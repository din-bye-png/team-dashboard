import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareChange,validState,configured} from '../public/backend.js';

const task=id=>({id,title:'Example task',person:'',status:'active',start:'',end:'',note:'',milestones:[]});
test('configuration fails closed and rejects a privileged key',()=>{
  assert.equal(configured({supabaseUrl:'',supabasePublishableKey:'',workspaceId:''}),false);
  const c={supabaseUrl:'https://example.supabase.co',supabasePublishableKey:'sb_publishable_example',workspaceId:'00000000-0000-4000-8000-000000000001'};
  assert.equal(configured(c),true);
  assert.equal(configured({...c,supabasePublishableKey:'sb_secret_example'}),false);
  assert.equal(configured({...c,supabaseUrl:'http://example.supabase.co'}),false);
});
test('edits, movement, delete/restore, historical restore preserve data and reject stale writes',()=>{
  let plan={revision:5,tasks:[task('a'),task('b')],trash:[]};
  assert.throws(()=>prepareChange(plan,{baseRevision:4,action:'delete',id:'a'}),e=>e.code===409&&e.plan===plan);
  let r=prepareChange(plan,{baseRevision:5,action:'move',id:'b',anchorId:'a',placement:'before'});
  assert.deepEqual(r.state.tasks.map(t=>t.id),['b','a']);
  r=prepareChange(plan,{baseRevision:5,action:'delete',id:'a'});
  assert.equal(r.state.trash[0].task.id,'a');
  plan={revision:6,...r.state};
  r=prepareChange(plan,{baseRevision:6,action:'restoreTask',id:'a'});
  assert.deepEqual(r.state.tasks.map(t=>t.id),['b','a']);assert.equal(r.state.trash.length,0);
  r=prepareChange(plan,{baseRevision:6,action:'restoreVersion'}, {tasks:[task('a')]});
  assert.deepEqual(r.state.tasks,[task('a')]);assert.equal(r.state.trash[0].task.id,'b');
  assert.equal(validState({tasks:[task('a'),task('a')],trash:[]}),false);
  assert.throws(()=>prepareChange(plan,{baseRevision:6,action:'move',id:'b',anchorId:'b',placement:'after'}));
});
