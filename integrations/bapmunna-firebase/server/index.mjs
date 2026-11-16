import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {initializeApp,applicationDefault,cert} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {readConfig,webhookVerifier,ApiError} from './security.mjs';
import {firestoreStore} from './store.mjs';
import {smartThingsClient} from './smartthings.mjs';
import {createService,configured} from './service.mjs';
import {createNodeHandler} from './http-adapter.mjs';

export function firebaseCredential(env,projectId,{certificate=cert,defaultCredential=applicationDefault}={}){
  const encoded=env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if(!encoded)return defaultCredential();
  try{
    if(typeof encoded!=='string'||encoded.length>32768)throw Error();
    const value=JSON.parse(encoded);
    if(value?.type!=='service_account'||value.project_id!==projectId||typeof value.client_email!=='string'||!value.client_email.endsWith(`@${projectId}.iam.gserviceaccount.com`)||typeof value.private_key!=='string'||!value.private_key.startsWith('-----BEGIN PRIVATE KEY-----'))throw Error();
    // Ignore credential-file URLs; only the expected Firebase project identity
    // and its signing key are accepted. This value stays in server memory.
    return certificate({projectId:value.project_id,clientEmail:value.client_email,privateKey:value.private_key});
  }catch{throw Error('FIREBASE_SERVICE_ACCOUNT_JSON is invalid or belongs to a different Firebase project.');}
}

export function createRuntime(env=process.env){
  const config=readConfig(env),ready=configured(config);
  if(env.VERCEL&&ready&&!env.FIREBASE_SERVICE_ACCOUNT_JSON)throw Error('A dedicated Firebase server credential is required on Vercel.');
  const app=ready?initializeApp({credential:firebaseCredential(env,config.projectId),projectId:config.projectId}):null;
  const store=app?firestoreStore(getFirestore(app)):null;
  const handle=createService({config,store,verifyConsent:uid=>store.verifyConsent(uid),verifyUser:token=>getAuth(app).verifyIdToken(token,true),verifyAccount:async(uid,authTime)=>{
    let user;
    try{user=await getAuth(app).getUser(uid);}catch(error){if(error.code==='auth/user-not-found')throw new ApiError(401,'login_required');throw error;}
    const validAfter=Date.parse(user.tokensValidAfterTime||'1970-01-01T00:00:00Z');
    if(user.disabled||!user.emailVerified||!Number.isInteger(authTime)||!Number.isFinite(validAfter)||authTime*1000<validAfter)throw new ApiError(401,'login_required');
  },smartthings:smartThingsClient(config),verifyWebhook:webhookVerifier()});
  return {config,ready,store,handle,maintain:handle.maintain};
}

// Importing the runtime in a serverless function must not open a listening port.
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const runtime=createRuntime();
    createServer(createNodeHandler({origin:runtime.config.origin,handle:runtime.handle})).listen(Number(process.env.PORT||8080),'0.0.0.0',()=>console.log(`SmartThings API listening; integration ${runtime.ready?'configured':'awaiting configuration'}.`));
  }catch{
    console.error('SmartThings API configuration is invalid.');process.exitCode=1;
  }
}
