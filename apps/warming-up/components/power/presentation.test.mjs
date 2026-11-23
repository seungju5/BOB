import test from 'node:test';
import assert from 'node:assert/strict';
import {observedSegments, displayNumber} from './presentation.ts';

const row = (minute, power, extra = {}) => ({minute, power, lower:power, upper:power, ...extra});

test('missing power makes a visible break while a measured zero stays in the waveform', () => {
  const input = [row(1,0),row(2,45),row(3,null),row(4,62),row(5,0)];
  assert.deepEqual(observedSegments(input).map(segment => segment.map(point => point.power)), [[0,45],[62,0]]);
  assert.equal(input[2].power,null);
});

test('a missing original interval cannot be crossed even without an inserted null marker', () => {
  const input = [row(2,80,{startMinute:0,endMinute:2}),row(8,20,{startMinute:6,endMinute:8})];
  assert.equal(observedSegments(input).length,2);
  assert.deepEqual(observedSegments([row(1,null),row(2,null)]),[]);
});

test('unknown and non-finite values are never formatted as zero', () => {
  assert.equal(displayNumber(null),'—');
  assert.equal(displayNumber(undefined),'—');
  assert.equal(displayNumber(Number.NaN),'—');
  assert.equal(displayNumber(0),'0');
});
