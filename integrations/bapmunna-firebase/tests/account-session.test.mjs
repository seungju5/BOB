import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mountAccount} from '../docs/account-view.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const user=(uid,verified=true)=>({uid,verified,email:`${uid}@example.invalid`,displayName:uid});
function fixture(t){
  const events=new Map(),refreshed=[];let listener;
  const provider={onUser(fn){listener=fn;fn(user('a',false));return()=>{listener=null;};},getProfile:async()=>null,isStaff:async()=>false,refreshUser:async()=>user('a')};
  const element={innerHTML:'',addEventListener:(type,fn)=>events.set(type,fn),removeEventListener:type=>events.delete(type)};
  const dispose=mountAccount(element,{audience:'carer',connect:async()=>provider,onSessionRefresh:value=>refreshed.push(value)});
  t.after(dispose);
  return {provider,element,refreshed,dispose,emit:(value,metadata)=>listener?.(value,metadata),refresh:()=>events.get('click')({stopPropagation(){},target:{closest:()=>({dataset:{cloudAction:'refresh-user'},closest:()=>null})}}),submit:()=>events.get('submit')({preventDefault(){},target:{id:'cloud-password-form',matches:()=>true,querySelectorAll:()=>[]}})};
}
test('email verification refresh updates the root even without an auth-state event',async t=>{
  const f=fixture(t);await flush();await f.refresh();
  assert.deepEqual(f.refreshed,[user('a')]);assert.match(f.element.innerHTML,/a님, 안녕하세요/);
});
test('an old refresh result cannot replace a newer signed-in account',async t=>{
  const f=fixture(t),pending=deferred();await flush();f.provider.refreshUser=()=>pending.promise;
  const run=f.refresh();f.emit(user('b'));await flush();pending.resolve(user('a'));await run;
  assert.deepEqual(f.refreshed,[]);assert.match(f.element.innerHTML,/b님, 안녕하세요/);assert.doesNotMatch(f.element.innerHTML,/a님, 안녕하세요/);
});
test('a refresh completed after leaving the screen never updates the root',async t=>{
  const f=fixture(t),pending=deferred();await flush();f.provider.refreshUser=()=>pending.promise;
  const run=f.refresh();f.dispose();pending.resolve(user('a'));await run;
  assert.deepEqual(f.refreshed,[]);
});
test('profile loading after refresh cannot publish the superseded identity',async t=>{
  const f=fixture(t),pending=deferred();await flush();let calls=0;f.provider.getProfile=()=>++calls===1?pending.promise:Promise.resolve(null);
  const run=f.refresh();await flush();f.emit(user('b'));await flush();pending.resolve(null);await run;
  assert.deepEqual(f.refreshed,[]);assert.match(f.element.innerHTML,/b님, 안녕하세요/);
});
function passwordFormData(t){
  const original=globalThis.FormData;
  globalThis.FormData=class{get(){return 'fixture-only-password';}};
  t.after(()=>{globalThis.FormData=original;});
}
test('same-account USER_UPDATED during password recovery still completes',async t=>{
  passwordFormData(t);const f=fixture(t);await flush();f.emit(user('a'),{recovery:true});
  f.provider.changePassword=async()=>{f.emit(user('a'),{recovery:false});};
  await f.submit();assert.deepEqual(f.refreshed,[user('a')]);assert.doesNotMatch(f.element.innerHTML,/id="cloud-password-form"/);
});
test('password response from a previous account cannot update the replacement',async t=>{
  passwordFormData(t);const f=fixture(t),pending=deferred();await flush();f.emit(user('a'),{recovery:true});
  f.provider.changePassword=()=>pending.promise;const run=f.submit();f.emit(user('b'));await flush();pending.resolve();await run;
  assert.deepEqual(f.refreshed,[]);assert.match(f.element.innerHTML,/b님, 안녕하세요/);assert.doesNotMatch(f.element.innerHTML,/a님, 안녕하세요|id="cloud-password-form"/);
});
