import {test} from 'node:test';
import assert from 'node:assert/strict';
import {consumeAuthLink,expiredMessage} from '../public/auth-link.js';
import {createBackend} from '../public/backend.js';
const config={supabaseUrl:'https://example.supabase.co',supabasePublishableKey:'sb_publishable_example',workspaceId:'00000000-0000-4000-8000-000000000001'};
function consume(fragment){
  let replaced;
  const result=consumeAuthLink({href:'https://example.org/team-dashboard/?view=week'+fragment},{state:null,replaceState(...args){replaced=args[2];}});
  return {result,replaced};
}
test('invite tokens are consumed and removed without losing the site subpath',()=>{
  const {result,replaced}=consume('#access_token=test-access&refresh_token=test-refresh&type=invite&expires_in=3600');
  assert.equal(result.type,'invite');assert.equal(result.access_token,'test-access');
  assert.equal(replaced,'/team-dashboard/?view=week');
  assert.deepEqual(consume('#section'),{result:null,replaced:undefined});
});
test('expired, incomplete and unsupported links fail closed without reflecting arbitrary error text',()=>{
  for(const fragment of ['#error=access_denied&error_code=otp_expired&error_description=unsafe','#access_token=test-access&type=invite','#access_token=test-access&refresh_token=test-refresh&type=unknown']){
    const {result,replaced}=consume(fragment);
    assert.deepEqual(result,{error:expiredMessage});assert.equal(replaced,'/team-dashboard/?view=week');
  }
});
function fixture({invalid=false,unverified=false,weak=false}={}){
  const calls=[];
  const backend=createBackend(config,()=>({auth:{
    async setSession(tokens){calls.push(['session',tokens]);return {error:invalid?{}:null};},
    async getUser(){return {data:unverified?null:{user:{email:'member@example.org'}},error:unverified?{}:null};},
    async updateUser(value){calls.push(['password',value]);return {error:weak?{code:'weak_password'}:null};},
    async signOut(){calls.push(['out']);return {error:null};},
  }}));
  return {backend,calls};
}
const invite={type:'invite',access_token:'test-access',refresh_token:'test-refresh'};
test('verified invite and recovery allow password setup once; no membership is assigned',async()=>{
  for(const type of ['invite','recovery']){
    const {backend,calls}=fixture();
    await assert.rejects(backend.setPassword('password-example'));
    assert.deepEqual(await backend.acceptAuthLink({...invite,type}),{passwordSetup:true,email:'member@example.org'});
    await assert.rejects(backend.setPassword('short'));
    await backend.setPassword('password-example');
    await assert.rejects(backend.setPassword('password-example'));
    assert.deepEqual(calls.map(c=>c[0]),['session','password']);
  }
});
test('invalid or unverified sessions cannot change passwords',async()=>{
  for(const options of [{invalid:true},{unverified:true}]){
    const {backend,calls}=fixture(options);
    await assert.rejects(backend.acceptAuthLink(invite));
    await assert.rejects(backend.setPassword('password-example'));
    assert.equal(calls.some(c=>c[0]==='password'),false);assert.equal(calls.at(-1)[0],'out');
  }
});
test('signout and signup callbacks cannot enable password setup; weak passwords can be retried',async()=>{
  const {backend}=fixture();
  await backend.acceptAuthLink(invite);await backend.signOut();
  await assert.rejects(backend.setPassword('password-example'));
  assert.equal((await backend.acceptAuthLink({...invite,type:'signup'})).passwordSetup,false);
  await assert.rejects(backend.setPassword('password-example'));
  const weak=fixture({weak:true});await weak.backend.acceptAuthLink(invite);
  await assert.rejects(weak.backend.setPassword('password-example'),/слишком простой/);
  await assert.rejects(weak.backend.setPassword('another-password-example'),/слишком простой/);
});
