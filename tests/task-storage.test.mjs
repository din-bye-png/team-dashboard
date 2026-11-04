import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('material migration preserves legacy tasks and isolates storage to workspace members',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create schema storage;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
 create table storage.objects(bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant usage on schema storage to anon,authenticated;
 grant select,insert,update,delete on storage.objects to anon,authenticated;`);
 await db.exec(await readFile('supabase/migrations/0001_dashboard.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/0003_task_context_and_materials.sql','utf8'));
 const workspace='10000000-0000-4000-8000-000000000001',member='20000000-0000-4000-8000-000000000001',stranger='20000000-0000-4000-8000-000000000002';
 const task={id:'t',title:'Task',person:'',note:'',status:'active',start:'',end:'',milestones:[]};
 const enriched={...task,context:'Goal',links:[{title:'Design',url:'https://figma.com/design/a'}],attachments:[{name:'a.pdf',path:workspace+'/'+member,type:'application/pdf',size:100}]};
 for(const t of [task,enriched])assert.equal((await db.query('select dashboard_private.valid_task($1) as ok',[t])).rows[0].ok,true);
 for(const patch of [{context:null},{links:[{title:'a',url:'javascript:alert(1)'}]},{attachments:[{...enriched.attachments[0],size:20971521}]},{attachments:[{...enriched.attachments[0],path:'../a'}]}])assert.equal((await db.query('select dashboard_private.valid_task($1) as ok',[{...task,...patch}])).rows[0].ok,false);
 await db.query('insert into auth.users values ($1),($2)',[member,stranger]);
 await db.query('insert into public.dashboard_workspaces(id) values ($1)',[workspace]);
 await db.query('insert into public.dashboard_members values($1,$2)',[workspace,member]);
 const as=async(role,id='')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role)};
 const upload=path=>db.query("insert into storage.objects values('task-attachments',$1)",[path]);
 await as('anon');await assert.rejects(()=>upload(workspace+'/'+member),/row-level security/);
 await as('authenticated',stranger);await assert.rejects(()=>upload(workspace+'/'+member),/row-level security/);
 await as('authenticated',member);await upload(workspace+'/'+member);
 assert.equal((await db.query('select * from storage.objects')).rows.length,1);
 await assert.rejects(()=>upload(stranger+'/'+member),/row-level security/);
 await db.query('delete from storage.objects');assert.equal((await db.query('select * from storage.objects')).rows.length,1);
 await as('authenticated',stranger);assert.equal((await db.query('select * from storage.objects')).rows.length,0);
 }finally{await db.close()}
});
