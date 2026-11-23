/**
 * Bapmunna power-state research baseline v0.2.
 * Pure, causal, dependency-free. NOT fitted to the supplied screenshots.
 * Accepts independently verified, complete interval means, NOT raw change events.
 * No network, raw-data persistence, production notifications, or probability claims.
 */
export const VERSION = 'prism-research-0.2';
export const STATES = ['COOKING', 'WARMING', 'OFF', 'UNKNOWN'];

/** Illustrative values for synthetic fixtures only; never a device calibration. */
export const DEMO_PROFILE = Object.freeze({
  id: 'SYNTHETIC-ONLY-v2', deviceKey: 'synthetic-cooker',
  provenance: 'synthetic_example_not_fitted',
  maxBinSeconds: 60, maxFreshnessSeconds: 90, maxGapSeconds: 60,
  minCoverage: 0.95, shortWindowSeconds: 600, longWindowSeconds: 3600,
  maximumPlausibleW: 2200, baselineW: 2, offCeilingW: 5,
  heatFloorW: 10, warmBandMaxW: 150, warmSpikeMaxW: 500, cookHighW: 700,
  cookMinHighSeconds: 300, cookMinDuty: 0.5, cookMinExcessWh: 60,
  recentHighSeconds: 120, warmMaxPulseSeconds: 180,
  warmMinRuns: 3, warmMinSpanSeconds: 900, warmContinuousMinSeconds: 600,
  warmQuietMaxSeconds: 1200, offConfirmSeconds: 2700,
  switchOffConfirmSeconds: 120, energyToleranceWh: 5, energyToleranceFraction: 0.25,
  measurementErrorW: 1, measurementErrorFraction: 0.02,
  transitionConfirmSeconds: 120,
});

const finite = value => typeof value === 'number' && Number.isFinite(value);
/** Reject timezone-free timestamps, calendar rollover, leap seconds and invalid offsets. */
export function parseTimestamp(value) {
  if (typeof value !== 'string') return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!m) return NaN;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const maxDay = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > maxDay ||
      hour > 23 || minute > 59 || second > 59 ||
      (m[7] !== 'Z' && (+m[9] > 14 || +m[10] > 59 || (+m[9] === 14 && +m[10] !== 0)))) return NaN;
  return Date.parse(value) / 1000;
}
const time = parseTimestamp;
const iso = seconds => new Date(seconds * 1000).toISOString();
const round = value => finite(value) ? Math.round(value * 1000) / 1000 : null;

function profileError(p) {
  if (!p || !p.id || !p.deviceKey || !p.provenance) return 'profile_not_calibrated';
  for (const key of Object.keys(DEMO_PROFILE)) {
    if (typeof DEMO_PROFILE[key] === 'number' && (!finite(p[key]) || p[key] < 0)) return `invalid_profile_${key}`;
  }
  if (!(p.baselineW <= p.offCeilingW && p.offCeilingW < p.heatFloorW &&
      p.heatFloorW < p.warmBandMaxW && p.warmBandMaxW < p.warmSpikeMaxW &&
      p.warmSpikeMaxW < p.cookHighW && p.cookHighW < p.maximumPlausibleW)) return 'invalid_profile_power_order';
  if (!(p.minCoverage > 0 && p.minCoverage <= 1 && p.cookMinDuty > 0 && p.cookMinDuty <= 1 &&
      p.maxBinSeconds > 0 && p.shortWindowSeconds > 0 &&
      p.longWindowSeconds >= p.offConfirmSeconds && p.longWindowSeconds >= p.shortWindowSeconds &&
      p.offConfirmSeconds > p.warmQuietMaxSeconds && p.warmMinRuns >= 3 &&
      Number.isInteger(p.warmMinRuns) && p.cookMinHighSeconds <= p.shortWindowSeconds &&
      p.warmContinuousMinSeconds > 0 && p.switchOffConfirmSeconds > 0 &&
      p.measurementErrorFraction < 1 && p.transitionConfirmSeconds > 0 &&
      p.warmMaxPulseSeconds > 0 && p.warmQuietMaxSeconds > 0 &&
      p.longWindowSeconds >= p.warmMinSpanSeconds)) return 'invalid_profile_duration';
  return null;
}

