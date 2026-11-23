import { random, hash, ApiError, ACCOUNT_CONSENT, CONSENT } from './security.mjs';
import { advancePowerNotice, hasPowerChecks, matchesPowerCheck, POWER_CHECK_MS } from './power-notice.mjs';

// None of these collections has a browser-readable rule. All access is through
// a verified Firebase ID token and an owner UID derived by the server.
export function firestoreStore(db, now = () => Date.now()) {
  const ref = (kind, id) => db.collection(`bapmunnaSmartThings${kind}`).doc(hash(id));
  const accountRef = (uid) => db.collection('bapmunnaAccounts').doc(uid);
  const settingsRef = (uid) => db.collection(`bapmunnaAccounts/${uid}/preferences`).doc('settings');
  async function eligible(uid, transaction) {
    const read = (ref) => (transaction ? transaction.get(ref) : ref.get());
    const [account, settings] = await Promise.all([read(accountRef(uid)), read(settingsRef(uid))]);
    return (
      account.data()?.ownerUid === uid &&
      account.data()?.consentVersion === ACCOUNT_CONSENT &&
      settings.data()?.ownerUid === uid &&
      settings.data()?.preparationAcknowledged === true
    );
  }
  const read = async (kind, id) => (await ref(kind, id).get()).data() || null;
  async function transact(kind, id, fn) {
    return db.runTransaction(async (tx) => {
      const target = ref(kind, id),
        current = (await tx.get(target)).data() || null;
      const result = fn(current);
      if (result.next === null) tx.delete(target);
      else if (result.next !== undefined) tx.set(target, result.next);
      return result.value;
    });
  }
  return {
    async verifyConsent(uid) {
      if (!(await eligible(uid))) throw new ApiError(403, 'consent_required');
    },
    async duePowerChecks() {
      const found = await db.collection('bapmunnaSmartThingsConnections')
        .where('powerChecks.nextAt', '<=', now()).orderBy('powerChecks.nextAt').limit(20)
        .select('uid', 'installId', 'deviceId').get();
      return found.docs.flatMap(doc => {
        const candidate = doc.data();
        return typeof candidate.uid === 'string' && doc.id === hash(candidate.uid) ? [candidate] : [];
      });
    },
    async claimPowerCheck(uid, deviceId, installId) {
      return db.runTransaction(async tx => {
        const target = ref('Connections', uid);
        const current = (await tx.get(target)).data();
        const at = now();
        if (!current?.powerChecks || current.deviceId !== deviceId ||
            (installId && current.installId !== installId) || current.powerChecks.nextAt > at) return null;
        if (!hasPowerChecks(current) || current.consentVersion !== CONSENT || !(await eligible(uid, tx))) {
          tx.update(target, {powerChecks: null});
          return null;
        }
        // Reserve before Samsung is called. Tabs, overlapping jobs and retries
        // share one ten-minute limit, including when Samsung returns an error.
        const nextAt = at + POWER_CHECK_MS;
        tx.update(target, {'powerChecks.nextAt': nextAt});
        return {deviceId, installId: current.installId, component: current.powerNotice.component,
          enabledAt: current.powerChecks.enabledAt, nextAt};
      });
    },
    async finishPowerCheck(uid, claim, observation, checkedAt) {
      return db.runTransaction(async tx => {
        const target = ref('Connections', uid);
        const current = (await tx.get(target)).data();
        if (!matchesPowerCheck(current, claim) || current.consentVersion !== CONSENT || !(await eligible(uid, tx))) return false;
        const fields = {'powerChecks.checkedAt': checkedAt};
        if (observation) {
          fields['powerChecks.measuredAt'] = Math.max(current.powerChecks.measuredAt ?? 0, observation.time);
          const notice = advancePowerNotice(current, observation, checkedAt, 'poll');
          if (notice) fields.powerNotice = notice;
        }
        tx.update(target, fields);
        return true;
      });
    },
    async dueConnections({ limit = 20 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20)
        throw new RangeError('Maintenance limit must be between 1 and 20.');
      // One indexed field: no scan of every user's encrypted credentials and
      // no additional paid scheduler/TTL. Only the cron receives these UIDs.
      const found = await db
        .collection('bapmunnaSmartThingsConnections')
        .where('refreshDueAt', '<=', new Date(now()))
        .orderBy('refreshDueAt')
        .limit(limit)
        .get();
      return found.docs.flatMap((doc) => {
        const value = doc.data();
        return typeof value?.uid === 'string' &&
          doc.id === hash(value.uid) &&
          typeof value.installId === 'string'
          ? [{ uid: value.uid, installId: value.installId }]
          : [];
      });
    },
    async cleanupExpired({ limit = 5000 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 5000)
        throw new RangeError('Cleanup limit must be between 1 and 5000.');
      const cutoff = now(),
        result = { scanned: 0, deleted: 0, limitReached: false, collections: {} };
      // This explicit list cannot include connections, installations, household
      // profiles or encrypted tokens. It uses ordinary reads/deletes, not TTL.
      for (const kind of ['States', 'Pending', 'Locks', 'Receipts']) {
        const counts = { scanned: 0, deleted: 0 };
        result.collections[kind] = counts;
        const remaining = limit - result.scanned;
        if (!remaining) continue;
        const found = await db
          .collection(`bapmunnaSmartThings${kind}`)
          .where('expiresAt', '<=', new Date(cutoff))
          .orderBy('expiresAt')
          .limit(remaining)
          .get();
        counts.scanned = found.docs.length;
        result.scanned += counts.scanned;
        for (let offset = 0; offset < found.docs.length; offset += 100) {
          const candidates = found.docs.slice(offset, offset + 100);
          counts.deleted += await db.runTransaction(async (tx) => {
            const current = await Promise.all(candidates.map((doc) => tx.get(doc.ref)));
            let deleted = 0;
            for (const doc of current) {
              const value = doc.data(),
                expiry = value?.expiresAt;
              const expiresAt =
                expiry instanceof Date
                  ? expiry.getTime()
                  : typeof expiry?.toMillis === 'function'
                    ? expiry.toMillis()
                    : NaN;
              // A lease may have been renewed after the query. Recheck inside
              // the transaction so cleanup cannot delete the new owner's lock.
              if (
                !Number.isFinite(expiresAt) ||
                expiresAt > cutoff ||
                (Number.isFinite(value?.until) && value.until > cutoff)
              )
                continue;
              tx.delete(doc.ref);
              deleted++;
            }
            return deleted;
          });
        }
        result.deleted += counts.deleted;
      }
      result.limitReached = result.scanned === limit;
      return result;
    },
    get: (uid) => read('Connections', uid),
    async patch(uid, fields, { installId, attemptId, requireConsent = false } = {}) {
      return db.runTransaction(async (tx) => {
        const target = ref('Connections', uid);
        const [saved, consent] = await Promise.all([
          tx.get(target),
          requireConsent ? eligible(uid, tx) : null,
        ]);
        const current = saved.data();
        if (!current) throw new ApiError(409, 'reconnect_required');
        if (
          (installId && current.installId !== installId) ||
          (attemptId && current.refreshAttemptId !== attemptId)
        )
          throw new ApiError(409, 'reconnect_required');
        if (requireConsent && (!consent || current.consentVersion !== CONSENT))
          throw new ApiError(403, 'consent_required');
        const next = { ...current, ...fields };
        if (Object.hasOwn(fields, 'lastSignalAt'))
          next.lastSignalAt = Math.max(current.lastSignalAt || 0, fields.lastSignalAt || 0) || null;
        tx.set(target, next);
        return next;
      });
    },
    async saveConnection(uid, value, { state, nonceHash } = {}) {
      if (!state || !nonceHash || value.uid !== uid || value.consentVersion !== CONSENT)
        throw new ApiError(400, 'invalid_state');
      return db.runTransaction(async (tx) => {
        const connection = ref('Connections', uid),
          installation = ref('Installations', value.installId);
        const stateRef = ref('States', state),
          pendingRef = ref('Pending', uid);
        const [old, owner, attempt, pending, consent] = await Promise.all([
          tx.get(connection),
          tx.get(installation),
          tx.get(stateRef),
          tx.get(pendingRef),
          eligible(uid, tx),
        ]);
        const saved = attempt.data();
        if (
          !saved ||
          saved.uid !== uid ||
          saved.nonceHash !== nonceHash ||
          saved.used !== true ||
          saved.cancelled === true ||
          saved.consentVersion !== CONSENT ||
          pending.data()?.stateHash !== hash(state) ||
          !Number.isFinite(saved.until) ||
          saved.until <= now()
        )
          throw new ApiError(400, 'invalid_state');
        if (!consent) throw new ApiError(403, 'consent_required');
        if (owner.exists && owner.data().uid !== uid) throw new ApiError(409, 'installation_in_use');
        if (old.exists && old.data().installId !== value.installId)
          throw new ApiError(409, 'disconnect_first');
        tx.set(connection, value);
        tx.set(installation, { uid, installId: value.installId });
        tx.delete(stateRef);
        tx.delete(pendingRef);
      });
    },
    async remove(uid, installId) {
      await db.runTransaction(async (tx) => {
        const connection = ref('Connections', uid),
          current = await tx.get(connection);
        if (current.data()?.installId !== installId) return;
        tx.delete(connection);
        tx.delete(ref('Installations', installId));
      });
    },
    installation: (id) => read('Installations', id),
    async saveState(state, value) {
      return db.runTransaction(async (tx) => {
        const target = ref('States', state),
          pending = ref('Pending', value.uid);
        const existing = await tx.get(target);
        if (existing.exists || value.consentVersion !== CONSENT)
          throw new ApiError(400, 'invalid_state');
        if (!(await eligible(value.uid, tx))) throw new ApiError(403, 'consent_required');
        const expiresAt = new Date(value.until);
        tx.set(target, { ...value, expiresAt });
        tx.set(pending, { stateHash: hash(state), expiresAt });
      });
    },
    async cancelPending(uid) {
      const target = ref('Pending', uid);
      return db.runTransaction(async (tx) => {
        await tx.get(target);
        tx.delete(target);
      });
    },
    async consumeState(state, nonceHash) {
      return transact('States', state, (current) => {
        if (
          !current ||
          !Number.isFinite(current.until) ||
          current.until <= now() ||
          current.nonceHash !== nonceHash ||
          current.used === true ||
          current.cancelled === true
        )
          throw new ApiError(400, 'invalid_state');
        // Retain the attempt through token exchange, so cancellation and the
        // final saveConnection transaction can race without reviving a session.
        return { next: { ...current, used: true }, value: current };
      });
    },
    async cancelState(state, uid) {
      return transact('States', state, (current) => {
        if (current && current.uid !== uid) return { value: false };
        const until = now() + 600000;
        return { next: { uid, cancelled: true, until, expiresAt: new Date(until) }, value: true };
      });
    },
    async withLease(uid, operation) {
      const owner = random();
      await transact('Locks', uid, (current) => {
        if (current?.until > now()) throw new ApiError(409, 'busy');
        return { next: { owner, until: now() + 120000, expiresAt: new Date(now() + 120000) } };
      });
      try {
        return await operation();
      } finally {
        await transact('Locks', uid, (current) => ({
          next: current?.owner === owner ? null : undefined,
        }));
      }
    },
    async receive(uid, installId, event) {
      return db.runTransaction(async (tx) => {
        const connection = ref('Connections', uid),
          receipt = ref('Receipts', `${installId}:${event.id}`);
        const [saved, seen, consent] = await Promise.all([
          tx.get(connection),
          tx.get(receipt),
          eligible(uid, tx),
        ]);
        const current = saved.data();
        if (
          seen.exists ||
          !current ||
          current.installId !== installId ||
          current.deviceId !== event.deviceId ||
          !['subscribing', 'connected'].includes(current.stage) ||
          !consent ||
          current.consentVersion !== CONSENT
        )
          return false;
        // Deduplication metadata contains no power readings. cleanupExpired
        // removes expired receipts without requiring billed Firestore TTL.
        tx.set(receipt, { expiresAt: new Date(now() + 86400000) });
        const arrival = {
          lastEventAt: Math.max(event.time, current.lastEventAt ?? 0),
          lastReceivedAt: Math.max(now(), current.lastReceivedAt ?? 0),
        };
        if (event.time >= (current.lastSignalAt || 0))
          Object.assign(arrival, { lastSignalAt: event.time, lastKind: event.kind });
        const notice = advancePowerNotice(current, event, now());
        if (notice) arrival.powerNotice = notice;
        tx.update(connection, arrival);
        return true;
      });
    },
  };
}
