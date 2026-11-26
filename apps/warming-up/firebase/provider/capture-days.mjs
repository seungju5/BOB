import {collection, doc, getDocsFromServer, runTransaction} from 'firebase/firestore';
import criteria from '../../server/smartthings/power-criteria.json' with {type:'json'};

const secondsPerDay = 86400;
const seoulOffset = 9 * 3600;
const dayOf = ms => Math.floor((Math.floor(ms / 1000) + seoulOffset) / secondsPerDay);
const daysKept = criteria.mealRecordDays;
const captures = (db, uid) => collection(db, 'bapmunnaAccounts', uid, 'meterCaptures');
const bucket = (db, uid, index) => doc(captures(db, uid), String(index));

export function deleteCaptureBuckets(writer, db, uid) {
  for (let i = 0; i < daysKept; i++) writer.delete(bucket(db, uid, i));
}

// Only derived observations go into these bounded daily buckets. The full
// screenshot, device identifier and meter reading never leave the picker.
export async function saveCapture(db, uid, measuredAt, cooking, expectedWindows, current) {
  const now = Date.now();
  if (!Number.isSafeInteger(measuredAt) || measuredAt <= 0 || measuredAt > now || typeof cooking !== 'boolean')
    throw Error('측정 날짜와 판독 결과를 다시 확인해 주세요.');
  const day = dayOf(measuredAt);
  if (day <= dayOf(now) - daysKept) throw Error('최근 ' + daysKept + '일의 측정만 기록에 담을 수 있어요.');
  const key = String(Math.floor(measuredAt / 1000) + seoulOffset - day * secondsPerDay);
  const ref = bucket(db, uid, day % daysKept);
  const settings = doc(db, 'bapmunnaAccounts', uid, 'preferences', 'settings');
  return runTransaction(db, async tx => {
    current();
    const [prefs, existing] = await Promise.all([tx.get(settings), tx.get(ref)]);
    current();
    if (prefs.data()?.preparationAcknowledged !== true) throw Error('우리 집 정보 이용 동의를 확인해 주세요.');
    const previous = existing.data();
    if (previous && previous.day > day) throw Error('보관 기간이 지난 측정이에요.');
    const sameDay = previous?.day === day;
    const samples = sameDay ? previous.samples : {};
    if (Object.hasOwn(samples, key)) {
      if (samples[key] !== cooking) throw Error('같은 시각에 다른 판독 결과가 있어요. 원본의 전력과 측정 시각을 확인해 주세요.');
      return 'duplicate';
    }
    const windows = sameDay ? previous.windows : prefs.data().windows;
    if (!Array.isArray(expectedWindows) || windows.length !== expectedWindows.length ||
        windows.some((w, i) => ['slot','start','end'].some(field => w[field] !== expectedWindows[i]?.[field])))
      throw Error('끼니 시간대가 바뀌었어요. 화면을 다시 열어 적용할 시간대를 확인해 주세요.');
    tx.set(ref, {day, windows, key, samples:{...samples, [key]:cooking}});
    return 'saved';
  });
}

export async function getCaptureDays(db, uid, current) {
  const found = await getDocsFromServer(captures(db, uid));
  current();
  const earliest = dayOf(Date.now()) - daysKept + 1;
  const days = [];
  const expired = [];
  for (const s of found.docs) {
    const {day, windows, samples} = s.data();
    if (s.metadata.hasPendingWrites) throw Error('서버에서 기록을 다시 확인해 주세요.');
    if (day < earliest) {
      expired.push(s.ref);
    } else {
      days.push({day, windows, samples});
    }
  }
  if (expired.length) await runTransaction(db, async tx => {
    current();
    const latest = await Promise.all(expired.map(ref => tx.get(ref)));
    current();
    // An import on another device may already have reused a bucket.
    for (const entry of latest) if (entry.exists() && entry.get('day') < earliest) tx.delete(entry.ref);
  });
  current();
  return days;
}
