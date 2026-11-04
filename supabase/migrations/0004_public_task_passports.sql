-- A random, revocable link exposes one active task through a narrow read-only RPC.
begin;

create table public.dashboard_task_shares (
  token uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.dashboard_workspaces(id) on delete cascade,
  task_id text not null,
  created_at timestamptz not null default now(),
  unique(workspace_id,task_id)
);
create index dashboard_task_shares_workspace_idx on public.dashboard_task_shares(workspace_id);
alter table public.dashboard_task_shares enable row level security;
revoke all on public.dashboard_task_shares from public,anon,authenticated;

-- A task removed from the active plan loses its public link. Restoring a backup
-- or a historical version cannot revive a revoked or deleted link.
create function dashboard_private.prune_task_shares() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.dashboard_task_shares s
  where s.workspace_id=new.workspace_id
    and not exists (
      select 1 from jsonb_array_elements(new.content->'tasks') t
      where t->>'id'=s.task_id
    );
  return new;
end $$;
revoke all on function dashboard_private.prune_task_shares() from public,anon,authenticated;
create trigger prune_task_shares_after_plan_change
after update of content on public.dashboard_plans
for each row execute function dashboard_private.prune_task_shares();

create function public.dashboard_task_share_status(p_workspace uuid,p_task_id text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare result uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.dashboard_members
    where workspace_id=p_workspace and user_id=auth.uid()
  ) then raise exception 'Not a workspace member' using errcode='42501'; end if;
  select s.token into result from public.dashboard_task_shares s
  where s.workspace_id=p_workspace and s.task_id=p_task_id;
  return result;
end $$;

create function public.dashboard_task_share_set(p_workspace uuid,p_task_id text,p_enabled boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare plan_content jsonb; result uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.dashboard_members
    where workspace_id=p_workspace and user_id=auth.uid()
  ) then raise exception 'Not a workspace member' using errcode='42501'; end if;
  if p_task_id is null or length(p_task_id) not between 1 and 128 or p_enabled is null
    then raise exception 'Invalid request' using errcode='22023'; end if;
  -- This lock serializes publishing with task deletion and the cleanup trigger.
  select p.content into plan_content from public.dashboard_plans p
  where p.workspace_id=p_workspace for share;
  if plan_content is null then raise exception 'Plan not found' using errcode='P0002'; end if;
  if p_enabled then
    if not exists (select 1 from jsonb_array_elements(plan_content->'tasks') t where t->>'id'=p_task_id)
      then raise exception 'Task not found' using errcode='P0002'; end if;
    insert into public.dashboard_task_shares(workspace_id,task_id)
      values(p_workspace,p_task_id) on conflict(workspace_id,task_id) do nothing;
    select s.token into result from public.dashboard_task_shares s
      where s.workspace_id=p_workspace and s.task_id=p_task_id;
    return result;
  end if;
  delete from public.dashboard_task_shares s
    where s.workspace_id=p_workspace and s.task_id=p_task_id;
  return null;
end $$;

-- Anonymous callers receive only explicitly selected fields of the current
-- active task. No plan, trash, history, attachment path or member data leaks.
create function public.dashboard_public_task(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'title',t.value->'title',
    'person',t.value->'person',
    'status',t.value->'status',
    'start',t.value->'start',
    'end',t.value->'end',
    'note',t.value->'note',
    'context',coalesce(t.value->'context','""'::jsonb),
    'links',coalesce((
      select jsonb_agg(jsonb_build_object('title',link->'title','url',link->'url') order by position)
      from jsonb_array_elements(coalesce(t.value->'links','[]'::jsonb)) with ordinality as items(link,position)
    ),'[]'::jsonb),
    'milestones',coalesce((
      select jsonb_agg(jsonb_build_object('date',milestone->'date','label',milestone->'label') order by position)
      from jsonb_array_elements(t.value->'milestones') with ordinality as items(milestone,position)
    ),'[]'::jsonb),
    'updatedAt',p.updated_at
  ) into result
  from public.dashboard_task_shares s
  join public.dashboard_plans p on p.workspace_id=s.workspace_id
  cross join lateral jsonb_array_elements(p.content->'tasks') t(value)
  where s.token=p_token and t.value->>'id'=s.task_id;
  return result;
end $$;

revoke all on function public.dashboard_task_share_status(uuid,text),
  public.dashboard_task_share_set(uuid,text,boolean),public.dashboard_public_task(uuid)
  from public,anon,authenticated;
grant execute on function public.dashboard_task_share_status(uuid,text),
  public.dashboard_task_share_set(uuid,text,boolean) to authenticated;
grant execute on function public.dashboard_public_task(uuid) to anon,authenticated;
commit;
