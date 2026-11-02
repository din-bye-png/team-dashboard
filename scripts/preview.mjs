import http from 'node:http';
import {readFile} from 'node:fs/promises';
const files={'/':'index.html','/index.html':'index.html','/bundle.js':'bundle.js','/style.css':'style.css'};
http.createServer(async(req,res)=>{
  const name=files[new URL(req.url,'http://localhost').pathname];
  if(!name){res.writeHead(404);res.end();return;}
  try{const bytes=await readFile('dist/'+name);res.writeHead(200,{'Content-Type':name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html','Cache-Control':'no-store'});res.end(bytes);}
  catch{res.writeHead(503);res.end('Run npm run build first');}
}).listen(4174,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:4174'));
