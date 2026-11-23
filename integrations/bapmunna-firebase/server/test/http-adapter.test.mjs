import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createServer,request as nodeRequest} from 'node:http';
import {createNodeHandler,MAX_REQUEST_BYTES} from '../http-adapter.mjs';
import {firebaseCredential,createRuntime} from '../index.mjs';

async function invoke(handle,{url='/api/smartthings/events',method='POST',headers={},chunks=[]}={}){
  const req=Readable.from(chunks);Object.assign(req,{url,method,headers});
  Object.defineProperty(req,'body',{get(){throw Error('Parsed request.body must not be accessed.');}});
  const result={headersSent:false,status:null,headers:null,body:null,writeHead(status,responseHeaders){this.headersSent=true;this.status=status;this.headers=responseHeaders;},end(body,done){this.body=body;done?.();}};
  await handle(req,result);return result;
}
const origin='https://connect.example.test';

test('Node adapter preserves raw webhook bytes, query order and fixed origin despite forwarded headers',async()=>{
  const raw=Buffer.from(' { "label" : "밥솥", "value": 1.000 }\r\n');
  let received;
  const handler=createNodeHandler({origin,handle:async request=>{
    received={url:request.url,raw:Buffer.from(await request.arrayBuffer()),authorization:request.headers.get('authorization')};
    return new Response('{"ok":true}',{headers:{'content-type':'application/json'}});
  }});
  const result=await invoke(handler,{url:'/api/smartthings/events?b=%2f&a=1',headers:{host:'attacker.invalid','x-forwarded-host':'attacker.invalid','x-forwarded-proto':'http',authorization:'Signature synthetic','content-length':String(raw.length)},chunks:[raw.subarray(0,4),raw.subarray(4)]});
  assert.equal(result.status,200);assert.equal(received.url,origin+'/api/smartthings/events?b=%2f&a=1');
  assert.deepEqual(received.raw,raw);assert.equal(received.authorization,'Signature synthetic');
});

test('Node adapter accepts exactly 1MiB and rejects larger declared or streamed bodies before service',async()=>{
  let calls=0;
  const handler=createNodeHandler({origin,handle:async request=>{calls++;assert.equal((await request.arrayBuffer()).byteLength,MAX_REQUEST_BYTES);return new Response(null,{status:204});}});
  assert.equal((await invoke(handler,{chunks:[Buffer.alloc(MAX_REQUEST_BYTES)]})).status,204);
  assert.equal((await invoke(handler,{headers:{'content-length':String(MAX_REQUEST_BYTES+1)}})).status,413);
  assert.equal((await invoke(handler,{chunks:[Buffer.alloc(MAX_REQUEST_BYTES),Buffer.from('x')]})).status,413);
  assert.equal(calls,1);
});

test('Node adapter rejects ambiguous paths, inconsistent lengths and bodies on GET',async()=>{
  let calls=0;const handler=createNodeHandler({origin,handle:async()=>{calls++;return new Response('unexpected');}});
  for(const url of ['https://attacker.invalid/api/smartthings/events','//attacker.invalid/events','/api/../api/smartthings/events','/api\\smartthings/events','/api/smartthings/events#fragment']){
    assert.equal((await invoke(handler,{url})).status,400);
  }
  for(const headers of [{'content-length':'2'},{'content-length':'-1'},{'content-length':['1','1']}])assert.equal((await invoke(handler,{headers,chunks:[Buffer.from('x')]})).status,400);
  assert.equal((await invoke(handler,{method:'GET',chunks:[Buffer.from('x')]})).status,400);
  assert.equal(calls,0);
});

test('Node adapter preserves multiple Set-Cookie headers and HEAD has no response body',async()=>{
  const handler=createNodeHandler({origin,handle:async()=>{
    const headers=new Headers();headers.append('Set-Cookie','nonce=one; HttpOnly');headers.append('Set-Cookie','other=two; Secure');
    return new Response('hidden on HEAD',{status:200,headers});
  }});
  const result=await invoke(handler,{method:'HEAD',url:'/api/smartthings/config'});
  assert.deepEqual(result.headers['set-cookie'],['nonce=one; HttpOnly','other=two; Secure']);assert.equal(result.body,undefined);
});

test('Node adapter never returns exception text or credentials',async()=>{
  const handler=createNodeHandler({origin,handle:async()=>{throw Error('synthetic-private-key and OAuth-code');}});
  const result=await invoke(handler);
  assert.equal(result.status,503);assert.equal(result.headers['Cache-Control'],'no-store');
  assert.equal(String(result.body),'{"error":"temporarily_unavailable"}');
});

