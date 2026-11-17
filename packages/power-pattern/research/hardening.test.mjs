import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPower, analyzeTimeline, parseTimestamp, DEMO_PROFILE } from './prism.mjs';
import { createStateTracker, explainDecision } from './tracker.mjs';
import { evaluateHoldout } from './validation.mjs';
import { makeBins, demoInput, at, observationAt } from './fixtures.mjs';
const check = (bins, options = {}) => classifyPower(demoInput(bins, options));
const high = () => makeBins(30, () => 1050);
const stepAt = (tracker, bins, minute, extras = {}) => tracker.step(demoInput(
  bins.filter(b => parseTimestamp(b.end) <= parseTimestamp(at(minute))), { asOf: at(minute), ...extras }));

for (const quietMinutes of [1, 2]) test(`stopped high heat is not current cooking after ${quietMinutes} minute(s)`, () => {
  const r = check(makeBins(30, i => i < 30 - quietMinutes ? 1050 : 2));
  assert.equal(r.state, 'UNKNOWN'); assert.ok(r.reasons.includes('high_heat_ended_transition_unresolved'));
});
test('meter uncertainty overlapping cooking boundary abstains', () => {
  const r = check(makeBins(30, () => 700));
  assert.equal(r.state, 'UNKNOWN'); assert.ok(r.features.latest.lowerMeanW < 700);
  assert.ok(r.reasons.includes('cooking_threshold_within_meter_error'));
});
test('meter uncertainty overlapping OFF boundary abstains', () => {
  const r = check(makeBins(50, () => 4.8)); assert.equal(r.state, 'UNKNOWN');
});
test('switch OFF still needs uncertainty-aware low power', () => {
  const r = check(makeBins(50, () => 4.8), { observation: { ...observationAt(at(50)), switch: 'off', switchAt: at(50) } });
  assert.ok(r.reasons.includes('off_threshold_within_meter_error'));
});
test('null inputs do not crash the classifier', () => {
  for (const input of [null, undefined, 4, []]) assert.equal(classifyPower(input).state, 'UNKNOWN');
  assert.ok(check(high(), { observation: null }).reasons.includes('invalid_observation'));
  assert.ok(check(high(), { energyCheck: null }).reasons.includes('invalid_or_reset_energy_counter'));
});
test('strict timestamps reject impossible calendar dates and offsets', () => {
  for (const invalid of ['2026-02-30T12:00:00Z', '2026-02-29T12:00:00Z',
    '2026-11-17T24:00:00Z', '2026-11-17T12:00:60Z', '2026-11-17T12:00:00+14:01']) {
    assert.ok(Number.isNaN(parseTimestamp(invalid)));
    assert.ok(check(high(), { asOf: invalid }).reasons.includes('invalid_as_of'));
  }
  assert.ok(Number.isFinite(parseTimestamp('2028-02-29T12:00:00+09:00')));
});
test('timeline never reads past cutoff and returns monotonic unique times', () => {
  const r = analyzeTimeline({ bins: high(), profile: DEMO_PROFILE, observation: observationAt, asOf: at(10.5) });
  assert.equal(r.length, 11); assert.equal(r.at(-1).asOf, at(10.5));
  assert.ok(r.every((x, i) => i === 0 || x.asOf > r[i - 1].asOf));
});
test('equivalent timezone spellings do not double replay one measurement', () => {
  const bins = high();
  const b = { ...bins[0], start: '2026-11-17T00:00:00+09:00', end: '2026-11-17T00:01:00+09:00' };
  const r = analyzeTimeline({ bins: [...bins, b], profile: DEMO_PROFILE, observation: observationAt });
  assert.equal(r.length, 30);
});
test('timeline input errors are explicit', () => {
  assert.throws(() => analyzeTimeline({ bins: null }), TypeError);
  assert.throws(() => analyzeTimeline({ bins: [], asOf: 'bad' }), TypeError);
});
test('temporal confirmation needs new measurements, then stabilizes', () => {
  const tracker = createStateTracker(), bins = high();
  assert.equal(stepAt(tracker, bins, 20).decisionPhase, 'accumulating');
  assert.equal(stepAt(tracker, bins, 21).state, 'UNKNOWN');
  const r = stepAt(tracker, bins, 22);
  assert.equal(r.state, 'COOKING'); assert.equal(r.confirmation.seconds, 120);
  assert.equal(r.modeConfirmed, false); assert.equal(r.confidence, null); assert.equal(r.eligibleForNotification, false);
});
test('replaying one snapshot cannot accelerate confirmation', () => {
  const tracker = createStateTracker(), bins = high();
  const first = stepAt(tracker, bins, 20);
  for (let i = 0; i < 100; i++) assert.deepEqual(stepAt(tracker, bins, 20), first);
  assert.equal(stepAt(tracker, bins, 21).state, 'UNKNOWN');
});
test('advancing only the wall clock cannot confirm cached measurements', () => {
  const tracker = createStateTracker(), bins = high().slice(0, 20);
  stepAt(tracker, bins, 20);
  const r = stepAt(tracker, bins, 20.25);
  assert.equal(r.state, 'UNKNOWN'); assert.ok(r.reasons.includes('no_new_power_evidence'));
});
test('quality failure immediately clears a stable candidate', () => {
  const tracker = createStateTracker(), bins = high();
  for (const m of [20, 21, 22]) stepAt(tracker, bins, m);
  const r = stepAt(tracker, bins, 23, { observation: { ...observationAt(at(23)), health: 'offline' } });
  assert.equal(r.state, 'UNKNOWN'); assert.equal(r.lastStableState, 'COOKING');
  assert.equal(explainDecision(r)[0].status, 'blocked');
  assert.equal(stepAt(tracker, bins, 24).decisionPhase, 'accumulating');
});
test('warming-to-cooking transition never keeps an old warming label', () => {
  const tracker = createStateTracker(), bins = makeBins(45, i => i < 35 ? 45 : 1050);
  for (let m = 25; m <= 35; m++) stepAt(tracker, bins, m);
  assert.equal(stepAt(tracker, bins, 36).state, 'UNKNOWN');
});
test('changed calibration or installation resets confirmation history', () => {
  for (const extras of [{ profile: { ...DEMO_PROFILE, baselineW: 1.9 } },
    { observation: { ...observationAt(at(22)), sessionId: 'replacement-plug' } }]) {
    const tracker = createStateTracker(), bins = high(); stepAt(tracker, bins, 20); stepAt(tracker, bins, 21);
    const r = stepAt(tracker, bins, 22, extras);
    assert.equal(r.state, 'UNKNOWN'); assert.equal(r.confirmation.seconds, 0);
  }
});
test('gaps in evaluation calls cannot satisfy continuous confirmation', () => {
  const tracker = createStateTracker(), bins = high(); stepAt(tracker, bins, 20);
  const r = stepAt(tracker, bins, 24);
  assert.equal(r.state, 'UNKNOWN'); assert.equal(r.confirmation.seconds, 0);
});
test('conflicting same-clock replay invalidates cached state', () => {
  const tracker = createStateTracker(), bins = high();
  for (const m of [20, 21, 22]) stepAt(tracker, bins, m);
  const r = stepAt(tracker, makeBins(30, () => 2), 22);
  assert.equal(r.state, 'UNKNOWN'); assert.ok(r.reasons.includes('conflicting_replay_at_same_time'));
});
test('tracker reset discards all household history', () => {
  const tracker = createStateTracker(), bins = high();
  for (const m of [20, 21, 22]) stepAt(tracker, bins, m);
  tracker.reset(); const r = stepAt(tracker, bins, 23);
  assert.equal(r.lastStableState, null); assert.equal(r.state, 'UNKNOWN');
});
test('same power signature cannot distinguish cooking from cleaning by assertion', () => {
  const r = check(high());
  assert.equal(r.state, 'COOKING'); assert.equal(r.modeConfirmed, false);
  assert.ok(r.reasons.includes('reheat_or_cleaning_not_excluded'));
});