function normalizeBins(input, p, now) {
  if (!Array.isArray(input)) return { error: 'invalid_bins' };
  const bins = [];
  for (const b of input) {
    const start = time(b?.start), end = time(b?.end);
    if (!finite(start) || !finite(end) || end <= start || end - start > p.maxBinSeconds) return { error: 'invalid_bin_interval' };
    if (end > now) return { error: 'future_data' };
    if (b.deviceKey !== p.deviceKey) return { error: 'mixed_or_wrong_device' };
    if (b.unit !== 'W') return { error: 'invalid_power_unit' };
    if (!finite(b.meanW) || b.meanW < 0 || b.meanW > p.maximumPlausibleW) return { error: 'invalid_power' };
    if (typeof b.complete !== 'boolean') return { error: 'missing_completeness_evidence' };
    if (b.maxW !== undefined && (!finite(b.maxW) || b.maxW < b.meanW || b.maxW > p.maximumPlausibleW)) return { error: 'invalid_peak' };
    const error = w => p.measurementErrorW + p.measurementErrorFraction * w;
    bins.push({ start, end, meanW: b.meanW, maxW: b.maxW ?? null,
      lowerMeanW: Math.max(0, b.meanW - error(b.meanW)), upperMeanW: b.meanW + error(b.meanW),
      upperMaxW: b.maxW === undefined ? null : b.maxW + error(b.maxW), peakKnown: b.maxW !== undefined,
      complete: b.complete, id: b.id ?? null });
  }
  bins.sort((a, b) => a.start - b.start || a.end - b.end);
  const unique = [];
  let duplicates = 0;
  for (const b of bins) {
    const previous = unique.at(-1);
    if (previous && b.start < previous.end) {
      if (b.start === previous.start && b.end === previous.end && b.meanW === previous.meanW &&
          b.maxW === previous.maxW && b.peakKnown === previous.peakKnown && b.complete === previous.complete) { duplicates++; continue; }
      return { error: 'overlapping_or_conflicting_bins' };
    }
    unique.push(b);
  }
  return { bins: unique, duplicates };
}

function windowBins(bins, start, end) {
  // A bin mean does not reveal energy in an arbitrary fraction of that bin.
  // Discard partial boundary bins and count their time as unobserved instead.
  return bins.filter(b => b.complete && b.start >= start && b.end <= end);
}
function summarize(bins, start, end, p) {
  const rows = windowBins(bins, start, end);
  let seconds = 0, wattSeconds = 0, excess = 0, lowerExcess = 0, highSeconds = 0, heatSeconds = 0;
  let longestGap = 0, cursor = start;
  for (const b of rows) {
    const dt = b.end - b.start;
    longestGap = Math.max(longestGap, b.start - cursor);
    cursor = b.end; seconds += dt; wattSeconds += b.meanW * dt;
    excess += Math.max(0, b.meanW - p.baselineW) * dt;
    lowerExcess += Math.max(0, b.lowerMeanW - p.baselineW) * dt;
    if (b.lowerMeanW >= p.cookHighW) highSeconds += dt;
    if (b.lowerMeanW >= p.heatFloorW) heatSeconds += dt;
  }
  longestGap = Math.max(longestGap, end - cursor);
  return { rows, seconds, coverage: end > start ? seconds / (end - start) : 0, longestGap,
    meanW: seconds ? wattSeconds / seconds : null, energyWh: wattSeconds / 3600,
    excessWh: excess / 3600, lowerExcessWh: lowerExcess / 3600, highSeconds,
    highDuty: seconds ? highSeconds / seconds : 0, heatSeconds };
}
function contiguousTail(bins, end, predicate) {
  const tail = []; let cursor = end;
  for (let i = bins.length - 1; i >= 0; i--) {
    const b = bins[i];
    if (b.end > end) continue;
    if (!b.complete || b.end !== cursor || !predicate(b)) break;
    tail.unshift(b); cursor = b.start;
  }
  return tail;
}
function heatRuns(bins, p) {
  const runs = [];
  for (const b of bins) {
    if (b.lowerMeanW < p.heatFloorW || b.upperMeanW > p.warmSpikeMaxW) continue;
    const previous = runs.at(-1);
    if (previous && previous.end === b.start) {
      previous.end = b.end; previous.maxMeanW = Math.max(previous.maxMeanW, b.meanW);
    } else runs.push({ start: b.start, end: b.end, maxMeanW: b.meanW });
  }
  return runs;
}
function median(values) {
  if (!values.length) return null;
  const a = [...values].sort((x, y) => x - y), n = a.length;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}
