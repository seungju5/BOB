import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {mountHousehold} from '../docs/household-view.mjs';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const user=(uid='a',verified=true)=>({uid,verified,email:`${uid}@example.invalid`});
const fields=(alias='우리 집')=>({relation:'mother',alias,residentCount:1,hasPet:false});
const stored=(uid='a',alias='우리 집')=>({ownerUid:uid,...fields(alias),updatedAt:{seconds:123}});

function fixture(t,options={}){
  const events=new Map(),listeners=[],reads=[],writes=[];let active=options.user===undefined?user():options.user,listener,unsubscribed=0;
  const provider={
    name:'Firebase',
    onUser(fn){listener=fn;listeners.push(fn);if(!options.waitAuth)fn(active);return()=>{unsubscribed++;if(listener===fn)listener=null;};},
    getHousehold(expectedUid){assert.equal(expectedUid,active?.uid);reads.push(active?.uid);return options.read?options.read(active):Promise.resolve(options.record??null);},
    saveHousehold(value,expectedUid){assert.equal(expectedUid,active?.uid);writes.push({uid:active?.uid,value});return options.save?options.save(value,active):Promise.resolve({...stored(active.uid),...value});},
  };
  if(options.unsupported){provider.name='Supabase';delete provider.getHousehold;delete provider.saveHousehold;}
  const element={innerHTML:'',addEventListener:(event,fn)=>events.set(event,fn),removeEventListener:event=>events.delete(event)};
  t.mock.method(globalThis,'FormData',function(form){this.get=name=>form.values[name]??null;});
  const dispose=mountHousehold(element,{homeHref:options.homeHref??'/bapmunna/carer/#guardian',connect:()=>options.connect?options.connect(provider):Promise.resolve(provider)});
  t.after(dispose);
  return {provider,element,events,listeners,reads,writes,dispose,get unsubscribed(){return unsubscribed;},
    emit(value){active=value;listener?.(value);},
    submit(value=fields(),consent=true){return events.get('submit')?.({preventDefault(){},stopPropagation(){},target:{matches:selector=>selector==='[data-household-form]',values:{...value,privacyConsent:consent?'on':null,residentCount:String(value.residentCount),hasPet:value.hasPet?'on':null}}});},
    click(action){return events.get('click')?.({stopPropagation(){},target:{closest:()=>({dataset:{householdAction:action}})}});},
  };
}

function fakeClock(t){
  let sequence=0,now=0;const timers=new Map();
  t.mock.method(globalThis,'setTimeout',(fn,ms)=>{const id=++sequence;timers.set(id,{fn,at:now+ms});return id;});
  t.mock.method(globalThis,'clearTimeout',id=>timers.delete(id));
  return {advance(ms=12_000){now+=ms;for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}},get pending(){return timers.size;}};
}

test('household waits for actual auth and never reads for signed-out or unverified users',async t=>{
  const f=fixture(t,{waitAuth:true});await flush();assert.match(f.element.innerHTML,/계정을 확인/);assert.doesNotMatch(f.element.innerHTML,/<form/);assert.equal(f.reads.length,0);
  f.emit(null);assert.match(f.element.innerHTML,/먼저 보호자 본인/);f.emit(user('a',false));assert.match(f.element.innerHTML,/이메일 확인/);assert.equal(f.reads.length,0);assert.equal(f.writes.length,0);
});

test('synchronous auth opens a blank, labelled form without seeded family names or consent',async t=>{
  const f=fixture(t);await flush();assert.deepEqual(f.reads,['a']);
  assert.match(f.element.innerHTML,/<input name="alias" value=""/);assert.match(f.element.innerHTML,/관계를 선택해 주세요/);
  for(const label of ['누구의 안부','어떻게 불러','함께 사는 인원','반려동물'])assert.ok(f.element.innerHTML.includes(label));
  assert.match(f.element.innerHTML,/개인정보 안내 보기/);assert.match(f.element.innerHTML,/실제 기기 연결과 가족 공유 권한은 별도로 확인/);assert.equal(f.writes.length,0);
});

