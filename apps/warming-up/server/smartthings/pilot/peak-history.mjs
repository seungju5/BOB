import criteria from '../power-criteria.json' with {type: 'json'};
import {isCookingPower} from '../cooking-signal.mjs';

const minute = 60_000;
const cadence = criteria.checkIntervalMinutes * minute;
export const dayOf = ms => Math.floor((ms + 9 * 3_600_000) / 86_400_000);
const quantile = (sorted, p) => sorted[Math.floor((sorted.length - 1) * p)];

function background(watts) {
  if (watts.length < 12) return null;
  watts.sort((a, b) => a - b);
  const low = quantile(watts, 0.20);
  const upper = quantile(watts, 0.85);
  const median = quantile(watts, 0.50);
  const deviations = watts.map(w => Math.abs(w - median)).sort((a, b) => a - b);
  // A heating cycle must exceed the outlet's ordinary duty cycle and measurement noise.
  const rise = Math.max(100, upper + Math.max(20, (upper - low) / 2, 6 * quantile(deviations, 0.50)));
  return {
    rise,
    settled: Math.min(upper + 5, low + 0.75 * (rise - low)),
    dominant: Math.max(quantile(watts, 0.97), low + 2 * (rise - low)),
  };
}

/** One owner-authorized, physical outlet. Only timestamps and evidence classifications leave memory. */
export function analyzePowerHistory(rows, now = Date.now()) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 10_000) throw Error('Expected bounded power history');
  const unique = new Map();
  for (const row of rows) {
    if (!row || !Number.isSafeInteger(row.at) || row.at <= 0 || row.at > now ||
        dayOf(row.at) <= dayOf(now) - criteria.mealRecordDays || !Number.isFinite(row.watts) || row.watts < 0) {
      throw Error('Invalid measured time or instantaneous watts');
    }
    if (unique.has(row.at) && unique.get(row.at) !== row.watts) throw Error('Conflicting measurements');
    unique.set(row.at, row.watts);
  }
  const points = [...unique].sort(([a], [b]) => a - b).map(([at, watts]) => ({at, watts}));
  const byDay = new Map();
  for (const point of points) {
    if (isCookingPower(point.watts)) continue;
    const day = dayOf(point.at);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(point.watts);
  }
  const bands = new Map([...byDay].map(([day, values]) => [day, background(values)]));
  const rising = p => isCookingPower(p.watts) || p.watts >= (bands.get(dayOf(p.at))?.rise ?? Infinity);
  const peaks = [];
  for (let i = 0; i < points.length; i++) {
    if (!rising(points[i])) continue;
    const start = i;
    while (i + 1 < points.length && points[i + 1].at - points[i].at <= 1.5 * cadence && rising(points[i + 1])) i++;
    const first = points[start], last = points[i];
    const before = points[start - 1], after = points[i + 1];
    const band = bands.get(dayOf(first.at));
    if (!band || !before || !after || first.at - before.at > 2.5 * cadence || after.at - last.at > 2.5 * cadence ||
        before.watts > band.settled || after.watts > band.settled) continue;
    const run = points.slice(start, i + 1);
    if (run.some(p => isCookingPower(p.watts))) continue;
    if (last.at - first.at < 2 * minute && !run.some(p => p.watts >= band.dominant)) continue;
    peaks.push({start: first.at, end: last.at});
  }
  return {observations: points.map(p => ({measuredAt: p.at, cooking: isCookingPower(p.watts)})), peaks};
}
