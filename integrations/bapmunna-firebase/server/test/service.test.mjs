import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,generateKeyPairSync,sign,createHash} from 'node:crypto';
import {createService,CONSENT} from '../service.mjs';
import {ApiError,hash,readConfig,vault,webhookVerifier} from '../security.mjs';
import {smartThingsClient,readingSummary} from '../smartthings.mjs';

const instant=Date.parse('2026-11-03T03:00:00Z');
const DAY=86400000;
const config=readConfig({PUBLIC_ORIGIN:'https://example.test',APP_URL:'https://example.test/carer/',FIREBASE_PROJECT_ID:'test-only',SMARTTHINGS_CONNECTION_ENABLED:'true',SMARTTHINGS_APP_ID:'app1',SMARTTHINGS_CLIENT_ID:'client',SMARTTHINGS_CLIENT_SECRET:'secret',SMARTTHINGS_ENCRYPTION_KEY:randomBytes(32).toString('base64')});
function fixture({connectionEnabled=true}={}){
  let time=instant,refreshes=0,subscriptions=0;
  const connections=new Map(),states=new Map(),locks=new Set(),seen=new Set();
  const store={
    get:async uid=>structuredClone(connections.get(uid)||null),
    patch:async(uid,value,{installId,attemptId,requireConsent=false}={})=>{const current=connections.get(uid);if(!current||(installId&&current.installId!==installId)||(attemptId&&current.refreshAttemptId!==attemptId))throw new ApiError(409,'reconnect_required');if(requireConsent&&!consented)throw new ApiError(403,'consent_required');const next={...current,...value};connections.set(uid,next);return structuredClone(next);},
    dueConnections:async({limit})=>[...connections].filter(([,c])=>c.refreshDueAt instanceof Date&&c.refreshDueAt.getTime()<=time).sort((a,b)=>a[1].refreshDueAt-b[1].refreshDueAt).slice(0,limit).map(([uid,c])=>({uid,installId:c.installId})),
    saveConnection:async(uid,value,attempt)=>{if(attempt){const pending=states.get(attempt.state);if(!pending||pending.uid!==uid||pending.nonceHash!==attempt.nonceHash||!pending.used||pending.cancelled||pending.until<=time)throw new ApiError(400,'invalid_state');}for(const [other,current]of connections)if(other!==uid&&current.installId===value.installId)throw new ApiError(409,'installation_in_use');connections.set(uid,value);if(attempt)states.delete(attempt.state);},
    remove:async(uid,id)=>{if(connections.get(uid)?.installId===id)connections.delete(uid);},
    installation:async id=>{for(const [uid,c]of connections)if(c.installId===id)return {uid};return null;},
    saveState:async(state,value)=>{if(states.has(state))throw new ApiError(400,'invalid_state');states.set(state,value);},
    consumeState:async(state,nonceHash)=>{const pending=states.get(state);if(!pending||pending.until<=time||pending.used||pending.cancelled||pending.nonceHash!==nonceHash)throw new ApiError(400,'invalid_state');pending.used=true;return pending;},
    cancelState:async(state,uid)=>{const current=states.get(state);if(current&&current.uid!==uid)return false;states.set(state,{uid,cancelled:true,until:time+600000});return true;},
    withLease:async(uid,fn)=>{if(locks.has(uid))throw new ApiError(409,'busy');locks.add(uid);try{return await fn();}finally{locks.delete(uid);}},
    receive:async(uid,installId,event)=>{const c=connections.get(uid);if(!c||c.installId!==installId||c.deviceId!==event.deviceId||seen.has(event.id))return false;seen.add(event.id);if(event.time>=(c.lastSignalAt||0))Object.assign(c,{lastSignalAt:event.time,lastReceivedAt:time,lastKind:event.kind});return true;},
  };
  const device={deviceId:'mine',label:'주방 플러그',components:[{capabilities:[{id:'powerMeter'}]}]};
  const smartthings={
    exchange:async()=>({access_token:'access-private',refresh_token:'refresh-private',expires_in:3600,installed_app_id:'install1'}),
    refresh:async()=>{refreshes++;await new Promise(resolve=>setTimeout(resolve,5));return {access_token:'access-new',refresh_token:'refresh-new',expires_in:3600};},
    devices:async()=>[device,{deviceId:'light',components:[]}],
    device:async(_token,id)=>{if(id!=='mine')throw new ApiError(502,'device_missing');return device;},
    status:async()=>({components:{main:{powerMeter:{power:{value:54,unit:'W',timestamp:new Date(time).toISOString()}}}}}),
    subscribe:async()=>{subscriptions++;},unsubscribe:async()=>{},confirm:async()=>{},
  };
  let validAccount=true,consented=true;
  const handle=createService({config:{...config,connectionEnabled},store,smartthings,now:()=>time,verifyUser:async token=>{if(token==='revoked')throw Error();return {uid:token,email_verified:token!=='unverified',auth_time:Math.floor(instant/1000)};},verifyAccount:async()=>{if(!validAccount)throw new ApiError(401,'login_required');},verifyConsent:async()=>{if(!consented)throw new ApiError(403,'consent_required');},verifyWebhook:async request=>{if(request.headers.get('authorization')!=='test-signed')throw new ApiError(401,'invalid_webhook');}});
  const call=(path,{method='GET',user='alice',body,headers={}}={})=>handle(new Request(config.origin+'/api/smartthings'+path,{method,headers:{Authorization:`Bearer ${user}`,Origin:config.origin,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)}));
  async function link(){
    const start=await call('/start',{method:'POST',body:{consentVersion:CONSENT}}),payload=await start.json(),state=new URL(payload.url).searchParams.get('state'),cookie=start.headers.get('set-cookie').split(';')[0];
    const callback=await call(`/callback?state=${state}&code=test-code`,{headers:{cookie}});assert.equal(callback.status,303);return {state,cookie};
  }
  return {call,link,store,connections,states,smartthings,maintain:handle.maintain,setConsent:value=>{consented=value;},revokeAccount:()=>{validAccount=false;},advance:ms=>{time+=ms;},stats:()=>({refreshes,subscriptions})};
}
test('OAuth binds state to user and browser, encrypts credentials, and consumes state once',async()=>{
  const f=fixture(),{state,cookie}=await f.link();
  assert.equal((await f.call('/status')).status,200);
  const saved=await f.store.get('alice');assert.equal(saved.stage,'choose_device');
  assert.doesNotMatch(JSON.stringify(saved),/access-private|refresh-private/);
  assert.equal(vault(config.key).open(saved.tokens,'alice:install1').access,'access-private');
  assert.throws(()=>vault(config.key).open(saved.tokens,'bob:install1'));
  assert.equal((await f.call(`/callback?state=${state}&code=replay`,{headers:{cookie}})).status,400);
  assert.deepEqual(await (await f.call('/status',{user:'bob'})).json(),{stage:'disconnected'});
});
test('revoked Firebase account cannot finish an earlier Samsung grant',async()=>{
  const f=fixture();const start=await f.call('/start',{method:'POST',body:{consentVersion:CONSENT}}),{url}=await start.json();
  const state=new URL(url).searchParams.get('state'),cookie=start.headers.get('set-cookie').split(';')[0];
  f.revokeAccount();const result=await f.call(`/callback?state=${state}&code=test`,{headers:{cookie}});
  assert.equal(new URL(result.headers.get('location')).searchParams.get('smartthings'),'failed');assert.equal(f.connections.size,0);
});
test('cancellation during Samsung token exchange prevents the final connection commit',async()=>{
  const f=fixture(),attemptId='this-attempt-has-at-least-thirty-two-characters';
  const start=await f.call('/start',{method:'POST',body:{consentVersion:CONSENT,attemptId}}),{url}=await start.json();
  const state=new URL(url).searchParams.get('state'),cookie=start.headers.get('set-cookie').split(';')[0],exchange=f.smartthings.exchange;
  f.smartthings.exchange=async()=>{await f.call('/cancel-start',{method:'POST',body:{attemptId}});return exchange();};
  const result=await f.call(`/callback?state=${state}&code=test`,{headers:{cookie}});
  assert.equal(new URL(result.headers.get('location')).searchParams.get('smartthings'),'failed');assert.equal(f.connections.size,0);
});
test('rejects forged, cross-browser, expired state, denied consent and cross-origin mutation',async()=>{
  const f=fixture();
  assert.equal((await f.call('/start',{method:'POST',body:{}})).status,400);
  assert.equal((await f.call('/start',{method:'POST',body:{consentVersion:CONSENT},headers:{Origin:'https://attacker.test'}})).status,403);
  const start=await f.call('/start',{method:'POST',body:{consentVersion:CONSENT}}),{url}=await start.json(),state=new URL(url).searchParams.get('state'),cookie=start.headers.get('set-cookie').split(';')[0];
  assert.equal((await f.call(`/callback?state=${state}&code=a`,{headers:{cookie:'__session=wrong'}})).status,400);
  f.advance(600001);assert.equal((await f.call(`/callback?state=${state}&code=a`,{headers:{cookie}})).status,400);
  assert.equal(f.connections.size,0);
});
test('unverified and revoked Firebase tokens cannot read or mutate',async()=>{
  const f=fixture();assert.equal((await f.call('/status',{user:'unverified'})).status,403);assert.equal((await f.call('/status',{user:'revoked'})).status,401);
  assert.equal((await f.call('/status',{headers:{Authorization:''}})).status,401);
});
test('only authorized power devices can be selected; no raw power or tokens leave server',async()=>{
  const f=fixture();await f.link();assert.equal((await (await f.call('/devices')).json()).devices.length,1);
  assert.equal((await f.call('/device',{method:'POST',body:{deviceId:'somebody-else'}})).status,502);
  assert.equal((await f.call('/device',{method:'POST',body:{deviceId:'../mine'}})).status,400);
  const selected=await f.call('/device',{method:'POST',body:{deviceId:'mine',label:'spoof'}}),data=await selected.json();
  assert.equal(data.stage,'connected');assert.equal(data.device.label,'주방 플러그');assert.equal(data.hasPower,true);assert.equal(f.stats().subscriptions,1);
  assert.doesNotMatch(JSON.stringify(data),/access|refresh|"value"|54/);
  assert.equal((await f.call('/check',{method:'POST',body:{}})).status,429);
  f.advance(31000);assert.equal((await f.call('/check',{method:'POST',body:{}})).status,200);
});
test('single-use refresh is serialized; second concurrent request gets retryable busy',async()=>{
  const f=fixture();await f.link();f.advance(3600001);
  const results=await Promise.all([f.call('/devices'),f.call('/devices')]);assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);assert.equal(f.stats().refreshes,1);
  assert.equal(vault(config.key).open((await f.store.get('alice')).tokens,'alice:install1').refresh,'refresh-new');
});
test('uncertain refresh fails closed and offers explicit Samsung revocation instructions',async()=>{
  const f=fixture();await f.link();f.advance(3600001);f.smartthings.refresh=async()=>{throw Error('secret upstream body');};
  const result=await f.call('/devices');assert.equal(result.status,409);assert.doesNotMatch(await result.text(),/secret/);
  assert.equal((await f.store.get('alice')).stage,'reconnect_required');
  assert.equal((await f.call('/connection',{method:'DELETE',body:{confirm:true}})).status,409);
  assert.equal((await f.call('/connection',{method:'DELETE',body:{confirm:true,forgetExpired:true}})).status,200);
  assert.equal(await f.store.get('alice'),null);
});
test('signed events are scoped to installation and selected device; disconnect clears connection',async()=>{
  const f=fixture();await f.link();await f.call('/device',{method:'POST',body:{deviceId:'mine'}});f.advance(60000);
  const body={messageType:'EVENT',eventData:{installedApp:{installedAppId:'install1'},events:[{eventType:'DEVICE_EVENT',eventTime:new Date(instant+60000).toISOString(),deviceEvent:{eventId:'event1',deviceId:'mine',capability:'powerMeter',attribute:'power',value:999}}]}};
  assert.equal((await f.call('/events',{method:'POST',body})).status,401);
  const signed={method:'POST',body,headers:{Authorization:'test-signed'}};
  assert.equal((await f.call('/events',signed)).status,200);assert.equal((await f.call('/events',signed)).status,200);
  assert.equal((await f.store.get('alice')).lastSignalAt,instant+60000);assert.doesNotMatch(JSON.stringify(await f.store.get('alice')),/999/);
  body.eventData.events[0].deviceEvent.deviceId='someone-else';body.eventData.events[0].deviceEvent.eventId='event2';body.eventData.events[0].eventTime=new Date(instant).toISOString();
  await f.call('/events',signed);assert.equal((await f.store.get('alice')).lastSignalAt,instant+60000);
  assert.equal((await f.call('/connection',{method:'DELETE',body:{confirm:true}})).status,200);assert.equal(await f.store.get('alice'),null);
});
test('unconfigured backend reports setup required and never initiates OAuth',async()=>{
  const handle=createService({config:{...config,key:''}});
  assert.equal((await (await handle(new Request(config.origin+'/api/smartthings/config'))).json()).enabled,false);
  assert.equal((await handle(new Request(config.origin+'/api/smartthings/start',{method:'POST'}))).status,503);
});
test('operator admission is closed by default and never hides an existing connection or prevents unlink',async()=>{
  for(const value of [undefined,'false','TRUE','1'])assert.equal(readConfig({SMARTTHINGS_CONNECTION_ENABLED:value}).connectionEnabled,false);
  const paused=fixture({connectionEnabled:false});
  const settings=await (await paused.call('/config')).json();
  assert.equal(settings.enabled,true);assert.equal(settings.connectionReady,false);
  assert.equal((await paused.call('/start',{method:'POST',body:{consentVersion:CONSENT}})).status,503);
  assert.equal(paused.states.size,0);
  const f=fixture();await f.link();
  paused.connections.set('alice',await f.store.get('alice'));
  assert.equal((await (await paused.call('/status')).json()).stage,'choose_device');
  assert.equal((await paused.call('/connection',{method:'DELETE',body:{confirm:true}})).status,200);
});
test('saved consent is checked at start, callback, device access and event receipt; unlink still works',async()=>{
  const f=fixture();f.setConsent(false);
  assert.equal((await f.call('/start',{method:'POST',body:{consentVersion:CONSENT}})).status,403);
  assert.equal(f.states.size,0);f.setConsent(true);
  const start=await f.call('/start',{method:'POST',body:{consentVersion:CONSENT}}),{url}=await start.json();
  const state=new URL(url).searchParams.get('state'),cookie=start.headers.get('set-cookie').split(';')[0];
  f.setConsent(false);
  assert.equal(new URL((await f.call(`/callback?state=${state}&code=test`,{headers:{cookie}})).headers.get('location')).searchParams.get('smartthings'),'failed');
  assert.equal(f.connections.size,0);f.setConsent(true);await f.link();
  await f.call('/device',{method:'POST',body:{deviceId:'mine'}});f.advance(60000);f.setConsent(false);
  assert.equal((await f.call('/devices')).status,403);
  assert.equal((await f.call('/check',{method:'POST',body:{}})).status,403);
  const body={messageType:'EVENT',eventData:{installedApp:{installedAppId:'install1'},events:[{eventType:'DEVICE_EVENT',eventTime:new Date(instant+60000).toISOString(),deviceEvent:{eventId:'after-withdrawal',deviceId:'mine',capability:'powerMeter',attribute:'power'}}]}};
  assert.equal((await f.call('/events',{method:'POST',body,headers:{Authorization:'test-signed'}})).status,200);
  assert.equal((await f.store.get('alice')).lastSignalAt,instant);
  assert.equal((await f.call('/status')).status,200);
  assert.equal((await f.call('/connection',{method:'DELETE',body:{confirm:true}})).status,200);
});
test('daily maintenance refreshes a due household without a browser visit and retains isolation',async()=>{
  const f=fixture();await f.link();
  const alice=await f.store.get('alice');
  f.connections.set('bob',{...alice,uid:'bob',installId:'install-b',refreshDueAt:new Date(instant+DAY),tokens:vault(config.key).seal({access:'bob-access',refresh:'bob-refresh',expiresAt:instant+DAY},'bob:install-b')});
  const bobBefore=JSON.stringify(await f.store.get('bob'));f.advance(2800000);
  const result=await f.maintain();assert.equal(result.refreshed,1);assert.equal(f.stats().refreshes,1);
  assert.equal(JSON.stringify(await f.store.get('bob')),bobBefore);
  assert.equal(vault(config.key).open((await f.store.get('alice')).tokens,'alice:install1').refresh,'refresh-new');
  assert.equal((await f.maintain()).scanned,0);
  assert.doesNotMatch(JSON.stringify(result),/alice|bob|install1|token|access-private|refresh-private/);
});
test('withdrawal during device status fetch cannot save a new reading or return connection details',async()=>{
  const f=fixture();await f.link();await f.call('/device',{method:'POST',body:{deviceId:'mine'}});f.advance(60000);
  const before=await f.store.get('alice'),status=f.smartthings.status;
  f.smartthings.status=async(...args)=>{const result=await status(...args);f.setConsent(false);return result;};
  const result=await f.call('/check',{method:'POST',body:{}});
  assert.equal(result.status,403);assert.deepEqual(await result.json(),{error:'consent_required'});
  assert.deepEqual(await f.store.get('alice'),before);
});
test('withdrawal during selection or subscription cannot commit a newly connected device',async()=>{
  for(const phase of ['status','subscribe']){
    const f=fixture();await f.link();const original=f.smartthings[phase];
    f.smartthings[phase]=async(...args)=>{const result=await original(...args);f.setConsent(false);return result;};
    const result=await f.call('/device',{method:'POST',body:{deviceId:'mine'}});
    assert.equal(result.status,403);assert.deepEqual(await result.json(),{error:'consent_required'});
    const saved=await f.store.get('alice');assert.notEqual(saved.stage,'connected');
    assert.equal(saved.lastSignalAt,undefined);assert.equal(saved.hasPower,undefined);assert.equal(saved.lastCheckedAt,undefined);
    if(phase==='status'){assert.equal(saved.deviceId,undefined);assert.equal(f.stats().subscriptions,0);}
    // An already-sent upstream subscription cannot be recalled, but it cannot
    // commit connection success, retain signals or prevent explicit unlink.
    assert.equal((await f.call('/connection',{method:'DELETE',body:{confirm:true}})).status,200);
  }
});
test('withdrawal while fetching device list prevents the list and rate metadata from being returned or saved',async()=>{
  const f=fixture();await f.link();const devices=f.smartthings.devices;
  f.smartthings.devices=async(...args)=>{const result=await devices(...args);f.setConsent(false);return result;};
  const result=await f.call('/devices');assert.equal(result.status,403);assert.deepEqual(await result.json(),{error:'consent_required'});
  assert.equal((await f.store.get('alice')).deviceListCheckedAt,undefined);
});
test('uninstall cleanup still runs after a withdrawn household data event in the same webhook batch',async()=>{
  const f=fixture();await f.link();await f.call('/device',{method:'POST',body:{deviceId:'mine'}});f.setConsent(false);
  const body={messageType:'EVENT',eventData:{installedApp:{installedAppId:'install1'},events:[
    {eventType:'DEVICE_EVENT',eventTime:new Date(instant).toISOString(),deviceEvent:{eventId:'withdrawn-signal',deviceId:'mine',capability:'powerMeter',attribute:'power'}},
    {eventType:'INSTALLED_APP_LIFECYCLE_EVENT',installedAppLifecycleEvent:{lifecycle:'DELETE',installedAppId:'install1',appId:'app1'}},
  ]}};
  assert.equal((await f.call('/events',{method:'POST',body,headers:{Authorization:'test-signed'}})).status,200);
  assert.equal(await f.store.get('alice'),null);
});
test('maintenance suspends revoked Firebase accounts and withdrawn consent without refreshing',async()=>{
  for(const reason of ['account','consent']){
    const f=fixture();await f.link();f.advance(2800000);
    if(reason==='account')f.revokeAccount();else f.setConsent(false);
    const result=await f.maintain();assert.equal(result.suspended,1);assert.equal(f.stats().refreshes,0);
    assert.equal((await f.store.get('alice')).stage,'reconnect_required');assert.equal((await f.maintain()).scanned,0);
  }
});
test('explicit refresh rejections retain credentials and use a persistent retry delay',async()=>{
  const f=fixture();await f.link();f.advance(3600001);let calls=0;
  f.smartthings.refresh=async()=>{calls++;throw new ApiError(429,'rate_limited');};
  assert.equal((await f.call('/devices')).status,429);
  const saved=await f.store.get('alice');assert.equal(saved.stage,'choose_device');assert.equal(saved.refreshAttemptId,null);
  assert.equal(vault(config.key).open(saved.tokens,'alice:install1').refresh,'refresh-private');
  assert.equal((await f.call('/devices')).status,429);assert.equal(calls,1);
  assert.equal((await f.maintain()).scanned,0);f.advance(300001);
  assert.equal((await f.maintain()).deferred,1);assert.equal(calls,2);
});
test('a persisted unfinished refresh attempt is never retried after a process crash',async()=>{
  const f=fixture();await f.link();f.advance(3600001);
  await f.store.patch('alice',{refreshAttemptId:'previous-process-attempt'});
  assert.equal((await f.call('/devices')).status,409);assert.equal(f.stats().refreshes,0);
  assert.equal((await f.store.get('alice')).stage,'reconnect_required');
});
test('lost persistence after a successful rotation cannot cause reuse of the old refresh token',async()=>{
  const f=fixture();await f.link();f.advance(3600001);const patch=f.store.patch;
  let databaseFailed=false;
  f.store.patch=async(uid,fields,options)=>{
    if(fields.tokens)databaseFailed=true;
    if(databaseFailed)throw Error('database temporarily unavailable');
    return patch(uid,fields,options);
  };
  assert.equal((await f.call('/devices')).status,503);assert.equal(f.stats().refreshes,1);
  assert.ok((await f.store.get('alice')).refreshAttemptId);
  f.store.patch=patch;
  assert.equal((await f.call('/devices')).status,409);assert.equal(f.stats().refreshes,1);
});
test('maintenance uses a bounded oldest-first batch and shares the live refresh lock',async()=>{
  const f=fixture();await f.link();const original=await f.store.get('alice');
  for(let i=0;i<21;i++){
    const uid=`owner-${i}`,installId=`installation-${i}`;
    f.connections.set(uid,{...original,uid,installId,tokens:vault(config.key).seal({access:'access-'+i,refresh:'refresh-'+i,expiresAt:instant+1000},`${uid}:${installId}`),refreshDueAt:new Date(instant-1000+i)});
  }
  const first=await f.maintain();assert.equal(first.processed,20);assert.equal(first.refreshed,20);assert.equal(first.limitReached,true);
  const second=await f.maintain();assert.equal(second.refreshed,1);assert.equal(second.limitReached,false);
  for(const limit of [0,21,1.5])await assert.rejects(()=>f.maintain({limit}),RangeError);
  f.advance(3600001);let complete,entered;
  const started=new Promise(resolve=>{entered=resolve;});
  f.smartthings.refresh=async()=>{entered();await new Promise(resolve=>{complete=resolve;});return {access_token:'rotated',refresh_token:'rotated-next',expires_in:3600};};
  const live=f.call('/devices');await started;
  const concurrent=await f.maintain({limit:1});assert.equal(concurrent.deferred,1);complete();assert.equal((await live).status,200);
});
test('OAuth invalid grant requests reconnection while invalid client reports operator configuration',async()=>{
  for(const [status,error,code] of [[400,'invalid_grant','reconnect_required'],[400,'invalid_client','oauth_configuration_required'],[401,'invalid_client','oauth_configuration_required']]){
    let calls=0;
    const client=smartThingsClient(config,async()=>{calls++;return Response.json({error,error_description:'private-details'},{status});});
    await assert.rejects(()=>client.refresh('synthetic-refresh'),error=>error.code===code&&!error.message.includes('private-details'));assert.equal(calls,1);
  }
});
test('verifies a real RSA signature, digest, freshness and approved key origin',async()=>{
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});let fetches=0;
  const verify=webhookVerifier({now:()=>instant,fetcher:async url=>{assert.equal(url,'https://key.smartthings.com/key/one');fetches++;return new Response(publicKey.export({type:'spki',format:'pem'}));}});
  const raw=Buffer.from('{"messageType":"EVENT"}'),date=new Date(instant).toUTCString(),digest='SHA256='+createHash('sha256').update(raw).digest('base64');
  const signature=sign('RSA-SHA256',Buffer.from(`(request-target): post /api/smartthings/events\ndigest: ${digest}\ndate: ${date}`),privateKey).toString('base64');
  const headers=new Headers({date,digest,authorization:`Signature keyId="/key/one",signature="${signature}",headers="(request-target) digest date",algorithm="rsa-sha256"`});
  const req={method:'POST',path:'/api/smartthings/events',raw,headers};await verify(req);await verify(req);assert.equal(fetches,1);
  await assert.rejects(()=>verify({...req,raw:Buffer.from('{}')}),{code:'invalid_webhook'});
  const stale=new Headers(headers);stale.set('date',new Date(instant-600000).toUTCString());await assert.rejects(()=>verify({...req,headers:stale}),{code:'invalid_webhook'});
  const malicious=new Headers(headers);malicious.set('authorization',headers.get('authorization').replace('/key/one','//attacker.test/key'));await assert.rejects(()=>verify({...req,headers:malicious}),{code:'invalid_webhook'});
});
test('SmartThings API budget errors are surfaced without automatic retry',async()=>{
  for(const [status,code]of [[402,'plan_required'],[429,'rate_limited']]){
    let calls=0;const client=smartThingsClient(config,async()=>{calls++;return new Response('{}',{status});});await assert.rejects(()=>client.devices('hidden'),{code});assert.equal(calls,1);
  }
  assert.deepEqual(readingSummary({components:{main:{powerMeter:{power:{value:0,unit:'W',timestamp:new Date(instant).toISOString()}}}}},instant),{hasPower:true,measuredAt:instant});
});