test('required household consent blocks a synthetic direct submit and resets for another account',async t=>{
  const f=fixture(t);await flush();
  assert.match(f.element.innerHTML,/name="privacyConsent" required/);
  assert.doesNotMatch(f.element.innerHTML,/name="privacyConsent" required checked/);
  await f.submit(fields('미동의 가상 정보'),false);
  assert.equal(f.writes.length,0);assert.match(f.element.innerHTML,/동의를 확인해 주세요/);
  await f.submit(fields('동의한 가상 정보'),true);assert.equal(f.writes.length,1);
  f.click('edit');assert.doesNotMatch(f.element.innerHTML,/name="privacyConsent" required checked/);
  f.emit(user('b'));await flush();
  assert.doesNotMatch(f.element.innerHTML,/name="privacyConsent" required checked/);
  await f.submit(fields('다른 계정 가상 정보'),false);assert.equal(f.writes.length,1);
});

test('existing household values load from the account and rendered aliases are escaped',async t=>{
  const f=fixture(t,{record:{...stored('a','<img src=x onerror=1>'),relation:'parents',residentCount:3,hasPet:true}});await flush();
  assert.match(f.element.innerHTML,/value="&lt;img src=x onerror=1&gt;"/);assert.doesNotMatch(f.element.innerHTML,/<img src=x/);
  assert.match(f.element.innerHTML,/<option value="parents" selected>/);assert.match(f.element.innerHTML,/<option value="3" selected>/);assert.match(f.element.innerHTML,/name="hasPet" checked/);assert.equal(f.writes.length,0);
});

test('save waits for stored data, trims the submitted alias and offers an explicit home link',async t=>{
  const pending=deferred(),f=fixture(t,{save:()=>pending.promise});await flush();const run=f.submit(fields('  입력 호칭  '));await flush();
  assert.match(f.element.innerHTML,/저장 확인 중/);assert.doesNotMatch(f.element.innerHTML,/기본정보를 저장했어요/);assert.deepEqual(f.writes[0].value,fields('입력 호칭'));
  pending.resolve(stored('a','서버에서 확인한 호칭'));await run;
  assert.match(f.element.innerHTML,/기본정보를 저장했어요/);assert.match(f.element.innerHTML,/서버에서 확인한 호칭/);assert.match(f.element.innerHTML,/href="\/bapmunna\/carer\/#guardian">홈으로 가기/);
  assert.deepEqual(Object.keys(f.writes[0].value).sort(),['alias','hasPet','relation','residentCount']);
});

test('save rejection keeps the draft and permits a real retry without advancing',async t=>{
  let attempt=0;const f=fixture(t,{save:value=>++attempt===1?Promise.reject(Error('offline')):Promise.resolve({...stored(),...value})});await flush();await f.submit(fields('남겨둔 호칭'));
  assert.match(f.element.innerHTML,/저장 결과를 확인하지 못했어요/);assert.match(f.element.innerHTML,/value="남겨둔 호칭"/);assert.doesNotMatch(f.element.innerHTML,/기본정보를 저장했어요|>홈으로 가기/);
  await f.submit(fields('남겨둔 호칭'));assert.match(f.element.innerHTML,/기본정보를 저장했어요/);assert.equal(f.writes.length,2);
});

test('undefined or another-account save responses cannot claim success',async t=>{
  let attempt=0;const f=fixture(t,{save:async()=>++attempt===1?undefined:stored('b','다른 계정')});await flush();
  await f.submit();assert.match(f.element.innerHTML,/저장 결과를 확인하지 못했어요/);
  await f.submit();assert.doesNotMatch(f.element.innerHTML,/기본정보를 저장했어요|다른 계정/);
});

test('invalid household values never call the adapter',async t=>{
  const f=fixture(t);await flush();
  for(const changed of [{alias:'   '},{alias:'가'.repeat(31)},{relation:'administrator'},{residentCount:0},{residentCount:7},{residentCount:1.5}])await f.submit({...fields(),...changed});
  assert.equal(f.writes.length,0);assert.match(f.element.innerHTML,/관계, 1~30자의 호칭/);
});

