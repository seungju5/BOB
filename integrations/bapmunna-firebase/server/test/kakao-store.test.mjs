import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {kakaoFirestoreStore,KAKAO_COLLECTIONS} from '../kakao-store.mjs';
import {hash,randomToken,challengeFor,kakaoUid} from '../kakao-security.mjs';

test('local Firestore: concurrent state/handoff consumption, wrong binding and bounded cleanup',{skip:!process.env.FIRESTORE_EMULATOR_HOST},async()=>{
  if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST))throw Error('Only a local emulator is allowed.');
  const app=initializeApp({projectId:'demo-bapmunna'},'kakao-store-test-'+randomUUID()),db=getFirestore(app);
  let time=2100000000000;
  const store=kakaoFirestoreStore(db,()=>time),state=randomToken(),flow=randomToken(),nonceHash=hash(randomToken()),challenge=challengeFor(randomToken()),code=randomToken(),uid=kakaoUid('12345',123456789);
  try{
    await store.saveState(state,{challenge,flow,nonceHash,until:time+600000},{networkKey:hash(randomToken())});
    await assert.rejects(()=>store.consumeState(state,hash(randomToken())),{code:'invalid_state'});
    const results=await Promise.allSettled([store.consumeState(state,nonceHash),store.consumeState(state,nonceHash)]);
    assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
    await store.saveHandoff(code,{uid,challenge,flow,until:time+120000});
    await assert.rejects(()=>store.consumeHandoff(code,challengeFor(randomToken()),flow),{code:'invalid_handoff'});
    await assert.rejects(()=>store.consumeHandoff(code,challenge,randomToken()),{code:'invalid_handoff'});
    const exchanges=await Promise.allSettled([store.consumeHandoff(code,challenge,flow),store.consumeHandoff(code,challenge,flow)]);
    assert.equal(exchanges.filter(result=>result.status==='fulfilled').length,1);assert.equal(exchanges.find(result=>result.status==='fulfilled').value,uid);
    const expired=randomToken();await store.saveHandoff(expired,{uid,challenge,flow,until:time+1});time+=2;
    await assert.rejects(()=>store.consumeHandoff(expired,challenge,flow),{code:'invalid_handoff'});
    const cleanupCode=randomToken();await store.saveHandoff(cleanupCode,{uid,challenge,flow,until:time+1});time+=2;
    const cleaned=await store.cleanup({limit:5000});assert.ok(cleaned.deleted>=1);
    assert.equal((await db.collection(KAKAO_COLLECTIONS.Handoffs).doc(hash(cleanupCode)).get()).exists,false);
  }finally{await deleteApp(app);}
});

test('local exact merged rules: all browser roles are denied Kakao state, handoff and rate metadata',{skip:!process.env.FIRESTORE_EMULATOR_HOST},async()=>{
  if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST))throw Error('Only a local emulator is allowed.');
  const [{initializeTestEnvironment,assertFails},{doc,setDoc,getDoc,deleteDoc,collection,getDocs,setLogLevel}]=await Promise.all([import('@firebase/rules-unit-testing'),import('firebase/firestore')]);
  setLogLevel('silent');
  const rules=await readFile(new URL('../../tmp/firebase/merged.rules',import.meta.url),'utf8');
  assert.match(rules,/match \/bapmunnaSystem\/\{document=\*\*\} \{ allow read,write: if false; \}/);
  const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
  const environment=await initializeTestEnvironment({projectId:'demo-bapmunna',firestore:{host,port:Number(port),rules}}),run=randomUUID();
  const owner='kakao-owner-'+run,staff='kakao-staff-'+run,id=hash(run);
  try{
    await environment.withSecurityRulesDisabled(async context=>{
      const db=context.firestore();await setDoc(doc(db,'bapmunnaStaff',staff),{role:'owner'});
      for(const path of Object.values(KAKAO_COLLECTIONS))await setDoc(doc(db,path,id),{uid:owner,challenge:'synthetic-challenge',expiresAt:new Date(Date.now()+600000),until:Date.now()+600000});
    });
    const contexts=[environment.unauthenticatedContext(),environment.authenticatedContext(owner,{email:'owner@example.test',email_verified:true}),environment.authenticatedContext('kakao-pending-'+run,{email_verified:false,firebase:{sign_in_provider:'custom'}}),environment.authenticatedContext(staff,{email:'staff@example.test',email_verified:true})];
    for(const context of contexts){
      const db=context.firestore();
      for(const path of Object.values(KAKAO_COLLECTIONS)){
        await assertFails(getDoc(doc(db,path,id)));await assertFails(getDocs(collection(db,path)));
        await assertFails(setDoc(doc(db,path,id),{uid:owner}));await assertFails(deleteDoc(doc(db,path,id)));
      }
    }
  }finally{
    await environment.withSecurityRulesDisabled(async context=>{
      const db=context.firestore();await deleteDoc(doc(db,'bapmunnaStaff',staff));
      for(const path of Object.values(KAKAO_COLLECTIONS))await deleteDoc(doc(db,path,id));
    });
    await environment.cleanup();
  }
});
