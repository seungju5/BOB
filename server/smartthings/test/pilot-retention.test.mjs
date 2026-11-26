import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeApp, deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {sweepPilotBuckets} from '../pilot/retention.mjs';
import {dayOf} from '../pilot/peak-history.mjs';

const midnight = Date.parse('2026-06-08T00:00:00+09:00');
const oldest = dayOf(midnight) - 35;

test('a reused bucket survives the interval between finding an expiry and deleting it', async () => {
  const previousVersion = {seconds:1, nanoseconds:0};
  let writes = 0;
  const doc = {
    get: () => oldest, updateTime:previousVersion,
    ref:{
      path:'bapmunnaAccounts/example/meterCaptureEvidence/' + (oldest % 35),
      async delete(precondition) {
        assert.deepEqual(precondition, {lastUpdateTime:previousVersion});
        writes++;
        throw Object.assign(Error('version changed'), {code:9});
      },
    },
  };
  const db = {collectionGroup(kind) {
    const docs = kind === 'meterCaptureEvidence' ? [doc] : [];
    return {
      where() { return this; }, orderBy() { return this; }, select() { return this; }, limit() { return this; },
      async get() { return {docs, size:docs.length}; },
    };
  }};
  assert.equal((await sweepPilotBuckets(db, {now:midnight})).expired, 1);
  assert.equal(writes, 0);
  assert.deepEqual(await sweepPilotBuckets(db, {now:midnight, apply:true}), {expired:1, deleted:0, changed:1, skipped:0, more:false});
  assert.equal(writes, 1);
});

test('dormant households: dry run, KST boundary, orphaned evidence, bounded work and unrelated paths', {
  skip:!process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(?:localhost|127\.0\.0\.1):\d+$/);
  // Each suite gets a separate emulator database, including collection-group queries.
  const projectId = 'demo-retention-' + randomUUID().slice(0, 8);
  const app = initializeApp({projectId}, projectId);
  const db = getFirestore(app);
  const root = db.collection('bapmunnaAccounts');
  const ref = (uid, kind, day) => root.doc(uid).collection(kind).doc(String(day % 35));
  const recent = ref('keep','meterCaptureEvidence',oldest + 1);
  const old = ref('inactive','meterCaptures',oldest);
  const oldEvidence = ref('inactive','meterCaptureEvidence',oldest);
  const orphan = ref('orphan','meterCaptureEvidence',oldest);
  const unrelated = db.doc('otherApp/example/meterCaptures/' + (oldest % 35));
  try {
    const batch = db.batch();
    for (const doc of [old, oldEvidence, orphan, unrelated]) batch.set(doc, {day:oldest});
    batch.set(recent, {day:oldest + 1});
    await batch.commit();
    assert.equal((await sweepPilotBuckets(db, {now:midnight - 1})).expired, 0);
    assert.deepEqual(await sweepPilotBuckets(db, {now:midnight}), {expired:3, deleted:0, changed:0, skipped:1, more:false});
    assert.equal((await sweepPilotBuckets(db, {now:midnight, apply:true, limit:1})).more, true);
    await sweepPilotBuckets(db, {now:midnight, apply:true});
    assert.deepEqual((await db.getAll(old,oldEvidence,orphan,recent,unrelated)).map(s => s.exists), [false,false,false,true,true]);
    assert.equal((await sweepPilotBuckets(db, {now:midnight, apply:true})).deleted, 0);
  } finally { await db.terminate(); await deleteApp(app); }
});
