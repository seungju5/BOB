import type {PowerRow, PowerState} from '@/packages/power-pattern/index.mjs';

export const stateLabels: Record<PowerState, string> = {
  COOKING: '취사 패턴 후보',
  WARMING: '보온 패턴 후보',
  OFF: '가열 멈춤 후보',
  UNKNOWN: '판단 보류',
};

export function displayNumber(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('ko-KR', {maximumFractionDigits: digits});
}

/** Missing bins split the line; an absent observation is never a zero-watt point. */
export function observedSegments(rows: PowerRow[]): PowerRow[][] {
  const segments: PowerRow[][] = [];
  let current: PowerRow[] = [];
  for (const row of rows) {
    if (row.power == null || !Number.isFinite(row.power)) {
      if (current.length) segments.push(current);
      current = [];
      continue;
    }
    const previous = current.at(-1);
    if (previous?.endMinute != null && row.startMinute != null && row.startMinute > previous.endMinute) {
      if (current.length) segments.push(current);
      current = [];
    }
    current.push(row);
  }
  if (current.length) segments.push(current);
  return segments;
}
