import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createBackend} from '../public/backend.js';
const config={supabaseUrl:'https://example.supabase.co',supabasePublishableKey:'sb_publishable_example',workspaceId:'00000000-0000-4000-8000-000000000001'};
function fixture({verified=true,sessionError=null}={}){
 let options;
 const backend=createBackend(config,(_url,_key,value)=>{
  options=value.auth;
  return {auth:{
   async signInWithPassword(){options.storage.setItem('session','test-token');return {error:null};},
   async getSession(){return {data:{session:options.storage.getItem('session')?{}:null},error:sessionError};},
   async getUser(){return {data:{user:verified?{email:'member@example.org'}:null},error:null};},
   async signOut(){options.storage.removeItem('session');return {error:null};},
   async setSession(){options.storage.setItem('session','invite-token');return {error:null};},
  }};
 });
 return {backend,get options(){return options;}};
}
test('reload restores a verified session from tab storage; signout removes it',async()=>{
 const values=new Map();
 globalThis.sessionStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 try{
  const first=fixture();assert.equal(first.options.persistSession,true);
  assert.equal(await first.backend.restoreSession(),false);
  await first.backend.signIn('member@example.org','example-password');
  const reloaded=fixture();assert.equal(await reloaded.backend.restoreSession(),true);
  assert.equal(first.options.storageKey,reloaded.options.storageKey);
  const savedStorage=globalThis.sessionStorage;
  globalThis.sessionStorage={getItem:()=>null,setItem(){},removeItem(){}};
  const otherTab=fixture();assert.notEqual(otherTab.options.storageKey,first.options.storageKey);
  assert.equal(await otherTab.backend.restoreSession(),false);globalThis.sessionStorage=savedStorage;
  await reloaded.backend.signOut();assert.equal(values.has('session'),false);
  assert.equal(await fixture().backend.restoreSession(),false);
 }finally{delete globalThis.sessionStorage;}
});
test('unverified saved sessions are cleared and auth failures are not treated as signed in',async()=>{
 const invalid=fixture({verified:false});await invalid.backend.signIn('','');
 assert.equal(await invalid.backend.restoreSession(),false);
 assert.equal(invalid.options.storage.getItem('session'),null);
 await assert.rejects(fixture({sessionError:new Error('offline')}).backend.restoreSession(),/offline/);
});
test('blocked storage falls back to memory without retaining credentials across reloads',async()=>{
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,get(){throw new Error('blocked');}});
 try{
  const first=fixture();await first.backend.signIn('','');
  assert.equal(await first.backend.restoreSession(),true);
  assert.equal(await fixture().backend.restoreSession(),false);
  await first.backend.signOut();assert.equal(await first.backend.restoreSession(),false);
 }finally{delete globalThis.sessionStorage;}
});
test('email-link credentials do not persist; subsequent password login can persist again',async()=>{
 const values=new Map();
 globalThis.sessionStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 try{
 const first=fixture();await first.backend.signIn('','');
 await first.backend.acceptAuthLink({type:'invite',access_token:'test-access',refresh_token:'test-refresh'});
 assert.equal(first.options.storage.getItem('session'),'invite-token');
 assert.equal(values.has('session'),false);
 assert.equal(await fixture().backend.restoreSession(),false);
 await first.backend.signOut();await first.backend.signIn('','');
 assert.equal(await first.backend.restoreSession(),true);
 }finally{delete globalThis.sessionStorage;}
});

test('real Supabase SDK restores password sessions but keeps invite sessions in memory',async()=>{
 const {createClient}=await import('@supabase/supabase-js');
 const values=new Map(),clients=[];
 globalThis.sessionStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 const user={id:config.workspaceId,aud:'authenticated',email:'member@example.org'};
 const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const token=[encode({alg:'HS256',typ:'JWT'}),encode({sub:user.id,aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600}),Buffer.from('test-signature').toString('base64url')].join('.');
 const factory=(url,key,options)=>{
  const client=createClient(url,key,{...options,auth:{...options.auth,autoRefreshToken:false},global:{fetch:async(url)=>{
   if(String(url).includes('/token'))return Response.json({access_token:token,refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user});
   if(String(url).endsWith('/user'))return Response.json(user);
   if(String(url).includes('/logout'))return new Response(null,{status:204});
   throw new Error('Unexpected Auth request');
  }}});clients.push(client);return client;
 };
 try{
  const first=createBackend(config,factory);await first.signIn(user.email,'example-password');
  const reloaded=createBackend(config,factory);assert.equal(await reloaded.restoreSession(),true);
  await reloaded.signOut();assert.equal(await createBackend(config,factory).restoreSession(),false);
  const invited=createBackend(config,factory);
  assert.equal((await invited.acceptAuthLink({type:'invite',access_token:token,refresh_token:'test-refresh'})).passwordSetup,true);
  assert.equal(await createBackend(config,factory).restoreSession(),false);
 }finally{for(const client of clients)await client.auth.stopAutoRefresh();delete globalThis.sessionStorage;}
});
