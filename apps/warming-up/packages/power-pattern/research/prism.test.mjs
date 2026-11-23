import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPower, DEMO_PROFILE, evaluateWindows } from './prism.mjs';
import { makeBins, demoInput, at } from './fixtures.mjs';
const check = (bins, options) => classifyPower(demoInput(bins, options));
const withObservation = (bins, patch) => {
  const input = demoInput(bins); Object.assign(input.observation, patch); return classifyPower(input);
};

test('sustained high energy produces a candidate, never a validated cooking or meal claim', () => {
  const r = check(makeBins(30, () => 1000));
  assert.equal(r.state, 'COOKING'); assert.equal(r.confidence, null);
  assert.equal(r.eligibleForNotification, false); assert.ok(r.reasons.includes('reheat_or_cleaning_not_excluded'));
});
test('isolated 420 W peak never becomes cooking', () => {
  assert.equal(check(makeBins(30, i => i === 28 ? 420 : 2)).state, 'UNKNOWN');
});
test('two minute 1200 W burst never becomes cooking', () => {
  assert.equal(check(makeBins(30, i => i >= 28 ? 1200 : 2)).state, 'UNKNOWN');
});
test('warming survives a 1-3 W quiet phase after recurrent moderate rises', () => {
  const r = check(makeBins(40, i => i % 8 === 0 ? 65 : 2));
  assert.equal(r.state, 'WARMING'); assert.equal(r.features.warm.periodMedianSeconds, 480);
});
test('continuous low heat can be a warming candidate', () => {
  assert.equal(check(makeBins(30, () => 45)).state, 'WARMING');
});
test('initial standby shorter than a warming quiet bound is not OFF', () => {
  assert.equal(check(makeBins(20, () => 2)).state, 'UNKNOWN');
});
test('long verified standby is operational OFF, not supply disconnection', () => {
  const r = check(makeBins(50, () => 2));
  assert.equal(r.state, 'OFF'); assert.equal(r.subtype, 'no_heat_standby_possible');
});
test('zero power does not independently prove supply disconnection', () => {
  assert.equal(check(makeBins(50, () => 0)).subtype, 'no_heat_standby_possible');
});
test('fresh switch off and low power receive a distinct subtype', () => {
  const r = withObservation(makeBins(15, () => 0), { switch: 'off', switchAt: at(15) });
  assert.equal(r.subtype, 'supply_cut_reported');
});
test('switch OFF with high power is a conflict, not a cooking or OFF decision', () => {
  const r = withObservation(makeBins(15, () => 950), { switch: 'off', switchAt: at(15) });
  assert.equal(r.state, 'UNKNOWN'); assert.ok(r.reasons.includes('switch_off_power_conflict'));
});
test('stale switch-off is not trusted', () => {
  const r = withObservation(makeBins(15, () => 0), { switch: 'off', switchAt: at(1) });
  assert.ok(r.reasons.includes('stale_switch_off'));
});
test('missing intervals are not zero-filled', () => {
  assert.equal(check(makeBins(60, () => 2).filter((_, i) => i < 50 || i >= 58)).state, 'UNKNOWN');
});
test('a gap breaks the OFF persistence clock even when old low-power data exist', () => {
  assert.equal(check(makeBins(90, () => 2).filter((_, i) => i !== 60)).state, 'UNKNOWN');
});
test('offline state vetoes fresh-looking low power', () => {
  assert.equal(withObservation(makeBins(50, () => 2), { health: 'offline' }).state, 'UNKNOWN');
});
test('fresh heartbeat does not make stale power current', () => {
  assert.equal(check(makeBins(50, () => 2), { asOf: at(60) }).state, 'UNKNOWN');
});
test('filtered capture values cannot form an interval observation', () => {
  assert.equal(withObservation(makeBins(50, () => 1000), { filtered: true }).state, 'UNKNOWN');
});
test('raw change events are not treated as sampled intervals', () => {
  assert.equal(withObservation(makeBins(50, () => 1000), { mode: 'event_only' }).state, 'UNKNOWN');
});
test('device association must be verified', () => {
  assert.equal(withObservation(makeBins(50, () => 1000), { deviceAssignmentVerified: false }).state, 'UNKNOWN');
});
test('duplicates do not inflate energy or persistence', () => {
  const bins = makeBins(30, () => 1000), result = check([...bins, ...bins]);
  assert.equal(result.features.short.energyWh, check(bins).features.short.energyWh);
  assert.equal(result.features.duplicatesRemoved, 30);
});
test('out-of-order bins have the same outcome after sorting', () => {
  const bins = makeBins(40, i => i % 8 === 0 ? 65 : 2);
  assert.deepEqual(check([...bins].reverse(), { asOf: at(40) }), check(bins));
});
test('conflicting duplicate is rejected', () => {
  const bins = makeBins(30, () => 1000);
  assert.ok(check([...bins, { ...bins[3], meanW: 2 }], { asOf: at(30) }).reasons.includes('overlapping_or_conflicting_bins'));
});
test('overlapping bins are rejected', () => {
  const bins = makeBins(30, () => 1000); bins[4].start = at(3.5);
  assert.equal(check(bins).state, 'UNKNOWN');
});
test('wrong unit is not silently converted', () => {
  const bins = makeBins(30, () => 1); bins[0].unit = 'kW';
  assert.ok(check(bins).reasons.includes('invalid_power_unit'));
});
test('negative and non-finite power rejected', () => {
  for (const meanW of [-1, NaN, Infinity]) {
    const bins = makeBins(30, () => 1000); bins[3].meanW = meanW;
    assert.equal(check(bins).state, 'UNKNOWN');
  }
});
test('different device data cannot share one profile', () => {
  const bins = makeBins(30, () => 1000); bins[3].deviceKey = 'other';
  assert.ok(check(bins).reasons.includes('mixed_or_wrong_device'));
});
test('unfilled real-device profile is not the demo profile', () => {
  assert.ok(check(makeBins(30, () => 1000), { profile: { deviceKey: 'C', model: 'CRP-CHXB1010FS' } }).reasons.includes('profile_not_calibrated'));
});
test('timestamps require an explicit UTC offset', () => {
  assert.equal(check(makeBins(30, () => 1000), { asOf: '2026-11-17T01:00:00' }).state, 'UNKNOWN');
});
test('future bins rejected', () => {
  assert.ok(check(makeBins(30, () => 1000), { asOf: at(29) }).reasons.includes('future_data'));
});
test('incomplete bins do not count toward coverage', () => {
  const bins = makeBins(30, () => 1000); bins[25].complete = false;
  assert.equal(check(bins).state, 'UNKNOWN');
});
test('counter reset and cross-window energy disagreement veto inference', () => {
  const bins = makeBins(30, () => 1000);
  const counter = { deviceKey: DEMO_PROFILE.deviceKey, start: at(20), end: at(30), unit: 'Wh',
    deltaWh: 1, sameCounter: true, reset: false };
  assert.ok(check(bins, { energyCheck: counter }).reasons.includes('power_energy_disagreement'));
  assert.ok(check(bins, { energyCheck: { ...counter, reset: true } }).reasons.includes('invalid_or_reset_energy_counter'));
});
test('matching independent Wh cross-check preserves candidate', () => {
  const bins = makeBins(30, () => 1000);
  assert.equal(check(bins, { energyCheck: { deviceKey: DEMO_PROFILE.deviceKey,
    start: at(20), end: at(30), unit: 'Wh', deltaWh: 1000 / 6,
    sameCounter: true, reset: false } }).state, 'COOKING');
});
test('single unexplained high spike in a low mean must not become warming', () => {
  const bins = makeBins(30, () => 45); bins[25].maxW = 1300;
  assert.equal(check(bins).state, 'UNKNOWN');
});
test('operational OFF waits beyond the assumed longest warming quiet phase', () => {
  const p = { ...DEMO_PROFILE, offConfirmSeconds: 600 };
  assert.ok(check(makeBins(50, () => 2), { profile: p }).reasons.includes('invalid_profile_duration'));
});
test('evaluation includes UNKNOWN in the recall denominator', () => {
  const r = evaluateWindows([{ truth: 'COOKING', predicted: 'COOKING', seconds: 60 },
    { truth: 'COOKING', predicted: 'UNKNOWN', seconds: 60 },
    { truth: 'WARMING', predicted: 'OFF', seconds: 30 }]);
  assert.equal(r.perState.COOKING.recallIncludingAbstentions, 0.5);
  assert.equal(r.decisionCoverage, 0.6); assert.equal(r.warmingMisclassifiedOffSeconds, 30);
});
test('same energy can have different patterns; energy alone is insufficient', () => {
  const burst = check(makeBins(60, i => i >= 30 && i < 35 ? 1200 : 0));
  const spread = check(makeBins(60, () => 100));
  assert.equal(burst.state, 'UNKNOWN'); assert.equal(spread.state, 'WARMING');
});
test('missing peak cannot establish OFF from a small average', () => {
  const bins = makeBins(50, () => 2).map(({maxW, ...b}) => b);
  assert.equal(check(bins).state, 'UNKNOWN');
});
test('missing peak cannot rule out high-power bursts during low average heat', () => {
  const bins = makeBins(30, () => 45).map(({maxW, ...b}) => b);
  assert.equal(check(bins).state, 'UNKNOWN');
});
test('low mean with observed heating peaks is not operational OFF', () => {
  assert.equal(check(makeBins(50, () => 2).map(b => ({...b, maxW: 100}))).state, 'UNKNOWN');
});
test('energy checks never split interval means to invent sub-bin energy', () => {
  const bins = makeBins(30, () => 1000).map(b => ({...b,maxW:2000}));
  const r = check(bins, { energyCheck: { deviceKey: DEMO_PROFILE.deviceKey,
    start: at(29.5), end: at(30), deltaWh: 0, unit: 'Wh', sameCounter: true, reset: false } });
  assert.equal(r.state, 'COOKING');
  assert.ok(r.reasons.includes('energy_crosscheck_unavailable_due_to_gaps'));
  assert.ok(!r.reasons.includes('power_energy_disagreement'));
});
test('partial-window bin coverage is not invented', () => {
  const r = check(makeBins(30, () => 1000), {asOf: at(30.5)});
  assert.equal(r.features.short.seconds, 540);
  assert.equal(r.features.short.coverage, 0.9);
  assert.equal(r.state, 'UNKNOWN');
});
