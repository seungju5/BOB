// Public, non-mutating deployment checks. No account tokens or health records.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const origin='https://bapmunna-smartthings.vercel.app';
const web='https://impact-series.web.app';
const cases=[
  ['walking-ready','/api/walking/config',200,{}],
  ['walking-web-config','/api/walking/config',200,{headers:{Origin:web}}],
  ['walking-unauthenticated','/api/walking/profile',401,{headers:{Origin:web}}],
  ['walking-private-board','/api/walking/board',401,{headers:{Origin:web}}],
  ['walking-no-origin','/api/walking/profile',403,{}],
  ['walking-foreign-origin','/api/walking/profile',403,{headers:{Origin:'https://example.invalid'}}],
  ['walking-invalid-query','/api/walking/config?other=value',400,{}],
  ['walking-native-preflight','/api/walking/sync',204,{method:'OPTIONS',headers:{Origin:'https://localhost','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}}],
  ['walking-web-preflight','/api/walking/join',204,{method:'OPTIONS',headers:{Origin:web,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}}],
  ['walking-native-owner-only','/api/walking/profile',403,{headers:{Origin:'https://localhost'}}],
  ['walking-invalid-pair-body','/api/walking/pair',400,{method:'POST',headers:{Origin:'https://localhost','Content-Type':'application/json'},body:'{}'}],
  ['kakao-preserved','/api/kakao/config',200,{headers:{Origin:web}}],
  ['smartthings-preserved','/api/smartthings/config',200,{}],
  ['cleanup-private','/api/smartthings/cleanup',401,{}],
];
const results=[];
for(const [name,route,status,options]of cases){
  const response=await fetch(origin+route,{...options,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(20000)});
  const data=response.status===204?null:await response.json();
  assert.equal(response.status,status,name);
  assert.match(response.headers.get('cache-control')||'',/no-store/,name+' cache');
  const item={name,status:response.status,passed:true};
  if(name.startsWith('walking-')&&name.includes('config')||name==='walking-ready'){
    assert.equal(data.enabled,true,name);assert.equal(data.consentVersion,'2026-11-17');assert.equal(data.timeZone,'Asia/Seoul');item.enabled=data.enabled;
  }
  if(name==='kakao-preserved'){assert.equal(data.enabled,true);item.enabled=data.enabled;}
  if(name==='smartthings-preserved'){assert.equal(data.enabled,true);assert.equal(data.connectionReady,false);item.enabled=data.enabled;item.connectionReady=data.connectionReady;}
  results.push(item);
}
const report={checkedAt:new Date().toISOString(),origin,passed:results.length,total:cases.length,results,realDeviceVerified:false,realHealthDataUsed:false};
if(process.argv[2]){const output=path.resolve(process.argv[2]);await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report,null,2));
