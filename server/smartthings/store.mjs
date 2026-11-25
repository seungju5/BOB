import { random, hash, ApiError, ACCOUNT_CONSENT, CONSENT } from './security.mjs';
import { advancePowerNotice, hasPowerChecks, matchesPowerCheck, MEAL_RECORD_CONSENT, POWER_CHECK_MS, POWER_NOTICE_CONSENT } from './power-notice.mjs';
import { activeMealRecordGrant, NOTICE_TARGET_LIFETIME, pruneMealRecords, recentCookDate, rememberMealTarget } from './meal-records.mjs';

function suspendedPowerChecks(checks) {
  return Number.isSafeInteger(checks?.enabledAt) ? {enabledAt:checks.enabledAt} : null;
}

// None of these collections has a browser-readable rule. All access is through
// a verified Firebase ID token and an owner UID derived by the server.
export function firestoreStore(db, now = () => Date.now()) {
  const ref = (kind, id) => db.collection(`bapmunnaSmartThings${kind}`).doc(hash(id));
  const accountRef = (uid) => db.collection('bapmunnaAccounts').doc(uid);
  const settingsRef = (uid) => db.collection(`bapmunnaAccounts/${uid}/preferences`).doc('settings');
  const targetKey = (uid, at) => hash('meal-notice/'+uid+'/'+at);
  async function selectedNotice(uid, tx) {
    const connection = ref('Connections',uid);
    const [snap, settings] = await Promise.all([tx.get(connection), eligible(uid,tx)]);
    const current = snap.data();
    if (!settings || current?.uid !== uid || current.stage !== 'connected' || current.consentVersion !== CONSENT ||
        current.deviceIsVirtual !== false || current.powerNotice?.version !== POWER_NOTICE_CONSENT) return null;
    return {connection,notice:current.powerNotice};
  }
  async function eligible(uid, transaction) {
    const read = (ref) => (transaction ? transaction.get(ref) : ref.get());
    const [account, settings] = await Promise.all([read(accountRef(uid)), read(settingsRef(uid))]);
    return (
      account.data()?.ownerUid === uid &&
      account.data()?.consentVersion === ACCOUNT_CONSENT &&
      settings.data()?.ownerUid === uid &&
      settings.data()?.preparationAcknowledged === true
    ) ? settings.data() : null;
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
    async setMealRecordConsent(uid, { installId, deviceId, enabled }, at = now()) {
      if (typeof enabled !== 'boolean') throw new ApiError(400, 'invalid_request');
      return db.runTransaction(async tx => {
        const target = ref('Connections', uid);
        const [snap, settings] = await Promise.all([tx.get(target), enabled ? eligible(uid, tx) : null]);
        const current = snap.data();
        if (!current || current.uid !== uid || current.installId !== installId || current.deviceId !== deviceId)
          throw new ApiError(409, 'choose_device');
        const notice = current.powerNotice;
        if (!enabled) {
          if (notice?.mealRecords) {
            const remaining = { ...notice };
            delete remaining.mealRecords;
            tx.update(target, {powerNotice:remaining});
          }
          return false;
        }
        if (!settings || current.consentVersion !== CONSENT) throw new ApiError(403, 'consent_required');
        if (current.stage !== 'connected' || current.deviceIsVirtual !== false || notice?.version !== POWER_NOTICE_CONSENT)
          throw new ApiError(409, 'power_notice_required');
        if (!activeMealRecordGrant(notice)) tx.update(target, {'powerNotice.mealRecords':{version:MEAL_RECORD_CONSENT,enabledAt:at,days:{}}});
        return true;
      });
    },
    async getCookerNoticeTarget(uid, at) {
      return db.runTransaction(async tx => {
        const selected = await selectedNotice(uid,tx);
        if (!selected || selected.notice.lastObservedAt !== at || at < (selected.notice.resumedAt ?? 0) ||
            !activeMealRecordGrant(selected.notice)) return null;
        const record = selected.notice.mealRecords, key = targetKey(uid,at);
        const next = rememberMealTarget(record,key,at,now());
        if (next !== record) tx.update(selected.connection, {'powerNotice.mealRecords':next});
        const target = next.targets?.[key];
        if (!target) return null;
        return target.slot ? {date:target.date,slot:target.slot} : {date:target.date};
      });
    },
    async resolveCookerNoticeTarget(uid, observedAt, {recorded} = {}) {
      const at = now();
      if (!Number.isSafeInteger(observedAt) || observedAt > at || at-observedAt >= NOTICE_TARGET_LIFETIME) return null;
      return db.runTransaction(async tx => {
        const selected = await selectedNotice(uid,tx);
        if (!selected || observedAt < selected.notice.enabledAt) return null;
        const notice = selected.notice;
        if (recorded !== true) return recentCookDate(notice,observedAt);
        const record = activeMealRecordGrant(notice) ? pruneMealRecords(notice.mealRecords,at) : null;
        const target = record?.targets?.[targetKey(uid,observedAt)];
        if (!target) return null;
        return target.slot ? {date:target.date,slot:target.slot} : {date:target.date};
      });
    },
    async pruneExpiredMealRecords({limit = 20} = {}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new RangeError('Invalid meal cleanup limit.');
      const at = now(), deadline = 'powerNotice.mealRecords.nextPurgeAt';
      const expired = await db.collection('bapmunnaSmartThingsConnections').where(deadline,'>',0).where(deadline,'<=',at)
        .orderBy(deadline).limit(limit).select(deadline).get();
      let trimmed = 0;
      for (const candidate of expired.docs) {
        const changed = await db.runTransaction(async tx => {
          const current = (await tx.get(candidate.ref)).data();
          const record = current?.powerNotice?.mealRecords;
          if (!record || record.nextPurgeAt == null || record.nextPurgeAt > at) return false;
          const clean = pruneMealRecords(record, at);
          tx.update(candidate.ref, {'powerNotice.mealRecords':clean});
          return true;
        });
        if (changed) trimmed++;
      }
      return {scanned:expired.docs.length,trimmed};
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
            (installId && current.installId !== installId) || !Number.isSafeInteger(current.powerChecks.nextAt) ||
            current.powerChecks.nextAt > at) return null;
        if (current.pendingDeviceRecheck || current.stage === 'reconnect_required') {
          // A disconnected older record can still have a deadline in the queue.
          tx.update(target, { powerChecks: suspendedPowerChecks(current.powerChecks) });
          return null;
        }
        if (!hasPowerChecks(current) || current.consentVersion !== CONSENT || !(await eligible(uid, tx))) {
          tx.update(target, {powerChecks: null});
          return null;
        }
        // Reserve before Samsung is called. Tabs, overlapping jobs and retries
        // share one ten-minute limit, including when Samsung returns an error.
        const nextAt = at + POWER_CHECK_MS;
        tx.update(target, {'powerChecks.nextAt': nextAt});
        return {deviceId, installId: current.installId, component: current.powerNotice.component,
          enabledAt: current.powerChecks.enabledAt, nextAt,
          ...(current.powerNotice.resumedAt && {resumedAt:current.powerNotice.resumedAt})};
      });
    },
    async finishPowerCheck(uid, claim, observation, checkedAt) {
      return db.runTransaction(async tx => {
        const target = ref('Connections', uid);
        const current = (await tx.get(target)).data();
        if (!matchesPowerCheck(current, claim) || current.uid !== uid || current.consentVersion !== CONSENT) return false;
        const settings = await eligible(uid, tx);
        if (!settings) return false;
        const fields = {'powerChecks.checkedAt': checkedAt};
        if (observation?.kind === 'power' && observation.component === current.powerNotice.component &&
            Number.isSafeInteger(observation.time) && observation.time >= current.powerChecks.enabledAt && observation.time <= checkedAt) {
          fields['powerChecks.measuredAt'] = Math.max(current.powerChecks.measuredAt ?? 0, observation.time);
          const notice = advancePowerNotice(current, observation, checkedAt, 'poll', settings);
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
    async get(uid) {
      const current = await read('Connections', uid);
      return current?.uid === uid ? current : null;
    },
    async patch(uid, fields, { installId, attemptId, requireConsent = false, recheckedDevice } = {}) {
      return db.runTransaction(async (tx) => {
        const target = ref('Connections', uid);
        const [saved, consent] = await Promise.all([
          tx.get(target),
          requireConsent ? eligible(uid, tx) : null,
        ]);
        const current = saved.data();
        if (!current || current.uid !== uid) throw new ApiError(409, 'reconnect_required');
        if (
          (installId && current.installId !== installId) ||
          (attemptId && current.refreshAttemptId !== attemptId)
        )
          throw new ApiError(409, 'reconnect_required');
        if (requireConsent && (!consent || current.consentVersion !== CONSENT))
          throw new ApiError(403, 'consent_required');
        const next = { ...current, ...fields };
        if (fields.stage === 'reconnect_required' && next.powerChecks)
          next.powerChecks = suspendedPowerChecks(next.powerChecks);
        if (current.pendingDeviceRecheck && fields.stage === 'connected') {
          if (!requireConsent || recheckedDevice?.id !== current.deviceId || current.deviceId !== next.deviceId)
            throw new ApiError(409, 'choose_device');
          if (next.powerNotice) {
            if (next.deviceIsVirtual !== false || next.powerNotice.component !== recheckedDevice.component)
              throw new ApiError(409, 'power_notice_required');
            const resumedAt = now();
            next.powerNotice = {...next.powerNotice, resumedAt};
            if (next.powerChecks)
              next.powerChecks = {enabledAt:next.powerChecks.enabledAt, nextAt:resumedAt + POWER_CHECK_MS};
          }
          delete next.pendingDeviceRecheck;
        }
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
        if (owner.exists && (owner.data().uid !== uid || owner.data().installId !== value.installId))
          throw new ApiError(409, 'installation_in_use');
        const previous = old.data();
        if (old.exists && (previous.uid !== uid || previous.installId !== value.installId))
          throw new ApiError(409, 'disconnect_first');
        if (previous?.deviceId && previous.deviceId !== value.deviceId) throw new ApiError(409, 'choose_device');
        const next = {...value};
        // A new OAuth grant carries credentials, never permissions from a UI
        // snapshot. Read the last saved choices inside the final transaction.
        delete next.powerNotice;
        delete next.powerChecks;
        delete next.pendingDeviceRecheck;
        if (value.stage === 'subscribing') {
          if (!previous?.deviceId || previous.deviceId !== value.deviceId || owner.data()?.uid !== uid)
            throw new ApiError(409, 'choose_device');
          next.pendingDeviceRecheck = true;
          const notice = previous.powerNotice;
          if (previous.consentVersion === CONSENT && previous.deviceIsVirtual === false && value.deviceIsVirtual === false &&
              notice?.version === POWER_NOTICE_CONSENT && Number.isSafeInteger(notice.enabledAt) &&
              typeof notice.component === 'string' && notice.component) {
            next.powerNotice = {...notice};
            if (activeMealRecordGrant(notice)) next.powerNotice.mealRecords = pruneMealRecords(notice.mealRecords,now());
            else delete next.powerNotice.mealRecords;
            if (previous.powerChecks) next.powerChecks = suspendedPowerChecks(previous.powerChecks);
          }
        }
        tx.set(connection, next);
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
          !current || typeof current.uid !== 'string' || !current.uid ||
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
          !current || current.uid !== uid ||
          current.installId !== installId ||
          current.deviceId !== event.deviceId ||
          current.pendingDeviceRecheck || event.time < (current.powerNotice?.resumedAt ?? 0) ||
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
        const notice = advancePowerNotice(current, event, now(), 'webhook', consent);
        if (notice) arrival.powerNotice = notice;
        tx.update(connection, arrival);
        return true;
      });
    },
  };
}
