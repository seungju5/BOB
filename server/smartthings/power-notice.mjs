import criteria from './power-criteria.json' with { type: 'json' };

const minute = 60000;
export const POWER_NOTICE_CONSENT = 'cooker-power-notice-v1';
export const highReading = watts => watts >= criteria.highWatts;

// State-change events report individual observations, not complete interval
// means. This notice describes repeated high readings only. Never promote it
// to a meal, an identified cooker mode or a family/health alert.
export function advancePowerNotice(current, event, receivedAt) {
  const notice = current.powerNotice;
  if (!notice || notice.version !== POWER_NOTICE_CONSENT || current.deviceIsVirtual === true ||
      event.kind !== 'power' || typeof event.high !== 'boolean' || event.component !== notice.component ||
      !Number.isSafeInteger(event.time) || event.time < notice.enabledAt || event.time > receivedAt ||
      receivedAt - event.time > criteria.maxGapMinutes * minute) return null;

  if (event.time <= (notice.lastPowerAt ?? 0)) {
    // An out-of-order low reading inside an as-yet-unconfirmed run breaks it.
    if (!event.high && notice.highSince != null && event.time >= notice.highSince && !notice.reported)
      return { ...notice, highSince: null, reported: false };
    return null;
  }
  const continued = event.high && notice.highSince != null &&
    event.time - notice.lastPowerAt <= criteria.maxGapMinutes * minute;
  const highSince = event.high ? (continued ? notice.highSince : event.time) : null;
  const reported = continued && notice.reported === true;
  const reached = highSince !== null && !reported && event.time - highSince >= criteria.spanMinutes * minute;
  return { ...notice, lastPowerAt: event.time, highSince, reported: reported || reached,
    lastObservedAt: reached ? event.time : notice.lastObservedAt ?? null };
}
