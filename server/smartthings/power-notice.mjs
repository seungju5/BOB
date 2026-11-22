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

  const previous = notice.lastPowerAt ?? null;
  const lastHigh = notice.lastHighAt ?? null;
  if (!event.high) {
    if (previous !== null && event.time <= previous) return null;
    const gap = previous !== null && event.time - previous > criteria.maxGapMinutes * minute;
    return { ...notice, lastPowerAt: event.time, lastHighAt: gap ? null : lastHigh };
  }
  if (event.time <= Math.max(lastHigh ?? 0, notice.lastObservedAt ?? 0)) return null;
  // A later low sample may have arrived first. A fresh high still counts.
  const priorObservation = previous !== null && previous > event.time ? lastHigh : previous;
  const continued = continuesCookRun(event.time, priorObservation, lastHigh);
  return { ...notice, lastPowerAt: Math.max(previous ?? 0, event.time), lastHighAt: event.time,
    lastObservedAt: continued ? notice.lastObservedAt : event.time };
}
