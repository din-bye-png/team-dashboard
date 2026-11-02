import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {validState} from '../public/backend.js';

const source=(await readFile('scripts/backup.mjs','utf8')).replace(/^import .*\n/gm,'');
async function run(visibility){
  let reads=0,uploads=0,checks=0;const logs=[];
  const backup={revision:1,tasks:[],trash:[],history:[{revision:1,tasks:[],trash:[]}]};
  const context=vm.createContext({process:{env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'test',WORKSPACE_ID:'test',BACKUP_REPOSITORY:'example/private-backup',BACKUP_REPO_TOKEN:'test',GITHUB_REPOSITORY:'example/app'}},
    createClient:()=>({rpc:async()=>{reads++;return {data:backup,error:null}}}),validState,Buffer,Date,JSON,Error,
    console:{log:message=>logs.push(message)},
    fetch:async(url,options)=>{
      if(options.method==='PUT'){uploads++;assert(!url.includes('test'));return {ok:true,json:async()=>({})};}
      const privateValue=visibility[Math.min(checks++,visibility.length-1)];
      return {ok:true,json:async()=>({private:privateValue,visibility:privateValue?'private':'public',archived:false,default_branch:'main'})};
    },
  });
  let error;try{await vm.runInContext('(async()=>{'+source+'})()',context)}catch(e){error=e;}
  return {reads,uploads,logs,error};
}
test('backup refuses public destinations before reading private data and rechecks visibility before upload',async()=>{
  let r=await run([false]);assert(r.error);assert.equal(r.reads,0);assert.equal(r.uploads,0);
  r=await run([true,false]);assert(r.error);assert.equal(r.reads,1);assert.equal(r.uploads,0);
  r=await run([true,true]);assert.equal(r.error,undefined);assert.equal(r.reads,1);assert.equal(r.uploads,1);
  assert.equal(r.logs.length,1);assert(!r.logs[0].includes('tasks'));
});