function featuresOf(stats) {
  return Object.fromEntries(['seconds', 'coverage', 'longestGap', 'meanW', 'energyWh',
    'excessWh', 'lowerExcessWh', 'highSeconds', 'highDuty', 'heatSeconds'].map(k => [k, round(stats[k])]));
}

/**
 * Input contract in README.md. All output states are research candidates.
 * UNKNOWN is an abstention, not a fourth physical mode.
 * Fresh online status never makes an old power value fresh.
 */
export function classifyPower(input = {}) {
  const { bins = [], profile, asOf, observation = {}, energyCheck } = input && typeof input === 'object' ? input : {};
  const now = time(asOf);
  const result = {
    version: VERSION, asOf: finite(now) ? iso(now) : null,
    profileId: profile?.id ?? null, state: 'UNKNOWN', subtype: null,
    interpretation: 'research_candidate_only', confidence: null,
    modeConfirmed: false, supplyState: 'UNPROVEN', observedThrough: null,
    eligibleForNotification: false, reasons: [], features: {},
  };
  const stop = reason => ({ ...result, reasons: [...result.reasons, reason] });
  if (!finite(now)) return stop('invalid_as_of');
  const invalidProfile = profileError(profile);
  if (invalidProfile) return stop(invalidProfile);
  const p = profile;
  if (!observation || typeof observation !== 'object' || Array.isArray(observation)) return stop('invalid_observation');
  if (observation.mode !== 'verified_interval_mean') return stop('interval_observation_not_verified');
  if (observation.filtered !== false) return stop('filtered_or_unknown_filter');
  if (observation.deviceAssignmentVerified !== true) return stop('dedicated_cooker_not_verified');
  const healthTime = time(observation.healthAt);
  if (observation.health !== 'online' || !finite(healthTime) || healthTime > now || now - healthTime > p.maxFreshnessSeconds)
    return stop('offline_or_stale_health');
  const normalized = normalizeBins(bins, p, now);
  if (normalized.error) return stop(normalized.error);
  const data = normalized.bins, latest = data.at(-1);
  result.features.duplicatesRemoved = normalized.duplicates;
  if (!latest || !latest.complete || now - latest.end > p.maxFreshnessSeconds) return stop('missing_or_stale_power');
  result.observedThrough = iso(latest.end);
  result.features.latest = { meanW: latest.meanW, lowerMeanW: round(latest.lowerMeanW),
    upperMeanW: round(latest.upperMeanW), maxW: latest.maxW, upperMaxW: round(latest.upperMaxW),
    errorModel: 'absolute_plus_relative_bound_not_probability' };
  const short = summarize(data, now - p.shortWindowSeconds, now, p);
  result.features.short = featuresOf(short);
  if (short.coverage < p.minCoverage || short.longestGap > p.maxGapSeconds) return stop('insufficient_recent_coverage');

  // Reject an energy counter reset, changed counter, or inconsistent energy over the SAME window.
  // It can veto evidence but cannot reconstruct a missing waveform.
  if (energyCheck !== undefined) {
    if (!energyCheck || typeof energyCheck !== 'object' || Array.isArray(energyCheck)) return stop('invalid_or_reset_energy_counter');
    const start = time(energyCheck.start), end = time(energyCheck.end);
    if (energyCheck.deviceKey !== p.deviceKey || energyCheck.unit !== 'Wh' ||
        energyCheck.sameCounter !== true || energyCheck.reset !== false ||
        !finite(energyCheck.deltaWh) || energyCheck.deltaWh < 0 ||
        !finite(start) || !finite(end) || end <= start || end > now)
      return stop('invalid_or_reset_energy_counter');
    const e = summarize(data, start, end, p);
    if (e.coverage < 1) result.reasons.push('energy_crosscheck_unavailable_due_to_gaps');
    else {
      result.features.energyResidualWh = round(energyCheck.deltaWh - e.energyWh);
      const tolerance = Math.max(p.energyToleranceWh, p.energyToleranceFraction * Math.max(e.energyWh, energyCheck.deltaWh));
      if (Math.abs(energyCheck.deltaWh - e.energyWh) > tolerance) return stop('power_energy_disagreement');
    }
  }
  const switchTime = time(observation.switchAt);
  if (observation.switch === 'off') {
    if (!finite(switchTime) || switchTime > now || now - switchTime > p.maxFreshnessSeconds)
      return stop('stale_switch_off');
    if (!latest.peakKnown) return stop('peak_unknown_for_off_confirmation');
    if (latest.maxW > p.offCeilingW) return stop('switch_off_power_conflict');
    if (latest.upperMaxW > p.offCeilingW) return stop('off_threshold_within_meter_error');
    const quiet = contiguousTail(data, latest.end, b => b.peakKnown && b.upperMaxW <= p.offCeilingW);
    const duration = quiet.length ? latest.end - quiet[0].start : 0;
    if (duration < p.switchOffConfirmSeconds) return stop('awaiting_switch_off_confirmation');
    return { ...result, state: 'OFF', subtype: 'supply_cut_reported', supplyState: 'CUT_REPORTED',
      reasons: [...result.reasons, 'fresh_switch_off_and_low_power'],
      features: { ...result.features, quietSeconds: duration } };
  }

  const lastHigh = [...data].reverse().find(b => b.complete && b.lowerMeanW >= p.cookHighW);
  result.features.lastHighEndedAt = lastHigh ? iso(lastHigh.end) : null;
  if (short.highSeconds >= p.cookMinHighSeconds && short.highDuty >= p.cookMinDuty &&
      short.lowerExcessWh >= p.cookMinExcessWh && lastHigh && now - lastHigh.end <= p.recentHighSeconds &&
      latest.lowerMeanW >= p.cookHighW) {
    return { ...result, state: 'COOKING', subtype: 'sustained_high_heat_candidate',
      reasons: [...result.reasons, 'sustained_high_energy', 'reheat_or_cleaning_not_excluded'] };
  }

  // The pulse calculation is restricted to a gap-free, moderate-power suffix.
  // One large, unexplained burst invalidates that suffix; missing bins never become OFF.
  if (latest.lowerMeanW < p.cookHighW && latest.upperMeanW >= p.cookHighW)
    return stop('cooking_threshold_within_meter_error');
  const tail = contiguousTail(data, latest.end, b => b.peakKnown && b.upperMaxW < p.cookHighW &&
    b.upperMeanW <= p.warmSpikeMaxW &&
    (b.upperMaxW <= p.offCeilingW || b.lowerMeanW >= p.heatFloorW));
  const tailStart = Math.max(now - p.longWindowSeconds, tail[0]?.start ?? now);
  const long = summarize(tail, tailStart, now, p);
  const rows = long.rows, runs = heatRuns(rows, p);
  const shortRuns = runs.filter(r => r.end - r.start <= p.warmMaxPulseSeconds);
  const lastRun = runs.at(-1);
  const gaps = runs.slice(1).map((r, i) => r.start - runs[i].end);
  const period = runs.slice(1).map((r, i) => r.start - runs[i].start);
  const periodMedian = median(period);
  const periodMad = periodMedian === null ? null : median(period.map(x => Math.abs(x - periodMedian)));
  const quietSeconds = lastRun ? now - lastRun.end : null;
  result.features.warm = { spanSeconds: round(now - tailStart), runCount: runs.length,
    shortRunCount: shortRuns.length, quietSeconds: round(quietSeconds),
    periodMedianSeconds: round(periodMedian), periodMadSeconds: round(periodMad),
    maxObservedQuietSeconds: gaps.length ? Math.max(...gaps) : null,
    note: 'runs_of_interval_means_not_instantaneous_heater_pulses' };
  const continuousWarm = contiguousTail(data, latest.end,
    b => b.peakKnown && b.lowerMeanW >= p.heatFloorW && b.upperMeanW <= p.warmBandMaxW && b.upperMaxW < p.cookHighW);
  const continuousSeconds = continuousWarm.length ? latest.end - continuousWarm[0].start : 0;
  const recurrent = shortRuns.length >= p.warmMinRuns && runs.length === shortRuns.length &&
    lastRun && now - tailStart >= p.warmMinSpanSeconds && quietSeconds <= p.warmQuietMaxSeconds &&
    gaps.every(gap => gap <= p.warmQuietMaxSeconds);
  if (continuousSeconds >= p.warmContinuousMinSeconds || recurrent) {
    return { ...result, state: 'WARMING', subtype: continuousSeconds >= p.warmContinuousMinSeconds ? 'continuous_low_heat' : 'recurrent_heat_with_quiet_gaps',
      reasons: [...result.reasons, continuousSeconds >= p.warmContinuousMinSeconds ? 'sustained_low_heat' : 'repeated_moderate_heat',
        quietSeconds > 0 ? 'heater_quiet_does_not_imply_off' : 'heating_observed'] };
  }

  // Heat-off is operational OFF (standby included), never proof of a disconnected supply.
  const lowTail = contiguousTail(data, latest.end, b => b.peakKnown && b.upperMaxW <= p.offCeilingW);
  const lowSeconds = lowTail.length ? latest.end - lowTail[0].start : 0;
  result.features.quietSeconds = lowSeconds;
  if (lowSeconds >= p.offConfirmSeconds) {
    return { ...result, state: 'OFF', subtype: 'no_heat_standby_possible',
      reasons: [...result.reasons, 'long_contiguous_low_power', 'supply_disconnection_not_proven'] };
  }
  if (lastHigh && now - lastHigh.end <= p.recentHighSeconds && latest.upperMaxW <= p.offCeilingW)
    return stop('high_heat_ended_transition_unresolved');
  return stop('insufficient_or_ambiguous_pattern');
}

