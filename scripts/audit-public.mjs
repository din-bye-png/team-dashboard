import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
const permittedRoots=new Set(['public','scripts','tests','supabase','.github','dist']);
const permittedFiles=new Set(['README.md','SECURITY.md','.gitignore','package.json','package-lock.json']);
const forbiddenFiles=/\.(?:png|jpe?g|webp|pdf|csv|zip|sqlite|db|pem|key|map)$/i;
const patterns=[
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/,
  /\bsb_secret_[A-Za-z0-9_-]{20,}\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}\b/,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /https?:\/\/[^\s/:]+:[^\s/@]+@/,
  /\bappgprj_[a-f0-9]+\b/,
  /https?:\/\/[^\s"']+\.chatgpt\.site/,
];
let count=0;
async function visit(directory='.'){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    if(['node_modules','.git','.DS_Store'].includes(entry.name))continue;
    const file=path.join(directory,entry.name),relative=path.relative('.',file);
    if(directory==='.'&&!permittedRoots.has(entry.name)&&!permittedFiles.has(entry.name))throw new Error('Unexpected public file: '+relative);
    if(entry.isSymbolicLink())throw new Error('Symlink not permitted: '+relative);
    if(entry.isDirectory()){await visit(file);continue;}
    if(forbiddenFiles.test(file)||/(^|\/)(?:backups|exports|media|\.openai)(\/|$)/.test(relative)||entry.name.startsWith('.env'))throw new Error('Private or unreviewed artifact: '+relative);
    const content=await readFile(file,'utf8');
    if(patterns.some(pattern=>pattern.test(content)))throw new Error('Potential credential or old hosting identity in '+relative);
    count++;
  }
}
await visit();console.log('PASS: '+count+' public files checked; no disallowed artifacts or recognized credential values.');
