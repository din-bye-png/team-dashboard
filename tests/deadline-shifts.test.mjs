import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {validShifts,recordShift,shiftSummary,shiftLabel} from '../public/deadline-shifts.js';
import {validState,prepareChange} from '../public/backend.js';

const task={id:'t',title:'Гайд',person:'',status:'active',start:'2026-11-09',end:'2026-11-20',note:'',milestones:[]};
const at=day=>day+'T12:00:00';

test('a changed deadline is logged; the first one stays the original',()=>{
 let plan={revision:0,tasks:[],trash:[],team:[]};
 const save=(end,day,extra={})=>{const {state}=prepareChange(plan,{action:'upsert',task:{...task,end,...extra},baseRevision:plan.revision},null,at(day));plan={revision:plan.revision+1,...state};return plan.tasks[0]};
 assert.equal('deadlineShifts' in save('2026-11-20','2026-11-10'),false);
 assert.equal('deadlineShifts' in save('2026-11-20','2026-11-11',{title:'Гайд 2'}),false);
 assert.deepEqual(save('2026-11-24','2026-11-12').deadlineShifts,[{from:'2026-11-20',to:'2026-11-24',at:'2026-11-12'}]);
 // A caller cannot rewrite the log.
 const saved=save('2026-11-28','2026-11-19',{deadlineShifts:[]});
 assert.deepEqual(saved.deadlineShifts,[{from:'2026-11-20',to:'2026-11-24',at:'2026-11-12'},{from:'2026-11-24',to:'2026-11-28',at:'2026-11-19'}]);
 assert.deepEqual(shiftSummary(saved),{original:'2026-11-20',days:8,log:saved.deadlineShifts});
 assert.equal(validState(plan),true);
 // Other edits keep the log.
 assert.equal(save('2026-11-28','2026-11-20',{note:'x'}).deadlineShifts.length,2);
 // "Убрать перенос": the log is forgotten, even when the same save moves the deadline.
 const clear=(end,day)=>{const {state}=prepareChange(plan,{action:'upsert',clearShifts:true,task:{...task,end},baseRevision:plan.revision},null,at(day));plan={revision:plan.revision+1,...state};return plan.tasks[0]};
 assert.equal('deadlineShifts' in clear('2026-11-30','2026-11-21'),false);
 assert.deepEqual(save('2026-12-02','2026-11-22').deadlineShifts,[{from:'2026-11-30',to:'2026-12-02',at:'2026-11-22'}]);
});

test('moves on the same day collapse; an undone move leaves no trace',()=>{
 const prev={...task};
 let log=recordShift(prev,{...task,end:'2026-11-22'},'2026-11-12');
 log=recordShift({...task,end:'2026-11-22',deadlineShifts:log},{...task,end:'2026-11-25'},'2026-11-12');
 assert.deepEqual(log,[{from:'2026-11-20',to:'2026-11-25',at:'2026-11-12'}]);
 log=recordShift({...task,end:'2026-11-25',deadlineShifts:log},{...task,end:'2026-11-20'},'2026-11-12');
 assert.deepEqual(log,[]);
 // A deadline set for the first time or removed is not a move.
 assert.deepEqual(recordShift({...task,end:''},task,'2026-11-12'),[]);
 assert.deepEqual(recordShift(task,{...task,end:''},'2026-11-12'),[]);
 assert.deepEqual(recordShift(undefined,task,'2026-11-12'),[]);
});

test('summary and labels',()=>{
 assert.equal(shiftSummary(task),null);
 assert.equal(shiftLabel(8),'перенос +8 д');assert.equal(shiftLabel(-2),'перенос −2 д');assert.equal(shiftLabel(0),'');assert.equal(shiftLabel(undefined),'');
 const back={...task,deadlineShifts:[{from:'2026-11-20',to:'2026-11-24',at:'2026-11-12'},{from:'2026-11-24',to:'2026-11-20',at:'2026-11-14'}]};
 assert.equal(shiftSummary(back).days,0);
 assert.equal(shiftSummary({...back,end:''}),null);
});

