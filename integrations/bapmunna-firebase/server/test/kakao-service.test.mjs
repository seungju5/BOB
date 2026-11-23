import test from 'node:test';
import assert from 'node:assert/strict';
import {createKakaoService,kakaoClient} from '../kakao-service.mjs';
import {kakaoFirestoreStore} from '../kakao-store.mjs';
import {readKakaoConfig,challengeFor,randomToken,hash,kakaoUid,cookieName,STATE_LIFETIME,HANDOFF_LIFETIME,STARTS_PER_DAY} from '../kakao-security.mjs';

const config=readKakaoConfig({KAKAO_API_ORIGIN:'https://api.example.test',BAPMUNNA_WEB_ORIGIN:'https://app.example.test',KAKAO_CLIENT_ID:'synthetic-client',KAKAO_CLIENT_SECRET:'synthetic-secret',KAKAO_APP_ID:'12345',FIREBASE_PROJECT_ID:'demo-bapmunna'});
// Deterministic transaction-boundary fake. Real concurrency is separately
// checked against a local Firestore emulator in kakao-store.test.mjs.
function database(){
  const documents=new Map(),queries=[];let tail=Promise.resolve();
  const snapshot=ref=>({ref,exists:documents.has(ref.path),data:()=>structuredClone(documents.get(ref.path))});
  const db={collection(name){return {
    doc(id){assert.match(id,/^[a-f0-9]{64}$/);return {path:name+'/'+id};},
    where(field,operator,cutoff){assert.equal(field,'expiresAt');assert.equal(operator,'<=');return {orderBy(order){assert.equal(order,'expiresAt');return {limit(limit){return {async get(){queries.push(name);return {docs:[...documents].filter(([path,value])=>path.startsWith(name+'/')&&value.expiresAt<=cutoff).sort((a,b)=>a[1].expiresAt-b[1].expiresAt).slice(0,limit).map(([path])=>snapshot({path}))};}};}};}};},
  };},runTransaction(operation){
    const pending=tail.then(async()=>{const writes=[];const result=await operation({get:async ref=>snapshot(ref),set(ref,value){writes.push(()=>documents.set(ref.path,structuredClone(value)));},delete(ref){writes.push(()=>documents.delete(ref.path));}});writes.forEach(write=>write());return result;});
    tail=pending.catch(()=>{});return pending;
  }};
  return {db,documents,queries};
}
function fixture({disabled=false,userError,upstreamId=123456789,fetcher}={}){
  let time=1800000000000;const data=database(),store=kakaoFirestoreStore(data.db,()=>time),calls={provider:[],lookup:[],mint:[]};
  const auth={async getUser(uid){calls.lookup.push(uid);if(userError)throw userError;if(disabled)return {disabled:true};throw Object.assign(Error('synthetic missing user'),{code:'auth/user-not-found'});},async createCustomToken(uid,claims){calls.mint.push({uid,claims});return 'synthetic.firebase.custom.token';}};
  const kakao=fetcher?kakaoClient(config,fetcher):{async userId(code){calls.provider.push(code);return upstreamId;}};
  const handle=createKakaoService({config,ready:true,store,auth,kakao,now:()=>time});
  const call=(path,{method='GET',headers={},body,origin=config.webOrigin}={})=>handle(new Request(config.origin+'/api/kakao'+path,{method,headers:{...(origin?{Origin:origin}:{}),...headers},...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}));
  async function start(options={}){
    const verifier=randomToken(),flow=randomToken();
    const response=await call('/start?'+new URLSearchParams({challenge:challengeFor(verifier),flow}),options);
    if(response.status!==303)return {response};
    const location=new URL(response.headers.get('location')),state=location.searchParams.get('state'),cookie=response.headers.get('set-cookie').split(';')[0];
    return {response,location,state,cookie,verifier,flow};
  }
  async function finish(attempt,query='code=synthetic-kakao-code'){
    const response=await call('/callback?state='+attempt.state+'&'+query,{origin:null,headers:{Cookie:attempt.cookie}});
    const location=new URL(response.headers.get('location'));return {response,location,params:new URLSearchParams(location.hash.slice(1))};
  }
  const exchange=(attempt,code,options={})=>call('/exchange',{method:'POST',headers:{'Content-Type':'application/json',...options.headers},body:{code,flow:attempt.flow,verifier:attempt.verifier},...options});
  return {...data,store,calls,call,start,finish,exchange,advance:ms=>time+=ms,now:()=>time};
}
test('normal flow requests no identity scopes, keeps tokens out of URLs/storage, and mints only the app-scoped UID',async()=>{
  const f=fixture(),attempt=await f.start();
  assert.equal(attempt.location.origin,'https://kauth.kakao.com');assert.equal(attempt.location.pathname,'/oauth/authorize');
  assert.equal(attempt.location.searchParams.get('redirect_uri'),config.redirect);assert.equal(attempt.location.searchParams.has('scope'),false);assert.equal(attempt.location.searchParams.has('code_challenge'),false);
  assert.match(attempt.response.headers.get('set-cookie'),/__Host-.*Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/);
  assert.equal(attempt.response.headers.get('referrer-policy'),'no-referrer');
  const saved=[...f.documents.values()].find(value=>value.challenge);
  assert.equal(saved.nonceHash,hash(attempt.cookie.split('=')[1]));assert.equal(JSON.stringify([...f.documents]).includes(attempt.state),false);
  const done=await f.finish(attempt);
  assert.equal(done.location.origin,config.webOrigin);assert.equal(done.location.pathname,'/bapmunna/app/auth/kakao/');assert.equal(done.location.search,'');
  assert.equal(done.params.get('flow'),attempt.flow);assert.match(done.params.get('code'),/^[\w-]{43}$/);
  assert.equal(done.location.href.includes('synthetic-kakao-code'),false);assert.match(done.response.headers.get('set-cookie'),/Max-Age=0$/);
  const reply=await f.exchange(attempt,done.params.get('code'));
  assert.equal(reply.status,200);assert.deepEqual(await reply.json(),{customToken:'synthetic.firebase.custom.token'});
  assert.equal(reply.headers.get('access-control-allow-origin'),config.webOrigin);assert.equal(reply.headers.get('access-control-allow-credentials'),null);
  assert.deepEqual(f.calls.lookup,[kakaoUid(config.appId,123456789)]);assert.deepEqual(f.calls.mint,[{uid:kakaoUid(config.appId,123456789),claims:{bapmunnaProvider:'kakao'}}]);
  assert.equal([...f.documents.keys()].some(path=>/States|Handoffs/.test(path)),false);
  assert.equal((await f.exchange(attempt,done.params.get('code'))).status,400);assert.equal(f.calls.mint.length,1);
});
test('missing, wrong, duplicated and another flow cookie cannot consume valid state',async()=>{
  const f=fixture(),a=await f.start(),b=await f.start();
  for(const cookie of ['',a.cookie.replace(/=.*/,()=> '='+randomToken()),b.cookie,a.cookie+'; '+a.cookie]){
    const response=await f.call('/callback?state='+a.state+'&code=synthetic',{origin:null,headers:{Cookie:cookie}});
    const params=new URLSearchParams(new URL(response.headers.get('location')).hash.slice(1));
    assert.equal(params.get('error'),'failed');assert.equal(params.has('flow'),false);assert.equal(response.headers.get('set-cookie'),null);
  }
  const done=await f.finish(a);assert.ok(done.params.get('code'));
  assert.ok((await f.finish(b)).params.get('code'));assert.equal(f.calls.provider.length,2);
  assert.notEqual(cookieName(a.state),cookieName(b.state));
});
test('state replay and concurrent callbacks authorize exactly once',async()=>{
  const f=fixture(),attempt=await f.start(),results=await Promise.all([f.finish(attempt),f.finish(attempt),f.finish(attempt)]);
  assert.equal(results.filter(result=>result.params.has('code')).length,1);assert.equal(f.calls.provider.length,1);
  const replay=await f.finish(attempt);assert.equal(replay.params.get('error'),'failed');assert.equal(replay.params.has('flow'),false);
});
test('bound expiry and cancellation return a safe error and never exchange provider codes',async()=>{
  for(const mode of ['expired','cancelled','unknown','missing-code']){
    const f=fixture(),attempt=await f.start();if(mode==='expired')f.advance(STATE_LIFETIME);
    const done=await f.finish(attempt,mode==='cancelled'?'error=access_denied&error_description=secret&return=https://evil.test':mode==='unknown'?'error=internal&error_description=secret':mode==='missing-code'?'code=':'code=synthetic');
    assert.equal(done.params.get('error'),['expired','cancelled'].includes(mode)?mode:'failed');assert.equal(done.params.get('flow'),attempt.flow);
    assert.equal(done.location.href.includes('evil'),false);assert.equal(done.location.href.includes('secret'),false);assert.equal(f.calls.provider.length,0);
    assert.equal((await f.finish(attempt)).params.get('error'),'failed');
  }
});
test('invalid, duplicate and unknown state never reflect attacker flow or target',async()=>{
  const f=fixture();
  for(const state of ['bad',randomToken(),randomToken()+'&state='+randomToken()]){
    const reply=await f.call('/callback?state='+state+'&code=synthetic&flow='+randomToken()+'&return=https://evil.test',{origin:null});
    const url=new URL(reply.headers.get('location'));assert.equal(url.origin,config.webOrigin);assert.equal(url.hash,'#error=failed');
  }
});
test('wrong verifier/flow cannot consume a handoff; concurrent valid exchange succeeds once',async()=>{
  const f=fixture(),attempt=await f.start(),done=await f.finish(attempt),code=done.params.get('code');
  assert.equal((await f.exchange({...attempt,verifier:randomToken()},code)).status,400);
  assert.equal((await f.exchange({...attempt,flow:randomToken()},code)).status,400);
  const results=await Promise.all([f.exchange(attempt,code),f.exchange(attempt,code),f.exchange(attempt,code)]);
  assert.equal(results.filter(result=>result.status===200).length,1);assert.equal(f.calls.mint.length,1);
});
test('expired handoff cannot mint and is removed even without cleanup',async()=>{
  const f=fixture(),attempt=await f.start(),done=await f.finish(attempt);f.advance(HANDOFF_LIFETIME);
  const response=await f.exchange(attempt,done.params.get('code'));assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:'invalid_handoff'});assert.equal(f.calls.mint.length,0);
  assert.equal([...f.documents.keys()].some(path=>path.includes('Handoffs')),false);
});
test('disabled or unavailable Firebase accounts cannot mint; error details stay private',async()=>{
  for(const options of [{disabled:true},{userError:Error('synthetic-private-key')}]){
    const f=fixture(options),attempt=await f.start(),done=await f.finish(attempt),response=await f.exchange(attempt,done.params.get('code'));
    assert.equal(response.status,options.disabled?403:503);assert.equal((await response.text()).includes('synthetic-private-key'),false);assert.equal(f.calls.mint.length,0);
    assert.equal((await f.exchange(attempt,done.params.get('code'))).status,400);
  }
});
test('exchange enforces exact origin, JSON, bounded body, input shape and no credentialed CORS',async()=>{
  const f=fixture(),attempt=await f.start(),done=await f.finish(attempt),code=done.params.get('code');
  for(const origin of [null,'https://evil.test',config.webOrigin+'.evil.test','null',config.origin]){
    const reply=await f.exchange(attempt,code,{origin});assert.equal(reply.status,403);assert.equal(reply.headers.get('access-control-allow-origin'),null);
  }
  for(const body of ['[]','null','{','x'.repeat(2049),JSON.stringify({code,flow:attempt.flow,verifier:attempt.verifier,extra:true})])assert.equal((await f.exchange(attempt,code,{body})).status,400);
  assert.equal((await f.exchange(attempt,code,{headers:{'Content-Type':'text/plain'}})).status,400);
  const preflight=await f.call('/exchange',{method:'OPTIONS',headers:{'access-control-request-method':'POST','access-control-request-headers':'Content-Type'}});
  assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-credentials'),null);
  assert.equal((await f.call('/exchange',{method:'OPTIONS',headers:{'access-control-request-method':'POST','access-control-request-headers':'Authorization'}})).status,403);
  assert.equal((await f.exchange(attempt,code)).status,200);
});
test('network rate limiting is persistent, HMAC-private, and resets after its bounded window',async()=>{
  const f=fixture();
  for(let index=0;index<10;index++)assert.equal((await f.start({headers:{'x-vercel-forwarded-for':'192.0.2.42'}})).response.status,303);
  const denied=await f.start({headers:{'x-vercel-forwarded-for':'192.0.2.42'}});assert.equal(denied.response.status,429);
  assert.equal(JSON.stringify([...f.documents]).includes('192.0.2.42'),false);
  f.advance(STATE_LIFETIME);assert.equal((await f.start({headers:{'x-vercel-forwarded-for':'192.0.2.42'}})).response.status,303);
});
test('global daily cap bounds attacker-controlled network cardinality and rejects malformed starts before writes',async()=>{
  const f=fixture();
  for(const query of ['',`challenge=${randomToken()}&flow=bad`,`challenge=${randomToken()}&flow=${randomToken()}&return=https://evil.test`])assert.equal((await f.call('/start?'+query)).status,400);
  assert.equal(f.documents.size,0);
  for(let index=0;index<STARTS_PER_DAY;index++)assert.equal((await f.start({headers:{'x-vercel-forwarded-for':`2001:db8::${(index+1).toString(16)}`}})).response.status,303);
  assert.equal((await f.start({headers:{'x-vercel-forwarded-for':'2001:db8::ffff'}})).response.status,429);
  assert.equal(f.documents.size,STARTS_PER_DAY*2+1);
});
test('cleanup is bounded, idempotent, and restricted to Kakao transient collections',async()=>{
  const f=fixture(),attempt=await f.start();await f.finish(attempt);await f.start();f.advance(86400001);
  f.documents.set('bapmunnaHouseholds/synthetic',{until:0,expiresAt:new Date(0)});
  const first=await f.store.cleanup({limit:2});assert.equal(first.deleted,2);assert.equal(first.limitReached,true);
  const next=await f.store.cleanup();assert.ok(next.deleted>0);assert.equal((await f.store.cleanup()).deleted,0);
  assert.ok(f.documents.has('bapmunnaHouseholds/synthetic'));assert.deepEqual([...new Set(f.queries)],['bapmunnaSystem/kakao/States','bapmunnaSystem/kakao/Handoffs','bapmunnaSystem/kakao/Limits']);
  for(const limit of [0,-1,1.5,5001,'1'])await assert.rejects(()=>f.store.cleanup({limit}),RangeError);
});
test('provider client uses fixed endpoints, client secret and timeout while ignoring email/profile and refresh tokens',async()=>{
  const requests=[];
  const f=fixture({fetcher:async(url,init)=>{requests.push({url,init});return Response.json(url.includes('/oauth/token')?{access_token:'synthetic-access-token',refresh_token:'synthetic-refresh-token',token_type:'bearer'}:{id:123456789,kakao_account:{email:'already-used@example.test',is_email_verified:true},properties:{nickname:'ignored'}});}});
  const attempt=await f.start(),done=await f.finish(attempt),reply=await f.exchange(attempt,done.params.get('code'));
  assert.equal(reply.status,200);assert.deepEqual(requests.map(item=>item.url),['https://kauth.kakao.com/oauth/token','https://kapi.kakao.com/v2/user/me']);
  assert.equal(requests[0].init.body.get('client_secret'),config.secret);assert.equal(requests[0].init.body.get('redirect_uri'),config.redirect);assert.equal(requests[1].init.body.get('property_keys'),'[]');
  for(const item of requests){assert.equal(item.init.redirect,'error');assert.ok(item.init.signal instanceof AbortSignal);}
  const persisted=JSON.stringify([...f.documents])+done.location.href;
  for(const secret of ['synthetic-access-token','synthetic-refresh-token','already-used@example.test','ignored'])assert.equal(persisted.includes(secret),false);
  assert.deepEqual(f.calls.mint[0].claims,{bapmunnaProvider:'kakao'});
});
test('provider error, oversized JSON, redirect failures and malformed IDs never create a handoff',async()=>{
  const responses=[()=>new Response('private upstream error',{status:500}),()=>new Response('x'.repeat(65537),{headers:{'Content-Type':'application/json'}}),()=>{throw Error('private secret');}];
  for(const id of [0,-1,1.25,'123456789',Number.MAX_SAFE_INTEGER+1,null])responses.push(url=>Response.json(url.includes('/oauth/token')?{access_token:'synthetic-access',token_type:'bearer'}:{id}));
  for(const fetcher of responses){
    const f=fixture({fetcher}),attempt=await f.start(),done=await f.finish(attempt);
    assert.equal(done.params.get('error'),'failed');assert.equal(done.params.get('flow'),attempt.flow);assert.equal([...f.documents.keys()].some(path=>path.includes('Handoffs')),false);assert.equal(f.calls.mint.length,0);
  }
});
test('unconfigured service exposes only enabled=false and does not need an existing integration',async()=>{
  const handle=createKakaoService({config});
  assert.deepEqual(await (await handle(new Request(config.origin+'/api/kakao/config'))).json(),{enabled:false});
  const response=await handle(new Request(config.origin+'/api/kakao/start'));assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'setup_required'});
});
