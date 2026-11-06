import http from 'node:http';
import {readFile} from 'node:fs/promises';
const files={'/lebowski-regular.otf':'lebowski-regular.otf','/theme.js':'theme.js','/team-logo.svg':'team-logo.svg','/team-logo.png':'team-logo.png','/':'index.html','/index.html':'index.html','/bundle.js':'bundle.js','/style.css':'style.css','/ui.css':'ui.css','/share.html':'share.html','/share.css':'share.css','/share-bundle.js':'share-bundle.js','/favicon.svg':'favicon.svg','/favicon.png':'favicon.png','/apple-touch-icon.png':'apple-touch-icon.png'};
http.createServer(async(req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const name=files[pathname]||(/^\/assets\/[a-zA-Z0-9._/-]+$/.test(pathname)&&!pathname.split('/').includes('..')?pathname.slice(1):null);
  if(!name){res.writeHead(404);res.end();return;}
  const type=name.endsWith('.otf')?'font/otf':name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.png')?'image/png':'text/html';
  try{const bytes=await readFile('dist/'+name);res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(bytes);}
  catch{res.writeHead(503);res.end('Run npm run build first');}
}).listen(4174,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:4174'));
