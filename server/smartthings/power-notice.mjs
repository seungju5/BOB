import criteria from './power-criteria.json' with { type: 'json' };
import { continuesCookRun } from './cooking-signal.mjs';

const minute = 60000;
export const POWER_NOTICE_CONSENT = criteria.noticeConsentVersion;

// Only a signed observation on the opted-in cooker plug may update this
// account's notice. Keep measurement times, never power values or meal claims.
export function advancePowerNotice(current, event, receivedAt) {
  const notice = current.powerNotice;
  if (!notice || notice.version !== POWER_NOTICE_CONSENT || current.deviceIsVirtual !== false ||
      event.kind !== 'power' || typeof event.high !== 'boolean' || event.component !== notice.component ||
      !Number.isSafeInteger(event.time) || event.time < notice.enabledAt || event.time > receivedAt ||
      receivedAt - event.time > criteria.maxGapMinutes * minute) return null;

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
      predecessor = first != null && time - lastHigh <= (criteria.mergeGapMinutes + criteria.maxGapMinutes) * minute
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
  if (predecessor && receivedAt - next.lastObservedAt <= criteria.maxGapMinutes * minute)
    next.previousRun = predecessor;
  if (next.lastPowerAt === notice.lastPowerAt && next.lastHighAt === notice.lastHighAt &&
    next.lastObservedAt === first && next.previousRun === previousRun) return null;
  return next;
}
