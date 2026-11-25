import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {firestoreStore} from '../store.mjs';
import {ACCOUNT_CONSENT,CONSENT,hash} from '../security.mjs';
import {POWER_NOTICE_CONSENT,publicMealRecords} from '../power-notice.mjs';

test('emulator: consent, owner isolation, concurrent poll/webhook, historical slots and actual retention', {
  skip:!process.env.FIRESTORE_EMULATOR_HOST
}, async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST,/^(127\.0\.0\.1|localhost):\d+$/);
  const run=randomUUID(), app=initializeApp({projectId:'demo-warming-up-meal-records'}, 'meal-records-'+run);
  const db=getFirestore(app), owner='synthetic-a-'+run, other='synthetic-b-'+run;
  const installId='installation-'+run, deviceId='plug-'+run;
  const target=db.collection('bapmunnaSmartThingsConnections').doc(hash(owner));
  const prefs=db.doc('bapmunnaAccounts/'+owner+'/preferences/settings');
  let time=Date.parse('2026-11-25T18:00:00+09:00');
  const store=firestoreStore(db,()=>time), mealWindows=[{slot:'breakfast',start:'06:00',end:'10:00'},
    {slot:'dinner',start:'18:00',end:'20:00'}];
  const dayMs=86_400_000;
  try {
    await db.doc('bapmunnaAccounts/'+owner).set({ownerUid:owner,consentVersion:ACCOUNT_CONSENT});
    await prefs.set({ownerUid:owner,preparationAcknowledged:true,windows:mealWindows,updatedAt:new Date(time-60000)});
    await target.set({uid:owner,installId,deviceId,stage:'connected',deviceIsVirtual:false,consentVersion:CONSENT,
      powerNotice:{component:'main',version:POWER_NOTICE_CONSENT,enabledAt:time-1,lastObservedAt:null},
      powerChecks:{enabledAt:time-1,nextAt:time}});
    await assert.rejects(store.setMealRecordConsent(other,{installId,deviceId,enabled:true},time),{code:'choose_device'});
    await assert.rejects(store.setMealRecordConsent(owner,{installId,deviceId:'another',enabled:true},time),{code:'choose_device'});
    assert.equal(await store.setMealRecordConsent(owner,{installId,deviceId,enabled:true},time),true);
    assert.equal(await store.setMealRecordConsent(owner,{installId,deviceId,enabled:true},time+1),true);
    const packet={id:'packet-'+run,deviceId,component:'main',high:true,time,kind:'power'};
    const claim=await store.claimPowerCheck(owner,deviceId,installId);
    await Promise.all([store.finishPowerCheck(owner,claim,packet,time),store.receive(owner,installId,packet),
      store.receive(owner,installId,packet),store.receive(other,installId,packet)]);
    assert.deepEqual(publicMealRecords(await store.get(owner),time).days,[
      {date:'2026-11-25',windows:mealWindows,confirmed:['dinner'],cook:1}
    ]);
    assert.deepEqual(await store.getCookerNoticeTarget(owner,time),{date:'2026-11-25',slot:'dinner'});
    assert.equal(await store.getCookerNoticeTarget(other,time),null);
    assert.equal(await store.getCookerNoticeTarget(owner,time-1),null);
    time+=dayMs;
    await prefs.update({windows:[{slot:'lunch',start:'16:00',end:'19:00'}],updatedAt:new Date(time-1000)});
    await store.receive(owner,installId,{...packet,id:'new-'+run,time});
    assert.deepEqual(publicMealRecords(await store.get(owner),time).days.map(row=>row.confirmed),[['dinner'],['lunch']]);
    time+=34*dayMs;
    await store.pruneExpiredMealRecords({limit:500});
    assert.deepEqual(Object.keys((await target.get()).get('powerNotice.mealRecords.days')),['2026-11-26']);
    await prefs.update({preparationAcknowledged:false});
    assert.equal(await store.getCookerNoticeTarget(owner,time-34*dayMs),null);
    await assert.rejects(store.setMealRecordConsent(owner,{installId,deviceId,enabled:true},time),{code:'consent_required'});
    assert.equal(await store.setMealRecordConsent(owner,{installId,deviceId,enabled:false},time),false);
    const off=await store.get(owner);
    assert.equal(off.powerNotice.mealRecords,undefined);
    assert.equal(off.powerNotice.version,POWER_NOTICE_CONSENT);
    assert.ok(off.powerChecks);
    assert.equal(await store.finishPowerCheck(owner,claim,packet,time),false);
  } finally { await deleteApp(app); }
});

