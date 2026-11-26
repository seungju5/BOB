import criteria from '../power-criteria.json' with {type:'json'};
import {ACCOUNT_CONSENT} from '../security.mjs';
import {validMealWindows} from '../../../lib/judge/resolveMealSlots.ts';
import {summarizeCaptureDays} from '../../../lib/smartthings/capture-days.ts';

const dayMs = 86_400_000, seoul = 9 * 3_600_000;
const dayOf = ms => Math.floor((ms + seoul) / dayMs);
const emailKey = email => String(email ?? '').trim().toLowerCase();

export function verifyRecipient(user, grant) {
  if (!user || user.uid !== grant.uid || !user.email || emailKey(user.email) !== emailKey(grant.recipientEmail) ||
      user.disabled || !user.emailVerified || grant.consented !== true || grant.physicalCooker !== true)
    throw Error('A verified account and the household grant for this physical cooker are required');
}

export async function saveHouseholdReading(db, user, grant, reading, now = Date.now()) {
  verifyRecipient(user, grant);
  const time = reading?.measuredAt;
  if (!Number.isSafeInteger(time) || time <= 0 || time > now || typeof reading.cooking !== 'boolean' ||
      dayOf(time) <= dayOf(now) - criteria.mealRecordDays)
    throw Error('Measurement outside the retention period');
  const day = dayOf(time);
  const second = String(Math.floor((time + seoul - day * dayMs) / 1000));
  const owner = db.collection('bapmunnaAccounts').doc(user.uid);
  const refs = [-1,0,1].map(offset => {
    const d = day + offset, id = String(d % criteria.mealRecordDays);
    return {day:d, ledger:owner.collection('meterCaptureEvidence').doc(id), summary:owner.collection('meterCaptures').doc(id)};
  });
  return db.runTransaction(async tx => {
    const [profile, settings, ...docs] = await tx.getAll(owner,owner.collection('preferences').doc('settings'),
      ...refs.flatMap(r => [r.ledger,r.summary]));
    const changed = settings.get('updatedAt');
    const revision = changed && String(changed.seconds)+':'+String(changed.nanoseconds);
    if (!revision || grant.settingsRevision !== revision) throw Error('Household permission or settings changed; reconfirm this import');
    if (profile.get('ownerUid') !== user.uid || emailKey(profile.get('email')) !== emailKey(user.email) ||
        profile.get('consentVersion') !== ACCOUNT_CONSENT || settings.get('ownerUid') !== user.uid ||
        settings.get('preparationAcknowledged') !== true || !validMealWindows(settings.get('windows')))
      throw Error('Account profile and active household consent are required');

    const buckets = refs.map((r,i) => {
      const ledger = docs[i*2].data(), visible = docs[i*2+1].data();
      if (r.day === day && (ledger?.day > day || visible?.day > day)) throw Error('A newer day already occupies this bucket');
      if (visible?.day === r.day && visible.count !== undefined && ledger?.day !== r.day)
        throw Error('A saved day is missing its private evidence');
      const source = ledger?.day === r.day ? ledger : visible?.day === r.day ? visible : null;
      return source ? {day:r.day,windows:source.windows,samples:source.samples} : null;
    });
    const current = buckets[1] ?? {day,windows:settings.get('windows'),samples:{}};
    const seen = Object.hasOwn(current.samples,second);
    if (seen && current.samples[second] !== reading.cooking) throw Error('Conflicting evidence for the same measurement');
    if (seen && docs[3].get('count') !== undefined) return {status:'duplicate',day, cook:docs[3].get('cook'),confirmed:docs[3].get('confirmed')};
    buckets[1] = {...current,samples:{...current.samples,[second]:reading.cooking}};
    const days = summarizeCaptureDays(buckets.filter(Boolean),now);
    // A delayed reading before midnight can move the first cooking event on the next day.
    for (const i of [1,2]) {
      const bucket = buckets[i];
      if (!bucket) continue;
      const date = new Date(bucket.day*dayMs).toISOString().slice(0,10);
      const summary = days.find(d => d.date === date);
      if (!summary) continue;
      tx.set(refs[i].ledger,bucket);
      tx.set(refs[i].summary,{day:bucket.day,windows:bucket.windows,cook:summary.cook,confirmed:summary.confirmed,count:summary.samples});
    }
    const result = days.find(d => d.date === new Date(day*dayMs).toISOString().slice(0,10));
    return {status:seen?'duplicate':'saved',day,cook:result.cook,confirmed:result.confirmed};
  });
}
