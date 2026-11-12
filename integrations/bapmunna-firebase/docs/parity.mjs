// Adapter for synthetic, in-memory workshop data. Never sends records to either DB.
import { resolveMealSlots, inAbsence } from './shared/lib/judge/resolveMealSlots.mjs';
import { evaluateAlerts, countMissedMeals } from './shared/lib/judge/evaluateAlerts.mjs';
import { kstDate, kstDateTime } from './shared/lib/judge/time.mjs';
import { DEFAULT_WINDOWS, patternReport } from './shared/lib/data/view.mjs';
import { ALERT_DEFAULTS } from './shared/config/detection.mjs';

export const SIM_EPOCH = Date.parse('2026-10-07T00:00:00+09:00');
export const simulationDate = minute => new Date(SIM_EPOCH + minute * 60000);
export const simulationDay = day => kstDate(simulationDate(day * 1440));
export function canonicalDefaults() {
  const minutes = value => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };
  return { windows: DEFAULT_WINDOWS.map(w => ({ id: w.slot, start: minutes(w.start), end: minutes(w.end) })),
    missed: ALERT_DEFAULTS.MISSED_MEALS_THRESHOLD, fasting: ALERT_DEFAULTS.FASTING_HOURS, emergency: ALERT_DEFAULTS.EMERGENCY_HOURS };
}
const clockText = minute => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
export function canonicalAbsences(state) {
  return state.away ? [{ startDate: simulationDay(Math.floor(state.away.start / 1440)), endDate: simulationDay(Math.floor((state.away.end - 1) / 1440)) }] : [];
}
export const canonicalAway = state => inAbsence(kstDate(simulationDate(state.now)), canonicalAbsences(state));
export function canonicalEatOutMeal(state) {
  return resolveMealSlots({ date: simulationDay(Math.floor(state.now / 1440)),
    windows: state.config.windows.filter(w => state.profile.meals.includes(w.id)).map(w => ({ slot: w.id, start: clockText(w.start), end: clockText(w.end) })),
    events: [], eatOutChecks: [simulationDate(state.now)], absences: [], now: simulationDate(state.now)
  }).find(slot => slot.status === 'eat_out')?.slot;
}
export function canonicalSlots(state, day) {
  const date = simulationDay(day), events = [], eatOutChecks = [];
  const windows = state.config.windows.filter(w => state.profile.meals.includes(w.id));
  for (const w of windows) {
    const r = state.records[`${day}:${w.id}`];
    const at = kstDateTime(date, clockText(w.start));
    // Only summarized synthetic slot evidence is reconstructed; no real telemetry.
    if (r?.sensor || (r?.manual && !r?.eatOut)) events.push({ type: 'cook', startedAt: at, endedAt: at });
    if (r?.manual && r.eatOut) eatOutChecks.push(at);
  }
  return resolveMealSlots({ date, windows: windows.map(w => ({ slot: w.id, start: clockText(w.start), end: clockText(w.end) })), events,
    eatOutChecks, absences: canonicalAbsences(state), now: simulationDate(state.now) }).map(slot => {
      const record = state.records[`${day}:${slot.slot}`];
      if (record?.exempt && ['pending', 'unconfirmed'].includes(slot.status)) return { ...slot, status: 'away', source: 'absence' };
      return slot;
    });
}
export function canonicalHistory(state) {
  const out = [], today = Math.floor(state.now / 1440);
  if (!state.consent) return out;
  for (let day = today - 35; day <= today; day++) {
    for (const slot of canonicalSlots(state, day)) {
      const w = state.config.windows.find(w => w.id === slot.slot);
      if (day * 1440 + w.start >= state.sharedFrom || state.records[`${day}:${slot.slot}`]?.manual || state.records[`${day}:${slot.slot}`]?.sensor) out.push(slot);
    }
  }
  return out;
}
export const canonicalStreak = state => countMissedMeals(canonicalHistory(state));
export function canonicalAlertResult(state) {
  return evaluateAlerts({ now: simulationDate(state.now), slots: canonicalHistory(state),
    lastActivityAt: state.lastActivityAt == null ? null : simulationDate(state.lastActivityAt),
    settings: { missedMealsThreshold: state.rules.consecutiveMissed, fastingHours: state.rules.inactiveHours, emergencyHours: state.rules.followupHours },
    absences: canonicalAbsences(state), lastReadingAt: state.online ? simulationDate(state.now) : (state.lastReadingAt == null ? null : simulationDate(state.lastReadingAt)),
    offlineMsSinceLastActivity: (state.offlineMinutes || 0) * 60000, openAlerts: [] });
}
export function canonicalPattern(state) {
  const report = patternReport({ slots: canonicalHistory(state), mealProfile: { windows: DEFAULT_WINDOWS }, absences: canonicalAbsences(state) }, simulationDate(state.now));
  return { ready: report.recent.rate !== null && report.before.rate !== null, recent: report.recent, previous: report.before,
    before: Math.round((report.before.rate || 0) * 100), after: Math.round((report.recent.rate || 0) * 100),
    delta: Math.round(((report.recent.rate || 0) - (report.before.rate || 0)) * 100), days: new Set(canonicalHistory(state).filter(s => s.date < simulationDay(Math.floor(state.now / 1440))).map(s => s.date)).size };
}
