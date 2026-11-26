import {isDeepStrictEqual} from 'node:util';
import criteria from '../power-criteria.json' with {type: 'json'};
import {ACCOUNT_CONSENT} from '../security.mjs';
import {validMealWindows} from '../../../lib/judge/resolveMealSlots.ts';
import {summarizeCaptureDays} from '../../../lib/smartthings/capture-days.ts';
import {dayOf} from './peak-history.mjs';
import {expiredHouseholdBuckets} from './retention.mjs';

const dayMs = 86_400_000;
const offset = 9 * 3_600_000;
const dayStart = day => day * dayMs - offset;
const epochSecond = ms => Math.floor(ms / 1000);
const secondOf = ms => epochSecond(ms - dayStart(dayOf(ms)));
const dateOf = day => new Date(day * dayMs).toISOString().slice(0, 10);
const emailKey = email => String(email ?? '').trim().toLowerCase();

export function verifyRecipient(user, grant) {
  if (!user || user.uid !== grant.uid || !user.email || emailKey(user.email) !== emailKey(grant.recipientEmail) ||
      user.disabled || !user.emailVerified || grant.consented !== true || grant.physicalCooker !== true) {
    throw Error('A verified account and the household grant for this physical cooker are required');
  }
}

function checkedPoints(observations, now) {
  if (!Array.isArray(observations) || !observations.length || observations.length > 10_000) throw Error('Expected bounded observations');
  const points = new Map();
  for (const {measuredAt, cooking} of observations) {
    if (!Number.isSafeInteger(measuredAt) || measuredAt <= 0 || measuredAt > now ||
        dayOf(measuredAt) <= dayOf(now) - criteria.mealRecordDays || typeof cooking !== 'boolean') throw Error('Measurement outside the retention period');
    if (points.has(measuredAt) && points.get(measuredAt) !== cooking) throw Error('Conflicting evidence');
    points.set(measuredAt, cooking);
  }
  return points;
}

function neighborDays(days, today) {
  return new Set([...days].flatMap(day => [day - 1, day, day + 1]).filter(day => day <= today && day > today - criteria.mealRecordDays));
}

function inferByDay(buckets) {
  const highs = [], intervals = [];
  for (const {day, samples, peaks} of buckets.values()) {
    const epoch = epochSecond(dayStart(day));
    for (const [sec, above] of Object.entries(samples)) if (above) highs.push(epoch + Number(sec));
    for (const [sec, end] of Object.entries(peaks)) intervals.push({start: epoch + Number(sec), end});
  }
  const join = criteria.mergeGapMinutes * 60, groups = [];
  for (const p of intervals.sort((a, b) => a.start - b.start)) {
    const last = groups.at(-1);
    if (last && p.start <= last.end + join) last.end = Math.max(last.end, p.end);
    else groups.push({...p});
  }
  const estimates = new Map();
  for (const {start, end} of groups) {
    if (highs.some(t => t >= start - join && t <= end + join)) continue;
    const day = dayOf(start * 1000);
    const clock = new Date(start * 1000 + offset).toISOString().slice(11, 16);
    const slot = buckets.get(day).windows.find(w => w.start <= clock && clock < w.end)?.slot;
    const summary = estimates.get(day) ?? {estimated: 0, estimatedSlots: [], estimatedBySlot: {}};
    summary.estimated++;
    if (slot) {
      if (!summary.estimatedSlots.includes(slot)) summary.estimatedSlots.push(slot);
      summary.estimatedBySlot[slot] = (summary.estimatedBySlot[slot] ?? 0) + 1;
    }
    estimates.set(day, summary);
  }
  return estimates;
}

// Wider histories can resolve or retract earlier estimates. A narrow or older replay cannot
// overwrite an estimate based on a more complete day. A single screenshot never recalibrates a day.
function updateEstimates(bucket, observedSeconds, intervals, first, last) {
  const center = epochSecond(dayStart(bucket.day));
  const margin = 2.5 * criteria.checkIntervalMinutes * 60;
  const from = Math.max(first, center - margin), to = Math.min(last, center + 86400 + margin);
  const old = bucket.coverage;
  const previousSeconds = old?.seconds ?? [];
  const complete = previousSeconds.every(sec => observedSeconds.has(sec));
  const replaces = !old || (complete && from <= old.from && to >= old.to);
  if (replaces) {
    bucket.peaks = {};
  }
  for (const p of intervals) {
    const start = epochSecond(p.start);
    if (replaces || start < old.from || start > old.to) bucket.peaks[secondOf(p.start)] = epochSecond(p.end);
  }
  // Single-image measurements may use a slightly different meter timestamp. Only compare history with history.
  const seconds = new Set([...previousSeconds, ...observedSeconds]);
  bucket.coverage = {from:Math.min(old?.from ?? from, from), to:Math.max(old?.to ?? to, to), seconds:[...seconds].sort((a,b) => a-b)};
}

