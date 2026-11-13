import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as authUtils from '../cloud/auth-utils.mjs';
import {createSessionStorage} from '../cloud/session-storage.mjs';

const sourceURL=new URL('../cloud/supabase-provider.src.mjs',import.meta.url);
const source=readFileSync(sourceURL,'utf8');
// Execute the actual provider in a fresh realm. Only SDK, storage and event IO
// are stubbed; no SDK session, email, credential or database is used.
const executable=source.replace(/^import .+;\n/gm,'')
  .replace('export function createProvider','function createProvider')
  .replaceAll('import.meta.url',JSON.stringify(sourceURL.href));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
const user=id=>({id,email:`${id}@example.invalid`,email_confirmed_at:'2026-11-13T00:00:00Z',user_metadata:{display_name:id}});
const meal=(uid,kind='home')=>({owner_uid:uid,day:'2026-11-13',meal:'lunch',kind});
const memoryStorage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};};

function fixture(t,{initialSession=null}={}){
  let activeUser=user('account-a');
  const authListeners=new Set(),focusListeners=new Set(),reads=[],identities=[],stops=[];
  const auth={
    getSession:()=>initialSession?.promise??Promise.resolve({data:{session:{user:activeUser}},error:null}),
    getUser:async()=>({data:{user:activeUser},error:null}),
    onAuthStateChange(callback){authListeners.add(callback);return {data:{subscription:{unsubscribe:()=>authListeners.delete(callback)}}};},
    signOut:async()=>{emit(null);return {error:null};},
  };
  const client={auth,from(table){
    assert.equal(table,'bapmunna_meals');
    let uid;
    const query={select(){return query;},eq(key,value){assert.equal(key,'owner_uid');uid=value;return query;},order(){return query;},limit(){const pending=deferred();reads.push({uid,...pending});return pending.promise;}};
    return query;
  }};
  function emit(next){activeUser=next;for(const listener of authListeners)listener(next?'SIGNED_IN':'SIGNED_OUT',next?{user:next}:null);}
  const realm={...authUtils,createSessionStorage,createClient:()=>client,URL,setTimeout,
    localStorage:memoryStorage(),sessionStorage:memoryStorage(),
    window:{addEventListener:(event,callback)=>{assert.equal(event,'focus');focusListeners.add(callback);},removeEventListener:(event,callback)=>{assert.equal(event,'focus');focusListeners.delete(callback);}}};
  vm.createContext(realm);vm.runInContext(`${executable};globalThis.factory=createProvider;`,realm,{filename:sourceURL.pathname});
  const provider=realm.factory({url:'https://fixture.invalid',publishableKey:'fixture-not-a-key'});
  const unwatch=provider.onUser(identity=>identities.push(identity?.uid??null));
  t.after(()=>{for(const stop of stops)stop();unwatch();});
  return {provider,auth,reads,identities,emit,focus:()=>{for(const callback of focusListeners)callback();},focusCount:()=>focusListeners.size,
    watch(callback,onError){const stop=provider.watchMeals(callback,onError);stops.push(stop);return stop;},
    finish(index,rows){reads[index].resolve({data:rows,error:null});},
    fail(index){reads[index].resolve({data:null,error:Error('synthetic read failure')});}};
}

test('a delayed account A read never reaches account B after its watcher is installed',async t=>{
  const f=fixture(t),seenA=[],seenB=[];await flush();
  f.watch(rows=>seenA.push(...rows));
  f.emit(user('account-b'));await flush();
  f.watch(rows=>seenB.push(...rows));
  assert.deepEqual(f.reads.map(read=>read.uid),['account-a','account-b']);
  f.finish(1,[meal('account-b')]);await flush();
  f.finish(0,[meal('account-a')]);await flush();
  assert.deepEqual(seenA,[]);assert.deepEqual(seenB.map(row=>row.ownerUid),['account-b']);
});

test('unsubscribing suppresses both a pending result and its focus listener',async t=>{
  const f=fixture(t),seen=[];await flush();
  const stop=f.watch(rows=>seen.push(...rows));assert.equal(f.focusCount(),1);
  stop();assert.equal(f.focusCount(),0);f.focus();assert.equal(f.reads.length,1);
  f.finish(0,[meal('account-a')]);await flush();assert.deepEqual(seen,[]);
});

test('same UID resubscription cannot receive an earlier subscription result or be cleared by its cleanup',async t=>{
  const f=fixture(t),oldSeen=[],newSeen=[];await flush();
  const oldStop=f.watch(rows=>oldSeen.push(...rows));
  f.watch(rows=>newSeen.push(...rows));oldStop();
  assert.equal(f.focusCount(),1);
  f.finish(0,[meal('account-a','outside')]);await flush();
  assert.deepEqual(oldSeen,[]);assert.deepEqual(newSeen,[]);
  f.finish(1,[meal('account-a')]);await flush();
  assert.deepEqual(newSeen.map(row=>row.kind),['home']);
});

test('an error from a superseded account does not reach either account error callback',async t=>{
  const f=fixture(t),errors=[];await flush();
  f.watch(()=>{},error=>errors.push(error.message));
  f.emit(user('account-b'));await flush();
  f.watch(()=>{},error=>errors.push(error.message));
  f.fail(0);f.finish(1,[]);await flush();assert.deepEqual(errors,[]);
});

test('logout invalidates pending reads even when the UI has not unsubscribed yet',async t=>{
  const f=fixture(t),seen=[];await flush();f.watch(rows=>seen.push(...rows));
  await f.provider.signOut();f.finish(0,[meal('account-a')]);await flush();
  assert.deepEqual(seen,[]);assert.equal(f.focusCount(),0);
});

test('switching A to B and back to A cannot revive the first A request',async t=>{
  const f=fixture(t),seen=[];await flush();f.watch(rows=>seen.push(...rows));
  f.emit(user('account-b'));f.emit(user('account-a'));await flush();
  f.watch(rows=>seen.push(...rows));f.finish(0,[meal('account-a','outside')]);f.finish(1,[meal('account-a')]);await flush();
  assert.deepEqual(seen.map(row=>row.kind),['home']);
});

test('a later focus refresh wins over an older request in the same subscription',async t=>{
  const f=fixture(t),seen=[];await flush();f.watch(rows=>seen.push(...rows));f.focus();
  f.finish(1,[meal('account-a','outside')]);await flush();f.finish(0,[meal('account-a')]);await flush();
  assert.deepEqual(seen.map(row=>row.kind),['outside']);
});

test('a late initial getSession cannot undo a newer auth event',async t=>{
  const initialSession=deferred(),f=fixture(t,{initialSession});
  f.emit(user('account-b'));initialSession.resolve({data:{session:{user:user('account-a')}},error:null});await flush();
  f.watch(()=>{});assert.equal(f.reads[0].uid,'account-b');assert.deepEqual(f.identities,['account-b']);f.finish(0,[]);
});

test('a late refreshUser getUser response cannot replace the newly signed-in account',async t=>{
  const f=fixture(t),pending=deferred();await flush();f.auth.getUser=()=>pending.promise;
  const refreshing=f.provider.refreshUser();await flush();f.emit(user('account-b'));
  pending.resolve({data:{user:user('account-a')},error:null});
  assert.equal((await refreshing).uid,'account-b');f.watch(()=>{});assert.equal(f.reads[0].uid,'account-b');f.finish(0,[]);
});
