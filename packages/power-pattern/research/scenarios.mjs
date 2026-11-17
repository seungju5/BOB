import { DEMO_PROFILE, parseTimestamp } from './prism.mjs';
import { createStateTracker, explainDecision } from './tracker.mjs';
import { makeBins, at, observationAt } from './fixtures.mjs';

export const SCENARIOS = [
  { id: 'cycle', name: '취사 → 보온 → 가열 멈춤', minutes: 120, selected: 50, maxW: 1400,
    bins: () => makeBins(120, i => i < 10 ? 2 : i < 30 ? 1050 : i < 70 && (i - 30) % 8 === 0 ? 80 : 2) },
  { id: 'quiet-warming', name: '보온 중 2W 휴지기', minutes: 60, selected: 40, maxW: 160,
    bins: () => makeBins(60, i => i % 8 === 0 ? 65 : 2) },
  { id: 'missing', name: '기록 끊김 · Off와 구분', minutes: 60, selected: 27, maxW: 160,
    bins: () => makeBins(60, i => i % 8 === 0 ? 65 : 2).filter((_, i) => i < 20 || i >= 36),
    observation: m => ({ ...observationAt(at(m)), health: m > 20 && m <= 36 ? 'offline' : 'online' }) },
  { id: 'boundary', name: '700W 경계 · 계측 오차', minutes: 40, selected: 25, maxW: 1000,
    bins: () => makeBins(40, () => 700) },
  { id: 'cut', name: '플러그 Off 보고 + 저전력', minutes: 60, selected: 30, maxW: 160,
    bins: () => makeBins(60, i => i < 20 ? (i % 8 === 0 ? 65 : 2) : 0),
    observation: m => ({ ...observationAt(at(m)), ...(m >= 21 ? { switch: 'off', switchAt: at(m) } : {}) }) },
  { id: 'ambiguous-mode', name: '같은 고출력 · 취사 또는 세척', minutes: 40, selected: 25, maxW: 1400,
    bins: () => makeBins(40, () => 1050) },
  { id: 'short-burst', name: '2분 고출력 · 취사 확정 금지', minutes: 50, selected: 22, maxW: 1400,
    bins: () => makeBins(50, i => i === 20 || i === 21 ? 1200 : 2) },
  { id: 'conflict', name: '모순 · Off 보고와 1,050W', minutes: 40, selected: 25, maxW: 1400,
    bins: () => makeBins(40, () => 1050),
    observation: m => ({ ...observationAt(at(m)), switch: 'off', switchAt: at(m) }) },
];

export function describe(result) {
  const has = x => result.reasons.includes(x);
  if (has('switch_off_power_conflict')) return 'Off 보고와 높은 전력이 충돌하여 판단을 멈춥니다.';
  if (has('offline_or_stale_health') || has('missing_or_stale_power')) return '측정이 끊겼습니다. 빈 구간을 0W나 Off로 바꾸지 않습니다.';
  if (has('insufficient_recent_coverage')) return '최근 10분의 관측 시간이 부족하여 판단을 보류합니다.';
  if (has('cooking_threshold_within_meter_error')) return '계측 오차 범위가 고출력 기준을 걸쳐 판단을 보류합니다.';
  if (has('high_heat_ended_transition_unresolved')) return '고출력이 끝났습니다. 다음 상태를 확인할 때까지 보류합니다.';
  if (result.decisionPhase === 'accumulating') return '같은 후보가 새로운 측정에서도 이어지는지 확인 중입니다.';
  if (result.state === 'COOKING') return '지속 고출력 패턴입니다. 취사·재가열·세척 구분은 아직 미검증입니다.';
  if (result.state === 'WARMING') return '반복 가열과 휴지기가 이어집니다. 낮은 순간 전력만으로 Off라 하지 않습니다.';
  if (result.subtype === 'supply_cut_reported') return '플러그 Off 보고와 연속 저전력이 함께 확인됐습니다.';
  if (result.state === 'OFF') return '오랫동안 가열이 없었습니다. 공급 차단과 대기는 구별하지 못합니다.';
  return '패턴이나 지속시간이 부족하여 세 상태 중 하나를 고르지 않습니다.';
}

export function buildScenarios() {
  return SCENARIOS.map(s => {
    const bins = s.bins(), tracker = createStateTracker();
    const frames = Array.from({ length: s.minutes }, (_, i) => {
      const minute = i + 1, asOf = at(minute);
      const observed = bins.filter(b => parseTimestamp(b.end) <= parseTimestamp(asOf));
      const result = tracker.step({ bins: observed, profile: DEMO_PROFILE, asOf,
        observation: s.observation?.(minute) ?? observationAt(asOf) });
      const exact = bins.find(b => b.end === asOf);
      return { minute, state: result.state, subtype: result.subtype,
        candidateState: result.candidateState, phase: result.decisionPhase,
        meanW: exact?.meanW ?? null, lowerW: result.features.latest?.lowerMeanW ?? null,
        upperW: result.features.latest?.upperMeanW ?? null,
        coverage: result.features.short?.coverage ?? null,
        highMinutes: result.features.short ? result.features.short.highSeconds / 60 : null,
        excessWh: result.features.short?.lowerExcessWh ?? null,
        runs: result.features.warm?.runCount ?? null,
        quietMinutes: (result.features.quietSeconds ?? result.features.warm?.quietSeconds ?? 0) / 60,
        confirmationSeconds: result.confirmation.seconds,
        reasons: result.reasons, trace: explainDecision(result), detail: describe(result),
        modeConfirmed: result.modeConfirmed, confidence: result.confidence,
        eligibleForNotification: result.eligibleForNotification };
    });
    const rows = Array.from({ length: s.minutes }, (_, i) => {
      const b = bins.find(x => x.end === at(i + 1));
      const error = b ? DEMO_PROFILE.measurementErrorW + b.meanW * DEMO_PROFILE.measurementErrorFraction : null;
      return { minute: i + 1, power: b?.meanW ?? null,
        lower: b ? Math.max(0, b.meanW - error) : null, upper: b ? b.meanW + error : null };
    });
    return { id: s.id, name: s.name, minutes: s.minutes, selected: s.selected,
      maxW: s.maxW, rows, frames, dataOrigin: 'SYNTHETIC_NOT_HOUSEHOLD_DATA' };
  });
}

export function chartConfig(s, selected = s.selected) {
  return { id: `prism-${s.id}`, title: '전력의 크기와 시간',
    description: '합성 예시 · 세로선까지의 측정만 판단에 사용', height: 280,
    spec: { type: 'line', x: 'minute', y: 'power', xLabel: '경과 시간 (분)', yLabel: '전력 (W)',
      xDomain: [0, s.minutes], yDomain: [0, s.maxW], showLegend: false,
      uncertainty: { lower: 'lower', upper: 'upper', style: 'band', label: '가정한 계측 오차 범위 · 신뢰구간 아님' },
      referenceLines: [{ axis: 'x', value: selected, label: '관측 시점' },
        ...(s.maxW >= 1000 ? [{ axis: 'y', value: DEMO_PROFILE.cookHighW, label: '예시 고출력 기준' }] : [])] }, rows: s.rows };
}