export async function saveHouseholdObservations(db, user, grant, observations, peaks = null, now = Date.now()) {
  verifyRecipient(user, grant);
  const points = checkedPoints(observations, now);
  const measured = new Map();
  for (const time of points.keys()) {
    const day = dayOf(time);
    if (!measured.has(day)) measured.set(day, new Set());
    measured.get(day).add(secondOf(time));
  }
  for (const p of peaks ?? []) {
    if (!p || !points.has(p.start) || !points.has(p.end) || p.start > p.end || points.get(p.start) || points.get(p.end)) {
      throw Error('Peak not bound to measured history');
    }
  }
  const today = dayOf(now);
  const publishDays = neighborDays(measured.keys(), today);
  const context = neighborDays(publishDays, today);
  const owner = db.collection('bapmunnaAccounts').doc(user.uid);
  const refs = [...context].sort((a, b) => a - b).map(day => {
    const id = String(day % criteria.mealRecordDays);
    return {day, ledger: owner.collection('meterCaptureEvidence').doc(id), summary: owner.collection('meterCaptures').doc(id)};
  });
  return db.runTransaction(async tx => {
    const [profile, settings, ...snaps] = await tx.getAll(owner, owner.collection('preferences').doc('settings'), ...refs.flatMap(r => [r.ledger, r.summary]));
    const stamp = settings.get('updatedAt');
    if (!stamp || grant.settingsRevision !== stamp.seconds + ':' + stamp.nanoseconds) throw Error('Household permission or settings changed; reconfirm this import');
    if (profile.get('ownerUid') !== user.uid || emailKey(profile.get('email')) !== emailKey(user.email) || profile.get('consentVersion') !== ACCOUNT_CONSENT ||
        settings.get('ownerUid') !== user.uid || settings.get('preparationAcknowledged') !== true || !validMealWindows(settings.get('windows'))) {
      throw Error('Account profile and active household consent are required');
    }
    const expired = new Map((await expiredHouseholdBuckets(tx, owner, now)).map(ref => [ref.path, ref]));
    const buckets = new Map(), oldSummaries = new Map(), oldEvidence = new Map();
    refs.forEach(({day}, i) => {
      const raw = snaps[2 * i].data(), published = snaps[2 * i + 1].data();
      if (measured.has(day) && (raw?.day > day || published?.day > day)) throw Error('A newer day already occupies this bucket');
      const current = published?.day === day ? published : null;
      const ledger = raw?.day === day ? raw : null;
      if (current && Object.hasOwn(current, 'count') && !ledger) throw Error('A saved day is missing its private evidence');
      if (current) oldSummaries.set(day, current);
      if (ledger) oldEvidence.set(day, ledger);
      const source = ledger ?? current;
      if (source || measured.has(day)) buckets.set(day, {day, windows: source?.windows ?? settings.get('windows'),
        samples: {...source?.samples}, peaks: {...source?.peaks}, ...(ledger?.coverage && {coverage: ledger.coverage})});
    });
    for (const [time, cooking] of points) {
      const samples = buckets.get(dayOf(time)).samples, sec = secondOf(time);
      if (Object.hasOwn(samples, sec) && samples[sec] !== cooking) throw Error('Conflicting evidence for the same measurement');
      samples[sec] = cooking;
    }
    if (peaks !== null) {
      const first = epochSecond(Math.min(...points.keys())), last = epochSecond(Math.max(...points.keys()));
      for (const [day, seconds] of measured) updateEstimates(buckets.get(day), seconds, peaks.filter(p => dayOf(p.start) === day), first, last);
    }
    const visible = new Map(summarizeCaptureDays([...buckets.values()], now).map(d => [d.date, d]));
    const estimates = inferByDay(buckets);
    const days = [];
    let changed = false;
    for (const r of refs) {
      if (!publishDays.has(r.day) || !visible.has(dateOf(r.day))) continue;
      const bucket = buckets.get(r.day), summary = visible.get(dateOf(r.day));
      // Report the meter's last minute, not the time of an operator import or retry.
      const lastMeasuredMinute = Object.keys(bucket.samples).reduce((last, sec) => Math.max(last, Math.floor(Number(sec) / 60)), -1);
      const data = {day: r.day, windows: summary.windows, cook: summary.cook, confirmed: summary.confirmed, count: summary.samples, lastMeasuredMinute, ...estimates.get(r.day)};
      if (!isDeepStrictEqual(oldEvidence.get(r.day), bucket)) { tx.set(r.ledger, bucket); expired.delete(r.ledger.path); changed = true; }
      if (!isDeepStrictEqual(oldSummaries.get(r.day), data)) { tx.set(r.summary, data); expired.delete(r.summary.path); changed = true; }
      if (measured.has(r.day)) days.push(data);
    }
    for (const ref of expired.values()) tx.delete(ref);
    return {status: changed ? 'saved' : 'duplicate', days};
  });
}

export async function saveHouseholdReading(db, user, grant, reading, now = Date.now()) {
  const {status, days: [day]} = await saveHouseholdObservations(db, user, grant, [reading], null, now);
  return {status, day: day.day, cook: day.cook, confirmed: day.confirmed};
}
