-- Revoke API access to the hosted event-trigger function and cover the three
-- dashboard foreign keys that are not already indexed by a primary key.
-- Does not change row level security policies or dashboard_save.
begin;
revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
create index if not exists dashboard_members_user_id_idx on public.dashboard_members (user_id);
create index if not exists dashboard_plans_updated_by_idx on public.dashboard_plans (updated_by);
create index if not exists dashboard_versions_created_by_idx on public.dashboard_versions (created_by);
commit;