test('emulator: a delivered meal link follows a corrected date and is inaccessible after withdrawal or expiry', {
  skip:!process.env.FIRESTORE_EMULATOR_HOST
}, async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST,/^(127\.0\.0\.1|localhost):\d+$/);
  const id=randomUUID(), app=initializeApp({projectId:'demo-warming-up-meal-routing'},'meal-routing-'+id);
  const db=getFirestore(app), owner='synthetic-'+id, deviceId='plug-'+id, installId='installation-'+id;
  const account=db.doc('bapmunnaAccounts/'+owner), prefs=account.collection('preferences').doc('settings');
  const connection=db.collection('bapmunnaSmartThingsConnections').doc(hash(owner));
  const midnight=Date.parse('2026-11-26T00:00:00+09:00'), min=60000, day=24*60*min;
  let time=midnight-5*min;
  const store=firestoreStore(db,()=>time);
  const setConsent=enabled=>store.setMealRecordConsent(owner,{installId,deviceId,enabled},time);
  const receive=observedAt=>store.receive(owner,installId,{id:randomUUID(),kind:'power',component:'main',deviceId,high:true,time:observedAt});
  const route=(observedAt,recorded=true)=>store.resolveCookerNoticeTarget(owner,observedAt,{recorded});
  const raw=async ()=>(await connection.get()).get('powerNotice.mealRecords');
  const original=midnight+10000, earlier=midnight-65000;
  try {
    await account.set({ownerUid:owner,consentVersion:ACCOUNT_CONSENT});
    await prefs.set({ownerUid:owner,preparationAcknowledged:true,updatedAt:new Date(time-min),windows:[
      {slot:'breakfast',start:'00:00',end:'05:00'}, {slot:'fifth',start:'20:00',end:'23:59'}
    ]});
    await connection.set({uid:owner,deviceId,installId,stage:'connected',deviceIsVirtual:false,consentVersion:CONSENT,
      powerNotice:{component:'main',version:POWER_NOTICE_CONSENT,enabledAt:time-min,lastObservedAt:null}});
    await setConsent(true);
    time=original;
    await receive(original);
    assert.equal(await route(original),null);
    assert.deepEqual(await store.getCookerNoticeTarget(owner,original),{date:'2026-11-26',slot:'breakfast'});
    await store.getCookerNoticeTarget(owner,original);
    time=original+min;
    await receive(earlier);
    assert.deepEqual(await route(original),{date:'2026-11-25',slot:'fifth'});
    assert.deepEqual(await route(original,false),{date:'2026-11-25'});
    assert.equal(await route(original-1),null);
    assert.equal(await store.resolveCookerNoticeTarget('other-'+id,original,{recorded:true}),null);
    const corrected=await raw();
    assert.equal(Object.keys(corrected.targets).length,1);
    assert.deepEqual(Object.keys(Object.values(corrected.targets)[0]).sort(),['date','slot','until']);
    assert.deepEqual(Object.keys(corrected.days),['2026-11-25']);
    time=original+30*min;
    await receive(time);
    assert.deepEqual(await route(original),{date:'2026-11-25',slot:'fifth'});
    await setConsent(false);
    assert.equal(await raw(),undefined);
    assert.equal(await route(original),null);
    await setConsent(true);
    assert.equal(await route(original),null);
    time+=20*min;
    const later=time;
    await receive(later);
    assert.deepEqual(await store.getCookerNoticeTarget(owner,later),{date:'2026-11-26',slot:'breakfast'});
    const deadline=Math.floor((later+day)/min)*min;
    time=deadline-1;
    assert.deepEqual(await route(later),{date:'2026-11-26',slot:'breakfast'});
    time=deadline;
    assert.equal(await route(later),null);
    await store.pruneExpiredMealRecords({limit:500});
    const pruned=await raw();
    assert.deepEqual(pruned.targets,{});
    assert.deepEqual(pruned.activeRefs,[]);
    assert.ok(pruned.days['2026-11-26']);
    assert.ok(pruned.nextPurgeAt>time);
  } finally { await deleteApp(app); }
});
