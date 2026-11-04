-- Optional context and materials preserve compatibility with existing tasks.
begin;
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

  return true;
exception when others then return false;
end $$;


-- Private objects are shared only with current members of their workspace.
insert into storage.buckets(id,name,public,file_size_limit)
values('task-attachments','task-attachments',false,20971520);
create policy task_attachment_read on storage.objects for select to authenticated using (
  bucket_id='task-attachments' and exists(
    select 1 from public.dashboard_members m
    where m.workspace_id::text=split_part(name,'/',1) and m.user_id=(select auth.uid())
  )
);
create policy task_attachment_upload on storage.objects for insert to authenticated with check (
  bucket_id='task-attachments' and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}$' and exists(
    select 1 from public.dashboard_members m
    where m.workspace_id::text=split_part(name,'/',1) and m.user_id=(select auth.uid())
  )
);
-- No update/delete policies: older revisions and trash keep working.
commit;
