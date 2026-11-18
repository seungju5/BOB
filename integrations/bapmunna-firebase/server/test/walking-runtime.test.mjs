import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtemp,rm,readdir,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Readable} from 'node:stream';
import {stage} from '../../../../workspaces/smartthings-vercel/scripts/stage.mjs';
import {createWalkingRuntime} from '../walking-runtime.mjs';
import {createWalkingService} from '../walking-service.mjs';
import {readWalkingConfig} from '../walking-security.mjs';

let temporary,destination,createWalkingVercelHandler,createVercelHandler;
before(async()=>{
  temporary=await mkdtemp(join(tmpdir(),'bapmunna-walking-stage-'));destination=join(temporary,'stage');await stage({destination});
  await symlink(fileURLToPath(new URL('../node_modules',import.meta.url)),join(destination,'node_modules'),'dir');
  ({createWalkingVercelHandler}=await import(pathToFileURL(join(destination,'runtime/walking-handler.mjs')).href));
  ({createVercelHandler}=await import(pathToFileURL(join(destination,'api/smartthings/[...path].mjs')).href));
});
after(async()=>{if(temporary)await rm(temporary,{recursive:true,force:true});});
async function invoke(handler,{path='/api/walking/config',method='GET',headers={},body}={}){
  const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);Object.assign(req,{url:path,method,headers});
  const response={headersSent:false,writeHead(status,value){this.status=status;this.headers=value;this.headersSent=true;},end(value,done){this.body=value;done?.();}};
  await handler(req,response);return {...response,json:response.body?.length?JSON.parse(String(response.body)):null};
}

