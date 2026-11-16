import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,symlink,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Readable} from 'node:stream';
import {randomBytes} from 'node:crypto';
import {stage,runtimeFiles,portalFiles} from '../../../../workspaces/smartthings-vercel/scripts/stage.mjs';
import {createKakaoService} from '../kakao-service.mjs';
import {readKakaoConfig} from '../kakao-security.mjs';

let temporary,destination,createVercelHandler,createKakaoVercelHandler;
before(async()=>{
  temporary=await mkdtemp(join(tmpdir(),'bapmunna-vercel-test-'));destination=join(temporary,'stage');
  await stage({destination});
  // Reuse the pinned local dependencies, without installation or network access.
  await symlink(fileURLToPath(new URL('../node_modules',import.meta.url)),join(destination,'node_modules'),'dir');
  ({createVercelHandler}=await import(pathToFileURL(join(destination,'api/smartthings/[...path].mjs')).href));
  ({createKakaoVercelHandler}=await import(pathToFileURL(join(destination,'runtime/kakao-handler.mjs')).href));
});
after(async()=>{if(temporary)await rm(temporary,{recursive:true,force:true});});

async function invoke(handler,{path='/api/smartthings/cleanup',method='GET',authorization}={}){
  const req=Readable.from([]);Object.assign(req,{url:path,method,headers:authorization?{authorization}:{}});
  const result={headersSent:false,writeHead(status,headers){this.status=status;this.headers=headers;this.headersSent=true;},end(body,done){this.body=body;done?.();}};
  await handler(req,result);return {...result,json:result.body?.length?JSON.parse(String(result.body)):null};
}
const secret='synthetic-cron-secret-'.repeat(3),origin='https://connect.example.test';

test('standalone stage includes only the explicit runtime and portal files, with unchanged pinned dependencies',async()=>{
  assert.deepEqual((await readdir(join(destination,'runtime'))).sort(),[...runtimeFiles].sort());
  assert.deepEqual((await readdir(join(destination,'public/connect'))).sort(),[...portalFiles.map(x=>x.slice('connect/'.length)),'bunny.png'].sort());
  const manifest=JSON.parse(await readFile(join(destination,'package.json'),'utf8'));
  const lock=JSON.parse(await readFile(join(destination,'package-lock.json'),'utf8'));
  assert.deepEqual(manifest.dependencies,{'firebase-admin':'14.5.0'});assert.deepEqual(lock.packages[''].dependencies,manifest.dependencies);
  const config=JSON.parse(await readFile(join(destination,'vercel.json'),'utf8'));
  assert.equal(config.env.NODEJS_HELPERS,'0');assert.equal(config.crons[0].path,'/api/smartthings/cleanup');
  assert.deepEqual(config.regions,['icn1']);assert.equal(config.framework,null);
  assert.ok(!(await readdir(destination)).some(name=>name.startsWith('.env')));
});

test('Kakao deploys four fixed entrypoints without a dynamic route that injects OAuth query metadata',async()=>{
  const routes=['callback.mjs','config.mjs','exchange.mjs','start.mjs'];
  assert.deepEqual((await readdir(join(destination,'api/kakao'))).sort(),routes);
  const shared=await import(pathToFileURL(join(destination,'runtime/kakao-handler.mjs')).href);
  for(const route of routes){
    const entry=await import(pathToFileURL(join(destination,'api/kakao',route)).href);
    assert.equal(entry.default,shared.default);
  }
});

