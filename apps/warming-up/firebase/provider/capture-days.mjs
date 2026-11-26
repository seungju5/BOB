import {collection, doc, getDocsFromServer, runTransaction} from 'firebase/firestore';
import criteria from '../../server/smartthings/power-criteria.json' with {type:'json'};

const secondsPerDay = 86400;
const seoulOffset = 9 * 3600;
const dayOf = ms => Math.floor((Math.floor(ms / 1000) + seoulOffset) / secondsPerDay);
const daysKept = criteria.mealRecordDays;
const captures = (db, uid) => collection(db, 'bapmunnaAccounts', uid, 'meterCaptures');
const bucket = (db, uid, index) => doc(captures(db, uid), String(index));

const evidence = (db, uid, id) => doc(db, 'bapmunnaAccounts', uid, 'meterCaptureEvidence', id);
export function deleteCaptureBuckets(writer, db, uid) {
  for (let i = 0; i < daysKept; i++) {
    writer.delete(bucket(db, uid, i));
    writer.delete(evidence(db, uid, String(i)));
  }
}

export async function getCaptureDays(db, uid, current) {
  const found = await getDocsFromServer(captures(db, uid));
  current();
  const earliest = dayOf(Date.now()) - daysKept + 1;
  const days = [];
  const expired = [];
  for (const s of found.docs) {
    const data = s.data();
    const {day, windows} = data;
    if (s.metadata.hasPendingWrites) throw Error('서버에서 기록을 다시 확인해 주세요.');
    if (day < earliest) {
      expired.push(s.ref);
    } else {
      days.push(Object.hasOwn(data, "count")
        ? {day, windows, count:data.count, cook:data.cook, confirmed:data.confirmed}
        : {day, windows, samples:data.samples});
    }
  }
  if (expired.length) await runTransaction(db, async tx => {
    current();
    const latest = await Promise.all(expired.map(ref => tx.get(ref)));
    current();
    // An import on another device may already have reused a bucket.
    for (const entry of latest) if (entry.exists() && entry.get('day') < earliest) {
      tx.delete(entry.ref);
      tx.delete(evidence(db, uid, entry.ref.id));
    }
  });
  current();
  return days;
}
