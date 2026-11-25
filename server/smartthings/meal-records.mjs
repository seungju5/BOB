import criteria from './power-criteria.json' with { type: 'json' };

const DAY = 86_400_000;
const SEOUL = 9 * 3_600_000;
const slots = new Set(['breakfast','lunch','dinner','fourth','fifth']);
const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const local = at => new Date(at + SEOUL).toISOString();
const dateOf = at => local(at).slice(0,10);
export const activeMealRecordGrant = notice => notice?.mealRecords?.version === criteria.mealRecordConsentVersion &&
  Number.isSafeInteger(notice.mealRecords.enabledAt) && notice.mealRecords.enabledAt > 0;

function slotAt(windows, at) {
  const hm = local(at).slice(11,16);
  return windows.find(w => w.start <= hm && hm < w.end)?.slot;
}

// A late measurement may predate the currently stored settings. Keep the real
// daily count but leave the meal unassigned until the date has a known schedule.
function settingsWindows(settings, at) {
  const stamp = settings?.updatedAt;
  const updated = stamp instanceof Date ? stamp.getTime() : stamp?.toMillis?.();
  if (!Number.isFinite(updated) || updated > at || !Array.isArray(settings.windows) ||
      settings.windows.length < 1 || settings.windows.length > slots.size) return [];
  const ids = new Set();
  let end = '';
  for (const w of settings.windows) {
    if (!w || !slots.has(w.slot) || ids.has(w.slot) || !clock.test(w.start) || !clock.test(w.end) ||
        w.start >= w.end || w.start < end) return [];
    ids.add(w.slot);
    end = w.end;
  }
  return settings.windows.map(({slot,start,end}) => ({slot,start,end}));
}

function nextPurge(days, targets = {}) {
  const first = Object.keys(days).sort()[0];
  const deadlines = Object.values(targets).map(t => t.until);
  if (first) deadlines.push(Date.parse(first + 'T00:00:00+09:00') + criteria.mealRecordDays * DAY);
  return deadlines.length ? Math.min(...deadlines) : null;
}

export const NOTICE_TARGET_LIFETIME = DAY;

// Keep date/slot routes only for notifications that are actually being sent.
// No event timestamps are stored in this map. The deadline is rounded down to
// the minute. Several devices receiving the same cooking start share one key.
export function rememberMealTarget(record, key, observedAt, at) {
  const ready = pruneMealRecords(record, at);
  if (!ready.active || !ready.days[ready.active.date]?.cook || ready.targets?.[key]) return ready;
  const until = Math.floor((observedAt + NOTICE_TARGET_LIFETIME) / 60000) * 60000;
  if (until <= at) return ready;
  const targets = {...ready.targets, [key]:{...ready.active, until}};
  return {...ready, targets, activeRefs:[...(ready.activeRefs ?? []),key], nextPurgeAt:nextPurge(ready.days,targets)};
}

export function recentCookDate(notice, observedAt) {
  const runs = [
    { first:notice?.lastObservedAt, last:notice?.lastHighAt ?? notice?.lastObservedAt },
    notice?.previousRun,
  ];
  const witnessed = runs.find(run => Number.isSafeInteger(run?.first) && Number.isSafeInteger(run?.last) &&
    run.first <= observedAt && observedAt <= run.last);
  return witnessed ? { date:dateOf(witnessed.first) } : null;
}

export function pruneMealRecords(records, at) {
  if (records.nextPurgeAt == null || records.nextPurgeAt > at) return records;
  const earliest = dateOf(at - (criteria.mealRecordDays - 1) * DAY);
  const days = Object.fromEntries(Object.entries(records.days).filter(([date]) => date >= earliest));
  const targets = Object.fromEntries(Object.entries(records.targets ?? {}).filter(([,t]) => t.until > at && days[t.date]));
  const keepKeys = keys => (keys ?? []).filter(key => Object.hasOwn(targets,key));
  return { ...records, days, targets, activeRefs:keepKeys(records.activeRefs), priorRefs:keepKeys(records.priorRefs),
    nextPurgeAt: nextPurge(days,targets),
    active: records.active && days[records.active.date] ? records.active : null,
    prior: records.prior && days[records.prior.date] ? records.prior : null };
}

