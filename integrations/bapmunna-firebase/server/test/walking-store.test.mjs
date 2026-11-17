import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {walkingFirestoreStore,WALKING_COLLECTIONS} from '../walking-store.mjs';
import {hash,randomCode,randomToken,koreanDay,rankKey,PAIR_LIFETIME,DEVICE_LIFETIME} from '../walking-security.mjs';

const skipped=!process.env.FIRESTORE_EMULATOR_HOST;
function localOnly(){if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Only a local demo Firestore emulator is allowed.');}
async function setup(day='2041-11-17'){
  localOnly();const run=randomUUID(),app=initializeApp({projectId:'demo-bapmunna'},'walking-store-'+run),db=getFirestore(app);
  let time=Date.parse(day+'T04:00:00Z');const store=walkingFirestoreStore(db,()=>time),uids=[],tokens=[],codes=[],rateKeys=[];
  const memberRef=uid=>db.collection(WALKING_COLLECTIONS.Members).doc(hash(uid));
  async function member(name='달빛토끼'){
    const uid='walking-'+run+'-'+uids.length;uids.push(uid);
    await db.doc('bapmunnaAccounts/'+uid).set({ownerUid:uid,consentVersion:'2026-10-16'});await store.join(uid,name);return uid;
  }
  async function pairing(uid){const code=randomCode();codes.push(code);await store.issuePairing(uid,Math.floor(time/1000)-1,code);return code;}
  async function link(uid,{confirmed=true}={}){
    const token=randomToken();tokens.push(token);await store.pair(await pairing(uid),token,async()=>{});if(confirmed)await store.confirm(token);return token;
  }
  async function clean(){
    const targets=[...uids.flatMap(uid=>[memberRef(uid),db.doc('bapmunnaAccounts/'+uid)]),...tokens.map(token=>db.collection(WALKING_COLLECTIONS.Devices).doc(hash(token))),...codes.map(code=>db.collection(WALKING_COLLECTIONS.Pairings).doc(hash(code))),...rateKeys.map(key=>db.collection(WALKING_COLLECTIONS.Limits).doc(hash(key)))];
    await Promise.all(targets.map(ref=>ref.delete()));await deleteApp(app);
  }
  return {run,db,store,uids,tokens,codes,rateKeys,member,memberRef,pairing,link,clean,now:()=>time,advance:ms=>{time+=ms;}};
}

test('real Firestore: one-use code, destination confirmation, replacement and late upload cannot resurrect a withdrawn member',{skip:skipped},async()=>{
  const f=await setup();try{
    const uid=await f.member(),oldCode=await f.pairing(uid),code=await f.pairing(uid),token=randomToken();f.tokens.push(token);
    await assert.rejects(()=>f.store.pair(oldCode,randomToken(),async()=>{}),{code:'invalid_pairing_code'});
    const candidates=await Promise.allSettled([f.store.pair(code,token,async()=>{}),f.store.pair(code,randomToken(),async()=>{})]);
    assert.equal(candidates.filter(value=>value.status==='fulfilled').length,1);
    const pending=candidates.find(value=>value.status==='fulfilled').value;f.tokens.push(pending.token);
    assert.equal(pending.confirmed,false);assert.equal(pending.nickname,'달빛토끼');
    await assert.rejects(()=>f.store.deviceIdentity(pending.token),{code:'device_confirmation_required'});
    assert.equal((await f.store.deviceIdentity(pending.token,{pending:true})).uid,uid);
    await assert.rejects(()=>f.store.join(uid,'다른목적지'),{code:'nickname_locked'});
    const confirmed=await f.store.confirm(pending.token);assert.equal(Date.parse(confirmed.expiresAt),f.now()+DEVICE_LIFETIME);
    assert.deepEqual(await f.store.confirm(pending.token),confirmed);
    const replacement=await f.link(uid,{confirmed:false});assert.equal((await f.store.deviceIdentity(pending.token)).uid,uid);
    await f.store.confirm(replacement);await assert.rejects(()=>f.store.deviceIdentity(pending.token),{code:'device_expired'});
    const snapshot={date:koreanDay(f.now()),count:1234,source:'ios-healthkit',queriedAt:f.now()};
    await Promise.allSettled([f.store.sync(replacement,snapshot),f.store.leave(uid)]);
    assert.deepEqual(await f.store.profile(uid),{joined:false});assert.equal((await f.memberRef(uid).get()).exists,false);
    await assert.rejects(()=>f.store.sync(replacement,snapshot));
    await f.store.join(uid,'새로운별명');await assert.rejects(()=>f.store.confirm(replacement));
  }finally{await f.clean();}
});
test('real Firestore: exact top50 and own rank beyond 50, zero versus absent, ties, and newer downward corrections',{skip:skipped},async()=>{
  const f=await setup('2042-11-17');try{
    const uid=await f.member(),token=await f.link(uid),date=koreanDay(f.now());
    let board=await f.store.board({uid});assert.equal(board.total,0);assert.equal(board.me.count,null);assert.equal(board.me.rank,null);
    await f.store.sync(token,{date,count:0,source:'android-health-connect',queriedAt:f.now()});board=await f.store.board({uid});assert.equal(board.me.count,0);assert.equal(board.me.rank,1);
    const seed=[];
    for(let index=0;index<54;index++){
      const other=await f.member('걷기친구'+String(index).padStart(2,'0'));
      const count=index<2?5000:5000-index;
      seed.push(f.memberRef(other).update({date,count,rankKey:rankKey(date,count),queriedAt:f.now(),syncedAt:f.now(),stepsExpireAt:new Date(f.now()+86400000)}));
    }
    await Promise.all(seed);board=await f.store.board({token});assert.equal(board.total,55);assert.equal(board.entries.length,50);assert.deepEqual(board.entries.slice(0,3).map(row=>row.rank),[1,1,3]);assert.equal(board.me.rank,55);
    for(const row of board.entries)assert.deepEqual(Object.keys(row).sort(),['count','nickname','publicId','rank']);
    assert.doesNotMatch(JSON.stringify(board),/walking-|ownerUid|authTime|deviceKey/);
    f.advance(1000);await f.store.sync(token,{date,count:5100,source:'android-health-connect',queriedAt:f.now()});
    const earlier=f.now();f.advance(1000);await f.store.sync(token,{date,count:4999,source:'android-health-connect',queriedAt:f.now()});
    board=await f.store.board({uid});assert.equal(board.me.rank,3);assert.equal(board.me.count,4999);
    await assert.rejects(()=>f.store.sync(token,{date,count:9000,source:'android-health-connect',queriedAt:earlier}),{code:'stale_snapshot'});
    await assert.rejects(()=>f.store.sync(token,{date,count:9000,source:'android-health-connect',queriedAt:f.now()}),{code:'stale_snapshot'});
    const same=await f.store.sync(token,{date,count:4999,source:'android-health-connect',queriedAt:f.now()});assert.equal(same.count,4999);
    const member=(await f.memberRef(uid).get()).data();assert.ok(!JSON.stringify(member).includes(token));
    const device=(await f.db.collection(WALKING_COLLECTIONS.Devices).doc(hash(token)).get()).data();assert.ok(!JSON.stringify(device).includes(token));
    f.advance(86400000);board=await f.store.board({uid});assert.equal(board.total,0);assert.equal(board.me.count,null);assert.equal(board.me.rank,null);
    await assert.rejects(()=>f.store.sync(token,{date,count:1,source:'ios-healthkit',queriedAt:f.now()}),{code:'stale_snapshot'});
  }finally{await f.clean();}
});
test('real Firestore: account consent, code/token expiry, unpair, bounded limits and cleanup remain separate',{skip:skipped},async()=>{
  const f=await setup('2043-11-17');try{
    const uid=await f.member(),token=await f.link(uid),date=koreanDay(f.now());
    await f.store.sync(token,{date,count:14,source:'ios-healthkit',queriedAt:f.now()});
    await f.db.doc('bapmunnaAccounts/'+uid).delete();await assert.rejects(()=>f.store.deviceIdentity(token),{code:'account_consent_required'});
    await assert.rejects(()=>f.store.sync(token,{date,count:15,source:'ios-healthkit',queriedAt:f.now()+1}),{code:'account_consent_required'});
    assert.deepEqual(await f.store.unpair(token),{ok:true});assert.deepEqual(await f.store.unpair(token),{ok:true});
    await f.db.doc('bapmunnaAccounts/'+uid).set({ownerUid:uid,consentVersion:'2026-10-16'});
    assert.equal((await f.store.profile(uid)).count,14);assert.equal((await f.store.profile(uid)).deviceConnected,false);
    const code=await f.pairing(uid);f.advance(PAIR_LIFETIME+1);await assert.rejects(()=>f.store.pair(code,randomToken(),async()=>{}),{code:'invalid_pairing_code'});
    const newToken=await f.link(uid);f.advance(DEVICE_LIFETIME+1);await assert.rejects(()=>f.store.deviceIdentity(newToken),{code:'device_expired'});
    const key='rate-'+f.run;f.rateKeys.push(key);
    await f.store.rateLimit([{key,limit:1,windowMs:1000}]);await assert.rejects(()=>f.store.rateLimit([{key,limit:1,windowMs:1000}]),{code:'rate_limited'});
    f.advance(1001);await f.store.rateLimit([{key,limit:1,windowMs:1000}]);
    const cleaned=await f.store.cleanup({limit:1});assert.equal(cleaned.scanned,1);assert.equal(cleaned.limitReached,true);assert.equal(cleaned.stepsCleared,1);
    const member=(await f.memberRef(uid).get()).data();assert.equal(member.nickname,'달빛토끼');assert.equal(member.count,undefined);assert.equal(member.rankKey,undefined);
    await f.store.cleanup({limit:1000});assert.equal((await f.store.profile(uid)).deviceConnected,false);
  }finally{await f.clean();}
});
test('real merged Firestore rules: anonymous, owner and staff cannot directly read or mutate any walking metadata',{skip:skipped},async()=>{
  localOnly();
  const [{initializeTestEnvironment,assertFails},{doc,setDoc,getDoc,deleteDoc,collection,getDocs,setLogLevel}]=await Promise.all([import('@firebase/rules-unit-testing'),import('firebase/firestore')]);
  setLogLevel('silent');const rules=await readFile(new URL('../../tmp/firebase/merged.rules',import.meta.url),'utf8');
  const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':'),run=randomUUID();
  const environment=await initializeTestEnvironment({projectId:'demo-bapmunna',firestore:{host,port:Number(port),rules}}),owner='walking-rule-owner-'+run,staff='walking-rule-staff-'+run,id=hash(run);
  try{
    await environment.withSecurityRulesDisabled(async context=>{
      const db=context.firestore();await setDoc(doc(db,'bapmunnaStaff',staff),{role:'owner'});
      for(const path of Object.values(WALKING_COLLECTIONS))await setDoc(doc(db,path,id),{uid:owner,nickname:'테스트별명'});
    });
    const contexts=[environment.unauthenticatedContext(),environment.authenticatedContext(owner,{email:'owner@example.test',email_verified:true}),environment.authenticatedContext(staff,{email:'staff@example.test',email_verified:true})];
    for(const context of contexts){
      const db=context.firestore();for(const path of Object.values(WALKING_COLLECTIONS)){
        await assertFails(getDoc(doc(db,path,id)));await assertFails(getDocs(collection(db,path)));await assertFails(setDoc(doc(db,path,id),{uid:owner}));await assertFails(deleteDoc(doc(db,path,id)));
      }
    }
  }finally{
    await environment.withSecurityRulesDisabled(async context=>{const db=context.firestore();await deleteDoc(doc(db,'bapmunnaStaff',staff));for(const path of Object.values(WALKING_COLLECTIONS))await deleteDoc(doc(db,path,id));});
    await environment.cleanup();
  }
});
