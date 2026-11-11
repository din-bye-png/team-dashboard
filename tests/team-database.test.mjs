import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

// Migration 0006: the team roster and task assignments survive saves, history,
// the private daily backup RPC and admin import; invalid data is rejected.
test('team and assignments are saved, versioned, backed up and imported',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
   grant usage on schema auth to anon,authenticated,service_role;
   grant execute on function auth.uid(),auth.role() to anon,authenticated,service_role;
   create schema storage;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
   create table storage.objects(bucket_id text,name text);
   alter table storage.objects enable row level security;`);
  for(const migration of ['0001_dashboard.sql','0003_task_context_and_materials.sql','0004_public_task_passports.sql'])
   await db.exec(await readFile('supabase/migrations/'+migration,'utf8'));
  const workspace='10000000-0000-4000-8000-000000000001',fresh='10000000-0000-4000-8000-000000000002',member='20000000-0000-4000-8000-000000000001';
  await db.query('insert into auth.users values($1)',[member]);
  await db.query('insert into public.dashboard_workspaces(id) values($1),($2)',[workspace,fresh]);
  const task={id:'t1',title:'Гайд',person:'Илья',status:'active',start:'2026-11-09',end:'2026-11-20',note:'',milestones:[],
   assignments:[{id:'a1',personId:'ilya',start:'2026-11-09',end:'2026-11-14',hours:8},{id:'a2',personId:'masha',start:'2026-11-15',end:'2026-11-20',hours:4}]};
  const team=[{id:'ilya',name:'Илья Краснов',color:'blue'},{id:'masha',name:'Маша',photo:'data:image/jpeg;base64,/9j/4AAQ'}];
  const legacyPlan={tasks:[{...task,assignments:undefined}],trash:[]};delete legacyPlan.tasks[0].assignments;
  await db.query('insert into public.dashboard_plans(workspace_id,revision,content) values($1,0,$2),($3,0,$4)',[workspace,legacyPlan,fresh,{tasks:[],trash:[]}]);
  await db.query('insert into public.dashboard_members values($1,$2)',[workspace,member]);

  // Before the migration the team is silently dropped: this is what 0006 fixes.
  const as=async(role,id='')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[id,role]);await db.exec('set role '+role)};
  const save=(revision,content)=>db.query("select public.dashboard_save($1,$2,$3,'Changed') as plan",[workspace,revision,content]);
  await as('authenticated',member);
  assert.equal((await save(0,{tasks:[task],trash:[],team})).rows[0].plan.team,undefined);

  await as('postgres');
  await db.exec(await readFile('supabase/migrations/0006_team_assignments.sql','utf8'));
  await as('authenticated',member);
  const saved=(await save(1,{tasks:[task],trash:[],team})).rows[0].plan;
  assert.deepEqual(saved.team,team);assert.deepEqual(saved.tasks[0].assignments,task.assignments);
  const history=(await db.query('select public.dashboard_snapshot($1,true) as s',[workspace])).rows[0].s.history;
  assert.deepEqual(history[0].team,team);

  // Plans and tasks without the new fields keep working.
  assert.equal((await save(2,legacyPlan)).rows[0].plan.revision,3);
  await save(3,{tasks:[task],trash:[],team});

  for(const bad of [
   {team:[{id:'x',name:' '}]},{team:[{id:'x',name:'A',color:'neon'}]},{team:[{id:'x',name:'A',photo:'https://x/y.png'}]},
   {team:[{id:'x',name:'A'},{id:'x',name:'B'}]},{team:{}},
   {tasks:[{...task,assignments:[{...task.assignments[0],end:'2026-11-01'}]}]},
   {tasks:[{...task,assignments:[{...task.assignments[0],hours:0}]}]},
   {tasks:[{...task,assignments:[{...task.assignments[0],hours:2.3}]}]},
   {tasks:[{...task,assignments:[{...task.assignments[0],start:'2026-02-30'}]}]},
   {tasks:[{...task,assignments:[task.assignments[0],task.assignments[0]]}]},
  ])await assert.rejects(()=>save(4,{tasks:[task],trash:[],team,...bad}),/Invalid plan/);

  // The private daily backup and admin import carry the team.
  await as('service_role');
  const backup=(await db.query('select public.dashboard_backup($1) as b',[workspace])).rows[0].b;
  assert.deepEqual(backup.team,team);assert.deepEqual(backup.tasks[0].assignments,task.assignments);
  assert.deepEqual(backup.history.find(v=>v.revision===backup.revision).team,team);
  await db.query('select public.dashboard_import($1,$2)',[fresh,backup]);
  await as('postgres');
  const imported=(await db.query('select content from public.dashboard_plans where workspace_id=$1',[fresh])).rows[0].content;
  assert.deepEqual(imported.team,team);
  const importedVersion=(await db.query('select content from public.dashboard_versions where workspace_id=$1 and revision=$2',[fresh,backup.revision])).rows[0].content;
  assert.deepEqual(importedVersion.team,team);
  for(const role of ['anon','authenticated'])
   for(const fn of ['public.dashboard_backup(uuid)','public.dashboard_import(uuid,jsonb)'])
    assert.equal((await db.query("select has_function_privilege($1,$2,'execute') as ok",[role,fn])).rows[0].ok,false,role+' '+fn);
 }finally{await db.close()}
});