test('a late account A read cannot replace account B household',async t=>{
  const pending=deferred(),f=fixture(t,{read:who=>who.uid==='a'?pending.promise:Promise.resolve(stored('b','B의 호칭'))});await flush();
  f.emit(user('b'));await flush();pending.resolve(stored('a','A의 비공개 호칭'));await flush();assert.match(f.element.innerHTML,/B의 호칭/);assert.doesNotMatch(f.element.innerHTML,/A의 비공개/);
});

test('A to B to A changes invalidate the original A read even after returning to the same uid',async t=>{
  const pending=deferred();let count=0;const f=fixture(t,{read:who=>++count===1?pending.promise:Promise.resolve(stored(who.uid,`${who.uid} 최신 호칭`))});await flush();
  f.emit(user('b'));await flush();f.emit(user('a'));await flush();pending.resolve(stored('a','이전 A'));await flush();assert.match(f.element.innerHTML,/a 최신 호칭/);assert.doesNotMatch(f.element.innerHTML,/이전 A/);
});

test('a late save from a previous account cannot mark the replacement account saved',async t=>{
  const pending=deferred(),f=fixture(t,{save:()=>pending.promise,read:who=>who.uid==='a'?Promise.resolve(null):Promise.resolve(stored('b','B의 호칭'))});await flush();
  const run=f.submit(fields('A의 호칭'));await flush();f.emit(user('b'));await flush();pending.resolve(stored('a','A의 호칭'));await run;
  assert.match(f.element.innerHTML,/B의 호칭/);assert.doesNotMatch(f.element.innerHTML,/A의 호칭|기본정보를 저장했어요/);
});

test('account switch before the deferred adapter invocation prevents writing A values as B',async t=>{
  const f=fixture(t);await flush();const run=f.submit(fields('A의 초안'));f.emit(user('b'));await run;await flush();
  assert.equal(f.writes.length,0);assert.doesNotMatch(f.element.innerHTML,/A의 초안|기본정보를 저장했어요/);
});

test('unmount ignores late reads and removes the auth observer and DOM events',async t=>{
  const pending=deferred(),f=fixture(t,{read:()=>pending.promise});await flush();f.dispose();const before=f.element.innerHTML;
  pending.resolve(stored('a','늦은 호칭'));await flush();assert.equal(f.element.innerHTML,before);assert.equal(f.events.size,0);assert.equal(f.unsubscribed,1);
});

test('unmount ignores late saves and repeated same-account auth does not cancel a valid save',async t=>{
  const pending=deferred(),f=fixture(t,{save:()=>pending.promise});await flush();const run=f.submit();await flush();f.emit(user('a'));pending.resolve(stored());await run;assert.match(f.element.innerHTML,/기본정보를 저장했어요/);
  f.click('edit');const next=deferred();f.provider.saveHousehold=()=>next.promise;const late=f.submit();await flush();f.dispose();const before=f.element.innerHTML;next.resolve(stored('a','늦은 저장'));await late;assert.equal(f.element.innerHTML,before);
});

test('unsupported Supabase adapters show preparation status without a fake save form',async t=>{
  const f=fixture(t,{unsupported:true});await flush();assert.match(f.element.innerHTML,/이 버전의 가구 정보 저장은 준비 중/);assert.match(f.element.innerHTML,/Firebase와 Supabase는 별도 계정/);assert.doesNotMatch(f.element.innerHTML,/<form/);assert.match(f.element.innerHTML,/나중에 홈으로/);
});

test('load failure has a retry and wrong-owner data is never rendered',async t=>{
  let count=0;const f=fixture(t,{read:async()=>++count===1?stored('b','다른 사람 이름'):stored('a','내 호칭')});await flush();
  assert.match(f.element.innerHTML,/불러오지 못했어요/);assert.doesNotMatch(f.element.innerHTML,/다른 사람 이름/);await f.click('retry-load');assert.match(f.element.innerHTML,/내 호칭/);
});

