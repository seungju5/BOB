import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { ACCOUNT_CONSENT, CONSENT } from '../security.mjs';
import { firestoreStore } from '../store.mjs';

test(
  'real Firestore transactions preserve owner isolation, locks, single-use state and signal order',
  { skip: !process.env.FIRESTORE_EMULATOR_HOST },
  async () => {
    if (!process.env.FIRESTORE_EMULATOR_HOST.match(/^(127\.0\.0\.1|localhost):\d+$/))
      throw Error('Only a local emulator is allowed.');
    // Receipts intentionally survive disconnect; each run must use its own installation.
    const run = randomUUID();
    const app = initializeApp({ projectId: 'demo-warming-up' }, 'smartthings-store-test-' + run),
      store = firestoreStore(getFirestore(app), () => 1000000);
    const uid = 'store-test-alice-' + run,
      installId = 'store-test-install-' + run,
      state = 'test-state-' + run;
    try {
      await getFirestore(app)
        .doc(`bapmunnaAccounts/${uid}`)
        .set({ ownerUid: uid, consentVersion: ACCOUNT_CONSENT });
      await getFirestore(app)
        .doc(`bapmunnaAccounts/${uid}/preferences/settings`)
        .set({ ownerUid: uid, preparationAcknowledged: true });
      await store.remove(uid, installId);
      await store.saveState(state + '-initial', {
        uid,
        consentVersion: CONSENT,
        nonceHash: 'start',
        until: 1000010,
      });
      await store.consumeState(state + '-initial', 'start');
      await store.saveConnection(
        uid,
        {
          uid,
          consentVersion: CONSENT,
          installId,
          stage: 'connected',
          deviceId: 'mine',
          tokens: { encrypted: true },
          lastSignalAt: 100,
        },
        { state: state + '-initial', nonceHash: 'start' },
      );
      await store.patch(uid, { uid, refreshDueAt: new Date(999999) });
      assert.ok(
        (await store.dueConnections()).some((item) => item.uid === uid && item.installId === installId),
      );
      await store.patch(uid, { refreshDueAt: null });
      assert.ok(!(await store.dueConnections()).some((item) => item.uid === uid));
      await store.patch(uid, { refreshDueAt: new Date(1000001) });
      assert.ok(!(await store.dueConnections()).some((item) => item.uid === uid));
      await assert.rejects(
        () => store.patch(uid, { tokens: { wrong: true } }, { installId: 'wrong-installation' }),
        { code: 'reconnect_required' },
      );
      await store.patch(uid, { refreshAttemptId: 'current-attempt' });
      await assert.rejects(
        () => store.patch(uid, { tokens: { wrong: true } }, { installId, attemptId: 'old-attempt' }),
        { code: 'reconnect_required' },
      );
      assert.deepEqual((await store.get(uid)).tokens, { encrypted: true });
      const bob = 'other-' + run;
      await getFirestore(app)
        .doc(`bapmunnaAccounts/${bob}`)
        .set({ ownerUid: bob, consentVersion: ACCOUNT_CONSENT });
      await getFirestore(app)
        .doc(`bapmunnaAccounts/${bob}/preferences/settings`)
        .set({ ownerUid: bob, preparationAcknowledged: true });
      await store.saveState(state + '-bob', {
        uid: bob,
        consentVersion: CONSENT,
        nonceHash: 'start',
        until: 1000010,
      });
      await store.consumeState(state + '-bob', 'start');
      await assert.rejects(
        () =>
          store.saveConnection(
            bob,
            { uid: bob, consentVersion: CONSENT, installId },
            { state: state + '-bob', nonceHash: 'start' },
          ),
        { code: 'installation_in_use' },
      );
      await store.saveState(state, {
        nonceHash: 'correct',
        until: 1000010,
        uid,
        consentVersion: CONSENT,
      });
      await assert.rejects(() => store.consumeState(state, 'wrong'), { code: 'invalid_state' });
      assert.equal((await store.consumeState(state, 'correct')).uid, uid);
      await assert.rejects(() => store.consumeState(state, 'correct'), { code: 'invalid_state' });
      assert.equal(await store.cancelState(state, 'different-owner'), false);
      assert.equal(await store.cancelState(state, uid), true);
      await assert.rejects(
        () =>
          store.saveState(state, { nonceHash: 'correct', until: 1000010, uid, consentVersion: CONSENT }),
        { code: 'invalid_state' },
      );
      await assert.rejects(
        () =>
          store.saveConnection(
            uid,
            { installId, stage: 'choose_device' },
            { state, nonceHash: 'correct' },
          ),
        { code: 'invalid_state' },
      );
      assert.equal((await store.get(uid)).stage, 'connected');
      const activeState = state + '-active';
      await store.saveState(activeState, {
        nonceHash: 'correct',
        until: 1000010,
        uid,
        consentVersion: CONSENT,
      });
      await store.consumeState(activeState, 'correct');
      await store.saveConnection(uid, await store.get(uid), {
        state: activeState,
        nonceHash: 'correct',
      });
      await assert.rejects(
        () => store.saveConnection(uid, { installId }, { state: activeState, nonceHash: 'correct' }),
        { code: 'invalid_state' },
      );
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      let entered;
      const started = new Promise((resolve) => {
        entered = resolve;
      });
      const first = store.withLease(uid, async () => {
        entered();
        await gate;
      });
      await started;
      await assert.rejects(() => store.withLease(uid, async () => {}), { code: 'busy' });
      release();
      await first;
      const firstEvent = { id: 'e1', deviceId: 'mine', time: 300, kind: 'power' };
      await store.patch(uid, { stage: 'choose_device' });
      assert.equal(await store.receive(uid, installId, firstEvent), false);
      await store.patch(uid, { stage: 'subscribing' });
      assert.equal(await store.receive(uid, installId, { ...firstEvent, deviceId: 'other' }), false);
      assert.equal(await store.receive(uid, installId, firstEvent), true);
      assert.equal((await store.get(uid)).stage, 'subscribing');
      await store.patch(uid, { stage: 'connected', lastSignalAt: null });
      await store.receive(uid, installId, { id: 'e1', deviceId: 'mine', time: 500, kind: 'power' });
      await store.receive(uid, installId, { id: 'e2', deviceId: 'mine', time: 200, kind: 'power' });
      await store.receive(uid, installId, { id: 'e3', deviceId: 'other', time: 600, kind: 'power' });
      await store.patch(uid, { lastSignalAt: 250 });
      assert.equal((await store.get(uid)).lastSignalAt, 300);
      assert.equal((await store.get(uid)).lastEventAt, 300);
      assert.equal((await store.get(uid)).lastReceivedAt, 1000000);
      await getFirestore(app)
        .doc(`bapmunnaAccounts/${uid}/preferences/settings`)
        .update({ preparationAcknowledged: false });
      await assert.rejects(() => store.verifyConsent(uid), { code: 'consent_required' });
      const beforeWithdrawalWrite = await store.get(uid);
      await assert.rejects(
        () =>
          store.patch(
            uid,
            { hasPower: true, lastSignalAt: 999, lastCheckedAt: 999 },
            { installId, requireConsent: true },
          ),
        { code: 'consent_required' },
      );
      assert.deepEqual(await store.get(uid), beforeWithdrawalWrite);
      // Token cleanup/invalidation is still possible without a data-read grant.
      await store.patch(uid, { refreshAttemptId: null }, { installId });
      assert.equal(
        await store.receive(uid, installId, {
          id: 'withdrawn',
          deviceId: 'mine',
          time: 900,
          kind: 'power',
        }),
        false,
      );
      assert.equal((await store.get(uid)).lastSignalAt, 300);
      await store.remove(uid, 'not-the-install');
      assert.ok(await store.get(uid));
      await store.remove(uid, installId);
      assert.equal(await store.get(uid), null);
      assert.equal(await store.installation(installId), null);
    } finally {
      await deleteApp(app);
    }
  },
);