test('webhook registration only follows the exact old or new Samsung confirmation endpoint',async()=>{
  const seen=[];const client=smartThingsClient(config,async url=>{seen.push(String(url));return new Response('{}');});
  for(const prefix of ['/apps','/v1/apps','/v1/smartapps'])await client.confirm(`https://api.smartthings.com${prefix}/app1/confirm-registration?token=example`);
  assert.equal(seen.length,3);
  for(const url of ['https://attacker.test/apps/app1/confirm-registration?token=a','https://api.smartthings.com/v1/apps/other/confirm-registration?token=a','https://api.smartthings.com/v1/apps/app1/confirm-registration','https://api.smartthings.com/v1/apps/app1/confirm-registration?token=a#hidden'])await assert.rejects(()=>client.confirm(url),{code:'invalid_confirmation'});
  assert.equal(seen.length,3);
});
test('reauthorization rechecks an existing device subscription before reporting connected',async()=>{
  const f=fixture();await f.link();await f.call('/device',{method:'POST',body:{deviceId:'mine'}});
  await f.store.patch('alice',{stage:'reconnect_required'});await f.link();
  assert.equal((await f.store.get('alice')).stage,'subscribing');
  assert.equal((await f.call('/check',{method:'POST',body:{}})).status,409);
  assert.equal((await (await f.call('/device',{method:'POST',body:{deviceId:'mine'}})).json()).stage,'connected');
  assert.equal(f.stats().subscriptions,2);
});