test('validation',()=>{
 assert.equal(validShifts(task),true);
 const ok={from:'2026-11-20',to:'2026-11-24',at:'2026-11-12'};
 assert.equal(validShifts({deadlineShifts:[ok]}),true);
 for(const bad of [{...ok,to:ok.from},{...ok,at:'12.11.2026'},{...ok,from:'2026-02-30'},{from:ok.from,to:ok.to},null])
  assert.equal(validShifts({deadlineShifts:[bad]}),false);
 assert.equal(validShifts({deadlineShifts:'x'}),false);
 assert.equal(validShifts({deadlineShifts:Array.from({length:51},()=>ok)}),false);
});

test('migration 0007 accepts a valid log and rejects a broken one',async()=>{
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
  for(const migration of ['0001_dashboard.sql','0003_task_context_and_materials.sql','0004_public_task_passports.sql','0006_team_assignments.sql','0007_deadline_shifts.sql'])
   await db.exec(await readFile('supabase/migrations/'+migration,'utf8'));
  const check=async t=>(await db.query('select dashboard_private.valid_task($1::jsonb) as ok',[JSON.stringify(t)])).rows[0].ok;
  const ok={from:'2026-11-20',to:'2026-11-24',at:'2026-11-12'};
  assert.equal(await check(task),true);
  assert.equal(await check({...task,deadlineShifts:[ok]}),true);
  assert.equal(await check({...task,assignments:[{id:'a',personId:'p',start:'2026-11-09',end:'2026-11-10',hours:8}],deadlineShifts:[ok]}),true);
  assert.equal(await check({...task,assignments:[{id:'a',personId:'p',start:'2026-11-09',end:'2026-11-10',hours:99}]}),false);
  for(const bad of [{...ok,to:ok.from},{...ok,at:'x'},{...ok,from:'2026-02-30'},{from:ok.from,to:ok.to}])
   assert.equal(await check({...task,deadlineShifts:[bad]}),false);
  assert.equal(await check({...task,deadlineShifts:{}}),false);
 }finally{await db.close()}
});

