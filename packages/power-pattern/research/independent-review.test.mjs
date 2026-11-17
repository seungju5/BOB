/**
 * Independently authored adversarial checks for PRISM research baseline v0.1.
 * These are synthetic software checks, not measurements of household accuracy.
 * Run: node --test independent-review.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPower, DEMO_PROFILE, evaluateWindows } from './prism.mjs';
import { makeBins, demoInput, observationAt, at } from './fixtures.mjs';

function probe(bins, patch, expected, reason) {
  const result = classifyPower(demoInput(bins, patch));
  assert.equal(result.state, expected);
  if (reason) assert.ok(result.reasons.includes(reason));
  assert.equal(result.eligibleForNotification, false);
  assert.equal(result.confidence, null);
  return result;
}

test('independent: high heat ending three minutes ago is not current cooking', () => {
  probe(makeBins(30, i => i < 27 ? 1050 : 2), {}, 'UNKNOWN');
});

test('independent: new high heat after a long OFF period needs fresh duration evidence', () => {
  probe(makeBins(60, i => i < 58 ? 2 : 1200), {}, 'UNKNOWN');
});

test('independent: one missing peak breaks the OFF confirmation clock', () => {
  const bins = makeBins(90, () => 2).map((bin, i) => {
    if (i !== 60) return bin;
    const { maxW, ...withoutPeak } = bin;
    return withoutPeak;
  });
  probe(bins, {}, 'UNKNOWN');
});

test('independent: only 44 minutes after a gap remains UNKNOWN', () => {
  probe(makeBins(90, () => 2).filter((_, i) => i !== 45), {}, 'UNKNOWN');
});

test('independent: 45 complete low-power minutes after a gap meet the demo OFF duration', () => {
  probe(makeBins(90, () => 2).filter((_, i) => i !== 44), {}, 'OFF');
});

test('independent: fresh power does not repair stale device health', () => {
  probe(makeBins(30, () => 1050), {
    observation: { ...observationAt(at(30)), healthAt: at(25) },
  }, 'UNKNOWN', 'offline_or_stale_health');
});

test('independent: future device health is rejected', () => {
  probe(makeBins(30, () => 1050), {
    observation: { ...observationAt(at(30)), healthAt: at(31) },
  }, 'UNKNOWN', 'offline_or_stale_health');
});

test('independent: an omitted filtering contract is not treated as unfiltered', () => {
  probe(makeBins(30, () => 1050), {
    observation: { ...observationAt(at(30)), filtered: undefined },
  }, 'UNKNOWN', 'filtered_or_unknown_filter');
});

test('independent: a future power bin is rejected rather than used retrospectively', () => {
  probe(makeBins(30, () => 1050), { asOf: at(29) }, 'UNKNOWN', 'future_data');
});

test('independent: an incomplete newest power bin cannot sustain a current decision', () => {
  const bins = makeBins(30, () => 1050).map((bin, i) =>
    i === 29 ? { ...bin, complete: false } : bin);
  probe(bins, {}, 'UNKNOWN', 'missing_or_stale_power');
});

test('independent: a low mean with observed high peaks is not continuous warming', () => {
  const bins = makeBins(30, () => 45).map(bin => ({ ...bin, maxW: 1000 }));
  probe(bins, {}, 'UNKNOWN');
});

test('independent: a low mean does not erase a peak conflicting with switch OFF', () => {
  const bins = makeBins(30, () => 2).map(bin => ({ ...bin, maxW: 100 }));
  probe(bins, {
    observation: { ...observationAt(at(30)), switch: 'off', switchAt: at(30) },
  }, 'UNKNOWN', 'switch_off_power_conflict');
});

test('independent: a two-minute aggregate exceeds the demo observation resolution', () => {
  const bins = makeBins(30, () => 1050);
  probe([...bins.slice(0, 28), { ...bins[28], end: at(30) }], {},
    'UNKNOWN', 'invalid_bin_interval');
});

test('independent: energy evidence from another device cannot corroborate this cooker', () => {
  probe(makeBins(30, () => 1050), {
    energyCheck: { deviceKey: 'foreign', start: at(20), end: at(30), deltaWh: 175,
      unit: 'Wh', reset: false, sameCounter: true },
  }, 'UNKNOWN', 'invalid_or_reset_energy_counter');
});

test('independent: energy evidence without counter-reset proof is not trusted', () => {
  probe(makeBins(30, () => 1050), {
    energyCheck: { deviceKey: DEMO_PROFILE.deviceKey, start: at(20), end: at(30),
      deltaWh: 175, unit: 'Wh', sameCounter: true },
  }, 'UNKNOWN', 'invalid_or_reset_energy_counter');
});

test('independent: shifted bin boundaries never invent half-bin energy', () => {
  const bins = makeBins(30, () => 1050).map(bin => ({ ...bin,
    start: new Date(Date.parse(bin.start) + 30000).toISOString(),
    end: new Date(Date.parse(bin.end) + 30000).toISOString(),
  }));
  const result = probe(bins, {
    asOf: at(30.5),
    energyCheck: { deviceKey: DEMO_PROFILE.deviceKey, start: at(29.75), end: at(30.25),
      deltaWh: 0, unit: 'Wh', reset: false, sameCounter: true },
  }, 'COOKING');
  assert.ok(result.reasons.includes('energy_crosscheck_unavailable_due_to_gaps'));
});

test('independent: abstaining on every labeled window never yields a perfect score', () => {
  const result = evaluateWindows([
    { truth: 'WARMING', predicted: 'UNKNOWN', seconds: 3600 },
  ]);
  assert.equal(result.decisionCoverage, 0);
  assert.equal(result.perState.WARMING.recallIncludingAbstentions, 0);
  assert.equal(result.selectiveAccuracy, null);
});
