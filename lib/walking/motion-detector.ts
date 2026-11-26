type Axes = { x: number | null; y: number | null; z: number | null };
export type MotionSample = { kind: 'gravity' | 'linear'; x: number; y: number; z: number };

function usable(axes: Axes | null): axes is { x: number; y: number; z: number } {
  return !!axes && Number.isFinite(axes.x) && Number.isFinite(axes.y) && Number.isFinite(axes.z);
}

export function readMotion(event: Pick<DeviceMotionEvent, 'acceleration' | 'accelerationIncludingGravity'>): MotionSample | null {
  const gravity = event.accelerationIncludingGravity;
  if (usable(gravity) && Math.hypot(gravity.x, gravity.y, gravity.z) > 1) {
    return { kind: 'gravity', x: gravity.x, y: gravity.y, z: gravity.z };
  }
  const linear = event.acceleration;
  if (usable(linear)) return { kind: 'linear', x: linear.x, y: linear.y, z: linear.z };
  return null;
}

// Times are in milliseconds and accelerations in m/s². Count the first two
// peaks retrospectively once a third establishes a walking rhythm.
export class MotionStepDetector {
  private kind?: MotionSample['kind'];
  private previousTime = -Infinity;
  private filtered = 0;
  private baseline = 0;
  private armed = true;
  private lastPeak = -Infinity;
  private pending = 0;
  private previousGap = 0;
  private linearAxis: 'x' | 'y' | 'z' = 'z';

  sample(time: number, sample: MotionSample): number {
    if (!Number.isFinite(time) || time <= this.previousTime) return 0;
    const gap = time - this.previousTime;
    this.previousTime = time;
    const reset = gap > 450 || sample.kind !== this.kind;
    if (sample.kind === 'linear') {
      // Keep the sign on a dominant axis. Rectifying a linear sine wave would
      // turn the upward and downward phases of one step into two peaks.
      let axis = this.linearAxis;
      for (const k of ['x', 'y', 'z'] as const) {
        if (Math.abs(sample[k]) > Math.max(0.8, Math.abs(sample[axis]) * 1.8)) axis = k;
      }
      this.linearAxis = axis;
    }
    const value = sample.kind === 'gravity' ? Math.hypot(sample.x, sample.y, sample.z) : sample[this.linearAxis];
    if (reset) {
      this.kind = sample.kind;
      this.filtered = this.baseline = value;
      this.armed = true;
      this.lastPeak = -Infinity;
      this.pending = this.previousGap = 0;
      return 0;
    }
    this.filtered += (value - this.filtered) * (1 - Math.exp(-gap / 55));
    this.baseline += (this.filtered - this.baseline) * (1 - Math.exp(-gap / 800));
    const signal = this.filtered - this.baseline;
    if (signal < 0.05) this.armed = true;
    if (!this.armed || signal < 0.82) return 0;
    this.armed = false;
    const interval = time - this.lastPeak;
    if (interval < 310) return 0;
    this.lastPeak = time;
    if (interval > 1650) {
      this.pending = 1;
      this.previousGap = 0;
      return 0;
    }
    if (this.pending === 2 && Math.max(interval, this.previousGap) > 1.7 * Math.min(interval, this.previousGap)) {
      this.previousGap = interval;
      return 0;
    }
    this.previousGap = interval;
    if (this.pending === 1) { this.pending = 2; return 0; }
    if (this.pending === 2) { this.pending = 0; return 3; }
    return 1;
  }
}