test('walking and hearts share one function while preserving four fixed Kakao functions and SmartThings',async()=>{
  assert.deepEqual(await readdir(join(destination,'api/walking')),['[action].mjs']);
  assert.equal((await readdir(join(destination,'api/kakao'))).length,4);assert.equal((await readdir(join(destination,'api/smartthings'))).length,1);
  const entry=await import(pathToFileURL(join(destination,'api/walking/[action].mjs')).href),shared=await import(pathToFileURL(join(destination,'runtime/walking-handler.mjs')).href);assert.equal(entry.default,shared.default);
});
test('staged heart core resolves and the wrapper carries bounded family photos unchanged',async()=>{
  const {heartSummary,createHeartState}=await import(pathToFileURL(join(destination,'runtime/heart-core.mjs')).href);
  const {heartFirestoreStore}=await import(pathToFileURL(join(destination,'runtime/heart-store.mjs')).href);
  assert.equal(typeof heartFirestoreStore,'function');assert.equal(heartSummary(createHeartState({date:'2026-11-18'}),'2026-11-18').count,null);
  const config=readWalkingConfig();let seen;
  const handler=createWalkingVercelHandler({env:{VERCEL:'1',NODEJS_HELPERS:'0'},runtimeFactory:()=>({config,handle:async request=>{seen=await request.json();return new Response('{"ok":true}');}})});
  const body={text:'합성 테스트 사진',photo:'data:image/jpeg;base64,'+'A'.repeat(200000)};
  const result=await invoke(handler,{path:'/api/walking/heartmessage?action=heartmessage',method:'POST',headers:{authorization:'Bearer synthetic','content-type':'application/json',origin:'https://impact-series.web.app'},body});
  assert.equal(result.status,200);assert.deepEqual(seen,body);
  assert.equal((await invoke(handler,{path:'/api/walking/heartmessage',method:'POST',body:{text:'A'.repeat(220001)}})).status,413);
});
test('Vercel metadata is removed only when one action matches the path; query/duplicate/mismatch remain rejected',async()=>{
  const config=readWalkingConfig(),handle=createWalkingService({config}),handler=createWalkingVercelHandler({env:{VERCEL:'1',NODEJS_HELPERS:'0'},runtimeFactory:()=>({config,handle})});
  assert.equal((await invoke(handler,{path:'/api/walking/config?action=config'})).status,200);
  assert.equal((await invoke(handler,{path:'/api/walking/config'})).status,200);
  for(const suffix of ['?action=board','?action=config&action=config','?action=config&owner=someone','?other=value'])assert.equal((await invoke(handler,{path:'/api/walking/config'+suffix})).status,400);
  const local=createWalkingVercelHandler({env:{},runtimeFactory:()=>({config,handle})});assert.equal((await invoke(local,{path:'/api/walking/config?action=config'})).status,400);
});
test('dynamic metadata handling preserves native POST body and authentication headers',async()=>{
  const config=readWalkingConfig();let seen;
  const handle=async request=>{seen={path:new URL(request.url).pathname,search:new URL(request.url).search,body:await request.json(),authorization:request.headers.get('authorization')};return new Response('{"ok":true}');};
  const handler=createWalkingVercelHandler({env:{VERCEL:'1',NODEJS_HELPERS:'0'},runtimeFactory:()=>({config,handle})});
  const result=await invoke(handler,{path:'/api/walking/pair?action=pair',method:'POST',headers:{authorization:'Bearer synthetic-test','content-type':'application/json',origin:'https://localhost'},body:{code:'01234567'}});
  assert.equal(result.status,200);assert.deepEqual(seen,{path:'/api/walking/pair',search:'',body:{code:'01234567'},authorization:'Bearer synthetic-test'});
});
test('walking runtime uses existing project credential without requiring Kakao or Samsung configuration',async()=>{
  const key=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
  const env={FIREBASE_PROJECT_ID:'demo-bapmunna',FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({type:'service_account',project_id:'demo-bapmunna',client_email:'walking-test@demo-bapmunna.iam.gserviceaccount.com',private_key:key})};
  let signed=0,initialized=0;
  const runtime=createWalkingRuntime(env,{apps:()=>[],certificate:value=>{signed++;assert.equal(value.projectId,'demo-bapmunna');return {};},initialize:()=>{initialized++;return {};},authFor:()=>({}),databaseFor:()=>({})});
  assert.equal(runtime.ready,true);assert.equal(signed,1);assert.equal(initialized,1);
  assert.equal((await runtime.handle(new Request('https://bapmunna-smartthings.vercel.app/api/walking/config'))).status,200);
  assert.equal(createWalkingRuntime({}).ready,false);
  assert.throws(()=>createWalkingRuntime({...env,FIREBASE_PROJECT_ID:'different-project'}),/credential/);
});
test('walking cleanup requires cron secret and runs even if provider integrations are unconfigured',async()=>{
  const secret='synthetic-walking-cron-secret'.repeat(3),config={origin:'https://connect.example.test'};let cleaned=0;
  const inactive=()=>({config,ready:false,store:null,handle:async()=>new Response('{}')});
  const walkingFactory=()=>({ready:true,store:{cleanup:async options=>{assert.deepEqual(options,{limit:1000});cleaned++;return {deleted:2,stepsCleared:3};}}});
  const handler=createVercelHandler({env:{CRON_SECRET:secret},runtimeFactory:inactive,kakaoFactory:inactive,walkingFactory});
  assert.equal((await invoke(handler,{path:'/api/smartthings/cleanup'})).status,401);assert.equal(cleaned,0);
  const result=await invoke(handler,{path:'/api/smartthings/cleanup',headers:{authorization:'Bearer '+secret}});assert.equal(result.status,200);assert.equal(result.json.walking.stepsCleared,3);assert.equal(cleaned,1);
});
test('one integration cleanup failure does not block the other namespaces or expose its exception',async()=>{
  const secret='synthetic-walking-cron-secret'.repeat(3);let cleaned=0;
  const runtimeFactory=()=>({config:{origin:'https://connect.example.test'},ready:true,store:{cleanupExpired:async()=>{throw Error('synthetic-private-data');}},handle:async()=>new Response('{}')});
  const handler=createVercelHandler({env:{CRON_SECRET:secret},runtimeFactory,kakaoFactory:()=>({ready:true,store:{cleanup:async()=>{throw Error('synthetic-private-data');}}}),walkingFactory:()=>({ready:true,store:{cleanup:async()=>{cleaned++;return {deleted:1};}}})});
  const result=await invoke(handler,{path:'/api/smartthings/cleanup',headers:{authorization:'Bearer '+secret}});assert.equal(result.status,503);assert.equal(cleaned,1);assert.equal(result.json.walking.deleted,1);assert.doesNotMatch(String(result.body),/synthetic-private-data/);
});