test('deployed Kakao wrapper starts a canonical login while continuing to reject extra or duplicate query values',async()=>{
  const config=readKakaoConfig({KAKAO_APP_ID:'12345',KAKAO_CLIENT_ID:'synthetic-client',KAKAO_CLIENT_SECRET:'synthetic-secret',FIREBASE_PROJECT_ID:'demo-bapmunna'});
  let saved=0;
  const store={async saveState(){saved++;}};
  const handle=createKakaoService({config,ready:true,store});
  const handler=createKakaoVercelHandler({env:{VERCEL:'1',NODEJS_HELPERS:'0'},runtimeFactory:()=>({config,handle})});
  const params=new URLSearchParams({challenge:randomBytes(32).toString('base64url'),flow:randomBytes(32).toString('base64url')});
  const path='/api/kakao/start?'+params;
  const start=await invoke(handler,{path});
  assert.equal(start.status,303);assert.equal(new URL(start.headers.location).origin,'https://kauth.kakao.com');
  assert.equal(new URL(start.headers.location).searchParams.get('redirect_uri'),config.redirect);
  assert.match(start.headers['set-cookie'][0],/HttpOnly; Secure; SameSite=Lax/);
  for(const extra of ['&...path=start','&return_url=https://example.test','&flow='+params.get('flow')]){
    const rejected=await invoke(handler,{path:path+extra});
    assert.equal(rejected.status,400);assert.equal(rejected.json.error,'invalid_request');
  }
  assert.equal(saved,1);
});

test('cron endpoint requires its own secret, rejects mutations and never widens cleanup from query input',async()=>{
  let cleaned=0,delegated=0;
  const runtime={config:{origin},ready:true,store:{async cleanupExpired(options){cleaned++;assert.deepEqual(options,{limit:5000});return {deleted:2,limitReached:false};}},async handle(){delegated++;return new Response('{"enabled":true}',{headers:{'content-type':'application/json'}});}};
  const handler=createVercelHandler({env:{CRON_SECRET:secret,NODEJS_HELPERS:'0',VERCEL:'1'},runtimeFactory:()=>runtime});
  assert.equal((await invoke(handler)).status,401);
  assert.equal((await invoke(handler,{authorization:'Bearer firebase-user-token'})).status,401);
  assert.equal((await invoke(handler,{method:'POST',authorization:'Bearer '+secret})).status,405);
  const response=await invoke(handler,{path:'/api/smartthings/cleanup?limit=999999&collection=Connections',authorization:'Bearer '+secret});
  assert.equal(response.status,200);assert.equal(response.json.deleted,2);assert.equal(cleaned,1);
  assert.equal((await invoke(handler,{path:'/api/smartthings/config'})).json.enabled,true);assert.equal(delegated,1);
});

test('cron cannot run with a missing secret or unconfigured runtime',async()=>{
  let cleaned=0;
  const runtime={config:{origin},ready:false,store:{async cleanupExpired(){cleaned++;}},handle:async()=>new Response('{}')};
  const noSecret=createVercelHandler({env:{},runtimeFactory:()=>runtime});
  assert.equal((await invoke(noSecret)).status,503);
  const unconfigured=createVercelHandler({env:{CRON_SECRET:secret},runtimeFactory:()=>runtime});
  assert.equal((await invoke(unconfigured,{authorization:'Bearer '+secret})).json.error,'setup_required');assert.equal(cleaned,0);
});

test('Kakao cleanup works with Samsung unconfigured and remains behind cron authorization',async()=>{
  let cleaned=0;
  const runtime={config:{origin},ready:false,store:null,handle:async()=>new Response('{}')};
  const kakao={ready:true,store:{async cleanup(options){assert.deepEqual(options,{limit:1000});cleaned++;return {deleted:3};}}};
  const handler=createVercelHandler({env:{CRON_SECRET:secret},runtimeFactory:()=>runtime,kakaoFactory:()=>kakao});
  assert.equal((await invoke(handler)).status,401);assert.equal(cleaned,0);
  const result=await invoke(handler,{authorization:'Bearer '+secret});assert.equal(result.status,200);assert.equal(result.json.kakao.deleted,3);assert.equal(cleaned,1);
});

test('Vercel wrapper fails closed if raw-body helpers or credentials are misconfigured, without logging details',async()=>{
  let initialized=0;
  const handler=createVercelHandler({env:{VERCEL:'1'},runtimeFactory:()=>{initialized++;throw Error('synthetic-private-key');}});
  assert.equal((await invoke(handler)).json.error,'temporarily_unavailable');assert.equal(initialized,0);
  const badCredentials=createVercelHandler({env:{},runtimeFactory:()=>{throw Error('synthetic-private-key');}});
  const result=await invoke(badCredentials);assert.equal(result.status,503);assert.deepEqual(result.json,{error:'temporarily_unavailable'});
});