// The log lives inside the task object, so every copy of the plan must carry it:
// saves, history versions, the private daily backup RPC, admin import, the trash,
// and restoring a version or a backup file in the browser.
test('deadline moves survive saves, history, the daily backup, import and restores',async()=>{
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
  for(const migration of ['0001_dashboard.sql','0003_task_context_and_materials.sql','0004_public_task_passports.sql','0006_team_assignments.sql','0007_deadline_shifts.sql'])
   await db.exec(await readFile('supabase/migrations/'+migration,'utf8'));
  const workspace='10000000-0000-4000-8000-000000000001',fresh='10000000-0000-4000-8000-000000000002',member='20000000-0000-4000-8000-000000000001';
  await db.query('insert into auth.users values($1)',[member]);
  await db.query('insert into public.dashboard_workspaces(id) values($1),($2)',[workspace,fresh]);
  await db.query('insert into public.dashboard_plans(workspace_id,revision,content) values($1,0,$2),($3,0,$2)',[workspace,{tasks:[],trash:[]},fresh]);
  await db.query('insert into public.dashboard_members values($1,$2)',[workspace,member]);
  const as=async(role,id='')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[id,role]);await db.exec('set role '+role)};
  // The browser's path: prepareChange builds the state, dashboard_save stores it.
  let plan={revision:0,tasks:[],trash:[],team:[]};
  const change=async(body,day)=>{
   const {state,reason}=prepareChange(plan,{...body,baseRevision:plan.revision},body.restored,at(day));
   plan=(await db.query('select public.dashboard_save($1,$2,$3,$4) as plan',[workspace,plan.revision,state,reason])).rows[0].plan;return plan;
  };
  await as('authenticated',member);
  const other={...task,id:'u',title:'Без переносов'};
  await change({action:'upsert',task},'2026-11-10');
  await change({action:'upsert',task:other},'2026-11-10');
  await change({action:'upsert',task:{...task,end:'2026-11-24'}},'2026-11-12');
  await change({action:'upsert',task:{...task,end:'2026-11-28'}},'2026-11-19');
  const log=[{from:'2026-11-20',to:'2026-11-24',at:'2026-11-12'},{from:'2026-11-24',to:'2026-11-28',at:'2026-11-19'}];
  assert.deepEqual(plan.tasks[0].deadlineShifts,log);
  assert.equal('deadlineShifts' in plan.tasks[1],false);

  // History versions keep the log as it was at each revision.
  const history=(await db.query('select public.dashboard_snapshot($1,true) as s',[workspace])).rows[0].s.history;
  assert.deepEqual(history.find(v=>v.revision===4).tasks[0].deadlineShifts,log);
  assert.deepEqual(history.find(v=>v.revision===3).tasks[0].deadlineShifts,[log[0]]);
  assert.equal('deadlineShifts' in history.find(v=>v.revision===2).tasks[0],false);

  // A deleted task keeps its log in the trash and gets it back when restored.
  await change({action:'delete',id:'t'},'2026-11-20');
  assert.deepEqual(plan.trash[0].task.deadlineShifts,log);
  await change({action:'restoreTask',id:'t'},'2026-11-20');
  assert.deepEqual(plan.tasks.find(t=>t.id==='t').deadlineShifts,log);

  // Restoring an older version brings back that version's log; no new move is recorded.
  await change({action:'restoreVersion',revision:3,restored:history.find(v=>v.revision===3)},'2026-11-21');
  assert.deepEqual(plan.tasks.find(t=>t.id==='t').deadlineShifts,[log[0]]);
  await change({action:'restoreVersion',revision:4,restored:history.find(v=>v.revision===4)},'2026-11-21');
  assert.deepEqual(plan.tasks.find(t=>t.id==='t').deadlineShifts,log);

  // The private daily backup: same checks as private-backup-automation/scripts/backup.mjs.
  await as('service_role');
  const backup=(await db.query('select public.dashboard_backup($1) as b',[workspace])).rows[0].b;
  assert.equal(backup.format,'team-plan-backup');
  assert.deepEqual(backup.tasks.find(t=>t.id==='t').deadlineShifts,log);
  const latest=backup.history.find(v=>v.revision===backup.revision);
  assert.deepEqual(latest.tasks,backup.tasks);
  // scripts/import-backup.mjs validates with validState before calling the RPC.
  assert.equal(validState({tasks:backup.tasks,trash:backup.trash}),true);
  await db.query('select public.dashboard_import($1,$2)',[fresh,backup]);
  await as('postgres');
  const imported=(await db.query('select content from public.dashboard_plans where workspace_id=$1',[fresh])).rows[0].content;
  assert.deepEqual(imported.tasks.find(t=>t.id==='t').deadlineShifts,log);
  const importedVersion=(await db.query('select content from public.dashboard_versions where workspace_id=$1 and revision=3',[fresh])).rows[0].content;
  assert.deepEqual(importedVersion.tasks[0].deadlineShifts,[log[0]]);

  // "Восстановить из копии" in the browser: the file's tasks replace the plan, logs included.
  await as('authenticated',member);
  await change({action:'upsert',clearShifts:true,task:{...task,end:'2026-11-28'}},'2026-11-22');
  assert.equal('deadlineShifts' in plan.tasks.find(t=>t.id==='t'),false);
  await change({action:'replace',tasks:backup.tasks,team:backup.team},'2026-11-22');
  assert.deepEqual(plan.tasks.find(t=>t.id==='t').deadlineShifts,log);

  // A backup made before this update has no logs and still restores.
  const old=backup.tasks.map(({deadlineShifts,...t})=>t);
  await change({action:'replace',tasks:old},'2026-11-23');
  assert.equal(plan.tasks.some(t=>'deadlineShifts' in t),false);

  // The server refuses a broken log.
  await assert.rejects(()=>db.query('select public.dashboard_save($1,$2,$3,$4)',[workspace,plan.revision,{tasks:[{...task,deadlineShifts:[{from:'x',to:'y',at:'z'}]}],trash:[]},'Changed']),/Invalid plan/);
 }finally{await db.close()}
});
