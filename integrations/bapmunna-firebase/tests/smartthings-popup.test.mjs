import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {connectInPopup} from '../docs/smartthings-popup.mjs';
function fixture(overrides={}){
  const listeners=new Map(),sent=[],controller=new AbortController();
  let openedUrl,reads=0,tokens=0,status={stage:'disconnected'};
  const popup={closed:false,postMessage:(value,origin)=>sent.push({value,origin}),close(){this.closed=true;}};
  const browser={crypto:{randomUUID:()=> 'fixed-channel-for-test'},location:{origin:'https://app.test'},open(url){openedUrl=url;return popup;},addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key)};
  const result=connectInPopup({origin:'https://backend.test',consentVersion:'test',signal:controller.signal,browser,getIdToken:async()=>{tokens++;return 'private-token';},readStatus:async()=>{reads++;return status;},pollMs:5,timeoutMs:200,...overrides});
  const message=(data={},origin='https://backend.test',source=popup)=>listeners.get('message')?.({origin,source,data:{channel:'fixed-channel-for-testfixed-channel-for-test',type:'bapmunna-ready',...data}});
  return {result,message,sent,controller,popup,browser,listeners,openedUrl,stats:()=>({reads,tokens}),setStatus:value=>{status=value;}};
}
test('popup binds token delivery to exact origin, source window and one-time channel',async()=>{
  const f=fixture();
  await f.message({},'https://attacker.test');await f.message({},'https://backend.test',{});await f.message({channel:'different-channel'});
  assert.equal(f.stats().tokens,0);assert.equal(f.sent.length,0);assert.doesNotMatch(f.openedUrl,/private-token/);
  await f.message();await f.message();assert.equal(f.sent.length,1);assert.equal(f.sent[0].origin,'https://backend.test');
  f.setStatus({stage:'choose_device'});assert.equal((await f.result).stage,'choose_device');assert.equal(f.listeners.size,0);assert.equal(f.popup.closed,true);
});
test('account logout during token refresh closes popup and prevents late token delivery',async()=>{
  let resolve;const pending=new Promise(r=>{resolve=r;});
  const f=fixture({getIdToken:()=>pending});const expected=assert.rejects(f.result,{code:'connection_cancelled'});
  void f.message();f.controller.abort();resolve('old-account-token');await expected;await delay(0);
  assert.equal(f.sent.length,0);assert.equal(f.popup.closed,true);assert.equal(f.listeners.size,0);
});
test('COOP removing opener still completes by reading only authenticated connection status',async()=>{
  const f=fixture();await f.message();f.popup.closed=true;f.setStatus({stage:'choose_device'});
  assert.equal((await f.result).stage,'choose_device');assert.ok(f.stats().reads>=1);
});
test('explicit cancellation cannot falsely report a connection',async()=>{
  const f=fixture();const expected=assert.rejects(f.result,{code:'connection_cancelled'});
  await f.message({type:'bapmunna-result',result:'cancelled'});await expected;assert.equal(f.stats().reads,0);
});
test('cancel after handoff invalidates the server attempt with the same owner token',async()=>{
  const cancellations=[];const f=fixture({cancelAttempt:async(token,attemptId)=>cancellations.push({token,attemptId})});
  const expected=assert.rejects(f.result,{code:'connection_cancelled'});await f.message();f.controller.abort();await expected;
  assert.deepEqual(cancellations,[{token:'private-token',attemptId:'fixed-channel-for-testfixed-channel-for-test'}]);
});
test('cancellation settles only after the bounded server invalidation finishes',async()=>{
  let finishCancel,settled=false;const cancellation=new Promise(resolve=>{finishCancel=resolve;});
  const f=fixture({cancelAttempt:()=>cancellation});
  const result=f.result.catch(error=>{settled=true;throw error;});const expected=assert.rejects(result,{code:'connection_cancelled'});
  await f.message();f.controller.abort();await delay(0);assert.equal(settled,false);
  finishCancel();await expected;assert.equal(settled,true);
});
test('blocked popup and unanswered handshake remain bounded and recoverable',async()=>{
  const controller=new AbortController();
  await assert.rejects(connectInPopup({origin:'https://backend.test',signal:controller.signal,browser:{crypto:{randomUUID:()=> 'test'},location:{origin:'https://app.test'},open:()=>null}}),{code:'popup_blocked'});
  const f=fixture({timeoutMs:15});await assert.rejects(f.result,{code:'connection_timeout'});assert.equal(f.stats().tokens,0);assert.equal(f.listeners.size,0);
});
