import {build} from 'esbuild';
import {readFile,mkdir,writeFile,rm,copyFile,cp} from 'node:fs/promises';
import {config} from '../public/config.js';
import {configured} from '../public/backend.js';

const bundledConfig={...config};
for(const [key,env] of Object.entries({supabaseUrl:'PUBLIC_SUPABASE_URL',supabasePublishableKey:'PUBLIC_SUPABASE_PUBLISHABLE_KEY',workspaceId:'PUBLIC_WORKSPACE_ID'})){
  if(process.env[env])bundledConfig[key]=process.env[env];
}
if(Object.values(bundledConfig).some(Boolean)&&!configured(bundledConfig))throw new Error('Invalid public configuration; only an HTTPS Supabase URL, publishable key and workspace UUID are accepted.');
await rm('dist',{recursive:true,force:true});await mkdir('dist');
const sources=await Promise.all(['app.js','sync.js','reorder.js','task-context.js','bar-resize.js'].map(name=>readFile('public/'+name,'utf8')));
const contents="import {materialIcon,safeMaterialUrl,MAX_FILE_SIZE,validMaterials} from './task-materials.js';\nimport {createBackend} from './backend.js';\nimport {consumeAuthLink} from './auth-link.js';\nconst config="+JSON.stringify(bundledConfig)+';\n'+sources.join('\n');
await build({stdin:{contents,resolveDir:process.cwd()+'/public',sourcefile:'main.js'},bundle:true,format:'iife',platform:'browser',target:'es2022',outfile:'dist/bundle.js',legalComments:'none',sourcemap:false});
await build({stdin:{contents:'const config='+JSON.stringify(bundledConfig)+';\n'+await readFile('public/share.js','utf8'),resolveDir:process.cwd()+'/public',sourcefile:'share.js'},bundle:true,format:'iife',platform:'browser',target:'es2022',outfile:'dist/share-bundle.js',legalComments:'none',sourcemap:false});
for(const name of ['index.html','style.css','share.html','share.css','favicon.svg','favicon.png','apple-touch-icon.png','team-logo.png','team-logo.svg','theme.js','lebowski-regular.otf'])await copyFile('public/'+name,'dist/'+name);
await cp('public/assets','dist/assets',{recursive:true});
await writeFile('dist/.nojekyll','');
console.log(configured(bundledConfig)?'Static build ready (Supabase configured)':'Static build ready (locked until Supabase is configured)');
