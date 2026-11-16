import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createKakaoRuntime,kakaoCredential} from '../kakao-runtime.mjs';
import {readKakaoConfig,kakaoUid} from '../kakao-security.mjs';

const privateKey=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
const account={type:'service_account',project_id:'demo-bapmunna',client_email:'synthetic-kakao@demo-bapmunna.iam.gserviceaccount.com',private_key:privateKey};
const env={KAKAO_CLIENT_ID:'synthetic-client',KAKAO_CLIENT_SECRET:'synthetic-secret',KAKAO_APP_ID:'12345',FIREBASE_PROJECT_ID:'demo-bapmunna',FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify(account)};
test('missing required settings fail closed without initializing an Admin app',async()=>{
  for(const key of ['KAKAO_CLIENT_ID','KAKAO_CLIENT_SECRET','KAKAO_APP_ID','FIREBASE_PROJECT_ID','FIREBASE_SERVICE_ACCOUNT_JSON']){
    const runtime=createKakaoRuntime({...env,[key]:''},{initialize(){throw Error('must not initialize');}});
    assert.equal(runtime.ready,false);assert.equal(runtime.store,null);assert.deepEqual(await (await runtime.handle(new Request(runtime.config.origin+'/api/kakao/config'))).json(),{enabled:false});
  }
});
test('runtime validates a dedicated certificate, ignores credential URLs, and initializes a separate named app',()=>{
  const seen=[],apps=[];
  const deps={apps:()=>apps,certificate:value=>{seen.push(value);return {synthetic:true};},initialize(options,name){const app={options,name};apps.push(app);return app;},authFor:app=>({app}),databaseFor:app=>({app})};
  const runtime=createKakaoRuntime({...env,SMARTTHINGS_APP_ID:'',SMARTTHINGS_CLIENT_ID:'',FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({...account,token_uri:'https://evil.test'})},deps);
  assert.equal(runtime.ready,true);assert.ok(runtime.store);assert.equal(apps.length,1);assert.match(apps[0].name,/^bapmunna-kakao-/);
  assert.deepEqual(Object.keys(seen[0]),['projectId','clientEmail','privateKey']);assert.equal(seen[0].projectId,env.FIREBASE_PROJECT_ID);
  createKakaoRuntime(env,deps);assert.equal(apps.length,1);
});
test('malformed, mismatched, non-RSA or weak credentials fail without exposing details or using ADC',()=>{
  const weakKey=generateKeyPairSync('rsa',{modulusLength:1024}).privateKey.export({type:'pkcs8',format:'pem'});
  const ecKey=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({type:'pkcs8',format:'pem'});
  const samples=['{','x'.repeat(32769),JSON.stringify({...account,project_id:'another-project'}),JSON.stringify({...account,client_email:'synthetic@evil.test'}),JSON.stringify({...account,private_key:'synthetic-private-key'}),JSON.stringify({...account,private_key:weakKey}),JSON.stringify({...account,private_key:ecKey})];
  for(const value of samples)assert.throws(()=>createKakaoRuntime({...env,FIREBASE_SERVICE_ACCOUNT_JSON:value}),{message:'Invalid Kakao Firebase server credential.'});
  assert.throws(()=>kakaoCredential(env,env.FIREBASE_PROJECT_ID,{certificate(){throw Error('private key details');}}),{message:'Invalid Kakao Firebase server credential.'});
});
test('server origins and immutable namespace are strict and never taken from request or client keys',()=>{
  for(const value of ['http://example.test','https://example.test/path','https://example.test/','https://user:pass@example.test','https://example.test?return=evil'])assert.throws(()=>readKakaoConfig({KAKAO_API_ORIGIN:value}),{message:'Invalid Kakao server configuration.'});
  for(const value of ['0','01','-1','1.5','abc','1'.repeat(19)])assert.throws(()=>readKakaoConfig({KAKAO_APP_ID:value}));
  const a=readKakaoConfig(env),b=readKakaoConfig({...env,KAKAO_CLIENT_ID:'rotated-key'});
  assert.equal(kakaoUid(a.appId,123),kakaoUid(b.appId,123));assert.notEqual(kakaoUid(a.appId,123),kakaoUid('54321',123));
  assert.equal(a.returnUrl,'https://impact-series.web.app/bapmunna/app/auth/kakao/');
});
test('Kakao runtime does not import SmartThings or open a listening server',async()=>{
  const source=await readFile(new URL('../kakao-runtime.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/from ['"]\.\/(?:index|service|store|security|smartthings)\.mjs['"]|createServer|\.listen\(/);
});
