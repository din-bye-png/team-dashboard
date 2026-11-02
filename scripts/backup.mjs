import {createClient} from '@supabase/supabase-js';
import {validState} from '../public/backend.js';
const env=process.env;
for(const key of ['SUPABASE_URL','SUPABASE_SECRET_KEY','WORKSPACE_ID','BACKUP_REPOSITORY','BACKUP_REPO_TOKEN'])if(!env[key])throw new Error('Missing backup setting: '+key);
if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.BACKUP_REPOSITORY)||env.BACKUP_REPOSITORY.toLowerCase()===env.GITHUB_REPOSITORY?.toLowerCase())throw new Error('Backup requires a separate private repository.');
const headers={Authorization:'Bearer '+env.BACKUP_REPO_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
const base='https://api.github.com/repos/'+env.BACKUP_REPOSITORY;
async function github(path,options={}){
  const response=await fetch(base+path,{...options,headers:{...headers,'Content-Type':'application/json'}});
  if(!response.ok)throw new Error('Backup repository request failed (HTTP '+response.status+').');
  return response.json();
}
// Verify visibility before fetching any confidential backlog from Supabase.
const repo=await github('');
if(repo.private!==true||repo.visibility!=='private'||repo.archived)throw new Error('Backup destination must be an active private repository.');
const client=createClient(env.SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:backup,error}=await client.rpc('dashboard_backup',{p_workspace:env.WORKSPACE_ID});
if(error||!backup||!validState({tasks:backup.tasks,trash:backup.trash})||!Array.isArray(backup.history))throw new Error('Backup export failed validation.');
if(backup.revision>0&&!backup.history.some(v=>v.revision===backup.revision&&JSON.stringify(v.tasks)===JSON.stringify(backup.tasks)&&JSON.stringify(v.trash)===JSON.stringify(backup.trash)))throw new Error('Backup current/history mismatch.');
const raw=JSON.stringify(backup,null,2)+'\n';
if(Buffer.byteLength(raw)>30_000_000)throw new Error('Backup exceeds size limit.');
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const file='backlog/'+stamp+'.json';
// Check once more just before uploading; never post into a known public destination.
if((await github('')).private!==true)throw new Error('Backup destination visibility changed.');
await github('/contents/'+file,{method:'PUT',body:JSON.stringify({message:'Daily backlog snapshot',branch:repo.default_branch,content:Buffer.from(raw).toString('base64')})});
console.log('Backlog backup saved to the verified private repository.');
