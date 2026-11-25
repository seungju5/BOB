import criteria from './power-criteria.json' with { type: 'json' };
import { continuesCookRun } from './cooking-signal.mjs';
import { recordCookRuns } from './meal-records.mjs';
export { publicMealRecords } from './meal-records.mjs';

const minute = 60000;
export const POWER_NOTICE_CONSENT = criteria.noticeConsentVersion;
export const MEAL_RECORD_CONSENT = criteria.mealRecordConsentVersion;
export const POWER_CHECK_MINUTES = criteria.checkIntervalMinutes;
export const POWER_CHECK_MS = POWER_CHECK_MINUTES * minute;

export function hasPowerChecks(current) {
  return current?.stage === 'connected' && !current.pendingDeviceRecheck && current.deviceIsVirtual === false &&
    current.powerNotice?.version === POWER_NOTICE_CONSENT &&
    Number.isSafeInteger(current.powerChecks?.enabledAt) && Number.isSafeInteger(current.powerChecks.nextAt);
}

export function matchesPowerCheck(current, claim) {
  return claim != null && hasPowerChecks(current) && current.installId === claim.installId && current.deviceId === claim.deviceId &&
    current.powerNotice.component === claim.component && current.powerChecks.enabledAt === claim.enabledAt &&
    current.powerChecks.nextAt === claim.nextAt && current.powerNotice.resumedAt === claim.resumedAt;
}

// Both sources use the original Samsung timestamp. A snapshot has a wider
// freshness window because Samsung may have measured between scheduled reads.
export function advancePowerNotice(current, event, receivedAt, source = 'webhook', settings = null) {
  const notice = current.powerNotice;
  const scheduled = source === 'poll';
  if (scheduled && (!hasPowerChecks(current) || event.time < current.powerChecks.enabledAt)) return null;
  const maxDelay = scheduled ? POWER_CHECK_MINUTES : criteria.maxGapMinutes;
  const reorderWindow = hasPowerChecks(current) ? Math.max(POWER_CHECK_MINUTES, criteria.maxGapMinutes) : criteria.maxGapMinutes;
  if (!notice || notice.version !== POWER_NOTICE_CONSENT || current.pendingDeviceRecheck || current.deviceIsVirtual !== false ||
      event.kind !== 'power' || typeof event.high !== 'boolean' || event.component !== notice.component ||
      !Number.isSafeInteger(event.time) || event.time < Math.max(notice.enabledAt, notice.resumedAt ?? 0) || event.time > receivedAt ||
      receivedAt - event.time > maxDelay * minute) return null;

  const { previousRun, ...next } = notice;
  const first = notice.lastObservedAt;
  // Older records could clear lastHighAt after a low reading. The saved start
  // is still a genuine observation and may be used as the last known high.
  const lastHigh = notice.lastHighAt ?? first;
  const time = event.time;
  next.lastPowerAt = Math.max(notice.lastPowerAt ?? 0, time);
  let predecessor = previousRun;
  if (event.high) {
    if (first == null || time > lastHigh && !continuesCookRun(time, lastHigh)) {
      // A fresh out-of-order high can bridge this boundary. Retain just the
      // previous bounds while such an observation can still arrive.
      predecessor = first != null && time - lastHigh <= (criteria.mergeGapMinutes + reorderWindow) * minute
        ? { first, last: lastHigh } : null;
      next.lastObservedAt = time;
      next.lastHighAt = time;
    } else if (time > lastHigh) {
      next.lastHighAt = time;
    } else if (time < first && continuesCookRun(first, time)) {
      if (predecessor && continuesCookRun(time, predecessor.last)) {
        next.lastObservedAt = predecessor.first;
        predecessor = null;
      } else {
        next.lastObservedAt = time;
      }
    }
  }
  if (predecessor && receivedAt - next.lastObservedAt <= reorderWindow * minute)
    next.previousRun = predecessor;
  if (next.lastPowerAt === notice.lastPowerAt && next.lastHighAt === notice.lastHighAt &&
    next.lastObservedAt === first && next.previousRun === previousRun) return null;
  return recordCookRuns(current, next, settings, receivedAt);
}
