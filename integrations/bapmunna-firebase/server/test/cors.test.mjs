import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readConfig} from '../security.mjs';
import {createService,CONSENT} from '../service.mjs';
const origin='https://backend.test',appOrigin='https://app.test';
const env={PUBLIC_ORIGIN:origin,APP_URL:origin+'/connect/',BAPMUNNA_APP_ORIGINS:appOrigin,BAPMUNNA_RETURN_URL:appOrigin+'/carer/#connect',FIREBASE_PROJECT_ID:'test',SMARTTHINGS_CONNECTION_ENABLED:'true',SMARTTHINGS_APP_ID:'test',SMARTTHINGS_CLIENT_ID:'test',SMARTTHINGS_CLIENT_SECRET:'test',SMARTTHINGS_ENCRYPTION_KEY:randomBytes(32).toString('base64')};
function fixture(){
  let reads=0,states=0,verifications=0;
  const handle=createService({config:readConfig(env),store:{get:async()=>{reads++;return null;},saveState:async()=>{states++;}},verifyUser:async token=>{verifications++;if(token!=='alice')throw Error();return {uid:'alice',email_verified:true,auth_time:1000};},verifyConsent:async()=>{},smartthings:{},verifyWebhook:async()=>{throw Error();}});
  const call=(path,{method='GET',source=appOrigin,token='alice',headers={},body}={})=>handle(new Request(origin+'/api/smartthings/'+path,{method,headers:{Origin:source,Authorization:`Bearer ${token}`,...headers},body}));
  return {call,stats:()=>({reads,states,verifications})};
}
test('exact allowlisted app can read its authenticated connection without cookies',async()=>{
  const f=fixture(),result=await f.call('status');
  assert.equal(result.status,200);assert.equal(result.headers.get('access-control-allow-origin'),appOrigin);
  assert.equal(result.headers.get('access-control-allow-credentials'),null);assert.equal(result.headers.get('set-cookie'),null);
  assert.deepEqual(await result.json(),{stage:'disconnected'});
  assert.equal((await f.call('status',{token:'forged'})).status,401);
});
test('CORS preflight cannot widen methods, headers, origins or OAuth cookie access',async()=>{
  const f=fixture();
  const headers={'access-control-request-method':'POST','access-control-request-headers':'authorization, content-type'};
  const ok=await f.call('device',{method:'OPTIONS',headers});assert.equal(ok.status,204);assert.equal(ok.headers.get('access-control-allow-origin'),appOrigin);
  assert.equal((await f.call('device',{method:'OPTIONS',source:'https://app.test.attacker.test',headers})).status,403);
  assert.equal((await f.call('device',{method:'OPTIONS',headers:{...headers,'access-control-request-method':'DELETE'}})).status,403);
  assert.equal((await f.call('device',{method:'OPTIONS',headers:{...headers,'access-control-request-headers':'cookie'}})).status,403);
  const start=await f.call('start',{method:'OPTIONS',headers});assert.equal(start.headers.get('access-control-allow-origin'),null);
  assert.deepEqual(f.stats(),{reads:0,states:0,verifications:0});
});
test('untrusted origin does not even query Firestore or verify a supplied token',async()=>{
  const f=fixture();assert.equal((await f.call('status',{source:'https://attacker.test'})).status,403);
  assert.deepEqual(f.stats(),{reads:0,states:0,verifications:0});
});
test('even trusted Firebase origin cannot mint OAuth cookie; only top-level backend can',async()=>{
  const f=fixture(),options={method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({consentVersion:CONSENT})};
  assert.equal((await f.call('start',options)).status,403);assert.equal(f.stats().states,0);
  const result=await f.call('start',{...options,source:origin});assert.equal(result.status,200);
  assert.match(result.headers.get('set-cookie'),/HttpOnly; SameSite=Lax.*Secure/);assert.equal(f.stats().states,1);
});
test('deployment config rejects wildcard, path, insecure origins and unlisted return site',()=>{
  for(const value of ['*','http://app.test','https://app.test/','https://app.test/path','https://user:pass@app.test'])assert.throws(()=>readConfig({...env,BAPMUNNA_APP_ORIGINS:value}));
  assert.throws(()=>readConfig({...env,BAPMUNNA_RETURN_URL:'https://attacker.test'}));
  assert.equal(readConfig(env).returnUrl,appOrigin+'/carer/#connect');
});