// Only the latest two mergeable cooking groups need reversible bookkeeping.
// The rest consists of daily counts and slot totals, without raw watts or times.
export function recordCookRuns(current, next, settings, at) {
  const before = current.powerNotice;
  if (current.stage !== 'connected' || !activeMealRecordGrant(before)) return next;
  const record = pruneMealRecords(before.mealRecords, at);
  const oldStart = before.lastObservedAt, start = next.lastObservedAt;
  const oldPrevious = before.previousRun?.first, previous = next.previousRun?.first;
  if (start === oldStart && previous === oldPrevious) return { ...next, mealRecords: record };
  const days = { ...record.days };
  const targets = {...record.targets};
  let active = record.active ?? null;
  let prior = record.prior ?? null;
  let activeRefs = record.activeRefs ?? [];
  let priorRefs = record.priorRefs ?? [];
  function remove(target) {
    const day = target && days[target.date];
    if (!day) return;
    if (day.cook === 1) { delete days[target.date]; return; }
    const counts = { ...day.counts };
    if (target.slot && counts[target.slot] === 1) delete counts[target.slot];
    else if (target.slot && counts[target.slot] > 1) counts[target.slot]--;
    days[target.date] = { ...day, cook: day.cook - 1, counts };
  }
  function add(time) {
    if (!Number.isSafeInteger(time) || time < record.enabledAt) return null;
    const date = dateOf(time);
    const day = days[date];
    // A day's historical order stays the same after later household edits.
    const windows = day?.windows.length ? day.windows : settingsWindows(settings, time);
    const slot = slotAt(windows, time);
    const counts = { ...day?.counts };
    if (slot) counts[slot] = (counts[slot] ?? 0) + 1;
    days[date] = {windows,counts,cook:(day?.cook ?? 0) + 1};
    return slot ? {date,slot} : {date};
  }
  if (start !== oldStart) {
    if (oldStart == null || start > oldStart) {
      prior = previous === oldStart ? active : null;
      priorRefs = prior ? activeRefs : [];
      active = add(start);
      activeRefs = [];
    } else {
      // Keep the original window when replacing the only count in a date.
      const snapshot = active && days[active.date]?.windows;
      const previousTarget = active;
      remove(active);
      if (start === oldPrevious) {
        active = prior;
        prior = null;
        activeRefs = [...priorRefs,...activeRefs];
        priorRefs = [];
      }
      else {
        const date = dateOf(start);
        if (previousTarget?.date === date && snapshot?.length && !days[date] && start >= record.enabledAt)
          days[date] = { windows:snapshot, counts:{}, cook:0 };
        active = add(start);
      }
      // A delivered notification can now belong to yesterday or a different
      // slot. Correct its private route without sending the device a new alert.
      for (const key of activeRefs) {
        if (active && targets[key]) targets[key] = {...active,until:targets[key].until};
        else delete targets[key];
      }
      if (!active) activeRefs = [];
    }
  }
  if (previous == null) { prior = null; priorRefs = []; }
  return { ...next, mealRecords: { ...record, days, active, prior, targets, activeRefs, priorRefs, nextPurgeAt: nextPurge(days,targets) } };
}

export function publicMealRecords(current, at = Date.now()) {
  const notice = current?.powerNotice;
  if (current?.stage !== 'connected' || current.deviceIsVirtual !== false ||
      notice?.version !== criteria.noticeConsentVersion || !activeMealRecordGrant(notice)) return null;
  const record = pruneMealRecords(notice.mealRecords, at);
  const days = Object.keys(record.days).sort().map(date => {
    const day = record.days[date];
    return {date, windows:day.windows, confirmed:day.windows.filter(w => day.counts[w.slot] > 0).map(w => w.slot), cook:day.cook};
  });
  return {days};
}
