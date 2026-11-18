import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {walkingFirestoreStore,WALKING_COLLECTIONS} from '../walking-store.mjs';
import {HEART_COLLECTIONS} from '../heart-store.mjs';
import {hash,randomToken,randomCode,koreanDay,PRIVATE_WALKING_CONSENT,WALKING_CONSENT} from '../walking-security.mjs';
const skipped=!process.env.FIRESTORE_EMULATOR_HOST;
async function fixture(){
  if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Only local demo emulators are allowed.');
  const run=randomUUID(),app=initializeApp({projectId:'demo-bapmunna-hearts'},'hearts-'+run),db=getFirestore(app);let time=Date.parse('2049-11-17T03:00:00Z');const store=walkingFirestoreStore(db,()=>time),uids=[],tokens=[],codes=[];
  async function member(sharingScope='public'){const uid='hearts-'+run+'-'+uids.length;uids.push(uid);await db.doc('bapmunnaAccounts/'+uid).set({ownerUid:uid,consentVersion:'2026-10-16'});await store.join(uid,'하트친구'+uids.length,{sharingScope});return uid;}
  async function link(uid){const token=randomToken(),code=randomCode();tokens.push(token);codes.push(code);await store.issuePairing(uid,Math.floor(time/1000),code);const preview=await store.pair(code,token,async()=>{});await store.confirm(token,preview.sharingScope==='private'?{consentVersion:PRIVATE_WALKING_CONSENT,shareTodaySteps:true,shareRanking:false}:{consentVersion:WALKING_CONSENT,shareTodaySteps:true});return token;}
  const join=uid=>store.hearts.join({uid},{enabled:true,goal:5000,leagueEnabled:false,region:''});
  async function sync(token,count){time+=1000;return store.sync(token,{date:koreanDay(time),count,queriedAt:time,source:'android-health-connect'});}
  async function clean(){for(const uid of uids){await store.leave(uid);await db.doc('bapmunnaAccounts/'+uid).delete();}await Promise.all([...tokens.map(token=>db.collection(WALKING_COLLECTIONS.Devices).doc(hash(token)).delete()),...codes.map(code=>db.collection(WALKING_COLLECTIONS.Pairings).doc(hash(code)).delete())]);await deleteApp(app);}
  return {run,db,store,member,link,join,sync,clean,time:()=>time,advance:ms=>{time+=ms;}};
}
test('real Firestore hearts: atomic sync credits, competing purchase, native locked projection and complete optout',{skip:skipped},async()=>{
  const f=await fixture();try{
    const a=await f.member(),b=await f.member(),token=await f.link(a);await f.join(a);await f.join(b);
    await f.sync(token,5000);assert.equal((await f.store.hearts.get({uid:a})).state.balance,3);
    const purchase=await Promise.allSettled([f.store.hearts.buy({uid:a},'scarf'),f.store.hearts.buy({uid:a},'basket')]);assert.equal(purchase.filter(row=>row.status==='fulfilled').length,1);
    assert.equal((await f.store.hearts.get({uid:a})).state.balance,0);
    const payload={text:'가족 응원',unlockPercent:200,requestId:randomUUID()};
    const [sent,retried]=await Promise.all([f.store.hearts.message({uid:a},payload),f.store.hearts.message({uid:a},payload)]),id=sent.messages[0].id;
    assert.equal(sent.messages.length,1);assert.deepEqual(sent.messages,retried.messages);await assert.rejects(()=>f.store.hearts.message({uid:a},{...payload,text:'다른 편지'}),{code:'heart_message_request_conflict'});
    assert.equal((await f.store.hearts.get({token})).messages[0].text,null);await assert.rejects(()=>f.store.hearts.read({uid:b},id),{code:'heart_message_not_found'});
    await f.sync(token,10000);assert.equal((await f.store.hearts.get({token})).messages[0].text,'가족 응원');
    const same={date:koreanDay(f.time()),count:10000,queriedAt:f.time(),source:'android-health-connect'};
    await Promise.all([f.store.sync(token,same),f.store.hearts.get({uid:a})]);assert.equal((await f.store.hearts.get({uid:a})).state.balance,2);
    await f.store.hearts.leave({uid:a});assert.deepEqual(await f.store.hearts.get({uid:a}),{enabled:false,joined:false});assert.equal((await f.store.profile(a)).joined,true);
    assert.equal((await f.db.collection(HEART_COLLECTIONS.Messages).where('ownerKey','==',hash(a)).get()).size,0);
  }finally{await f.clean();}
});
test('real Firestore hearts: paused updates, retention and late device write cannot resurrect withdrawn data',{skip:skipped},async()=>{
  const f=await fixture();try{
    const uid=await f.member(),token=await f.link(uid);await f.join(uid);await f.store.hearts.settings({uid},{enabled:false});await f.sync(token,10000);
    assert.equal((await f.store.hearts.get({uid})).state.balance,0);await f.store.hearts.settings({uid},{enabled:true});assert.equal((await f.store.hearts.get({uid})).state.balance,5);
    const orphan=await f.member('private');await f.store.hearts.join({uid:orphan},{enabled:true,goal:5000,leagueEnabled:true,region:'철회'});await f.store.hearts.message({uid:orphan},{text:'철회할 편지',unlockPercent:0});await f.db.doc('bapmunnaAccounts/'+orphan).delete();
    await f.store.hearts.message({uid},{text:'오래된 편지',unlockPercent:0});f.advance(31*86400000);await f.store.hearts.cleanup({limit:1000});assert.equal((await f.store.hearts.get({uid})).messages.length,0);
    assert.equal((await f.db.collection(HEART_COLLECTIONS.Hearts).doc(hash(orphan)).get()).exists,false);
    await Promise.allSettled([f.store.leave(uid),f.store.sync(token,{date:koreanDay(f.time()),count:5000,queriedAt:f.time(),source:'android-health-connect'})]);
    assert.equal((await f.db.collection(HEART_COLLECTIONS.Hearts).doc(hash(uid)).get()).exists,false);
  }finally{await f.clean();}
});
test('real Firestore private walking stays out of public aggregates and needs separate league consent',{skip:skipped},async()=>{
  const f=await fixture();try{
    const privateUid=await f.member('private'),publicUid=await f.member(),privateToken=await f.link(privateUid),publicToken=await f.link(publicUid);
    await f.join(privateUid);await f.sync(privateToken,10000);await f.sync(publicToken,100);
    const board=await f.store.board({uid:publicUid});assert.equal(board.total,1);assert.equal(board.me.rank,1);assert.equal(board.entries.length,1);
    assert.equal((await f.db.collection(WALKING_COLLECTIONS.Members).doc(hash(privateUid)).get()).data().rankKey,undefined);
    assert.equal((await f.store.profile(privateUid)).count,10000);assert.equal((await f.store.board({token:privateToken})).me.count,null);
    assert.equal((await f.store.hearts.get({token:privateToken})).state.balance,5);await assert.rejects(()=>f.store.hearts.league({uid:privateUid}),{code:'heart_league_consent_required'});
    await f.store.hearts.settings({uid:privateUid},{leagueEnabled:true,region:'세종'});const league=await f.store.hearts.league({uid:privateUid});assert.equal(league.total,1);assert.equal(league.me.score,200);assert.equal(league.practice,true);
    assert.equal((await f.store.board({uid:publicUid})).total,1);
    await f.store.leave(privateUid);assert.equal((await f.db.collection(HEART_COLLECTIONS.Hearts).doc(hash(privateUid)).get()).exists,false);await assert.rejects(()=>f.sync(privateToken,12000));
  }finally{await f.clean();}
});
test('real Firestore league stores bounded cohorts and settles one completed week atomically',{skip:skipped},async()=>{
  const f=await fixture();try{
    // Fixed clocks must not reuse a previous test run's already-settled cohort.
    const participants=[],region='검증'+f.run.replaceAll('-','').slice(0,12).replace(/\d/g,digit=>String.fromCharCode(65+Number(digit)));
    for(let index=0;index<10;index++){
      const uid=await f.member('private'),token=await f.link(uid);participants.push(uid);
      await f.store.hearts.join({uid},{enabled:true,goal:5000,leagueEnabled:true,region});await f.sync(token,10000-index*500);
    }
    const before=await f.store.hearts.league({uid:participants[0]});assert.equal(before.total,10);assert.equal(before.practice,false);assert.equal(before.me.rank,1);
    f.advance(7*86400000);
    await Promise.all(participants.map(async(uid,index)=>{const result=await f.store.hearts.get({uid});assert.equal(result.tier,index<3?1:0);}));
    for(let index=0;index<10;index++)assert.equal((await f.store.hearts.get({uid:participants[index]})).tier,index<3?1:0);
    assert.equal((await f.store.hearts.league({uid:participants[0]})).total,10);
  }finally{await f.clean();}
});
