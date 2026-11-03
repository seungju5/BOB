import {createServer} from 'node:http';
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {readConfig,webhookVerifier} from './security.mjs';
import {firestoreStore} from './store.mjs';
import {smartThingsClient} from './smartthings.mjs';
import {createService,configured} from './service.mjs';

const config=readConfig(process.env),ready=configured(config);
const app=ready?initializeApp({credential:applicationDefault(),projectId:config.projectId}):null;
const handle=createService({config,store:app?firestoreStore(getFirestore(app)):null,verifyUser:token=>getAuth(app).verifyIdToken(token,true),smartthings:smartThingsClient(config),verifyWebhook:webhookVerifier()});
createServer(async(req,res)=>{
  try{
    let length=0;const chunks=[];
    for await(const chunk of req){length+=chunk.length;if(length>1048576){res.writeHead(413);res.end();req.destroy();return;}chunks.push(chunk);}
    // The public origin comes from trusted configuration, never Host/X-Forwarded-*.
    const url=new URL(req.url,config.origin);
    if(url.origin!==config.origin){res.writeHead(400);res.end();return;}
    const request=new Request(url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
    const result=await handle(request);
    res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
  }catch{res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":"temporarily_unavailable"}');}
}).listen(Number(process.env.PORT||8080),'0.0.0.0',()=>console.log(`SmartThings API listening; integration ${ready?'configured':'awaiting configuration'}.`));
