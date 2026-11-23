import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,createHash} from 'node:crypto';
import {createKakaoClient,requestAccountEmail,completeKakaoSession} from '../cloud/kakao-client.mjs';

const key='bapmunna:kakao:pending:v1',origin='https://warming-up-bapmunna.web.app';
const code=Buffer.alloc(32,7).toString('base64url');
function fixture(){
  const state=new Map(),calls=[],events=[];
  let time=100000,ready=true,response={customToken:'synthetic.payload.signature'},status=200;
  const storage={getItem:k=>state.get(k)??null,setItem:(k,v)=>state.set(k,v),removeItem:k=>{events.push('clear');state.delete(k);}};
  const location={hash:'',pathname:'/bapmunna/app/auth/kakao/',assigned:'',assign(url){this.assigned=url;}};
  const history={replaceState(a,b,path){events.push('strip');assert.equal(path,location.pathname);location.hash='';}};
  const fetch=async(url,init)=>{calls.push({url,init});events.push('fetch');return new Response(JSON.stringify(url.endsWith('/config')?{enabled:ready}:response),{status:url.endsWith('/config')?200:status});};
  const options={config:{enabled:true,apiOrigin:origin},storage,location,history,crypto:webcrypto,fetch,now:()=>time};
  const client=createKakaoClient(options);
  return {client,options,state,calls,events,location,pending:()=>JSON.parse(state.get(key)),time:value=>{time=value;},ready:value=>{ready=value;},response:(value,httpStatus=200)=>{response=value;status=httpStatus;}};
}
async function started(){const f=fixture();await f.client.begin(true);const p=f.pending();f.location.hash=`#code=${code}&flow=${p.flow}`;return {...f,p};}

test('start uses unpredictable proof and fixed origin, stores no auth token',async()=>{
  const f=await started(),url=new URL(f.location.assigned);
  assert.equal(url.origin,origin);assert.equal(url.pathname,'/api/kakao/start');
  assert.equal(url.searchParams.get('challenge'),createHash('sha256').update(f.p.verifier).digest('base64url'));
  assert.equal(url.searchParams.get('flow'),f.p.flow);assert.equal(f.p.keep,true);
  assert.deepEqual(Object.keys(f.p).sort(),['createdAt','flow','keep','verifier']);
  assert.ok(!url.href.includes(f.p.verifier));
});
test('unconfigured server never redirects',async()=>{
  const f=fixture();f.ready(false);await assert.rejects(f.client.begin(),{code:'auth/kakao-not-ready'});assert.equal(f.location.assigned,'');assert.equal(f.state.size,0);
});
test('client refuses an unapproved API origin',async()=>{
  const f=fixture(),client=createKakaoClient({...f.options,config:{enabled:true,apiOrigin:'https://other.example'}});
  assert.equal(await client.available(),false);await assert.rejects(client.begin(),{code:'auth/kakao-not-ready'});assert.equal(f.calls.length,0);
});
test('blocked session storage fails before leaving the app',async()=>{
  const f=fixture(),client=createKakaoClient({...f.options,storage:{setItem(){throw Error('blocked');}}});
  await assert.rejects(client.begin(),{code:'auth/kakao-storage'});assert.equal(f.location.assigned,'');
});
test('handoff strips fragment and consumes pending proof before network, token stays in memory',async()=>{
  const f=await started();f.events.length=0;
  const result=await f.client.finish();assert.deepEqual(result,{customToken:'synthetic.payload.signature',keep:true});
  assert.deepEqual(f.events,['strip','clear','fetch']);assert.equal(f.state.size,0);assert.equal(f.location.hash,'');
  const exchange=f.calls.at(-1);assert.equal(exchange.url,origin+'/api/kakao/exchange');assert.equal(exchange.init.credentials,'omit');
  assert.deepEqual(JSON.parse(exchange.init.body),{code,flow:f.p.flow,verifier:f.p.verifier});
});
test('React duplicate completion shares one request',async()=>{
  const f=await started();const [a,b]=await Promise.all([f.client.finish(),f.client.finish()]);assert.equal(a,b);assert.equal(f.calls.filter(c=>c.url.endsWith('/exchange')).length,1);
});
for(const scenario of ['missing','expired','future','wrong-flow','duplicate-code','duplicate-flow','invalid-code','cancelled']){
  test(`rejects ${scenario} callback without exchange`,async()=>{
    const f=await started();
    if(scenario==='missing')f.state.clear();
    if(scenario==='expired')f.time(f.p.createdAt+600001);
    if(scenario==='future')f.time(f.p.createdAt-1);
    if(scenario==='wrong-flow')f.location.hash=`#code=${code}&flow=${code}`;
    if(scenario==='duplicate-code')f.location.hash+=`&code=${code}`;
    if(scenario==='duplicate-flow')f.location.hash+=`&flow=${f.p.flow}`;
    if(scenario==='invalid-code')f.location.hash=`#code=bad&flow=${f.p.flow}`;
    if(scenario==='cancelled')f.location.hash=`#error=cancelled&flow=${f.p.flow}`;
    await assert.rejects(f.client.finish(),{code:scenario==='cancelled'?'auth/kakao-cancelled':'auth/kakao-expired'});
    assert.equal(f.calls.filter(c=>c.url.endsWith('/exchange')).length,0);assert.equal(f.state.size,0);assert.equal(f.location.hash,'');
  });
}
test('HTTP errors are sanitized and a rejected handoff cannot be retried',async()=>{
  const f=await started();f.response({error:'private-upstream-detail'},429);
  await assert.rejects(f.client.finish(),{code:'auth/kakao-rate-limited'});await assert.rejects(f.client.finish(),{code:'auth/kakao-rate-limited'});assert.equal(f.calls.length,2);
});
test('invalid Firebase token is never passed to SDK',async()=>{
  const f=await started();f.response({customToken:'not-a-token'});await assert.rejects(f.client.finish(),{code:'auth/kakao-failed'});
});
test('explicit fragment survives early URL cleanup',async()=>{
  const f=await started(),fragment=f.location.hash;f.location.hash='';assert.equal((await f.client.finish(fragment)).keep,true);
});
test('signout clears pending proof even when storage is blocked',async()=>{
  const f=await started();f.client.cancel();assert.equal(f.state.size,0);
  createKakaoClient({...f.options,storage:{removeItem(){throw Error();}}}).cancel();
});
test('verification sends only the requested address for the bound unverified account',async()=>{
  const user={uid:'synthetic-kakao',email:null},calls=[];
  await requestAccountEmail({email:' person@example.test ',expectedUid:user.uid,currentUser:()=>user,sendVerification:async(u,email)=>calls.push([u,email])});
  assert.deepEqual(calls,[[user,'person@example.test']]);assert.equal(user.email,null);
});
test('verification rejects changed sessions before and after request',async()=>{
  const user={uid:'A',email:null};let current=user,called=0;
  await assert.rejects(requestAccountEmail({email:'a@example.test',expectedUid:'B',currentUser:()=>current,sendVerification:async()=>{called++;}}),{code:'auth/user-changed'});
  assert.equal(called,0);
  await assert.rejects(requestAccountEmail({email:'a@example.test',expectedUid:'A',currentUser:()=>current,sendVerification:async()=>{current={uid:'B'};}}),{code:'auth/user-changed'});
});
test('verification cannot change an existing email or merge an occupied email',async()=>{
  const user={uid:'A',email:'a@example.test'};
  await assert.rejects(requestAccountEmail({email:'b@example.test',expectedUid:'A',currentUser:()=>user,sendVerification:async()=>{throw Error('must not call');}}),{code:'auth/email-already-set'});
  user.email=null;
  await assert.rejects(requestAccountEmail({email:'occupied@example.test',expectedUid:'A',currentUser:()=>user,sendVerification:async()=>{throw Object.assign(Error(),{code:'auth/email-already-in-use'});}}),{code:'auth/email-already-in-use'});
});

