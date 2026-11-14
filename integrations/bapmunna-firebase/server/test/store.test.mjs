import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {firestoreStore} from '../store.mjs';

test('real Firestore transactions preserve owner isolation, locks, single-use state and signal order',{skip:!process.env.FIRESTORE_EMULATOR_HOST},async()=>{
  if(!process.env.FIRESTORE_EMULATOR_HOST.match(/^(127\.0\.0\.1|localhost):\d+$/))throw Error('Only a local emulator is allowed.');
  // Receipts intentionally survive disconnect; each run must use its own installation.
  const run=randomUUID();
  const app=initializeApp({projectId:'demo-bapmunna'},'smartthings-store-test-'+run),store=firestoreStore(getFirestore(app),()=>1000000);
  const uid='store-test-alice-'+run,installId='store-test-install-'+run,state='test-state-'+run;
  try{
    await store.remove(uid,installId);
    await store.saveConnection(uid,{installId,stage:'connected',deviceId:'mine',tokens:{encrypted:true},lastSignalAt:100});
    await assert.rejects(()=>store.saveConnection('store-test-bob',{installId}),{code:'installation_in_use'});
    await store.saveState(state,{nonceHash:'correct',until:1000010,uid});
    await assert.rejects(()=>store.consumeState(state,'wrong'),{code:'invalid_state'});
    assert.equal((await store.consumeState(state,'correct')).uid,uid);
    await assert.rejects(()=>store.consumeState(state,'correct'),{code:'invalid_state'});
    assert.equal(await store.cancelState(state,'different-owner'),false);
    assert.equal(await store.cancelState(state,uid),true);
    await assert.rejects(()=>store.saveState(state,{nonceHash:'correct',until:1000010,uid}),{code:'invalid_state'});
    await assert.rejects(()=>store.saveConnection(uid,{installId,stage:'choose_device'},{state,nonceHash:'correct'}),{code:'invalid_state'});
    assert.equal((await store.get(uid)).stage,'connected');
    const activeState=state+'-active';
    await store.saveState(activeState,{nonceHash:'correct',until:1000010,uid});
    await store.consumeState(activeState,'correct');
    await store.saveConnection(uid,await store.get(uid),{state:activeState,nonceHash:'correct'});
    await assert.rejects(()=>store.saveConnection(uid,{installId},{state:activeState,nonceHash:'correct'}),{code:'invalid_state'});
    let release;const gate=new Promise(resolve=>{release=resolve;});let entered;
    const started=new Promise(resolve=>{entered=resolve;});
    const first=store.withLease(uid,async()=>{entered();await gate;});
    await started;await assert.rejects(()=>store.withLease(uid,async()=>{}),{code:'busy'});release();await first;
    await store.receive(uid,installId,{id:'e1',deviceId:'mine',time:300,kind:'power'});
    await store.receive(uid,installId,{id:'e1',deviceId:'mine',time:500,kind:'power'});
    await store.receive(uid,installId,{id:'e2',deviceId:'mine',time:200,kind:'power'});
    await store.receive(uid,installId,{id:'e3',deviceId:'other',time:600,kind:'power'});
    await store.patch(uid,{lastSignalAt:250});assert.equal((await store.get(uid)).lastSignalAt,300);
    await store.remove(uid,'not-the-install');assert.ok(await store.get(uid));
    await store.remove(uid,installId);assert.equal(await store.get(uid),null);assert.equal(await store.installation(installId),null);
  }finally{await deleteApp(app);}
});
