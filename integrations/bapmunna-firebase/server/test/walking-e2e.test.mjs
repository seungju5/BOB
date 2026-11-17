import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {createWalkingService} from '../walking-service.mjs';
import {walkingFirestoreStore,WALKING_COLLECTIONS} from '../walking-store.mjs';
import {hash,koreanDay} from '../walking-security.mjs';

const skipped=!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST;
test('real Auth + Firestore: verified login → consent → pair → destination confirm → sync; live disable, consent removal and deletion revoke access',{skip:skipped},async()=>{
  for(const name of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST'])if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env[name]))throw Error('Only local demo emulators are allowed.');
  const run=randomUUID(),app=initializeApp({projectId:'demo-bapmunna'},'walking-e2e-'+run),db=getFirestore(app),auth=getAuth(app),store=walkingFirestoreStore(db);
  const uid='walking-e2e-'+run,email=run+'@example.test',password=randomUUID(),keys=new Set(),tokens=[],codes=[];
  const rateLimit=store.rateLimit;
  store.rateLimit=async buckets=>{buckets.forEach(bucket=>{if(!bucket.key.startsWith('pair-global:'))keys.add(bucket.key);});return rateLimit(buckets);};
  const config={origin:'https://bapmunna-smartthings.vercel.app',webOrigin:'https://impact-series.web.app'};
  const handle=createWalkingService({config,ready:true,store,auth,rateSecret:run});
  async function request(path,{token,body,native=false}={}){
    const headers={Origin:native?'https://localhost':config.webOrigin};if(token)headers.Authorization='Bearer '+token;if(body)headers['Content-Type']='application/json';
    const response=await handle(new Request(config.origin+'/api/walking/'+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined}));
    return {status:response.status,body:await response.json()};
  }
  try{
    await auth.createUser({uid,email,password,emailVerified:true});
    const login=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-walking-test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});
    assert.equal(login.status,200);const idToken=(await login.json()).idToken;
    assert.equal((await request('profile',{token:idToken})).body.error,'account_consent_required');
    await db.doc('bapmunnaAccounts/'+uid).set({ownerUid:uid,consentVersion:'2026-10-16'});
    assert.deepEqual((await request('profile',{token:idToken})).body,{joined:false});
    assert.equal((await request('join',{token:idToken,body:{nickname:'진짜연결토끼',consentVersion:'2026-11-17',shareTodaySteps:true}})).status,200);
    const pairing=await request('pairing',{token:idToken,body:{}});assert.equal(pairing.status,200);codes.push(pairing.body.code);
    const paired=await request('pair',{native:true,body:{code:pairing.body.code}});assert.equal(paired.status,200);assert.equal(paired.body.confirmed,false);tokens.push(paired.body.token);
    const token=paired.body.token;
    assert.equal((await request('board',{native:true,token})).body.error,'device_confirmation_required');
    assert.equal((await request('confirm',{native:true,token,body:{consentVersion:'2026-11-17',shareTodaySteps:true}})).body.confirmed,true);
    const time=Date.now(),snapshot={date:koreanDay(time),count:456,source:'android-health-connect',queriedAt:new Date(time).toISOString(),timeZone:'Asia/Seoul'};
    assert.equal((await request('sync',{native:true,token,body:snapshot})).status,200);
    assert.equal((await request('board',{token:idToken})).body.me.count,456);
    assert.equal((await request('profile',{token:idToken})).body.deviceConnected,true);
    await auth.updateUser(uid,{disabled:true});assert.equal((await request('board',{native:true,token})).status,401);
    await auth.updateUser(uid,{disabled:false,emailVerified:false});assert.equal((await request('board',{native:true,token})).status,401);
    await auth.updateUser(uid,{emailVerified:true});
    await db.doc('bapmunnaAccounts/'+uid).update({consentVersion:'outdated'});
    assert.equal((await request('sync',{native:true,token,body:snapshot})).body.error,'account_consent_required');
    await db.doc('bapmunnaAccounts/'+uid).update({consentVersion:'2026-10-16'});
    assert.equal((await request('board',{native:true,token})).status,200);
    await auth.deleteUser(uid);assert.equal((await request('board',{native:true,token})).status,401);
    assert.deepEqual(await request('unpair',{native:true,token,body:{}}),{status:200,body:{ok:true}});
    assert.deepEqual(await request('unpair',{native:true,token,body:{}}),{status:200,body:{ok:true}});
  }finally{
    await auth.deleteUser(uid).catch(error=>{if(error.code!=='auth/user-not-found')throw error;});
    await store.leave(uid);await db.doc('bapmunnaAccounts/'+uid).delete();
    await Promise.all([
      ...tokens.map(token=>db.collection(WALKING_COLLECTIONS.Devices).doc(hash(token)).delete()),
      ...codes.map(code=>db.collection(WALKING_COLLECTIONS.Pairings).doc(hash(code)).delete()),
      ...keys].map(target=>typeof target==='string'?db.collection(WALKING_COLLECTIONS.Limits).doc(hash(target)).delete():target));
    await deleteApp(app);
  }
});