/** One result per observed bin end, plus an optional final asOf. No future context. */
export function analyzeTimeline({ bins = [], profile, observation, asOf } = {}) {
  if (!Array.isArray(bins) || bins.some(b => !finite(time(b?.end))))
    throw new TypeError('Timeline requires bins with valid timestamp endpoints.');
  if (asOf !== undefined && !finite(time(asOf))) throw new TypeError('Invalid timeline cutoff.');
  const cutoff = asOf === undefined ? Infinity : time(asOf);
  const endingTimes = [...new Set(bins.map(b => time(b.end)).filter(t => t <= cutoff))];
  if (finite(cutoff)) endingTimes.push(cutoff);
  const endings = [...new Set(endingTimes)].sort((a, b) => a - b).map(iso);
  return endings.map(end => classifyPower({ bins: bins.filter(b => time(b.end) <= time(end)),
    profile, asOf: end,
    observation: typeof observation === 'function' ? observation(end) : observation }));
}

/** Duration-weighted evaluation. UNKNOWN is included in recall denominators. */
export function evaluateWindows(rows) {
  const truthStates = STATES.slice(0, 3);
  const matrixSeconds = Object.fromEntries(truthStates.map(s => [s, Object.fromEntries(STATES.map(x => [x, 0]))]));
  let total = 0, accepted = 0, correct = 0;
  for (const row of rows) {
    if (!truthStates.includes(row.truth) || !STATES.includes(row.predicted) || !finite(row.seconds) || row.seconds <= 0)
      throw new TypeError('Each evaluation row needs an independent truth, predicted state, and positive seconds.');
    matrixSeconds[row.truth][row.predicted] += row.seconds;
    total += row.seconds;
    if (row.predicted !== 'UNKNOWN') accepted += row.seconds;
    if (row.truth === row.predicted) correct += row.seconds;
  }
  const perState = Object.fromEntries(truthStates.map(state => {
    const trueSeconds = Object.values(matrixSeconds[state]).reduce((a, b) => a + b, 0);
    const predictedSeconds = truthStates.reduce((s, actual) => s + matrixSeconds[actual][state], 0);
    const hit = matrixSeconds[state][state];
    return [state, { precision: predictedSeconds ? hit / predictedSeconds : null,
      recallIncludingAbstentions: trueSeconds ? hit / trueSeconds : null,
      truthSeconds: trueSeconds, predictedSeconds }];
  }));
  return { matrixSeconds, perState, observedLabeledSeconds: total,
    decisionCoverage: total ? accepted / total : null,
    accuracyIncludingAbstentions: total ? correct / total : null,
    selectiveAccuracy: accepted ? correct / accepted : null,
    warmingMisclassifiedOffSeconds: matrixSeconds.WARMING.OFF,
    note: 'Not a confidence interval. Independent real labels and clustered uncertainty analysis required.' };
}
