import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runtimeSurface,runtimeSession,accountBoundaryChanged,createAccountBoundary,createRuntimeSession,readTutorialHint,writeTutorialHint} from '../docs/runtime-mode.mjs';
import {livePage,liveTutorialPage} from '../docs/live-view.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('hosted screens never default to seeded demo, regardless of auth result',()=>{
  for(const view of ['guardian','senior','report','alerts','settings','family','privacy','more','tutorial'])assert.equal(runtimeSurface({cloudEnabled:true,view}),'live');
  assert.equal(runtimeSurface({cloudEnabled:true,explicitDemo:true,view:'guardian'}),'demo');
  assert.equal(runtimeSurface({cloudEnabled:false,view:'guardian'}),'demo');
});
test('explicit demo does not turn account or SmartThings into fake service',()=>{
  for(const view of ['account','connect'])assert.equal(runtimeSurface({cloudEnabled:true,explicitDemo:true,view}),'service');
  assert.equal(runtimeSurface({cloudEnabled:true,view:'journey'}),'demo');
});
test('only provider identity is used, with no retained credentials or profile',()=>{
  assert.deepEqual(runtimeSession({uid:'a',verified:true,token:'private',email:'not-retained'}),{status:'signed-in',uid:'a'});
  assert.equal(runtimeSession(null).status,'signed-out');
  assert.equal(runtimeSession({uid:'a',verified:false}).status,'unverified');
  assert.equal(runtimeSession({verified:true}).status,'error');
  assert.equal(runtimeSession({uid:'a',verified:true},{recovery:true}).status,'recovery');
});
test('login/logout/account replacement exit an old demo and clear presentation state',()=>{
  assert.equal(accountBoundaryChanged({status:'signed-out',uid:null},{status:'signed-in',uid:'a'}),true);
  assert.equal(accountBoundaryChanged({status:'signed-in',uid:'a'},{status:'signed-in',uid:'b'}),true);
  assert.equal(accountBoundaryChanged({status:'signed-in',uid:'a'},{status:'signed-out',uid:null}),true);
  assert.equal(accountBoundaryChanged({status:'signed-in',uid:'a'},{status:'signed-in',uid:'a'}),false);
});
test('account observation follows provider changes without demo fallback',async()=>{
  let listener,stopped=0;const states=[];
  const control=createRuntimeSession({connect:async()=>({onUser(callback){listener=callback;return()=>stopped++;}}),onChange:value=>states.push(value)});
  control.start();await tick();listener(null);listener({uid:'a',verified:true});listener({uid:'b',verified:true});listener(null);control.dispose();
  assert.deepEqual(states.map(s=>s.status),['checking','signed-out','signed-in','signed-in','signed-out']);assert.equal(stopped,1);
});
test('account boundary survives loading, failed retries and restored pages',()=>{
  const changed=createAccountBoundary();
  assert.equal(changed({status:'signed-in',uid:'a'}),false);
  assert.equal(changed({status:'checking',uid:null}),false);
  assert.equal(changed({status:'error',uid:null}),false);
  assert.equal(changed({status:'signed-in',uid:'a'}),false);
  assert.equal(changed({status:'checking',uid:null}),false);
  assert.equal(changed({status:'signed-in',uid:'b'}),true);
  assert.equal(changed({status:'signed-out',uid:null}),true);
  assert.equal(changed({status:'unverified',uid:'b'}),true);
  assert.equal(changed({status:'signed-in',uid:'b'}),true);
});
test('provider failure has a finite error and retry can recover',async()=>{
  let reject=true;const states=[];
  const control=createRuntimeSession({connect:async()=>{if(reject)throw Error('offline');return {onUser(fn){fn(null);return()=>{};}};},onChange:s=>states.push(s)});
  control.start();await tick();assert.equal(states.at(-1).status,'error');reject=false;control.start();await tick();assert.equal(states.at(-1).status,'signed-out');control.dispose();
});
test('auth timeout rejects a late callback and cleans the old observer',async()=>{
  let callback,stopped=false;const states=[];
  const control=createRuntimeSession({connect:async()=>({onUser(fn){callback=fn;return()=>{stopped=true;};}}),onChange:s=>states.push(s),timeoutMs:15});
  control.start();await new Promise(resolve=>setTimeout(resolve,30));assert.equal(states.at(-1).status,'error');assert.equal(stopped,true);
  callback({uid:'old',verified:true});assert.equal(states.at(-1).status,'error');control.dispose();
});
test('late provider initialization after retry cannot replace the current account',async()=>{
  let firstResolve,calls=0;const states=[];
  const control=createRuntimeSession({connect:()=>++calls===1?new Promise(r=>{firstResolve=r;}):Promise.resolve({onUser(fn){fn({uid:'new',verified:true});return()=>{};}}),onChange:s=>states.push(s)});
  control.start();await tick();control.start();await tick();firstResolve({onUser(){throw Error('must not subscribe');}});await tick();assert.deepEqual(states.at(-1),{status:'signed-in',uid:'new'});control.dispose();
});
test('tutorial hint is account and provider scoped, never auth evidence',()=>{
  const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
  writeTutorialHint(storage,'https://impact-series.web.app/bapmunna/','a');
  assert.equal(readTutorialHint(storage,'https://impact-series.web.app/bapmunna/','a'),true);
  assert.equal(readTutorialHint(storage,'https://impact-series.web.app/bapmunna/','b'),false);
  assert.equal(readTutorialHint(storage,'https://impact-series.web.app/bapmunna/supabase/','a'),false);
  assert.equal(readTutorialHint({getItem(){throw Error();}},'https://impact-series.web.app/bapmunna/','a'),false);
  assert.doesNotThrow(()=>writeTutorialHint({setItem(){throw Error();}},'https://impact-series.web.app/bapmunna/','a'));
});
test('live home, reports and alerts never expose fixture meals or timestamps',()=>{
  for(const status of ['checking','signed-in','signed-out','unverified','recovery','error'])for(const view of ['guardian','senior','report','alerts','settings','family','more']){
    const html=livePage({view,edition:'carer',session:{status,uid:'test'},href:v=>'#'+v,companion:'cooker.png'});
    assert.doesNotMatch(html,/11:42|10월 7일|가상 요약|가상 기기 연결됨|data-meal-detail|data-ack=|data-signal=/);
    assert.match(html,/data-runtime-mode="live"/);
  }
});
test('connection entry and tutorial use fixed home flow, without forced API steps',()=>{
  const home=livePage({view:'guardian',edition:'carer',session:{status:'signed-in'},href:v=>'#'+v,companion:'cooker.png'});
  assert.match(home,/href="#connect"/);
  const last=liveTutorialPage({index:4,companion:'cooker.png'});
  assert.match(last,/홈으로 시작하기/);assert.doesNotMatch(last,/href="#connect"/);
});
