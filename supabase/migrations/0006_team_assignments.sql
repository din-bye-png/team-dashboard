-- Team roster and per-task assignments.
-- The plan JSON gains an optional top-level `team` array, and each task an optional
-- `assignments` array. Saves, history versions, admin import and the private daily
-- backup (dashboard_backup) carry the team alongside tasks and trash.
-- Existing plans without these fields stay valid. No policy or grant changes.
-- Number 0005 is reserved for the subtasks migration (separate branch). If that one
-- lands later, its valid_task must also keep the assignments check below.
begin;

create or replace function dashboard_private.valid_hours(h jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(h)='number' and (h::text)::numeric>0 and (h::text)::numeric<=24
    and (h::text)::numeric*2=trunc((h::text)::numeric*2)
$$;

create or replace function dashboard_private.valid_task(t jsonb) returns boolean
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
  if t ? 'context' and (jsonb_typeof(t->'context') is distinct from 'string' or length(t->>'context')>20000) then return false; end if;
  if t ? 'links' then
    if jsonb_typeof(t->'links') is distinct from 'array' or jsonb_array_length(t->'links')>30 then return false; end if;
    for m in select value from jsonb_array_elements(t->'links') loop
      if jsonb_typeof(m->'title') is distinct from 'string' or length(m->>'title')>200
        or jsonb_typeof(m->'url') is distinct from 'string' or length(m->>'url')>2000
        or m->>'url' !~ '^https?://[^/@[:space:]]+([/?#]|$)' then return false; end if;
    end loop;
  end if;
  if t ? 'attachments' then
    if jsonb_typeof(t->'attachments') is distinct from 'array' or jsonb_array_length(t->'attachments')>20 then return false; end if;
    for m in select value from jsonb_array_elements(t->'attachments') loop
      if jsonb_typeof(m->'name') is distinct from 'string' or length(m->>'name') not between 1 and 255
        or jsonb_typeof(m->'type') is distinct from 'string' or length(m->>'type')>200
        or jsonb_typeof(m->'path') is distinct from 'string' or m->>'path' !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}$'
        or jsonb_typeof(m->'size') is distinct from 'number' or (m->>'size')::numeric not between 0 and 20971520
        or (m->>'size')::numeric<>trunc((m->>'size')::numeric) then return false; end if;
    end loop;
  end if;
  if t ? 'assignments' then
    if jsonb_typeof(t->'assignments') is distinct from 'array' or jsonb_array_length(t->'assignments')>50 then return false; end if;
    if (select count(distinct value->>'id') from jsonb_array_elements(t->'assignments'))<>jsonb_array_length(t->'assignments') then return false; end if;
    for m in select value from jsonb_array_elements(t->'assignments') loop
      if jsonb_typeof(m->'id') is distinct from 'string' or length(m->>'id') not between 1 and 128
        or jsonb_typeof(m->'personId') is distinct from 'string' or length(m->>'personId') not between 1 and 128
        or jsonb_typeof(m->'start') is distinct from 'string' or jsonb_typeof(m->'end') is distinct from 'string'
        or m->>'start' !~ '^\d{4}-\d{2}-\d{2}$' or m->>'end' !~ '^\d{4}-\d{2}-\d{2}$'
        or to_char((m->>'start')::date,'YYYY-MM-DD')<>m->>'start' or to_char((m->>'end')::date,'YYYY-MM-DD')<>m->>'end'
        or m->>'start'>m->>'end' or not dashboard_private.valid_hours(m->'hours') then return false; end if;
    end loop;
  end if;
  return true;
exception when others then return false;
end $$;

create or replace function dashboard_private.valid_state(s jsonb) returns boolean
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
  if s ? 'team' then
    if jsonb_typeof(s->'team') is distinct from 'array' or jsonb_array_length(s->'team')>100 then return false; end if;
    if (select count(distinct value->>'id') from jsonb_array_elements(s->'team'))<>jsonb_array_length(s->'team') then return false; end if;
    for t in select value from jsonb_array_elements(s->'team') loop
      if jsonb_typeof(t) is distinct from 'object'
        or jsonb_typeof(t->'id') is distinct from 'string' or length(t->>'id') not between 1 and 128
        or jsonb_typeof(t->'name') is distinct from 'string' or length(btrim(t->>'name'))=0 or length(t->>'name')>200
        or (t ? 'hours' and not dashboard_private.valid_hours(t->'hours'))
        or (t ? 'color' and (jsonb_typeof(t->'color') is distinct from 'string'
          or t->>'color' not in ('yellow','blue','pink','green','coral','violet','gray','black')))
        or (t ? 'photo' and (jsonb_typeof(t->'photo') is distinct from 'string' or length(t->>'photo')>24000
          or t->>'photo' !~ '^data:image/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$')) then return false; end if;
    end loop;
  end if;
  return true;
