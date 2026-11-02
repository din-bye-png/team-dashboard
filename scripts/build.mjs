import {build} from 'esbuild';
import {readFile,mkdir,writeFile,rm,copyFile} from 'node:fs/promises';
import {config} from '../public/config.js';
import {configured} from '../public/backend.js';

const bundledConfig={...config};
for(const [key,env] of Object.entries({supabaseUrl:'PUBLIC_SUPABASE_URL',supabasePublishableKey:'PUBLIC_SUPABASE_PUBLISHABLE_KEY',workspaceId:'PUBLIC_WORKSPACE_ID'})){
  if(process.env[env])bundledConfig[key]=process.env[env];
}
if(Object.values(bundledConfig).some(Boolean)&&!configured(bundledConfig))throw new Error('Invalid public configuration; only an HTTPS Supabase URL, publishable key and workspace UUID are accepted.');
await rm('dist',{recursive:true,force:true});await mkdir('dist');
const sources=await Promise.all(['app.js','sync.js','reorder.js'].map(name=>readFile('public/'+name,'utf8')));
const contents="import {createBackend} from './backend.js';\nconst config="+JSON.stringify(bundledConfig)+';\n'+sources.join('\n');
await build({stdin:{contents,resolveDir:process.cwd()+'/public',sourcefile:'main.js'},bundle:true,format:'iife',platform:'browser',target:'es2022',outfile:'dist/bundle.js',legalComments:'none',sourcemap:false});
for(const name of ['index.html','style.css'])await copyFile('public/'+name,'dist/'+name);
await writeFile('dist/.nojekyll','');
console.log(configured(bundledConfig)?'Static build ready (Supabase configured)':'Static build ready (locked until Supabase is configured)');