const truth = (patch = {}) => ({ id: 'truth-1', deviceKey: 'A', sessionId: 'test-day', start: at(0), end: at(10),
  state: 'COOKING', source: 'device_display', evidenceId: 'observer-log-1', ...patch });
const prediction = (patch = {}) => ({ id: 'prediction-1', deviceKey: 'A', sessionId: 'test-day',
  start: at(0), end: at(10), availableAt: at(0), state: 'COOKING', profileId: 'frozen-test-profile', ...patch });
const evaluate = patch => evaluateHoldout({ profileId: 'frozen-test-profile', truth: [truth()], predictions: [prediction()], ...patch });

test('held-out scoring counts missing predictions as abstentions', () => {
  const r = evaluate({ predictions: [prediction({ end: at(5) })] });
  assert.equal(r.decisionCoverage, 0.5); assert.equal(r.correctDecisionFractionAllLabeledTime, 0.5);
  assert.equal(r.selectiveAccuracy, 1); assert.equal(r.predictionMissingSeconds, 300);
});
test('duplicate truth is not additional validation data', () => {
  assert.throws(() => evaluate({ truth: [truth(), truth()] }), /duplicate/);
  assert.throws(() => evaluate({ truth: [truth(), truth({ id: 'truth-2' })] }), /Overlapping/);
});
test('overlapping predictions are rejected', () => {
  assert.throws(() => evaluate({ predictions: [prediction(), prediction({ id: 'prediction-2', start: at(5) })] }), /Overlapping/);
});
test('predictions cannot see future data', () => {
  assert.throws(() => evaluate({ predictions: [prediction({ availableAt: at(1) })] }), /future leakage/);
});
test('different model versions cannot be silently mixed in holdout evaluation', () => {
  assert.throws(() => evaluate({ predictions: [prediction({ profileId: 'retuned-after-test' })] }), /frozen/);
});
test('power-derived color labels cannot become independent ground truth', () => {
  assert.throws(() => evaluate({ truth: [truth({ source: 'power_graph_red' })] }), /independent/);
});
test('missing predictions for another device are not borrowed', () => {
  const r = evaluate({ predictions: [prediction({ deviceKey: 'B' })] });
  assert.equal(r.decisionCoverage, 0); assert.equal(r.selectiveAccuracy, null);
});
test('cleaning/reheat OTHER remains a cooking false positive', () => {
  const r = evaluate({ truth: [truth({ state: 'OTHER' })] });
  assert.equal(r.perState.COOKING.precision, 0); assert.equal(r.outOfScopeFalseDecisionSeconds, 600);
});
test('all UNKNOWN cannot look like perfect classification', () => {
  const r = evaluate({ predictions: [] });
  assert.equal(r.correctDecisionFractionAllLabeledTime, 0); assert.equal(r.selectiveAccuracy, null);
});
test('temporal holdout rejects future or overlapping calibration', () => {
  assert.throws(() => evaluate({ training: [truth({ id: 'fit-1', sessionId: 'train-day' })] }), /leakage/);
});
test('unseen-device holdout excludes the training device', () => {
  const train = truth({ id: 'fit-1', start: at(-20), end: at(-10), sessionId: 'train-day' });
  assert.throws(() => evaluate({ split: 'unseen_device', training: [train] }), /leakage/);
  assert.equal(evaluate({ split: 'temporal', training: [train] }).labeledSessions, 1);
});
test('same clock across distinct devices counts distinct sessions only', () => {
  const r = evaluate({ truth: [truth(), truth({ id: 'truth-B', deviceKey: 'B' })] });
  assert.equal(r.independentDevices, 2); assert.equal(r.labeledSessions, 2);
  assert.equal(r.uncertainty, null); assert.equal(r.productionValidated, false);
});
test('seeded perturbations far from boundaries preserve synthetic candidates', () => {
  let seed = 42; const rnd = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let i = 0; i < 50; i++) {
    assert.equal(check(makeBins(30, () => 1000 + 50 * rnd())).state, 'COOKING');
    assert.equal(check(makeBins(50, () => 1 + rnd())).state, 'OFF');
    assert.equal(check(makeBins(30, () => 40 + 10 * rnd())).state, 'WARMING');
  }
});
