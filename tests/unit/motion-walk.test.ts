import { describe, expect, it } from 'vitest';
import { MotionStepDetector, readMotion, type MotionSample } from '@/lib/walking/motion-detector';

function walk(cycles: number, period: number, hz: number, axis: 'x' | 'y' | 'z', kind: MotionSample['kind']) {
  const detector = new MotionStepDetector();
  let steps = 0;
  const interval = 1000 / hz;
  for (let time = 0; time < 1000 + cycles * period; time += interval) {
    const phase = Math.max(0, time - 1000) / period;
    const sample: MotionSample = { kind, x: 0, y: 0, z: 0 };
    sample[axis] = (kind === 'gravity' ? 9.81 : 0) + 2.5 * Math.sin(phase * 2 * Math.PI);
    steps += detector.sample(time, sample);
  }
  return steps;
}

describe('walking with the phone motion sensor', () => {
  it('recognizes slow and brisk walks at mobile sampling rates and different phone orientations', () => {
    for (const hz of [20, 30, 60]) {
      for (const period of [410, 600, 1100]) {
        for (const axis of ['x','y','z'] as const) {
          expect(walk(12, period, hz, axis, 'gravity')).toBe(12);
          expect(walk(12, period, hz, axis, 'linear')).toBe(12);
        }
      }
    }
  });

  it('ignores an isolated jolt, then credits the first few walking steps together', () => {
    expect(walk(1, 500, 60, 'z', 'gravity')).toBe(0);
    expect(walk(2, 500, 60, 'z', 'gravity')).toBe(0);
    expect(walk(3, 500, 60, 'z', 'gravity')).toBe(3);
  });

  it('does not count stillness, rotation, bad clocks or separated bursts as a walk', () => {
    const detector = new MotionStepDetector();
    let steps = 0;
    for (let i = 0; i < 1200; i++) {
      const t = i * 16;
      const mag = 9.81 + .14 * Math.sin(i) + (i % 250 === 4 ? 3 : 0);
      const sample: MotionSample = { kind:'gravity', x:mag * Math.sin(i / 50), y:0, z:mag * Math.cos(i / 50) };
      steps += detector.sample(t, sample) + detector.sample(t - 2, sample) + detector.sample(NaN, sample);
    }
    expect(steps).toBe(0);
    for (let burst = 0; burst < 5; burst++) {
      for (let i = 0; i < 60; i++) {
        steps += detector.sample(30_000 + burst * 3000 + i * 16, { kind:'gravity', x:0, y:0, z:9.81 + 2.5*Math.sin(i*16/500*2*Math.PI) });
      }
    }
    expect(steps).toBe(0);
  });

  it('requires complete sensor vectors and can use gravity or linear acceleration', () => {
    const missing = { x:null, y:null, z:null };
    expect(readMotion({ acceleration:null, accelerationIncludingGravity:missing })).toBeNull();
    expect(readMotion({ acceleration:{ x:0,y:NaN,z:1 }, accelerationIncludingGravity:null })).toBeNull();
    const linear = { x:0,y:0,z:0 };
    expect(readMotion({ acceleration:linear, accelerationIncludingGravity:missing })).toEqual({ kind:'linear', ...linear });
    const gravity = { x:9.81,y:0,z:0 };
    expect(readMotion({ acceleration:linear, accelerationIncludingGravity:gravity })).toEqual({ kind:'gravity', ...gravity });
  });
});
