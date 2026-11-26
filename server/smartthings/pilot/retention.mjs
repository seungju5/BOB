import criteria from '../power-criteria.json' with {type:'json'};
import {dayOf} from './peak-history.mjs';

const collections = ['meterCaptures', 'meterCaptureEvidence'];
const daysKept = criteria.mealRecordDays;

function expiredQuery(collection, cutoff) {
  return collection.where('day', '>=', 0).where('day', '<=', cutoff).orderBy('day').select('day');
}

function isPilotBucket(snapshot, collection, cutoff) {
  const [root, uid, kind, id, ...rest] = snapshot.ref.path.split('/');
  const day = snapshot.get('day');
  return root === 'bapmunnaAccounts' && !!uid && kind === collection && rest.length === 0
    && Number.isSafeInteger(day) && day >= 0 && day <= cutoff && id === String(day % daysKept);
}

/** Part of the same transaction as the consent check and new daily summaries. */
export async function expiredHouseholdBuckets(tx, owner, now) {
  const cutoff = dayOf(now) - daysKept;
  const groups = await Promise.all(collections.map(kind =>
    tx.get(expiredQuery(owner.collection(kind), cutoff).limit(daysKept))));
  return groups.flatMap((group, i) => group.docs.filter(doc => isPilotBucket(doc, collections[i], cutoff)).map(doc => doc.ref));
}

/** The private maintenance job can also reach households that have stopped importing or opening the app. */
export async function sweepPilotBuckets(db, {apply = false, now = Date.now(), limit = 250} = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw Error('Invalid pilot cleanup budget');
  const cutoff = dayOf(now) - daysKept;
  const result = {expired:0, deleted:0, changed:0, skipped:0, more:false};
  for (const kind of collections) {
    const group = await expiredQuery(db.collectionGroup(kind), cutoff).limit(limit + 1).get();
    if (group.size > limit) result.more = true;
    for (const doc of group.docs.slice(0, limit)) {
      if (!isPilotBucket(doc, kind, cutoff)) { result.skipped++; continue; }
      result.expired++;
      if (!apply) continue;
      try {
        // An import may have reused this slot for a newer day since the query.
        await doc.ref.delete({lastUpdateTime:doc.updateTime});
        result.deleted++;
      } catch (error) {
        if (error.code !== 9 && error.code !== 5) throw error;
        result.changed++;
      }
    }
  }
  return result;
}
