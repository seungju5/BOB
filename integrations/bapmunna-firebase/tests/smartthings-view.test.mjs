import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {mountSmartThings,signalLabel} from '../docs/smartthings-view.mjs';

const member={uid:'test-member',verified:true};
const never=()=>new Promise(()=>{});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const json=(body,status=200)=>({ok:status<400,status,headers:new Headers({'content-type':'application/json'}),json:async()=>body});
const html=(status=404)=>({ok:status<400,status,headers:new Headers({'content-type':'text/html'}),json:async()=>{throw Error('HTML is not JSON');}});
const flush=()=>delay(0);
async function eventually(predicate){for(let i=0;i<40;i++){if(predicate())return;await delay(5);}assert.ok(predicate(),'expected visible state was never reached');}

function provider(user=member){
  const listeners=new Set();
  return {
    getIdToken:async()=> 'test-only-token',
    onUser(callback){listeners.add(callback);callback(user);return ()=>listeners.delete(callback);},
    emit(next){user=next;for(const callback of [...listeners])callback(next);},
    get listeners(){return listeners.size;},
  };
}
function surface(){
  const listeners=new Map();
  return {innerHTML:'',checked:true,
    addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type),
    querySelector(selector){return selector.includes('st-consent')?{checked:this.checked,focus(){}}:null;},
    click(action){return listeners.get('click')?.({stopPropagation(){},target:{closest:()=>({dataset:{stAction:action}})}});},
  };
}
function fixture(t,{connect,fetcher,requestTimeoutMs=25,auth=provider(),homeHref='',apiOrigin='',popupConnect}={}){
  const previousLocation=Object.getOwnPropertyDescriptor(globalThis,'location');
  const navigations=[];
  Object.defineProperty(globalThis,'location',{configurable:true,value:{href:'https://example.test/carer/#connect',assign:url=>navigations.push(url)}});
  const el=surface(),requests=[];
  const dispose=mountSmartThings(el,{accountHref:'/carer/#account',homeHref,requestTimeoutMs,apiOrigin,...(popupConnect?{popupConnect}:{}),connect:connect||(()=>Promise.resolve(auth)),fetcher:async(path,options)=>{
    requests.push({path,options});return fetcher?fetcher(path,options):json(path.endsWith('/config')?{enabled:true,consentVersion:'test-v1'}:{stage:'disconnected'});
  }});
  t.after(()=>{dispose();if(previousLocation)Object.defineProperty(globalThis,'location',previousLocation);else delete globalThis.location;});
  return {el,requests,auth,dispose,navigations};
}
test('remote backend requests omit cookies and bind the displayed Firebase UID',async t=>{
  const expected=[],auth=provider();auth.getIdToken=async uid=>{expected.push(uid);return 'test-only-token';};
  const {el,requests}=fixture(t,{auth,apiOrigin:'https://backend.test'});
  await eventually(()=>el.innerHTML.includes('name="st-consent"'));
  assert.deepEqual(expected,[member.uid]);assert.ok(requests.every(x=>x.path.startsWith('https://backend.test/api/smartthings/')));
  assert.ok(requests.every(x=>x.options.credentials==='omit'));
});
test('remote popup uses the displayed UID even before Firebase auth observers report a switch',async t=>{
  const auth=provider();let actualUid=member.uid,sent=0;
  auth.getIdToken=async expected=>{if(expected!==actualUid)throw Object.assign(Error(),{code:'auth/user-changed'});return 'only-matching-user';};
  const {el}=fixture(t,{auth,apiOrigin:'https://backend.test',popupConnect:async options=>{await options.getIdToken();sent++;return {stage:'choose_device'};}});
  await eventually(()=>el.innerHTML.includes('name="st-consent"'));actualUid='another-user';await el.click('start');
  assert.equal(sent,0);assert.match(el.innerHTML,/계정이 바뀌었어요/);assert.doesNotMatch(el.innerHTML,/삼성 계정 확인 완료/);
});
test('remote popup completion cannot overwrite a later signed-out screen',async t=>{
  const pending=deferred();let signal;
  const {el,auth}=fixture(t,{apiOrigin:'https://backend.test',popupConnect:options=>{signal=options.signal;return pending.promise;}});
  await eventually(()=>el.innerHTML.includes('name="st-consent"'));const run=el.click('start');assert.match(el.innerHTML,/삼성 연결 창에서/);
  auth.emit(null);await eventually(()=>el.innerHTML.includes('로그인하러 가기'));assert.equal(signal.aborted,true);
  pending.resolve({stage:'choose_device'});await run;assert.match(el.innerHTML,/로그인하러 가기/);assert.doesNotMatch(el.innerHTML,/삼성 계정 확인 완료/);
});
test('remote popup cancellation returns to live status and ignores a late completion',async t=>{
  const pending=deferred();let signal;
  const {el,requests}=fixture(t,{apiOrigin:'https://backend.test',popupConnect:options=>{signal=options.signal;return pending.promise;}});
  await eventually(()=>el.innerHTML.includes('name="st-consent"'));const run=el.click('start');
  const stopping=el.click('cancel-start');assert.equal(signal.aborted,true);
  assert.equal(requests.filter(x=>x.path.endsWith('/status')).length,1);
  pending.resolve({stage:'choose_device'});await stopping;await run;await eventually(()=>el.innerHTML.includes('name="st-consent"'));assert.doesNotMatch(el.innerHTML,/삼성 계정 확인 완료/);
  assert.equal(requests.filter(x=>x.path.endsWith('/status')).length,2);
});
const failed=el=>el.innerHTML.includes('연결 상태 다시 확인')&&el.innerHTML.includes('aria-busy="false"');