exception when others then return false;
end $$;
revoke all on function dashboard_private.valid_hours(jsonb),dashboard_private.valid_task(jsonb),dashboard_private.valid_state(jsonb) from public,anon,authenticated;

-- Same checks, locking and history as before; the team is now kept instead of dropped.
create or replace function public.dashboard_save(p_workspace uuid,p_revision bigint,p_content jsonb,p_reason text) returns jsonb
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
  if p_content ? 'team' then cleaned=cleaned||jsonb_build_object('team',p_content->'team'); end if;
  update public.dashboard_plans set revision=current_plan.revision+1,content=cleaned,updated_at=stamp,updated_by=auth.uid()
    where workspace_id=p_workspace returning * into saved;
  insert into public.dashboard_versions(workspace_id,revision,content,created_at,created_by,reason)
    values(p_workspace,saved.revision,saved.content,stamp,auth.uid(),p_reason);
  delete from public.dashboard_versions where workspace_id=p_workspace and created_at<stamp-interval '30 days' and revision<saved.revision;
  return saved.content||jsonb_build_object('revision',saved.revision,'updatedAt',saved.updated_at,'updatedBy',saved.updated_by);
end $$;

-- Admin-only import keeps the team of the plan and of every historical version.
create or replace function public.dashboard_import(p_workspace uuid,p_backup jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare current_plan public.dashboard_plans; item jsonb; state jsonb; r bigint; latest jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Admin only' using errcode='42501'; end if;
  select * into current_plan from public.dashboard_plans where workspace_id=p_workspace for update;
  if not found or current_plan.revision<>0 or current_plan.content<>'{"tasks":[],"trash":[]}'::jsonb
    then raise exception 'Import requires a new empty plan'; end if;
  state=jsonb_build_object('tasks',p_backup->'tasks','trash',p_backup->'trash')
    ||case when p_backup ? 'team' then jsonb_build_object('team',p_backup->'team') else '{}'::jsonb end;
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
      p_workspace,(item->>'revision')::bigint,jsonb_build_object('tasks',item->'tasks','trash',item->'trash')
        ||case when item ? 'team' then jsonb_build_object('team',item->'team') else '{}'::jsonb end,
      (item->>'createdAt')::timestamptz,null,item->>'reason');
  end loop;
  update public.dashboard_plans set revision=r,content=state,updated_at=(p_backup->>'updatedAt')::timestamptz,updated_by=null where workspace_id=p_workspace;
end $$;

-- The private daily backup reads this RPC; it now includes the team roster.
-- History entries already carry their team because versions store the whole plan content.
create or replace function public.dashboard_backup(p_workspace uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Admin only' using errcode='42501'; end if;
  select jsonb_build_object('format','team-plan-backup','formatVersion',1,'exportedAt',now(),
    'revision',p.revision,'updatedAt',p.updated_at,'updatedBy',p.updated_by,'tasks',p.content->'tasks','trash',p.content->'trash',
    'team',coalesce(p.content->'team','[]'::jsonb),
    'history',coalesce((select jsonb_agg(v.content||jsonb_build_object('revision',v.revision,'createdAt',v.created_at,
      'createdBy',v.created_by,'reason',v.reason) order by v.revision desc) from public.dashboard_versions v
      where v.workspace_id=p_workspace),'[]'::jsonb)) into result from public.dashboard_plans p where p.workspace_id=p_workspace;
  if result is null then raise exception 'Plan not initialized'; end if;
  return result;
end $$;

revoke all on function public.dashboard_save(uuid,bigint,jsonb,text),public.dashboard_import(uuid,jsonb),public.dashboard_backup(uuid) from public,anon,authenticated;
grant execute on function public.dashboard_save(uuid,bigint,jsonb,text) to authenticated;
grant execute on function public.dashboard_import(uuid,jsonb),public.dashboard_backup(uuid) to service_role;
commit;
