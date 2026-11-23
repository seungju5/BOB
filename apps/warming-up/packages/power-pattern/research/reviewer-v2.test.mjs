/** Independent adversarial checks, authored without changing implementation.
 * All data are synthetic. Passing checks are not field accuracy measurements.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPower, DEMO_PROFILE, parseTimestamp } from './prism.mjs';
import { createStateTracker, explainDecision } from './tracker.mjs';
import { evaluateHoldout } from './validation.mjs';
import { makeBins, demoInput, observationAt, at } from './fixtures.mjs';

const high = makeBins(40, () => 1050);
const step = (tracker, minute, bins = high, extras = {}) => tracker.step(demoInput(
  bins.filter(b => parseTimestamp(b.end) <= parseTimestamp(at(minute))),
  { asOf: at(minute), ...extras }));
const safety = result => {
  assert.equal(result.modeConfirmed, false);
  assert.equal(result.confidence, null);
  assert.equal(result.eligibleForNotification, false);
};

test('review: returned evidence mutation cannot corrupt cached tracker decisions', () => {
  const t = createStateTracker();
  step(t, 20); step(t, 21);
  const original = step(t, 22), expected = structuredClone(original);
  original.state = 'OFF';
  original.features.short.highSeconds = 0;
  original.confirmation.seconds = 99999;
  original.reasons.push('fabricated');
  assert.deepEqual(step(t, 22), expected);
});

test('review: out-of-order result cannot restore a formerly cached stable result', () => {
  const t = createStateTracker();
  step(t, 20); step(t, 21); assert.equal(step(t, 22).state, 'COOKING');
  assert.equal(step(t, 21).state, 'UNKNOWN');
  assert.equal(step(t, 22).state, 'UNKNOWN');
  assert.equal(step(t, 23).decisionPhase, 'accumulating');
});

test('review: switching devices cannot inherit the previous household confirmation', () => {
  const t = createStateTracker(); step(t, 20); step(t, 21); step(t, 22);
  const profile = { ...DEMO_PROFILE, id: 'device-B-demo', deviceKey: 'B' };
  const bins = high.map(b => ({ ...b, deviceKey: 'B' }));
  const result = step(t, 23, bins, { profile });
  assert.equal(result.state, 'UNKNOWN');
  assert.equal(result.lastStableState, null);
  assert.equal(result.confirmation.seconds, 0);
});

test('review: in-place profile mutation resets pending calibration history', () => {
  const t = createStateTracker(), profile = { ...DEMO_PROFILE };
  step(t, 20, high, { profile }); step(t, 21, high, { profile });
  profile.measurementErrorW = 2;
  const result = step(t, 22, high, { profile });
  assert.equal(result.state, 'UNKNOWN');
  assert.equal(result.confirmation.seconds, 0);
});

test('review: harmless cached polling does not erase valid pending evidence', () => {
  const bins = Array.from({ length: 180 }, (_, i) => ({
    deviceKey: DEMO_PROFILE.deviceKey, start: at(i / 6), end: at((i + 1) / 6),
    meanW: 1050, maxW: 1050, unit: 'W', complete: true,
  }));
  const t = createStateTracker();
  assert.equal(step(t, 20, bins).state, 'UNKNOWN');
  const cached = step(t, 20.05, bins);
  assert.equal(cached.state, 'UNKNOWN');
  assert.ok(cached.reasons.includes('no_new_power_evidence'));
  step(t, 21, bins); step(t, 21.05, bins);
  const result = step(t, 22, bins);
  assert.equal(result.state, 'COOKING');
  assert.equal(result.confirmation.seconds, 120);
});

test('review: a data-quality failure, unlike cached polling, clears pending evidence', () => {
  const t = createStateTracker(); step(t, 20); step(t, 21);
  const obs = { ...observationAt(at(22)), filtered: true };
  const failed = step(t, 22, high, { observation: obs });
  assert.equal(failed.state, 'UNKNOWN');
  assert.equal(explainDecision(failed)[0].status, 'blocked');
  assert.equal(step(t, 23).confirmation.seconds, 0);
});

test('review: empty input after stable heat never retains current cooking', () => {
  const t = createStateTracker(); step(t, 20); step(t, 21); step(t, 22);
  const r = step(t, 23, []);
  assert.equal(r.state, 'UNKNOWN');
  assert.equal(r.lastStableState, 'COOKING');
  safety(r);
});

test('review: zero measured watts without switch evidence do not prove supply cut', () => {
  const r = classifyPower(demoInput(makeBins(60, () => 0)));
  assert.equal(r.state, 'OFF'); assert.equal(r.supplyState, 'UNPROVEN');
  assert.equal(r.subtype, 'no_heat_standby_possible'); safety(r);
});

test('review: a freshly reported switch cut plus measured quiet is distinct from standby', () => {
  const bins = makeBins(60, () => 0), input = demoInput(bins);
  input.observation.switch = 'off'; input.observation.switchAt = at(60);
  const r = classifyPower(input);
  assert.equal(r.supplyState, 'CUT_REPORTED'); assert.equal(r.subtype, 'supply_cut_reported'); safety(r);
});

test('review: stale switch cut never promotes long zero-power data to proven cut', () => {
  const bins = makeBins(60, () => 0), input = demoInput(bins);
  input.observation.switch = 'off'; input.observation.switchAt = at(55);
  const r = classifyPower(input);
  assert.equal(r.state, 'UNKNOWN'); assert.equal(r.supplyState, 'UNPROVEN');
});

test('review: periodic quiet warming phase remains distinct from long standby', () => {
  const r = classifyPower(demoInput(makeBins(60, i => i % 7 === 0 ? 60 : 2)));
  assert.equal(r.state, 'WARMING');
  assert.ok(r.reasons.includes('heater_quiet_does_not_imply_off')); safety(r);
});

test('review: caller-provided cooking and cleaning tags cannot resolve identical waveforms', () => {
  const a = classifyPower({ ...demoInput(high), claimedMode: 'COOKING' });
  const b = classifyPower({ ...demoInput(high), claimedMode: 'CLEANING' });
  assert.deepEqual(a, b); safety(a);
  assert.ok(a.reasons.includes('reheat_or_cleaning_not_excluded'));
});

test('review: missing peak maximum and a weak mean cannot certify no heat', () => {
  const bins = makeBins(60, () => 2).map(({ maxW, ...b }) => b);
  assert.equal(classifyPower(demoInput(bins)).state, 'UNKNOWN');
});

test('review: energy disagreement prevents stable tracker output immediately', () => {
  const t = createStateTracker(); step(t, 20); step(t, 21); step(t, 22);
  const energyCheck = { deviceKey: DEMO_PROFILE.deviceKey, start: at(13), end: at(23),
    unit: 'Wh', deltaWh: 0, sameCounter: true, reset: false };
  const r = step(t, 23, high, { energyCheck });
  assert.equal(r.state, 'UNKNOWN');
  assert.ok(r.reasons.includes('power_energy_disagreement'));
});

const label = patch => ({ id: 'truth', deviceKey: 'A', sessionId: 's1', start: at(20), end: at(30),
  state: 'COOKING', source: 'device_display', evidenceId: 'independent-log', ...patch });
const pred = patch => ({ id: 'prediction', deviceKey: 'A', sessionId: 's1', start: at(20), end: at(30),
  availableAt: at(20), state: 'COOKING', profileId: 'fixed-profile', ...patch });
const evaluate = patch => evaluateHoldout({ truth: [label()], predictions: [pred()],
  profileId: 'fixed-profile', split: 'temporal', ...patch });
const train = patch => ({ id: 'fit', deviceKey: 'A', sessionId: 'training', start: at(0), end: at(10), ...patch });

test('review: relabeling the session cannot duplicate one physical device truth interval', () => {
  assert.throws(() => evaluate({ truth: [label(), label({ id: 'truth2', sessionId: 's2' })] }), /overlap/i);
});

test('review: relabeling the session cannot duplicate one physical device prediction interval', () => {
  assert.throws(() => evaluate({ predictions: [pred(), pred({ id: 'prediction2', sessionId: 's2' })] }), /overlap/i);
});

test('review: temporal holdout cannot use future training from another device', () => {
  assert.throws(() => evaluate({ training: [train({ deviceKey: 'B', start: at(50), end: at(60) })] }), /leakage/i);
});

test('review: a prediction cannot predate completion of training for its frozen profile', () => {
  assert.throws(() => evaluate({ training: [train()], predictions: [pred({ availableAt: at(5) })] }), /training|calibration|leakage/i);
});

test('review: nonoverlapping sessions of one device are counted without multiplying devices', () => {
  const r = evaluate({ truth: [label(), label({ id: 'truth2', sessionId: 's2', start: at(30), end: at(40) })],
    predictions: [pred(), pred({ id: 'prediction2', sessionId: 's2', start: at(30), end: at(40), availableAt: at(30) })] });
  assert.equal(r.labeledSeconds, 1200); assert.equal(r.independentDevices, 1); assert.equal(r.labeledSessions, 2);
  assert.equal(r.productionValidated, false); assert.equal(r.uncertainty, null);
});

test('review: another household can be evaluated at the same wall-clock interval', () => {
  const r = evaluate({ truth: [label(), label({ id: 'truth2', deviceKey: 'B' })] });
  assert.equal(r.labeledSeconds, 1200); assert.equal(r.independentDevices, 2);
  assert.equal(r.decisionCoverage, 0.5); assert.equal(r.predictionMissingSeconds, 600);
});

test('review: unheard-of modes remain in precision denominators', () => {
  const r = evaluate({ truth: [label({ state: 'OTHER' })] });
  assert.equal(r.perState.COOKING.precision, 0);
  assert.equal(r.outOfScopeFalseDecisionSeconds, 600);
  assert.equal(r.selectiveAccuracy, 0);
});

test('review: partial abstention never hides behind selective accuracy', () => {
  const r = evaluate({ predictions: [pred({ end: at(21) })] });
  assert.equal(r.selectiveAccuracy, 1);
  assert.equal(r.decisionCoverage, 0.1);
  assert.equal(r.correctDecisionFractionAllLabeledTime, 0.1);
  assert.equal(r.perState.COOKING.recallIncludingAbstentions, 0.1);
});

test('review: exact-boundary train/test separation is accepted with causal availability', () => {
  const r = evaluate({ training: [train({ end: at(20) })] });
  assert.equal(r.labeledSeconds, 600); assert.equal(r.productionValidated, false);
});

test('review: invalid independent-label provenance rejects the whole evaluation', () => {
  assert.throws(() => evaluate({ truth: [label({ source: 'red_line_in_power_graph' })] }), /independent/i);
});

test('review: uncertainty remains unclaimed even for a perfect synthetic holdout', () => {
  const r = evaluate({});
  assert.equal(r.selectiveAccuracy, 1); assert.equal(r.productionValidated, false);
  assert.equal(r.uncertainty, null); assert.match(r.note, /no 100% guarantee/);
});
