import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScenarios, chartConfig } from './scenarios.mjs';
const examples = buildScenarios();
const get = id => examples.find(s => s.id === id);
test('all visible frames disclose synthetic origin and unverified actual mode', () => {
  assert.equal(examples.length, 8);
  for (const s of examples) for (const f of s.frames) {
    assert.equal(s.dataOrigin, 'SYNTHETIC_NOT_HOUSEHOLD_DATA');
    assert.equal(f.confidence, null); assert.equal(f.modeConfirmed, false); assert.equal(f.eligibleForNotification, false);
  }
});
test('visible cycle demonstrates candidates and immediate transition abstention', () => {
  const s = get('cycle');
  assert.equal(s.frames[25 - 1].state, 'COOKING');
  assert.equal(s.frames[31 - 1].state, 'UNKNOWN');
  assert.equal(s.frames[50 - 1].state, 'WARMING');
  assert.equal(s.frames[120 - 1].state, 'OFF');
});
test('visible quiet warming retains context at measured 2W', () => {
  const f = get('quiet-warming').frames[39]; assert.equal(f.meanW, 2); assert.equal(f.state, 'WARMING');
});
test('missing graph values remain null and missing frames cannot become OFF', () => {
  const s = get('missing');
  for (let i = 20; i < 36; i++) {
    assert.equal(s.rows[i].power, null); assert.equal(s.rows[i].lower, null); assert.equal(s.rows[i].upper, null);
    assert.equal(s.frames[i].meanW, null); assert.equal(s.frames[i].state, 'UNKNOWN');
  }
});
test('threshold, short burst and contradictory signals never become confident states', () => {
  for (const id of ['boundary', 'short-burst', 'conflict']) assert.ok(get(id).frames.every(f => f.state === 'UNKNOWN'));
});
test('chart cursor state changes do not mutate shared configs or source frames', () => {
  const s = get('cycle'); const a = chartConfig(s, 1), b = chartConfig(s, 120);
  assert.equal(a.spec.referenceLines[0].value, 1); assert.equal(b.spec.referenceLines[0].value, 120);
  assert.equal(s.selected, 50);
});