test('subscription payload matches the registered legacy or new API app format',async()=>{
  for(const oauth of ['/oauth','/v1/oauth']){
    let sent;const client=smartThingsClient({...config,oauth},async(url,init)=>{sent={url,body:JSON.parse(init.body)};return new Response('{}');});
    await client.subscribe('test-access','test-install','test-device');
    assert.equal(sent.url,'https://api.smartthings.com/v1/installedapps/test-install/subscriptions');
    assert.equal(sent.body.device.deviceId,'test-device');
    assert.equal(oauth==='/oauth'?sent.body.device.subscriptionName:sent.body.subscriptionName,'bapmunnaSignals');
    assert.equal(sent.body.sourceType,'DEVICE');
  }
});

test('a subscription name conflict cannot falsely confirm a different device',async()=>{
  for(const oauth of ['/oauth','/v1/oauth']){
    let deviceId='other-device',reads=0;
    const client=smartThingsClient({...config,oauth},async(_url,init)=>{
      if(init.method==='POST')return new Response('{}',{status:409});
      reads++;
      return Response.json({items:[{sourceType:'DEVICE',device:{deviceId,capability:'*',attribute:'*',subscriptionName:'bapmunnaSignals'},subscriptionName:'bapmunnaSignals'}]});
    });
    await assert.rejects(()=>client.subscribe('test-access','test-install','mine'),{code:'subscription_conflict'});
    deviceId='mine';assert.equal((await client.subscribe('test-access','test-install','mine')).device.deviceId,'mine');
    assert.equal(reads,2);
  }
  const f=fixture();await f.link();f.smartthings.subscribe=async()=>{throw new ApiError(409,'subscription_conflict');};
  assert.equal((await f.call('/device',{method:'POST',body:{deviceId:'mine'}})).status,409);
  assert.equal((await f.store.get('alice')).stage,'subscribing');
});
