import test from 'node:test';
import assert from 'node:assert/strict';
import {createWalkingService} from '../walking-service.mjs';
import {randomToken,WalkingError} from '../walking-security.mjs';
import {heartPhoto,HEART_MESSAGE_BODY_BYTES} from '../heart-security.mjs';
const time=Date.parse('2041-11-17T03:00:00Z'),origin='https://api.example.test',web='https://app.example.test',native='https://localhost';
function fixture({deviceError=null,account={},hearts={}}={}){
  const calls=[];
  const functions=Object.fromEntries(['get','join','settings','buy','equip','gift','message','read','leave','league'].map(name=>[name,async(...args)=>{calls.push([name,...args]);return name==='leave'?{ok:true}:{enabled:true,joined:true};}]));
  const store={rateLimit:async()=>{},deviceIdentity:async()=>{if(deviceError)throw deviceError;return {uid:'owner-a',authTime:Math.floor(time/1000)-1};},join:async(...args)=>{calls.push(['walking-join',...args]);return {joined:true};},confirm:async(...args)=>{calls.push(['walking-confirm',...args]);return {ok:true,confirmed:true};},hearts:{...functions,...hearts}};
  const auth={verifyIdToken:async()=>({uid:'owner-a',email_verified:true,auth_time:Math.floor(time/1000)-1}),getUser:async()=>({uid:'owner-a',emailVerified:true,disabled:false,tokensValidAfterTime:'2040-01-01T00:00:00Z',...account})};
  return {calls,handle:createWalkingService({config:{origin,webOrigin:web},ready:true,store,auth,now:()=>time})};
}
async function invoke(handle,path,{body,token='test.jwt.owner',site=web,raw}={}){
  const response=await handle(new Request(origin+'/api/walking/'+path,{method:body===undefined&&raw===undefined?'GET':'POST',headers:{origin:site,authorization:'Bearer '+token,'content-type':'application/json'},body:raw??(body===undefined?undefined:JSON.stringify(body))}));
  return {status:response.status,body:await response.json(),headers:response.headers};
}
const join={consentVersion:'2026-11-17-hearts',enabled:true,goal:5000,leagueEnabled:false,region:''};
test('heart endpoints use verifiedcurrent account and rejectbrowserselected owner, steps, cooking or calories',async()=>{
  const f=fixture();assert.equal((await invoke(f.handle,'hearts')).status,200);assert.deepEqual(f.calls[0],['get',{uid:'owner-a'}]);
  assert.equal((await invoke(f.handle,'heartjoin',{body:join})).status,200);
  for(const patch of [{uid:'other'},{count:100000},{cooking:true},{calories:500},{consentVersion:'old'}])assert.equal((await invoke(f.handle,'heartjoin',{body:{...join,...patch}})).status,400);
  const invalid=fixture({account:{disabled:true}});assert.equal((await invoke(invalid.handle,'hearts')).status,401);assert.equal(invalid.calls.length,0);
});
test('native device cannot sendguardian messages or gifts and requiresdestination confirmation for hearts',async()=>{
  const f=fixture(),token=randomToken();
  assert.equal((await invoke(f.handle,'hearts',{site:native,token})).status,200);assert.deepEqual(f.calls[0],['get',{token}]);
  for(const path of ['heartmessage','heartgift'])assert.equal((await invoke(f.handle,path,{site:native,token,body:path==='heartmessage'?{text:'안부'}:{itemId:'scarf'}})).status,403);
  const pending=fixture({deviceError:new WalkingError(403,'device_confirmation_required')});assert.equal((await invoke(pending.handle,'hearts',{site:native,token})).body.error,'device_confirmation_required');assert.equal(pending.calls.length,0);
  assert.equal((await invoke(f.handle,'hearts',{token})).status,401);
});
test('all heart mutations acceptonly documentedpayload and propagate boundedpolicies without plaintextsecrets',async()=>{
  const f=fixture();
  for(const [path,body,method]of [['heartsettings',{enabled:false},'settings'],['heartbuy',{itemId:'scarf'},'buy'],['heartequip',{itemId:'default-hat'},'equip'],['heartgift',{itemId:'basket'},'gift'],['heartmessage',{text:'안부',unlockPercent:25},'message'],['heartread',{id:'abcdefghijklmnop'},'read'],['heartleave',{},'leave']]){
    const result=await invoke(f.handle,path,{body});assert.equal(result.status,200);assert.equal(f.calls.at(-1)[0],method);assert.equal(result.headers.get('cache-control'),'no-store');
    assert.equal((await invoke(f.handle,path,{body:{...body,owner:'other'}})).status,400);
  }
});
test('optional heart andlockedletter403 errors do notmasqueradeasinvalidwalkingcredentials',async()=>{
  for(const code of ['heart_consent_required','heart_paused','heart_league_consent_required','heart_message_locked']){
    const f=fixture({hearts:{get:async()=>{throw new WalkingError(403,code);}}});assert.equal((await invoke(f.handle,'hearts',{site:native,token:randomToken()})).body.error,code);
  }
});
test('onlymessageupload acceptslarge rasterpayload; every other heart action retains2048bytebodycap',async()=>{
  const png=Buffer.alloc(3000);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write('IHDR',12);png.writeUInt32BE(1,16);png.writeUInt32BE(1,20);
  const photo='data:image/png;base64,'+png.toString('base64');assert.equal(heartPhoto(photo),photo);
  const f=fixture(),body={text:'가족 사진',photo};assert.equal((await invoke(f.handle,'heartmessage',{body})).status,200);assert.equal(f.calls.at(-1)[2].photo,photo);
  assert.equal((await invoke(f.handle,'heartsettings',{body})).status,400);
  assert.equal((await invoke(f.handle,'heartmessage',{raw:' '.repeat(HEART_MESSAGE_BODY_BYTES+1)})).status,400);
  const huge=Buffer.from(png);huge.writeUInt32BE(10000,16);assert.throws(()=>heartPhoto('data:image/png;base64,'+huge.toString('base64')));
});
test('heart HTTP hasno trusted cooking ingestion ormanual step path',async()=>{
  const f=fixture();for(const path of ['heartcooking','recordCooking','heartsync'])assert.equal((await invoke(f.handle,path,{body:{count:10000,cooking:true}})).status,404);assert.equal(f.calls.length,0);
});
test('private walking enrollment and device confirmation require exact explicit non-ranking consent',async()=>{
  const f=fixture(),privateConsent={consentVersion:'2026-11-17-private',shareTodaySteps:true,shareRanking:false};
  assert.equal((await invoke(f.handle,'join',{body:{nickname:'가족산책',...privateConsent}})).status,200);
  assert.deepEqual(f.calls.at(-1),['walking-join','owner-a','가족산책',{sharingScope:'private'}]);
  const token=randomToken();assert.equal((await invoke(f.handle,'confirm',{site:native,token,body:privateConsent})).status,200);assert.deepEqual(f.calls.at(-1),['walking-confirm',token,privateConsent]);
  for(const patch of [{shareRanking:true},{shareTodaySteps:false},{consentVersion:'2026-11-17'},{count:5000}])assert.equal((await invoke(f.handle,'join',{body:{nickname:'가족산책',...privateConsent,...patch}})).status,400);
  const {shareRanking,...missing}=privateConsent;assert.equal((await invoke(f.handle,'confirm',{site:native,token,body:missing})).status,400);
  assert.equal((await invoke(f.handle,'join',{body:{nickname:'공개산책',consentVersion:'2026-11-17',shareTodaySteps:true}})).status,200);assert.deepEqual(f.calls.at(-1),['walking-join','owner-a','공개산책',{sharingScope:'public'}]);
});
test('heartmessage accepts an optional UUID idempotency key and reports conflicting reuse as 409',async()=>{
  const f=fixture(),requestId='2ff5a58e-fc5f-4ceb-8e37-cda18c159b51';
  assert.equal((await invoke(f.handle,'heartmessage',{body:{text:' 안부 ',requestId:requestId.toUpperCase()}})).status,200);
  assert.deepEqual(f.calls.at(-1),['message',{uid:'owner-a'},{text:'안부',unlockPercent:0,requestId}]);
  assert.equal((await invoke(f.handle,'heartmessage',{body:{text:'안부',requestId:'not-a-uuid'}})).status,400);
  const conflict=fixture({hearts:{message:async()=>{throw new WalkingError(409,'heart_message_request_conflict');}}});
  const result=await invoke(conflict.handle,'heartmessage',{body:{text:'다른 내용',requestId}});assert.equal(result.status,409);assert.equal(result.body.error,'heart_message_request_conflict');
});