test('actual Node HTTP transport preserves raw bytes and sends a usable 413 response',async t=>{
  const seen=[];
  const server=createServer(createNodeHandler({origin,handle:async request=>{
    seen.push({url:request.url,body:Buffer.from(await request.arrayBuffer())});
    return new Response('{"ok":true}',{headers:{'content-type':'application/json'}});
  }}));
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const send=raw=>new Promise((resolve,reject)=>{
    const request=nodeRequest({hostname:'127.0.0.1',port:server.address().port,path:'/api/smartthings/events?b=2&a=1',method:'POST',headers:{host:'attacker.invalid','x-forwarded-host':'attacker.invalid','content-length':String(raw.length)}},response=>{
      const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>resolve({status:response.statusCode,body:Buffer.concat(chunks).toString()}));
    });
    request.on('error',reject);request.end(raw);
  });
  const raw=Buffer.from(' { "label": "밥솥" }\r\n');
  assert.equal((await send(raw)).status,200);assert.deepEqual(seen,[{url:origin+'/api/smartthings/events?b=2&a=1',body:raw}]);
  const oversized=await send(Buffer.alloc(MAX_REQUEST_BYTES+1));assert.equal(oversized.status,413);assert.equal(JSON.parse(oversized.body).error,'request_too_large');assert.equal(seen.length,1);
});

test('Firebase server credential accepts only the configured project identity and keeps ADC fallback',()=>{
  const synthetic={type:'service_account',project_id:'demo-bapmunna',client_email:'integration@demo-bapmunna.iam.gserviceaccount.com',private_key:'-----BEGIN PRIVATE KEY-----\nSYNTHETIC\n-----END PRIVATE KEY-----\n',token_uri:'https://attacker.invalid'};
  const options={certificate:value=>value,defaultCredential:()=>({adc:true})};
  assert.deepEqual(firebaseCredential({},'demo-bapmunna',options),{adc:true});
  const credential=firebaseCredential({FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify(synthetic)},'demo-bapmunna',options);
  assert.deepEqual(Object.keys(credential).sort(),['clientEmail','privateKey','projectId']);assert.equal(credential.projectId,'demo-bapmunna');
  for(const value of ['not json',JSON.stringify({...synthetic,project_id:'other-project'}),JSON.stringify({...synthetic,type:'authorized_user'}),JSON.stringify({...synthetic,client_email:'wrong@other-project.iam.gserviceaccount.com'})]){
    assert.throws(()=>firebaseCredential({FIREBASE_SERVICE_ACCOUNT_JSON:value},'demo-bapmunna',options),{message:'FIREBASE_SERVICE_ACCOUNT_JSON is invalid or belongs to a different Firebase project.'});
  }
  assert.throws(()=>firebaseCredential({FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify(synthetic)},'demo-bapmunna',{...options,certificate(){throw Error(synthetic.private_key);}}),{message:'FIREBASE_SERVICE_ACCOUNT_JSON is invalid or belongs to a different Firebase project.'});
});

test('imported runtime can expose unconfigured status without credentials or a listening server',async()=>{
  const appOrigin='https://app.example.test';
  const runtime=createRuntime({PUBLIC_ORIGIN:origin,APP_URL:origin+'/connect/',BAPMUNNA_APP_ORIGINS:appOrigin,BAPMUNNA_RETURN_URL:appOrigin+'/carer/#connect'});
  assert.equal(runtime.ready,false);assert.equal(runtime.store,null);
  const response=await runtime.handle(new Request(origin+'/api/smartthings/config'));
  assert.equal((await response.json()).enabled,false);
});
test('Vercel cannot claim a configured integration without its dedicated Firebase server identity',()=>{
  assert.throws(()=>createRuntime({VERCEL:'1',PUBLIC_ORIGIN:origin,APP_URL:origin+'/connect/',FIREBASE_PROJECT_ID:'demo-bapmunna',SMARTTHINGS_APP_ID:'test-app',SMARTTHINGS_CLIENT_ID:'test-client',SMARTTHINGS_CLIENT_SECRET:'synthetic-secret',SMARTTHINGS_ENCRYPTION_KEY:Buffer.alloc(32).toString('base64')}),{message:'A dedicated Firebase server credential is required on Vercel.'});
});
