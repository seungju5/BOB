import { DEMO_PROFILE } from './prism.mjs';
export const ORIGIN = Date.parse('2026-11-17T00:00:00+09:00');
export const at = minute => new Date(ORIGIN + minute * 60000).toISOString();
export function makeBins(minutes, fn, startMinute = 0) {
  return Array.from({ length: minutes }, (_, i) => {
    const power = fn(i);
    return { deviceKey: DEMO_PROFILE.deviceKey, start: at(startMinute + i), end: at(startMinute + i + 1),
      meanW: power, maxW: power, unit: 'W', complete: true };
  });
}
export const observationAt = asOf => ({ mode: 'verified_interval_mean', filtered: false,
  deviceAssignmentVerified: true, health: 'online', healthAt: asOf });
export function demoInput(bins, options = {}) {
  const asOf = options.asOf ?? bins.at(-1)?.end ?? at(60);
  return { bins, asOf, profile: DEMO_PROFILE, observation: observationAt(asOf), ...options };
}
export function syntheticDay() {
  // Entirely invented demonstration, not digitized from the user's figures.
  const bins = makeBins(240, i => i < 45 ? 2 : i < 75 ? 1050 : i < 170 ?
    ((i - 75) % 8 === 0 ? 80 : 2) : 2);
  return bins.filter((_, i) => i < 118 || i >= 130);
}