for(const response of [html(404),html(200),json({enabled:false})]){
  test(`unavailable API (${response.status}, ${response.headers.get('content-type')}) exits without waiting for auth`,async t=>{
    let authCalls=0;
    const {el,requests}=fixture(t,{connect:()=>{authCalls++;return never();},fetcher:async()=>response});
    await eventually(()=>el.innerHTML.includes('준비 중'));
    assert.equal(authCalls,0);assert.equal(requests.length,1);
    assert.match(el.innerHTML,/내 계정으로 돌아가기/);assert.doesNotMatch(el.innerHTML,/연결 설정 완료/);
  });
}
test('config fetch that never settles times out and retry can recover',async t=>{
  let first=true,requestSignal;
  const {el}=fixture(t,{fetcher:(_path,{signal})=>{requestSignal=signal;return first?never():json({enabled:false});}});
  assert.match(el.innerHTML,/내 계정으로 돌아가기/);
  await eventually(()=>failed(el));assert.equal(requestSignal.aborted,true);assert.match(el.innerHTML,/응답이 늦어지고/);
  first=false;await el.click('reload');await eventually(()=>el.innerHTML.includes('준비 중'));
  assert.doesNotMatch(el.innerHTML,/role="alert"/);
});
test('a stalled response body is bounded as well as fetch',async t=>{
  const {el}=fixture(t,{fetcher:()=>({...json({}),json:never})});
  await eventually(()=>failed(el));assert.match(el.innerHTML,/응답이 늦어지고/);
});
test('a stalled SDK import leaves a retryable state and late SDK cannot subscribe',async t=>{
  const sdk=deferred(),auth=provider();
  const {el}=fixture(t,{connect:()=>sdk.promise});
  await eventually(()=>failed(el));const screen=el.innerHTML;sdk.resolve(auth);await flush();
  assert.equal(auth.listeners,0);assert.equal(el.innerHTML,screen);
});
test('missing first auth callback times out and removes its listener',async t=>{
  let subscribed=0;
  const {el}=fixture(t,{auth:{getIdToken:async()=> 'test',onUser(){subscribed++;return ()=>subscribed--;}}});
  await eventually(()=>failed(el));assert.equal(subscribed,0);
});
test('a rejected or synchronous SDK error has retry and account recovery',async t=>{
  const {el}=fixture(t,{connect:()=>{throw Error('offline');}});
  await eventually(()=>failed(el));assert.match(el.innerHTML,/href="\/carer\/#account"/);
});
test('unknown/malformed config is an error, not a success or preparation claim',async t=>{
  const {el}=fixture(t,{fetcher:async()=>json(null)});
  await eventually(()=>failed(el));assert.match(el.innerHTML,/연결 정보를 읽지 못했어요/);assert.doesNotMatch(el.innerHTML,/연결 설정 완료|준비 중/);
});
test('verified account proceeds into the existing consent/API UI',async t=>{
  const {el,requests}=fixture(t);
  await eventually(()=>el.innerHTML.includes('name="st-consent"'));
  assert.deepEqual(requests.map(x=>x.path),['/api/smartthings/config','/api/smartthings/status']);
  assert.equal(requests[1].options.headers.Authorization,'Bearer test-only-token');
  assert.doesNotMatch(el.innerHTML,/test-only-token|test-member/);
  const policyAt=el.innerHTML.indexOf('개인정보 이용·제공 안내');
  assert.ok(policyAt>0&&policyAt<el.innerHTML.indexOf('name="st-consent"'));
  assert.ok(el.innerHTML.includes('https://impact-series.web.app/bapmunna/app/privacy/'));
  assert.doesNotMatch(el.innerHTML,/notion\.com/);
  assert.match(el.innerHTML,/target="_blank" rel="noopener noreferrer"/);
});
test('reconnection explains the Samsung permission steps before asking for consent',async t=>{
  const {el}=fixture(t,{fetcher:async path=>json(path.endsWith('/config')?{enabled:true,consentVersion:'test-v1'}:{stage:'reconnect_required'})});
  await eventually(()=>el.innerHTML.includes('삼성 계정 다시 연결'));
  assert.match(el.innerHTML,/삼성 화면에서 연결할 기기와 읽기 허용 내용을 확인/);
  assert.match(el.innerHTML,/밥뭇나로 돌아와 플러그를 골라/);
  assert.doesNotMatch(el.innerHTML,/허용 기간이 끝났거나 권한이 바뀌었을/);
});
test('anonymous account only sees login and cannot request device status',async t=>{
  const {el,requests}=fixture(t,{auth:provider(null)});
  await eventually(()=>el.innerHTML.includes('로그인하러 가기'));
  assert.deepEqual(requests.map(x=>x.path),['/api/smartthings/config']);
});
test('a provider without compatible credentials never calls the Firebase API',async t=>{
  const {el,requests}=fixture(t,{auth:{onUser(){throw Error('must not subscribe');}}});
  await eventually(()=>el.innerHTML.includes('준비 중'));assert.equal(requests.length,1);
});
test('a stalled token refresh cannot start a late authenticated request',async t=>{
  const token=deferred(),auth=provider();auth.getIdToken=()=>token.promise;
  const {el,requests}=fixture(t,{auth});
  await eventually(()=>failed(el));token.resolve('late-test-token');await flush();
  assert.equal(requests.length,1);assert.ok(failed(el));
});
test('status API timeout stops loading even when fetch ignores abort',async t=>{
  const {el}=fixture(t,{fetcher:path=>path.endsWith('/config')?json({enabled:true}):never()});
  await eventually(()=>failed(el));assert.doesNotMatch(el.innerHTML,/연결 설정 완료/);
});
test('repeated unchanged auth notifications do not restart loading',async t=>{
  const {el,requests,auth}=fixture(t);
  await eventually(()=>el.innerHTML.includes('name="st-consent"'));
  auth.emit({...member});auth.emit({...member});await flush();assert.equal(requests.length,2);
});
test('sign-out invalidates an in-flight status response and clears old account state',async t=>{
  const status=deferred();
  const {el,auth,requests}=fixture(t,{requestTimeoutMs:200,fetcher:path=>path.endsWith('/config')?json({enabled:true}):status.promise});
  await eventually(()=>requests.length===2);auth.emit(null);
  await eventually(()=>el.innerHTML.includes('로그인하러 가기'));
  status.resolve(json({stage:'connected',device:{label:'Old account device'}}));await flush();
  assert.doesNotMatch(el.innerHTML,/Old account device|연결 설정 완료/);
});
test('navigation cleanup ignores late responses and removes subscriptions',async t=>{
  const status=deferred();
  const {el,auth,requests,dispose}=fixture(t,{requestTimeoutMs:200,fetcher:path=>path.endsWith('/config')?json({enabled:true}):status.promise});
  await eventually(()=>requests.length===2);dispose();el.innerHTML='다른 화면';status.resolve(json({stage:'connected'}));await flush();
  assert.equal(el.innerHTML,'다른 화면');assert.equal(auth.listeners,0);assert.equal(requests[1].options.signal.aborted,true);
});
test('an API action timeout releases disabled buttons without a false success',async t=>{
  const {el}=fixture(t,{fetcher:path=>path.endsWith('/config')?json({enabled:true}):path.endsWith('/status')?json({stage:'choose_device'}):never()});
  await eventually(()=>el.innerHTML.includes('플러그 목록 보기'));await el.click('devices');
  assert.match(el.innerHTML,/응답이 늦어지고/);assert.match(el.innerHTML,/aria-busy="false"/);assert.doesNotMatch(el.innerHTML,/ disabled|기기를 연결했어요/);
});
test('OAuth starts only after consent and only through an approved Samsung URL',async t=>{
  const url='https://api.smartthings.com/oauth/authorize?state=test-only';
  const {el,requests,navigations}=fixture(t,{fetcher:path=>path.endsWith('/config')?json({enabled:true,consentVersion:'test-v1'}):path.endsWith('/status')?json({stage:'disconnected'}):json({url})});
  await eventually(()=>el.innerHTML.includes('name="st-consent"'));el.checked=false;await el.click('start');assert.equal(requests.length,2);
  el.checked=true;await el.click('start');assert.deepEqual(navigations,[url]);
  assert.equal(requests.at(-1).options.method,'POST');assert.deepEqual(JSON.parse(requests.at(-1).options.body),{consentVersion:'test-v1'});
});
test('HTML returned by an API action is recoverable and is never a successful connection',async t=>{
  const {el,navigations}=fixture(t,{fetcher:path=>path.endsWith('/config')?json({enabled:true}):path.endsWith('/status')?json({stage:'disconnected'}):html()});
  await eventually(()=>el.innerHTML.includes('name="st-consent"'));await el.click('start');
  assert.match(el.innerHTML,/연결 기능을 준비하고 있어요/);assert.match(el.innerHTML,/aria-busy="false"/);assert.deepEqual(navigations,[]);
});
test('invalid status JSON is not mistaken for a connected device',async t=>{
  const {el}=fixture(t,{fetcher:path=>json(path.endsWith('/config')?{enabled:true}:{})});
  await eventually(()=>failed(el));assert.doesNotMatch(el.innerHTML,/연결 설정 완료|연결 마무리 중/);
});
test('invalid device JSON leaves the list button available for retry',async t=>{
  const {el}=fixture(t,{fetcher:path=>json(path.endsWith('/config')?{enabled:true}:path.endsWith('/status')?{stage:'choose_device'}:{devices:[null]})});
  await eventually(()=>el.innerHTML.includes('플러그 목록 보기'));await el.click('devices');
  assert.match(el.innerHTML,/연결 정보를 읽지 못했어요/);assert.match(el.innerHTML,/플러그 목록 보기/);assert.match(el.innerHTML,/aria-busy="false"/);
});
test('unexpected fetch abort is recoverable rather than an invented disconnected state',async t=>{
  const {el}=fixture(t,{fetcher:()=>{throw new DOMException('network aborted','AbortError');}});
  await eventually(()=>failed(el));assert.match(el.innerHTML,/role="alert"/);
});
test('untrusted OAuth destination cannot navigate away from the app',async t=>{
  const {el,navigations}=fixture(t,{fetcher:path=>json(path.endsWith('/config')?{enabled:true}:path.endsWith('/status')?{stage:'disconnected'}:{url:'https://example.invalid/authorize'})});
  await eventually(()=>el.innerHTML.includes('name="st-consent"'));await el.click('start');
  assert.deepEqual(navigations,[]);assert.match(el.innerHTML,/role="alert"/);assert.match(el.innerHTML,/aria-busy="false"/);
});
test('a home entry returns to home without asking a signed-in visitor to log in again',async t=>{
  const {el}=fixture(t,{homeHref:'/carer/#guardian',fetcher:async()=>json({enabled:false})});
  await eventually(()=>el.innerHTML.includes('준비 중'));
  assert.match(el.innerHTML,/href="\/carer\/#guardian">홈으로 돌아가기/);
  assert.doesNotMatch(el.innerHTML,/밥뭇나 로그인|로그인하기/);
});
test('home remains reachable during loading and after a timeout',async t=>{
  const {el}=fixture(t,{homeHref:'/carer/#guardian',fetcher:never});
  assert.match(el.innerHTML,/홈으로 돌아가기/);await eventually(()=>failed(el));
  assert.match(el.innerHTML,/href="\/carer\/#guardian">홈으로 돌아가기/);
});
for(const field of ['lastSignalAt','lastReceivedAt','lastCheckedAt']){
  test(`malformed ${field} in initial status shows retry instead of throwing during render`,async t=>{
    const {el}=fixture(t,{fetcher:path=>json(path.endsWith('/config')?{enabled:true}:{stage:'connected',[field]:'not-a-date'})});
    await eventually(()=>failed(el));assert.match(el.innerHTML,/연결 정보를 읽지 못했어요/);assert.doesNotMatch(el.innerHTML,/연결 상태를 확인하고 있어요/);
  });
  test(`malformed ${field} in an action keeps the previous valid status and releases controls`,async t=>{
    const {el}=fixture(t,{fetcher:path=>json(path.endsWith('/config')?{enabled:true}:path.endsWith('/status')?{stage:'connected',lastSignalAt:1794531600000}:{stage:'connected',[field]:'not-a-date'})});
    await eventually(()=>el.innerHTML.includes('지금 연결 확인하기'));await el.click('check');
    assert.match(el.innerHTML,/연결 정보를 읽지 못했어요/);assert.match(el.innerHTML,/aria-busy="false"/);assert.doesNotMatch(el.innerHTML,/기기의 최근 상태를 확인했어요/);
  });
}
test('nonfinite and out-of-range timestamps cannot crash status rendering',async t=>{
  const {el}=fixture(t,{fetcher:path=>json(path.endsWith('/config')?{enabled:true}:{stage:'connected',lastCheckedAt:1e100})});
  await eventually(()=>failed(el));
  for(const value of [NaN,Infinity,1e100,-1,true,{},'not-a-date'])assert.equal(signalLabel({lastSignalAt:value}),'신호 시각을 확인해 주세요');
});
test('valid epoch timestamps and missing times retain the existing connection display',async t=>{
  const {el}=fixture(t,{fetcher:path=>json(path.endsWith('/config')?{enabled:true}:{stage:'connected',lastSignalAt:Date.now(),lastReceivedAt:null,lastCheckedAt:1794531600000})});
  await eventually(()=>el.innerHTML.includes('지금 연결 확인하기'));
  assert.match(el.innerHTML,/기기 신호를 받았어요/);assert.match(el.innerHTML,/아직 없음/);assert.doesNotMatch(el.innerHTML,/role="alert"/);
});
