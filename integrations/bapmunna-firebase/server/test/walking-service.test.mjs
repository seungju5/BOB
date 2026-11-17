import test from 'node:test';
import assert from 'node:assert/strict';
import {createWalkingService} from '../walking-service.mjs';
import {readWalkingConfig,nickname,syncInput,randomToken,validDeviceToken,koreanDay,nextKoreanMidnight,rankKey,WalkingError} from '../walking-security.mjs';

const time=Date.parse('2041-11-17T04:00:00.000Z'),origin='https://bapmunna-smartthings.vercel.app',web='https://impact-series.web.app',native='https://localhost';
const consent={consentVersion:'2026-11-17',shareTodaySteps:true};
function fixture({account={},claims={},storeOverrides={},authOverrides={},ready=true}={}){
  const calls=[];
  const store={
    rateLimit:async buckets=>{calls.push(['limit',buckets]);},
    profile:async uid=>{calls.push(['profile',uid]);return {joined:false};},
    join:async(uid,name)=>{calls.push(['join',uid,name]);return {joined:true,nickname:name};},
    leave:async uid=>{calls.push(['leave',uid]);return {ok:true};},
    issuePairing:async(uid,authTime,code)=>{calls.push(['pairing',uid,authTime,code]);return {code,expiresAt:new Date(time+600000).toISOString()};},
    pair:async(code,token,verify)=>{await verify('user-a',Math.floor(time/1000)-60);calls.push(['pair',code]);return {token,nickname:'달빛토끼',publicId:'opaque-id',confirmed:false,expiresAt:new Date(time+600000).toISOString()};},
    deviceIdentity:async(token,options)=>{calls.push(['identity',token,options]);return {uid:'user-a',authTime:Math.floor(time/1000)-60};},
    confirm:async token=>{calls.push(['confirm',token]);return {ok:true,confirmed:true};},
    unpair:async token=>{calls.push(['unpair',token]);return {ok:true};},
    sync:async(token,input)=>{calls.push(['sync',token,input]);return {ok:true,date:input.date,count:input.count,syncedAt:new Date(time).toISOString()};},
    board:async value=>{calls.push(['board',value]);return {entries:[],me:{count:null,rank:null},total:0};},
    ...storeOverrides,
  };
  const auth={
    verifyIdToken:async(token,checkRevoked)=>{calls.push(['verify',token,checkRevoked]);return {uid:'user-a',email_verified:true,auth_time:Math.floor(time/1000)-60,...claims};},
    getUser:async uid=>{calls.push(['current',uid]);return {uid,disabled:false,emailVerified:true,tokensValidAfterTime:'2041-01-01T00:00:00Z',...account};},
    ...authOverrides,
  };
  return {calls,handle:createWalkingService({config:readWalkingConfig({FIREBASE_PROJECT_ID:'demo-bapmunna'}),ready,store,auth,rateSecret:'synthetic-test-key',now:()=>time})};
}
async function invoke(handle,path,{origin:requestOrigin=web,method='GET',token='synthetic.jwt.a',body,headers={}}={}){
  const h={...headers};if(requestOrigin!==null)h.Origin=requestOrigin;if(token!==null)h.Authorization='Bearer '+token;
  if(body!==undefined)h['Content-Type']='application/json';
  const response=await handle(new Request(origin+'/api/walking/'+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)}));
  return {status:response.status,headers:response.headers,body:response.status===204?null:await response.json()};
}

