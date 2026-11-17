import {initializeApp,getApps,cert} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {kakaoCredential} from './kakao-runtime.mjs';
import {readWalkingConfig,hash} from './walking-security.mjs';
import {walkingFirestoreStore} from './walking-store.mjs';
import {createWalkingService} from './walking-service.mjs';

export function createWalkingRuntime(env=process.env,{initialize=initializeApp,apps=getApps,certificate=cert,authFor=getAuth,databaseFor=getFirestore,now=()=>Date.now()}={}){
  const config=readWalkingConfig(env),ready=Boolean(config.projectId&&env.FIREBASE_SERVICE_ACCOUNT_JSON);
  let store=null,auth=null,rateSecret='';
  if(ready){
    // Reuse the already-approved dedicated credential and strict RSA/project
    // validation. Kakao provider keys and Samsung readiness are not required.
    const {credential,identity}=kakaoCredential(env,config.projectId,{certificate});
    const name='bapmunna-walking-'+identity,app=apps().find(item=>item.name===name)||initialize({credential,projectId:config.projectId},name);
    auth=authFor(app);store=walkingFirestoreStore(databaseFor(app),now);rateSecret=hash(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  return {config,ready,store,handle:createWalkingService({config,ready,store,auth,rateSecret,now})};
}
