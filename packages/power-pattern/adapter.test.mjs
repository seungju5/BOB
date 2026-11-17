import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {getPowerScenarios, parsePowerInput, sampleJSON, PowerInputError, MAX_INPUT_BYTES, MAX_INPUT_BINS} from './index.mjs';
import {buildScenarios} from './research/scenarios.mjs';
import {createStateTracker} from './research/tracker.mjs';
import {makeBins, demoInput, at} from './research/fixtures.mjs';

const parse = input => parsePowerInput(JSON.stringify(input));
const example = () => JSON.parse(sampleJSON);
const fails = (fn, code) => assert.throws(fn, error => error instanceof PowerInputError && error.code === code && /[가-힣]/.test(error.message));

test('five algorithms and five inherited test suites retain their recorded source SHA256 bytes', async () => {
  const manifest = JSON.parse(await readFile(new URL('./provenance.json', import.meta.url), 'utf8'));
  assert.equal(manifest.version, 'prism-research-0.2'); assert.equal(manifest.files.length, 10);
  for (const item of manifest.files) {
    const bytes = await readFile(new URL('./' + item.file, import.meta.url));
    assert.equal(bytes.length, item.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256);
  }
});
test('synthetic scenarios are original computed outputs, freshly returned with research guards', () => {
  const actual = getPowerScenarios(); assert.deepEqual(actual, buildScenarios()); assert.equal(actual.length, 8);
  for (const scenario of actual) for (const frame of scenario.frames) {
    assert.equal(scenario.dataOrigin, 'SYNTHETIC_NOT_HOUSEHOLD_DATA');
    assert.equal(frame.modeConfirmed, false); assert.equal(frame.eligibleForNotification, false); assert.equal(frame.confidence, null);
  }
  actual[0].frames[0].state = 'INVALID'; assert.notEqual(getPowerScenarios()[0].frames[0].state, 'INVALID');
});
test('synthetic download has original input contract, no family data or device model', () => {
  const input = example(); assert.equal(input.profile.deviceKey, 'synthetic-cooker'); assert.equal(input.profile.provenance, 'synthetic_example_not_fitted');
  assert.equal(input.bins.length, 30); assert.deepEqual(Object.keys(input).sort(), ['asOf', 'bins', 'observation', 'profile']);
  assert.doesNotMatch(sampleJSON, /CRP-|덕훈|정숙|email|household|token|secret|password/i);
});
test('one imported window is one real causal step; long cooking evidence cannot fabricate later confirmation', () => {
  const input = example(), recording = parse(input);
  assert.deepEqual(recording.result, createStateTracker().step(input));
  assert.equal(recording.source, 'imported'); assert.equal(recording.privacy, 'local-only'); assert.equal(recording.analysisMode, 'single-window');
  assert.equal(recording.frames.length, 1); assert.equal(recording.frames[0].candidateState, 'COOKING');
  assert.equal(recording.frames[0].state, 'UNKNOWN'); assert.equal(recording.frames[0].phase, 'accumulating');
  assert.equal(recording.frames[0].confirmationSeconds, 0); assert.equal(recording.result.confirmation.requiredSeconds, 120);
  assert.ok(recording.frames[0].reasons.includes('awaiting_transition_confirmation')); assert.equal(recording.frames[0].confidence, null);
  assert.equal(recording.frames[0].trace.find(row => row.key === 'mode').status, 'unverified');
});
test('full local metadata, energy veto reasons and evidence features are preserved', () => {
  const input = example(); input.profile.annotation = {source: 'independent-test'}; input.bins[0].id = 'observed-interval-1'; input.observation.sessionId = 'local-session';
  input.energyCheck = {deviceKey: input.profile.deviceKey, start: input.bins[0].start, end: input.asOf, unit: 'Wh', sameCounter: true, reset: false, deltaWh: 1};
  const recording = parse(input);
  assert.deepEqual(recording.metadata.bins, input.bins); assert.deepEqual(recording.metadata.profile, input.profile);
  assert.deepEqual(recording.metadata.observation, input.observation); assert.deepEqual(recording.metadata.energyCheck, input.energyCheck);
  assert.ok(recording.result.reasons.includes('power_energy_disagreement')); assert.deepEqual(recording.frames[0].reasons, recording.result.reasons);
  assert.ok(Object.hasOwn(recording.result.features, 'energyResidualWh'));
});
test('malformed JSON and primitives fail with safe Korean errors without echoing source', () => {
  for (const text of ['null', '1', 'true', '[]', '"private-input"']) fails(() => parsePowerInput(text), 'invalid_input');
  fails(() => parsePowerInput(undefined), 'invalid_input'); fails(() => parsePowerInput('{"sensitive":"'), 'malformed_json');
  try { parsePowerInput('{"sensitive":"'); } catch (error) { assert.doesNotMatch(error.message, /sensitive/); }
});
test('UTF8 byte size is bounded at 2MiB before parsing, including multibyte text', () => {
  fails(() => parsePowerInput(' '.repeat(MAX_INPUT_BYTES + 1)), 'too_large');
  fails(() => parsePowerInput('가'.repeat(Math.floor(MAX_INPUT_BYTES / 3) + 1)), 'too_large');
  const padded = sampleJSON + ' '.repeat(MAX_INPUT_BYTES - new TextEncoder().encode(sampleJSON).length);
  assert.equal(parsePowerInput(padded).frames.length, 1);
});
test('2,000 original bins are accepted and 2,001 rejected without truncation', () => {
  assert.equal(parse(demoInput(makeBins(MAX_INPUT_BINS, () => 2))).metadata.bins.length, MAX_INPUT_BINS);
  fails(() => parse(demoInput(makeBins(MAX_INPUT_BINS + 1, () => 2))), 'too_many_bins');
});
test('replay and raw SmartThings instantaneous events are never coerced into complete interval means', () => {
  fails(() => parse({samples: [example()]}), 'replay_not_supported');
  fails(() => parse({powerMeter: {power: {value: 1200, unit: 'W'}}}), 'unsupported_shape');
  const input = example(); input.observation.mode = 'instantaneous_change_events';
  const recording = parse(input); assert.equal(recording.result.state, 'UNKNOWN');
  assert.ok(recording.result.reasons.includes('interval_observation_not_verified')); assert.deepEqual(recording.rows, []);
});
test('missing completeness and arithmetic overflow are rejected, while absent maxW remains absent', () => {
  const missing = example(); delete missing.bins[0].complete; fails(() => parse(missing), 'malformed_bin');
  fails(() => parsePowerInput(sampleJSON.replace('1050', '1e309')), 'invalid_number');
  const noPeak = example(); noPeak.bins.forEach(bin => { delete bin.maxW; });
  const recording = parse(noPeak); assert.ok(recording.metadata.bins.every(bin => !Object.hasOwn(bin, 'maxW')));
  assert.equal(recording.result.features.latest.maxW, null);
});
test('structural profile and timestamp errors are rejected without selecting new default thresholds', () => {
  const incomplete = example(); delete incomplete.profile.cookHighW; fails(() => parse(incomplete), 'malformed_profile');
  const invalidTime = example(); invalidTime.asOf = '2026-02-30T00:00:00Z'; fails(() => parse(invalidTime), 'malformed_recording');
  const noZone = example(); noZone.bins[0].start = '2026-11-17T00:00:00'; fails(() => parse(noZone), 'malformed_bin');
  const wrongOrder = example(); wrongOrder.profile.heatFloorW = wrongOrder.profile.cookHighW;
  assert.ok(parse(wrongOrder).result.reasons.includes('invalid_profile_power_order'));
});
test('future and overlapping intervals retain classifier abstention reasons and are not plotted as valid data', () => {
  const future = example(); future.bins.push({...future.bins.at(-1), start: at(30), end: at(31)});
  const a = parse(future); assert.ok(a.result.reasons.includes('future_data')); assert.equal(a.result.state, 'UNKNOWN'); assert.deepEqual(a.rows, []);
  const overlap = example(); overlap.bins.push({...overlap.bins[0], meanW: 1040});
  const b = parse(overlap); assert.ok(b.result.reasons.includes('overlapping_or_conflicting_bins')); assert.deepEqual(b.rows, []);
});
test('duplicate intervals including equivalent UTC offsets display only once and keep duplicate evidence', () => {
  const input = example(); input.bins.unshift({...input.bins[0], start: '2026-11-17T00:00:00+09:00', end: '2026-11-17T00:01:00+09:00'});
  const recording = parse(input); assert.equal(recording.rows.length, 30); assert.equal(recording.result.features.duplicatesRemoved, 1);
  assert.equal(recording.metadata.bins.length, 31);
});
test('gaps and incomplete intervals stay null, not zero, and original subminute timing is preserved', () => {
  const input = example(); input.bins.splice(10, 1); input.bins[12].complete = false;
  const recording = parse(input); assert.ok(recording.rows.some(row => row.startMinute === 10 && row.endMinute === 11 && row.power === null));
  assert.ok(recording.rows.some(row => row.complete === false && row.start === input.bins[12].start && row.power === null));
  const subminute = example(); subminute.bins[0].start = '2026-11-16T15:00:30.000Z';
  const partial = parse(subminute); assert.equal(partial.rows[0].endMinute - partial.rows[0].startMinute, 0.5);
});
test('stale or offline health never becomes OFF, meal evidence, live observations or notification approval', () => {
  const input = demoInput(makeBins(60, () => 2)); input.observation.health = 'offline';
  const result = parse(input); assert.equal(result.result.state, 'UNKNOWN'); assert.equal(result.frames[0].meanW, null);
  assert.equal(result.result.modeConfirmed, false); assert.equal(result.result.eligibleForNotification, false);
  assert.ok(result.result.reasons.includes('offline_or_stale_health')); assert.deepEqual(result.rows, []);
});
test('old last measurement does not appear as a new measurement at asOf; empty input is distinct from zero power', () => {
  const old = example(); old.asOf = at(31); old.observation.healthAt = at(31);
  const result = parse(old); assert.equal(result.frames[0].meanW, null); assert.equal(result.rows.at(-1).power, null);
  const empty = parse(demoInput([], {asOf: at(30)})); assert.equal(empty.result.state, 'UNKNOWN'); assert.equal(empty.frames[0].meanW, null);
  const zero = parse(demoInput(makeBins(60, () => 0))); assert.equal(zero.frames[0].meanW, 0); assert.equal(zero.result.state, 'OFF');
  assert.equal(zero.result.modeConfirmed, false); assert.equal(zero.result.eligibleForNotification, false);
});
test('adversarial nested metadata and prototype keys are rejected before the tracker serializes input', () => {
  const input = example(); let nested = {}; input.profile.extra = nested; for (let i = 0; i < 15; i++) nested = nested.next = {};
  fails(() => parse(input), 'complex_input');
  fails(() => parsePowerInput(sampleJSON.replace('"profile": {', '"profile": {"__proto__":{"polluted":true},')), 'invalid_metadata');
  assert.equal({}.polluted, undefined);
});