test('external and executable home URLs are replaced with the local guardian home',async t=>{
  const f=fixture(t,{homeHref:'javascript:alert(1)'});await flush();assert.match(f.element.innerHTML,/href="#guardian">나중에 홈으로/);assert.doesNotMatch(f.element.innerHTML,/javascript:/);
});

test('SDK connection timeout offers retry and a late original connection cannot install its observer',async t=>{
  const clock=fakeClock(t),pending=deferred();let attempt=0;const f=fixture(t,{connect:provider=>++attempt===1?pending.promise:Promise.resolve(provider)});await flush();clock.advance();await flush();
  assert.match(f.element.innerHTML,/계정 연결을 확인하지 못했어요/);assert.match(f.element.innerHTML,/나중에 홈으로/);await f.click('retry-connect');await flush();assert.equal(f.listeners.length,1);
  pending.resolve(f.provider);await flush();assert.equal(f.listeners.length,1);assert.match(f.element.innerHTML,/<form/);
});

test('first auth timeout unsubscribes and ignores a late event after retry',async t=>{
  const clock=fakeClock(t),f=fixture(t,{waitAuth:true});await flush();const old=f.listeners[0];clock.advance();await flush();
  assert.match(f.element.innerHTML,/계정 연결을 확인하지 못했어요/);assert.equal(f.unsubscribed,1);
  const retry=f.click('retry-connect');await flush();f.emit(user('b'));await retry;await flush();old(user('a'));await flush();assert.deepEqual(f.reads,['b']);
});

test('read timeout permits retry and the late timed-out response cannot overwrite fresh data',async t=>{
  const clock=fakeClock(t),pending=deferred();let attempt=0;const f=fixture(t,{read:()=>++attempt===1?pending.promise:Promise.resolve(stored('a','새로 읽은 호칭'))});await flush();clock.advance();await flush();
  assert.match(f.element.innerHTML,/불러오지 못했어요/);await f.click('retry-load');pending.resolve(stored('a','늦은 이전 호칭'));await flush();assert.match(f.element.innerHTML,/새로 읽은 호칭/);assert.doesNotMatch(f.element.innerHTML,/늦은 이전/);
});

test('save timeout means unconfirmed, permits server reload and ignores the late save result',async t=>{
  const clock=fakeClock(t),pending=deferred();let reads=0;const f=fixture(t,{save:()=>pending.promise,read:async()=>++reads===1?null:stored('a','서버 재확인 호칭')});await flush();
  const run=f.submit(fields('입력 호칭'));await flush();clock.advance();await run;assert.match(f.element.innerHTML,/저장 결과를 확인하지 못했어요/);assert.match(f.element.innerHTML,/value="입력 호칭"/);assert.doesNotMatch(f.element.innerHTML,/기본정보를 저장했어요|저장에 실패/);
  await f.click('retry-load');pending.resolve(stored('a','늦은 저장 호칭'));await flush();assert.match(f.element.innerHTML,/서버 재확인 호칭/);assert.doesNotMatch(f.element.innerHTML,/늦은 저장 호칭|기본정보를 저장했어요/);
});