function sessionFixture(){
  const uid='kakao:'+'a'.repeat(64),user={uid,email:null,emailVerified:false};
  const token='e30.'+Buffer.from(JSON.stringify({uid})).toString('base64url')+'.c2ln';
  const before=new Set(),observers=new Set();let release,started;
  const began=new Promise(resolve=>{started=resolve;}),network=new Promise(resolve=>{release=resolve;});
  const auth={currentUser:null,authStateReady:async()=>{}};
  const commit=async(value,fromAnotherTab=false)=>{if(!fromAnotherTab)for(const hook of before)await hook(value);auth.currentUser=value;for(const hook of observers)hook(value);};
  const options={auth,client:{finish:async()=>({customToken:token,keep:false}),cancel(){}},remember:async()=>{},beforeChange:(a,fn)=>{before.add(fn);return()=>before.delete(fn);},observe:(a,fn)=>{observers.add(fn);return()=>observers.delete(fn);},signIn:async()=>{started();await network;await commit(user);return {user};}};
  return {options,auth,before,observers,began,release,commit,user};
}
test('custom sign-in retains both session guards until the actual SDK completes',async()=>{
  const f=sessionFixture(),pending=completeKakaoSession(f.options);await f.began;
  assert.equal(f.before.size,1);assert.equal(f.observers.size,1);f.release();
  assert.equal(await pending,f.user);assert.equal(f.auth.currentUser,f.user);assert.equal(f.before.size,0);assert.equal(f.observers.size,0);
});
for(const crossTab of [false,true])test(`late Kakao result cannot overwrite a newer Google session (${crossTab?'cross-tab':'same-tab'})`,async()=>{
  const f=sessionFixture(),pending=completeKakaoSession(f.options);await f.began;
  const google={uid:'synthetic-google-B'};await f.commit(google,crossTab);f.release();
  await assert.rejects(pending,{code:'auth/user-changed'});assert.equal(f.auth.currentUser,google);assert.equal(f.before.size,0);
});
test('navigation abort invalidates but does not remove the SDK commit guard early',async()=>{
  const f=sessionFixture(),abort=new AbortController(),pending=completeKakaoSession({...f.options,signal:abort.signal});await f.began;
  abort.abort();assert.equal(f.before.size,1);assert.equal(f.observers.size,1);
  f.release();await assert.rejects(pending,{code:'auth/user-changed'});assert.equal(f.auth.currentUser,null);assert.equal(f.before.size,0);
});
test('a restored session rejects the stale callback before token redemption',async()=>{
  const f=sessionFixture();let calls=0;f.auth.currentUser={uid:'restored-user'};f.options.client.finish=async()=>{calls++;throw Error();};
  await assert.rejects(completeKakaoSession(f.options),{code:'auth/user-changed'});assert.equal(calls,0);
});
