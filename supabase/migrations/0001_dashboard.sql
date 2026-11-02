-- Apply to a new Supabase project. No customer data or member list belongs in migrations.
begin;
create schema dashboard_private;
revoke all on schema dashboard_private from public, anon, authenticated;

create function dashboard_private.valid_task(t jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare m jsonb; k text;
begin
  if jsonb_typeof(t) is distinct from 'object' then return false; end if;
  foreach k in array array['id','title','person','note','status','start','end'] loop
    if jsonb_typeof(t->k) is distinct from 'string' then return false; end if;
  end loop;
  if length(t->>'id') not between 1 and 128 or length(btrim(t->>'title'))=0
    or length(t->>'title')>500 or length(t->>'person')>200 or length(t->>'note')>10000
    or t->>'status' not in ('active','blocked','waiting','done') then return false; end if;
  foreach k in array array['start','end'] loop
    if t->>k<>'' and (t->>k !~ '^\d{4}-\d{2}-\d{2}$'
      or to_char((t->>k)::date,'YYYY-MM-DD')<>t->>k) then return false; end if;
  end loop;
  if t->>'start'<>'' and t->>'end'<>'' and t->>'start'>t->>'end' then return false; end if;
  if jsonb_typeof(t->'milestones') is distinct from 'array' then return false; end if;
  if jsonb_array_length(t->'milestones')>100 then return false; end if;
  for m in select value from jsonb_array_elements(t->'milestones') loop
    if jsonb_typeof(m->'date') is distinct from 'string' or jsonb_typeof(m->'label') is distinct from 'string'
      or length(m->>'label')>500 or m->>'date' !~ '^\d{4}-\d{2}-\d{2}$'
      or to_char((m->>'date')::date,'YYYY-MM-DD')<>m->>'date' then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;

create function dashboard_private.valid_state(s jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare t jsonb;
begin
  if jsonb_typeof(s) is distinct from 'object' or octet_length(s::text)>1000000
    or jsonb_typeof(s->'tasks') is distinct from 'array'
    or jsonb_typeof(s->'trash') is distinct from 'array' then return false; end if;
  if jsonb_array_length(s->'tasks')>500 or jsonb_array_length(s->'trash')>1000 then return false; end if;
  for t in select value from jsonb_array_elements(s->'tasks') loop
    if not dashboard_private.valid_task(t) then return false; end if;
  end loop;
  if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(s->'tasks')) then return false; end if;
  for t in select value from jsonb_array_elements(s->'trash') loop
    if not dashboard_private.valid_task(t->'task') or jsonb_typeof(t->'deletedAt') is distinct from 'string'
      or t->>'deletedAt' !~ '^\d{4}-\d{2}-\d{2}T' or (t->>'deletedAt')::timestamptz is null then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;
revoke all on function dashboard_private.valid_task(jsonb),dashboard_private.valid_state(jsonb) from public,anon,authenticated;

create table public.dashboard_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Team plan'
);
create table public.dashboard_members (
  workspace_id uuid not null references public.dashboard_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (workspace_id,user_id)
);
create table public.dashboard_plans (
  workspace_id uuid primary key references public.dashboard_workspaces(id) on delete cascade,
  revision bigint not null check(revision>=0),
  content jsonb not null check(dashboard_private.valid_state(content)),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create table public.dashboard_versions (
  workspace_id uuid not null references public.dashboard_workspaces(id) on delete cascade,
  revision bigint not null check(revision>=0),
  content jsonb not null check(dashboard_private.valid_state(content)),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  reason text not null check(length(reason)<=1000),
  primary key (workspace_id,revision)
);
alter table public.dashboard_workspaces enable row level security;
alter table public.dashboard_members enable row level security;
alter table public.dashboard_plans enable row level security;
alter table public.dashboard_versions enable row level security;
revoke all on public.dashboard_workspaces,public.dashboard_members,public.dashboard_plans,public.dashboard_versions from public,anon,authenticated;
grant select on public.dashboard_workspaces,public.dashboard_members,public.dashboard_plans,public.dashboard_versions to authenticated;
create policy members_self on public.dashboard_members for select to authenticated using(user_id=(select auth.uid()));
create policy workspaces_member on public.dashboard_workspaces for select to authenticated using(
  exists(select 1 from public.dashboard_members m where m.workspace_id=id and m.user_id=(select auth.uid())));
create policy plans_member on public.dashboard_plans for select to authenticated using(
  exists(select 1 from public.dashboard_members m where m.workspace_id=dashboard_plans.workspace_id and m.user_id=(select auth.uid())));
create policy versions_member on public.dashboard_versions for select to authenticated using(
  exists(select 1 from public.dashboard_members m where m.workspace_id=dashboard_versions.workspace_id and m.user_id=(select auth.uid())));

-- One SQL statement gives a matching current plan and history in a single snapshot.
create function public.dashboard_snapshot(p_workspace uuid,p_history boolean default false) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or not exists(select 1 from public.dashboard_members where workspace_id=p_workspace and user_id=auth.uid())
    then raise exception 'Not a workspace member' using errcode='42501'; end if;
  select jsonb_build_object(
    'plan',p.content||jsonb_build_object('revision',p.revision,'updatedAt',p.updated_at,'updatedBy',p.updated_by),
    'history',case when p_history then coalesce((select jsonb_agg(v.content||jsonb_build_object(
      'revision',v.revision,'createdAt',v.created_at,'createdBy',v.created_by,'reason',v.reason) order by v.revision desc)
      from public.dashboard_versions v where v.workspace_id=p_workspace),'[]'::jsonb) else '[]'::jsonb end
  ) into result from public.dashboard_plans p where p.workspace_id=p_workspace;
  if result is null then raise exception 'Plan not initialized' using errcode='P0002'; end if;
  return result;
end $$;

create function public.dashboard_save(p_workspace uuid,p_revision bigint,p_content jsonb,p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare current_plan public.dashboard_plans; saved public.dashboard_plans; stamp timestamptz:=clock_timestamp(); cleaned jsonb;
begin
  if auth.uid() is null or not exists(select 1 from public.dashboard_members where workspace_id=p_workspace and user_id=auth.uid())
    then raise exception 'Not a workspace member' using errcode='42501'; end if;
  if not dashboard_private.valid_state(p_content) or p_reason is null or length(p_reason)>1000
    then raise exception 'Invalid plan' using errcode='22023'; end if;
  select * into current_plan from public.dashboard_plans where workspace_id=p_workspace for update;
  if not found then raise exception 'Plan not initialized' using errcode='P0002'; end if;
  if p_revision is distinct from current_plan.revision then raise exception 'Revision conflict' using errcode='40001'; end if;
  select jsonb_build_object('tasks',p_content->'tasks','trash',coalesce(jsonb_agg(value) filter(
    where (value->>'deletedAt')::timestamptz>=stamp-interval '30 days'),'[]'::jsonb))
    into cleaned from jsonb_array_elements(p_content->'trash');
  update public.dashboard_plans set revision=current_plan.revision+1,content=cleaned,updated_at=stamp,updated_by=auth.uid()
    where workspace_id=p_workspace returning * into saved;
  insert into public.dashboard_versions(workspace_id,revision,content,created_at,created_by,reason)
    values(p_workspace,saved.revision,saved.content,stamp,auth.uid(),p_reason);
  delete from public.dashboard_versions where workspace_id=p_workspace and created_at<stamp-interval '30 days' and revision<saved.revision;
  return saved.content||jsonb_build_object('revision',saved.revision,'updatedAt',saved.updated_at,'updatedBy',saved.updated_by);
end $$;

-- Admin-only atomic legacy import. Accessible only through the trusted service role.
-- Refuses to overwrite a nonempty plan; original historical authors remain unknown.
create function public.dashboard_import(p_workspace uuid,p_backup jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare current_plan public.dashboard_plans; item jsonb; state jsonb; r bigint; latest jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Admin only' using errcode='42501'; end if;
  select * into current_plan from public.dashboard_plans where workspace_id=p_workspace for update;
  if not found or current_plan.revision<>0 or current_plan.content<>'{"tasks":[],"trash":[]}'::jsonb
    then raise exception 'Import requires a new empty plan'; end if;
  state=jsonb_build_object('tasks',p_backup->'tasks','trash',p_backup->'trash');
  if not dashboard_private.valid_state(state) or jsonb_typeof(p_backup->'history') is distinct from 'array'
    then raise exception 'Invalid backup'; end if;
  r=(p_backup->>'revision')::bigint;
  select value into latest from jsonb_array_elements(p_backup->'history') where (value->>'revision')::bigint=r;
  if r<1 or latest is null or latest->'tasks' is distinct from state->'tasks' or latest->'trash' is distinct from state->'trash'
    then raise exception 'Inconsistent backup'; end if;
  delete from public.dashboard_versions where workspace_id=p_workspace;
  for item in select value from jsonb_array_elements(p_backup->'history') loop
    if (item->>'revision')::bigint not between 1 and r then raise exception 'Invalid revision'; end if;
    insert into public.dashboard_versions(workspace_id,revision,content,created_at,created_by,reason) values(
      p_workspace,(item->>'revision')::bigint,jsonb_build_object('tasks',item->'tasks','trash',item->'trash'),
      (item->>'createdAt')::timestamptz,null,item->>'reason');
  end loop;
  update public.dashboard_plans set revision=r,content=state,updated_at=(p_backup->>'updatedAt')::timestamptz,updated_by=null where workspace_id=p_workspace;
end $$;

revoke all on function public.dashboard_snapshot(uuid,boolean),public.dashboard_save(uuid,bigint,jsonb,text),public.dashboard_import(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.dashboard_snapshot(uuid,boolean),public.dashboard_save(uuid,bigint,jsonb,text) to authenticated;
grant execute on function public.dashboard_import(uuid,jsonb) to service_role;

create function public.dashboard_backup(p_workspace uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Admin only' using errcode='42501'; end if;
  select jsonb_build_object('format','team-plan-backup','formatVersion',1,'exportedAt',now(),
    'revision',p.revision,'updatedAt',p.updated_at,'updatedBy',p.updated_by,'tasks',p.content->'tasks','trash',p.content->'trash',
    'history',coalesce((select jsonb_agg(v.content||jsonb_build_object('revision',v.revision,'createdAt',v.created_at,
      'createdBy',v.created_by,'reason',v.reason) order by v.revision desc) from public.dashboard_versions v
      where v.workspace_id=p_workspace),'[]'::jsonb)) into result from public.dashboard_plans p where p.workspace_id=p_workspace;
  if result is null then raise exception 'Plan not initialized'; end if;
  return result;
end $$;
revoke all on function public.dashboard_backup(uuid) from public,anon,authenticated;
grant execute on function public.dashboard_backup(uuid) to service_role;
commit;
