import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('Postgres enforces membership, validation, atomic revisions, author and admin import',async()=>{
  const db=new PGlite();
  const member='00000000-0000-4000-8000-000000000001',stranger='00000000-0000-4000-8000-000000000002';
  const workspace='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
    grant usage on schema auth to anon,authenticated,service_role;
    grant execute on function auth.uid(),auth.role() to anon,authenticated,service_role;`);
  await db.exec(await readFile('supabase/migrations/0001_dashboard.sql','utf8'));
  await db.query('insert into auth.users values ($1),($2)',[member,stranger]);
  await db.query('insert into public.dashboard_workspaces(id) values ($1),($2)',[workspace,other]);
  await db.query('insert into public.dashboard_plans(workspace_id,revision,content) values ($1,0,$3),($2,0,$3)',[workspace,other,{tasks:[],trash:[]}]);
  await db.query('insert into public.dashboard_members values ($1,$2)',[workspace,member]);
  async function as(role,id=''){
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[id,role]);
    await db.exec('set role '+role);
  }
  const snapshot=(w=workspace)=>db.query('select public.dashboard_snapshot($1,true) as result',[w]);
  const save=(revision,state,reason='Changed')=>db.query('select public.dashboard_save($1,$2,$3,$4) as result',[workspace,revision,state,reason]);
  await as('anon');await assert.rejects(snapshot(),/permission denied/);
  await assert.rejects(()=>db.query('select * from public.dashboard_plans'),/permission denied/);
  await as('authenticated',stranger);
  assert.equal((await db.query('select * from public.dashboard_plans')).rows.length,0);
  await assert.rejects(snapshot(),/Not a workspace member/);
  await assert.rejects(()=>save(0,{tasks:[],trash:[]}),/Not a workspace member/);
  await assert.rejects(()=>db.query('insert into public.dashboard_members values ($1,$2)',[workspace,stranger]),/permission denied/);
  await as('authenticated',member);
  assert.equal((await db.query('select * from public.dashboard_plans')).rows.length,1);
  await assert.rejects(()=>snapshot(other),/Not a workspace member/);
  await assert.rejects(()=>db.query("update public.dashboard_plans set revision=9"),/permission denied/);
  await assert.rejects(()=>db.query("delete from public.dashboard_versions"),/permission denied/);
  const task={id:'task-1',title:'Example task',person:'Member',status:'active',start:'',end:'',note:'Example note',milestones:[]};
  const state={tasks:[task],trash:[]};
  let result=(await save(0,state)).rows[0].result;
  assert.equal(result.revision,1);assert.equal(result.updatedBy,member);
  assert.equal((await snapshot()).rows[0].result.history.length,1);
  await assert.rejects(()=>save(0,state),/Revision conflict/);
  for(const invalid of [{...state,tasks:[task,task]}, {...state,tasks:[{...task,end:'2026-02-30'}]}, {...state,tasks:[{...task,status:'invalid'}]}, {tasks:[],trash:[{task,deletedAt:'invalid'}]}, {tasks:[{...task,title:''}],trash:[]}, {tasks:[{...task,note:'x'.repeat(10001)}],trash:[]}]){
    await assert.rejects(()=>save(1,invalid),/Invalid plan/);
  }
  await as('postgres');
  await db.exec("alter table public.dashboard_versions add constraint simulate_snapshot_failure check(reason<>'fail snapshot')");
  await as('authenticated',member);
  await assert.rejects(()=>save(1,{tasks:[],trash:[]},'fail snapshot'),/simulate_snapshot_failure/);
  result=(await snapshot()).rows[0].result;
  assert.equal(result.plan.revision,1);assert.equal(result.plan.tasks.length,1);assert.equal(result.history.length,1);
  await assert.rejects(()=>db.query('select public.dashboard_import($1,$2)',[workspace,{}]),/permission denied/);
  await assert.rejects(()=>db.query('select public.dashboard_backup($1)',[workspace]),/permission denied/);
  await as('service_role');
  const exported=(await db.query('select public.dashboard_backup($1) as result',[workspace])).rows[0].result;
  assert.deepEqual(exported.tasks,state.tasks);assert.equal(exported.history[0].revision,exported.revision);
  const stamp=new Date().toISOString();
  const backup={revision:2,updatedAt:stamp,...state,history:[{revision:2,createdAt:stamp,reason:'Imported',...state}]};
  await db.query('select public.dashboard_import($1,$2)',[other,backup]);
  await assert.rejects(()=>db.query('select public.dashboard_import($1,$2)',[other,backup]),/Import requires a new empty plan/);
  await as('postgres');
  const imported=(await db.query('select * from public.dashboard_versions where workspace_id=$1',[other])).rows[0];
  assert.equal(imported.created_by,null);assert.deepEqual(imported.content,state);
  await db.close();
});
