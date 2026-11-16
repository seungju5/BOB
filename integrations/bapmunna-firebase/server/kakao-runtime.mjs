import {createPrivateKey} from 'node:crypto';
import {initializeApp,getApps,cert} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {readKakaoConfig,kakaoConfigured,hash} from './kakao-security.mjs';
import {kakaoFirestoreStore} from './kakao-store.mjs';
import {createKakaoService,kakaoClient} from './kakao-service.mjs';

export function kakaoCredential(env,projectId,{certificate=cert}={}){
  try{
    const encoded=env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if(typeof encoded!=='string'||encoded.length>32768)throw Error();
    const value=JSON.parse(encoded);
    if(value?.type!=='service_account'||value.project_id!==projectId||typeof value.client_email!=='string'||!new RegExp('^[a-zA-Z0-9._-]+@'+projectId+'\\.iam\\.gserviceaccount\\.com$').test(value.client_email)||typeof value.private_key!=='string'||!value.private_key.startsWith('-----BEGIN PRIVATE KEY-----'))throw Error();
    const key=createPrivateKey(value.private_key);
    if(key.asymmetricKeyType!=='rsa'||key.asymmetricKeyDetails.modulusLength<2048)throw Error();
    // Explicit cert credentials sign custom tokens locally; no IAM SignBlob,
    // Identity Platform upgrade, ADC fallback or new billing is necessary.
    return {credential:certificate({projectId,clientEmail:value.client_email,privateKey:value.private_key}),identity:hash(projectId+':'+value.client_email+':'+value.private_key).slice(0,20)};
  }catch{throw Error('Invalid Kakao Firebase server credential.');}
}

export function createKakaoRuntime(env=process.env,{initialize=initializeApp,apps=getApps,certificate=cert,authFor=getAuth,databaseFor=getFirestore,fetcher=fetch,now=()=>Date.now()}={}){
  const config=readKakaoConfig(env);
  const ready=kakaoConfigured(config)&&Boolean(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  let store=null,auth=null;
  if(ready){
    const {credential,identity}=kakaoCredential(env,config.projectId,{certificate});
    const name='bapmunna-kakao-'+identity;
    const app=apps().find(candidate=>candidate.name===name)||initialize({credential,projectId:config.projectId},name);
    auth=authFor(app);store=kakaoFirestoreStore(databaseFor(app),now);
  }
  return {config,ready,store,handle:createKakaoService({config,ready,store,auth,kakao:kakaoClient(config,fetcher),now})};
}