// Exercise the real Firebase adapter with only SDK I/O replaced; no live account,
// network, database, or generated cloud bundle is used by these tests.
const providerSource=readFileSync(new URL('../cloud/firebase-provider.src.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export function createProvider','function createProvider');
function firebaseFixture(){
  class Stamp{toDate(){return new Date(123);}}
  const auth={currentUser:{uid:'a',emailVerified:true}},listeners=new Set(),database=new Map(),reads=[],writes=[];
  const snap=value=>({exists:()=>value!==null,data:()=>value});
  const sdk={
    getApps:()=>[],initializeApp:()=>({}),getAuth:()=>auth,getFirestore:()=>({}),
    onAuthStateChanged:(_auth,callback)=>{listeners.add(callback);callback(auth.currentUser);return()=>listeners.delete(callback);},
    doc:(_db,...parts)=>({path:parts.join('/')}),Timestamp:Stamp,
    serverTimestamp:()=>({sentinel:true}),
    getDocFromServer:async ref=>{reads.push(ref.path);return snap(database.get(ref.path)??null);},
    setDoc:async(ref,value)=>{writes.push({path:ref.path,value});database.set(ref.path,{...value,updatedAt:new Stamp()});},
  };
  // Mutable forwarding functions let individual tests delay the actual I/O edge.
  const context={...sdk,getDocFromServer:(...args)=>sdk.getDocFromServer(...args),setDoc:(...args)=>sdk.setDoc(...args)};
  const create=runInNewContext(`${providerSource}\ncreateProvider;`,context);
  return {provider:create({}),sdk,auth,listeners,database,reads,writes,snap,stamp:()=>new Stamp(),
    emit(value){auth.currentUser=value;for(const listener of [...listeners])listener(value);},
  };
}
const plain=value=>JSON.parse(JSON.stringify(value));

test('Firebase API token requires the displayed UID before starting token retrieval',async()=>{
  const f=firebaseFixture();let calls=0;f.auth.currentUser.getIdToken=async()=>{calls++;return 'only-a-token';};
  for(const expected of [undefined,'b'])await assert.rejects(f.provider.getIdToken(expected),{code:'auth/user-changed'});
  assert.equal(calls,0);assert.equal(await f.provider.getIdToken('a'),'only-a-token');assert.equal(f.listeners.size,0);
});

test('Firebase API token is discarded if currentUser changes before auth observers run',async()=>{
  const f=firebaseFixture(),pending=deferred();f.auth.currentUser.getIdToken=()=>pending.promise;
  const token=f.provider.getIdToken('a');f.auth.currentUser={uid:'b',emailVerified:true};pending.resolve('a-private-token');
  await assert.rejects(token,{code:'auth/user-changed'});assert.equal(f.listeners.size,0);
});

test('Firebase API token does not cross an A to B to A session transition',async()=>{
  const f=firebaseFixture(),pending=deferred(),original=f.auth.currentUser;original.getIdToken=()=>pending.promise;
  const token=f.provider.getIdToken('a');f.emit({uid:'b',emailVerified:true});f.emit(original);pending.resolve('a-private-token');
  await assert.rejects(token,{code:'auth/user-changed'});assert.equal(f.listeners.size,0);
});

test('Firebase household adapter writes only the owner-private path and returns server-stamped stored values',async()=>{
  const f=firebaseFixture();assert.equal(await f.provider.getHousehold('a'),null);const actual=await f.provider.saveHousehold(fields('  내 호칭  '),'a');
  assert.equal(actual.alias,'내 호칭');assert.ok(actual.updatedAt.toDate() instanceof Date);assert.equal(f.writes[0].path,'bapmunnaAccounts/a/preferences/household');
  assert.deepEqual(Object.keys(f.writes[0].value).sort(),['alias','hasPet','ownerUid','relation','residentCount','updatedAt']);assert.deepEqual(plain(await f.provider.getHousehold('a')),plain(actual));assert.equal(f.listeners.size,0);
});

test('Firebase household adapter rejects invalid or consent-bearing payloads before writes',async()=>{
  const f=firebaseFixture();for(const changed of [{ownerUid:'b'},{consent:true},{alias:' '},{alias:'x'.repeat(31)},{relation:'viewer'},{residentCount:0},{residentCount:7},{residentCount:2.5},{hasPet:'false'}])await assert.rejects(f.provider.saveHousehold({...fields(),...changed},'a'));
  assert.equal(f.writes.length,0);assert.equal(f.listeners.size,0);f.emit({uid:'a',emailVerified:false});await assert.rejects(f.provider.getHousehold('a'));assert.equal(f.reads.length,0);
});

test('Firebase household adapter discards a late read across A to B to A sessions',async()=>{
  const f=firebaseFixture(),pending=deferred(),original=f.auth.currentUser;f.sdk.getDocFromServer=()=>pending.promise;
  const read=f.provider.getHousehold('a');f.emit({uid:'b',emailVerified:true});f.emit(original);pending.resolve(f.snap({...stored(),updatedAt:f.stamp()}));
  await assert.rejects(read,{code:'auth/user-changed'});assert.equal(f.listeners.size,0);
});

test('Firebase household adapter cannot report a write success after the account changes',async()=>{
  const f=firebaseFixture(),pending=deferred();f.sdk.setDoc=(ref,value)=>{f.writes.push({path:ref.path,value});return pending.promise;};
  const saving=f.provider.saveHousehold(fields('A의 호칭'),'a');f.emit({uid:'b',emailVerified:true});pending.resolve();await assert.rejects(saving,{code:'auth/user-changed'});
  assert.equal(f.writes[0].path,'bapmunnaAccounts/a/preferences/household');assert.equal(f.reads.length,0);assert.equal(f.listeners.size,0);
});

test('Firebase household adapter requires successful server readback and a timestamp before claiming save',async()=>{
  const f=firebaseFixture();f.sdk.getDocFromServer=async()=>f.snap(null);await assert.rejects(f.provider.saveHousehold(fields(),'a'));
  f.sdk.getDocFromServer=async()=>f.snap({...stored(),updatedAt:null});await assert.rejects(f.provider.saveHousehold(fields(),'a'));
  f.sdk.getDocFromServer=async()=>{throw Error('unavailable');};await assert.rejects(f.provider.saveHousehold(fields(),'a'));assert.equal(f.listeners.size,0);
});

test('Firebase household adapter requires the UI identity before any database request',async()=>{
  const f=firebaseFixture();
  for(const expectedUid of [undefined,null,'',123,'b']){
    await assert.rejects(f.provider.getHousehold(expectedUid),{code:'auth/user-changed'});
    await assert.rejects(f.provider.saveHousehold(fields('A의 초안'),expectedUid),{code:'auth/user-changed'});
  }
  assert.equal(f.reads.length,0);assert.equal(f.writes.length,0);assert.equal(f.listeners.size,0);
});

test('initial A auth notification cannot read B after currentUser changes before the deferred request',async t=>{
  const f=firebaseFixture(),events=new Map();
  const element={innerHTML:'',addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
  const provider={...f.provider,onUser(callback){return f.provider.onUser(who=>{
    callback(who);
    // Firebase sets currentUser before awaiting persistence and notifying auth
    // observers. The UI can still hold A during that window.
    if(who?.uid==='a')f.auth.currentUser={uid:'b',emailVerified:true};
  });}};
  const stop=mountHousehold(element,{connect:async()=>provider});t.after(stop);await flush();
  assert.equal(f.reads.length,0);assert.equal(f.writes.length,0);
  assert.match(element.innerHTML,/불러오지 못했어요/);assert.doesNotMatch(element.innerHTML,/<form/);
});

test('A draft cannot be written to B while currentUser is ahead of the UI auth notification',async t=>{
  const f=firebaseFixture(),events=new Map();
  const element={innerHTML:'',addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
  t.mock.method(globalThis,'FormData',function(form){this.get=name=>form.values[name]??null;});
  const stop=mountHousehold(element,{connect:async()=>f.provider});t.after(stop);await flush();
  const submit=alias=>events.get('submit')({preventDefault(){},stopPropagation(){},target:{matches:()=>true,values:{relation:'mother',alias,residentCount:'1',hasPet:null,privacyConsent:'on'}}});
  f.auth.currentUser={uid:'b',emailVerified:true};
  await submit('A의 비공개 초안');
  assert.equal(f.writes.length,0);assert.deepEqual(f.reads,['bapmunnaAccounts/a/preferences/household']);
  assert.match(element.innerHTML,/저장 결과를 확인하지 못했어요/);assert.doesNotMatch(element.innerHTML,/기본정보를 저장했어요/);
  f.emit(f.auth.currentUser);await flush();
  assert.doesNotMatch(element.innerHTML,/A의 비공개 초안/);await submit('B의 새 호칭');
  assert.equal(f.writes.length,1);assert.equal(f.writes[0].path,'bapmunnaAccounts/b/preferences/household');assert.equal(f.writes[0].value.alias,'B의 새 호칭');
  assert.match(element.innerHTML,/기본정보를 저장했어요/);
});