test('KST day and next midnight never use host timezone; numeric rank key orders 0 and large totals',()=>{
  assert.equal(koreanDay(Date.parse('2041-11-16T15:00:00Z')),'2041-11-17');
  assert.equal(nextKoreanMidnight(Date.parse('2041-11-16T15:00:00Z')),Date.parse('2041-11-17T15:00:00Z'));
  assert.ok(rankKey('2041-11-17',9)<rankKey('2041-11-17',100));assert.ok(rankKey('2041-11-17',999999)<rankKey('2041-11-17',1000000));
});
test('aliases reject contacts and markup; sync rejects stale days, missing values and invalid health data',()=>{
  assert.equal(nickname('  달빛  토끼 '),'달빛 토끼');
  for(const name of ['a','user@example.test','01012345678','<토끼>','토끼\n이름'])assert.throws(()=>nickname(name));
  const valid={date:'2041-11-17',count:0,source:'android-health-connect',queriedAt:new Date(time).toISOString(),timeZone:'Asia/Seoul'};
  assert.equal(syncInput(valid,time).count,0);
  for(const patch of [{count:null},{count:-1},{count:1.2},{count:1000001},{source:'manual'},{timeZone:'UTC'},{date:'2041-11-16'},{queriedAt:'2041-11-17T03:00:00Z'},{queriedAt:'2041-11-17T04:02:00Z'}])assert.throws(()=>syncInput({...valid,...patch},time));
  assert.throws(()=>syncInput({...valid,uid:'other'},time));assert.ok(validDeviceToken(randomToken()));assert.equal(validDeviceToken('walk_fake'),false);
});
test('configuration is public without private credentials and remains available while setup is incomplete',async()=>{
  const f=fixture({ready:false});const value=await invoke(f.handle,'config',{origin:null,token:null});
  assert.deepEqual(value.body,{enabled:false,consentVersion:'2026-11-17',timeZone:'Asia/Seoul'});assert.equal(value.headers.get('cache-control'),'no-store');
  assert.equal((await invoke(f.handle,'profile')).status,503);assert.equal(f.calls.length,0);
});
test('strict origin, methods, JSON and unknown query guards reject before account or database access',async()=>{
  const f=fixture();
  for(const args of [['profile',{origin:null}],['profile',{origin:'https://foreign.example'}],['join',{origin:native,method:'POST',body:{nickname:'토끼',...consent}}],['pair',{origin:web,method:'POST',body:{code:'12345678'}}]])assert.equal((await invoke(f.handle,...args)).status,403);
  assert.equal((await invoke(f.handle,'profile?uid=other')).status,400);
  assert.equal((await invoke(f.handle,'profile',{method:'POST',body:{}})).status,405);
  assert.equal((await invoke(f.handle,'profile',{token:null})).status,401);
  const r=await f.handle(new Request(origin+'/api/walking/join',{method:'POST',headers:{Origin:web,'Content-Type':'text/plain'},body:'{}'}));assert.equal(r.status,400);
  assert.equal(f.calls.length,0);
});
test('CORS preflight permits only the intended authenticated web and native routes',async()=>{
  const f=fixture();
  const good=await invoke(f.handle,'sync',{method:'OPTIONS',origin:native,token:null,headers:{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization, content-type'}});
  assert.equal(good.status,204);assert.equal(good.headers.get('access-control-allow-origin'),native);
  assert.equal((await invoke(f.handle,'sync',{method:'OPTIONS',origin:web,headers:{'Access-Control-Request-Method':'POST'}})).status,403);
  assert.equal((await invoke(f.handle,'profile',{method:'OPTIONS',headers:{'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'x-other'}})).status,403);
});
test('only verified current Firebase accounts can join and no client owner field can choose another account',async()=>{
  for(const opts of [{claims:{email_verified:false}},{claims:{firebase:{sign_in_provider:'anonymous'}}},{account:{disabled:true}},{account:{emailVerified:false}},{account:{tokensValidAfterTime:new Date(time).toISOString()}},{authOverrides:{getUser:async()=>{throw {code:'auth/user-not-found'};}}}]){
    const f=fixture(opts);assert.equal((await invoke(f.handle,'join',{method:'POST',body:{nickname:'달빛토끼',...consent}})).status,401);assert.ok(!f.calls.some(call=>call[0]==='join'));
  }
  const f=fixture();assert.equal((await invoke(f.handle,'join',{method:'POST',body:{nickname:'달빛토끼',...consent,uid:'other'}})).status,400);
  const joined=await invoke(f.handle,'join',{method:'POST',body:{nickname:'달빛토끼',...consent}});assert.equal(joined.status,200);assert.deepEqual(f.calls.find(call=>call[0]==='join'),['join','user-a','달빛토끼']);assert.equal(f.calls.find(call=>call[0]==='verify')[2],true);
});
test('pair reveals destination but creates only a pending token and confirm requires separate current consent',async()=>{
  const f=fixture();const paired=await invoke(f.handle,'pair',{method:'POST',origin:native,token:null,body:{code:'01234567'}});
  assert.equal(paired.status,200);assert.equal(paired.body.confirmed,false);assert.equal(paired.body.nickname,'달빛토끼');assert.ok(validDeviceToken(paired.body.token));
  const limits=f.calls.find(call=>call[0]==='limit')[1];assert.equal(limits.length,2);assert.doesNotMatch(JSON.stringify(limits),/127\.0\.0\.1/);
  assert.equal((await invoke(f.handle,'confirm',{method:'POST',origin:native,token:paired.body.token,body:{...consent,shareTodaySteps:false}})).status,400);
  assert.equal((await invoke(f.handle,'confirm',{method:'POST',origin:native,token:paired.body.token,body:consent})).body.confirmed,true);
  assert.ok(f.calls.some(call=>call[0]==='identity'&&call[2].pending===true));
});
test('device token cannot act as a Firebase owner, and every sync checks the current owner account',async()=>{
  const token=randomToken(),data={date:'2041-11-17',count:1280,source:'ios-healthkit',queriedAt:new Date(time).toISOString(),timeZone:'Asia/Seoul'};
  const f=fixture();assert.equal((await invoke(f.handle,'profile',{token})).status,401);
  assert.equal((await invoke(f.handle,'sync',{method:'POST',origin:native,token,body:data})).status,200);assert.ok(f.calls.some(call=>call[0]==='current'));
  const disabled=fixture({account:{disabled:true}});assert.equal((await invoke(disabled.handle,'sync',{method:'POST',origin:native,token,body:data})).status,401);assert.ok(!disabled.calls.some(call=>call[0]==='sync'));
  const pending=fixture({storeOverrides:{deviceIdentity:async()=>{throw new WalkingError(403,'device_confirmation_required');}}});assert.equal((await invoke(pending.handle,'board',{origin:native,token})).body.error,'device_confirmation_required');
});
test('temporary Firebase failures do not masquerade as revoked devices or leak upstream data',async()=>{
  const f=fixture({authOverrides:{getUser:async()=>{throw Error('private synthetic provider details');}}});
  const result=await invoke(f.handle,'board',{origin:native,token:randomToken()});assert.equal(result.status,503);assert.deepEqual(result.body,{error:'temporarily_unavailable'});
});
test('unpair stays idempotent and possible when account credentials expired; it grants no read or write access',async()=>{
  const f=fixture({authOverrides:{getUser:async()=>{throw Error('must not be called');}}}),token=randomToken();
  for(let i=0;i<2;i++)assert.deepEqual((await invoke(f.handle,'unpair',{origin:native,token,method:'POST',body:{}})).body,{ok:true});
  assert.equal(f.calls.filter(call=>call[0]==='unpair').length,2);assert.ok(!f.calls.some(call=>call[0]==='current'||call[0]==='identity'));
});
