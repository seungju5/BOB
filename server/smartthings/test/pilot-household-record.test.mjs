import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {getFirestore} from 'firebase-admin/firestore';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {saveHouseholdObservations,saveHouseholdReading,verifyRecipient} from '../pilot/household-record.mjs';
import {ACCOUNT_CONSENT} from '../security.mjs';

const profile = {uid:'synthetic',email:'owner@example.test',emailVerified:true};
const agreement = {uid:'synthetic',recipientEmail:'owner@example.test',consented:true,physicalCooker:true};
test('pilot grants are for a single verified, enabled recipient and physical cooker',()=>{
  verifyRecipient(profile,agreement);
  for (const change of [{disabled:true},{emailVerified:false},{uid:'another'},{email:'elsewhere@example.test'}])
    assert.throws(()=>verifyRecipient({...profile,...change},agreement));
  assert.throws(()=>verifyRecipient(profile,{...agreement,physicalCooker:false}));
  assert.throws(()=>verifyRecipient(profile,{...agreement,consented:false}));
});

test('private import is idempotent and reassigns a late cross-midnight cooking signal atomically',{
  skip:!process.env.FIRESTORE_EMULATOR_HOST
},async()=>{
  assert.match(process.env.FIRESTORE_EMULATOR_HOST,/^(?:127\.0\.0\.1|localhost):\d+$/);
  const uid=randomUUID(),app=initializeApp({projectId:'demo-warming-up'},'pilot-'+uid);
  const db=getFirestore(app), owner=db.collection('bapmunnaAccounts').doc(uid);
  const user={...profile,uid}, grant={...agreement,uid};
  const windows=[{slot:'breakfast',start:'00:00',end:'09:00'},{slot:'dinner',start:'18:00',end:'23:59'}];
  const settings=owner.collection('preferences').doc('settings');
  const now=Date.parse('2026-06-08T09:00:00+09:00'), day=Math.floor((now+32400000)/86400000);
  const summary=d=>owner.collection('meterCaptures').doc(String(d%35));
  try {
    await owner.set({ownerUid:uid,email:user.email,consentVersion:ACCOUNT_CONSENT});
    await settings.set({ownerUid:uid,updatedAt:new Date(now-86400000),windows,preparationAcknowledged:true});
    const updated=(await settings.get()).get('updatedAt');grant.settingsRevision=updated.seconds+':'+updated.nanoseconds;
    const save=(at,cooking=true)=>saveHouseholdReading(db,user,grant,{measuredAt:Date.parse(at+'+09:00'),cooking},now);
    const first='2026-06-08T00:05:00';
    const expired = day-36, orphanDay = day-37;
    const evidence = d=>owner.collection('meterCaptureEvidence').doc(String(d%35));
    const setup = db.batch();
    for (const d of [expired,day-35]) {
      setup.set(summary(d), {day:d,windows,count:1,cook:0,confirmed:[]});
      setup.set(evidence(d), {day:d,windows,samples:{0:false},peaks:{}});
    }
    setup.set(evidence(orphanDay), {day:orphanDay,windows,samples:{0:false},peaks:{}});
    await setup.commit();
    assert.deepEqual((await Promise.all([save(first),save(first)])).map(x=>x.status).sort(),['duplicate','saved']);
    assert.deepEqual((await db.getAll(summary(expired),evidence(expired),evidence(orphanDay))).map(s=>s.exists),[false,false,false]);
    assert.equal((await evidence(day).get()).get('day'),day);
    assert.equal((await summary(day).get()).get('cook'),1);
    await save('2026-06-07T23:55:00');
    assert.equal((await summary(day).get()).get('cook'),0);
    assert.deepEqual((await summary(day-1).get()).get('confirmed'),['dinner']);
    await save('2026-06-08T00:18:00');
    await save('2026-06-08T00:35:00',false);
    assert.deepEqual((await summary(day).get()).data(),{day,count:3,cook:1,confirmed:['breakfast'],lastMeasuredMinute:35,windows});
    await assert.rejects(save(first,false),/Conflicting/);
    // Earlier-day context must survive a limited re-import, including the previous midnight grouping.
    const bounded = ['2026-06-08T06:00:00','2026-06-08T06:10:00','2026-06-08T06:20:00'];
    const measurements = [first,'2026-06-08T00:18:00','2026-06-08T00:35:00',...bounded].map((at,i) => ({
      measuredAt:Date.parse(at+'+09:00'),cooking:i<2,
    }));
    const peak = measurements[4].measuredAt;
    const batch = (items,peaks) => saveHouseholdObservations(db,user,grant,items,peaks,now);
    const intervals = [{start:peak,end:peak}];
    assert.equal((await batch(measurements,intervals)).status,'saved');
    assert.equal((await batch(measurements,intervals)).status,'duplicate');
    assert.deepEqual((await summary(day).get()).get('estimatedSlots'),['breakfast']);
    assert.equal((await summary(day).get()).get('cook'),1);
    await batch(measurements.slice(-3),[]);
    assert.equal((await summary(day).get()).get('estimated'),1);
    await batch(measurements,[]);
    assert.equal((await summary(day).get()).get('estimated'),undefined);
    await batch(measurements,intervals);
    await save('2026-06-08T06:18:00');
    assert.equal((await summary(day).get()).get('estimated'),undefined);
    await settings.update({preparationAcknowledged:false});
    await assert.rejects(save(first),/consent/);
    await settings.update({preparationAcknowledged:true,updatedAt:new Date(now)});
    await assert.rejects(save(first),/permission or settings changed/);
  } finally {await db.terminate();await deleteApp(app);}
});
