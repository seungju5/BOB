import {VERSION, DEMO_PROFILE, parseTimestamp} from './research/prism.mjs';
import {createStateTracker, explainDecision} from './research/tracker.mjs';
import {buildScenarios, describe} from './research/scenarios.mjs';
import {makeBins, demoInput} from './research/fixtures.mjs';

export {VERSION};
export const MAX_INPUT_BYTES = 2 * 1024 * 1024;
export const MAX_INPUT_BINS = 2000;
const numericProfileKeys = Object.keys(DEMO_PROFILE).filter(key => typeof DEMO_PROFILE[key] === 'number');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const number = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
const identity = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 256;
const timestamp = value => typeof value === 'string' && Number.isFinite(parseTimestamp(value));

export class PowerInputError extends Error {
  constructor(code, message) { super(message); this.name = 'PowerInputError'; this.code = code; }
}
function fail(code, message) { throw new PowerInputError(code, message); }

/** Guard untrusted JSON before the unchanged research code traverses it. */
function inspectJson(value) {
  const stack = [{value, depth: 0}]; let visited = 0;
  while (stack.length) {
    const item = stack.pop();
    if (++visited > 50000 || item.depth > 12) fail('complex_input', '자료 구조가 너무 복잡해요. 예제와 같은 한 구간의 자료를 넣어 주세요.');
    if (typeof item.value === 'number' && !Number.isFinite(item.value)) fail('invalid_number', '숫자 범위를 확인해 주세요. 계산할 수 없는 값이 있어요.');
    if (item.value !== null && typeof item.value === 'object') {
      for (const [key, child] of Object.entries(item.value)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) fail('invalid_metadata', '지원하지 않는 자료 항목이 있어요. 예제 형식을 확인해 주세요.');
        stack.push({value: child, depth: item.depth + 1});
      }
    }
  }
}
function checkInput(input) {
  if (!object(input)) fail('invalid_input', 'JSON 객체 한 개를 넣어 주세요. 숫자나 목록만으로는 분석할 수 없어요.');
  if (Object.hasOwn(input, 'samples')) fail('replay_not_supported', '이번 화면은 한 시점의 구간 자료를 분석해요. samples 목록 대신 예제처럼 한 개의 자료를 넣어 주세요.');
  if (Object.keys(input).some(key => !['bins', 'asOf', 'profile', 'observation', 'energyCheck', 'dataOrigin'].includes(key)))
    fail('unsupported_shape', '구간 자료 형식이 달라요. SmartThings 순간값을 평균값으로 바꾸지 말고 예제의 입력 형식을 확인해 주세요.');
  if (!Array.isArray(input.bins) || !timestamp(input.asOf) || !object(input.profile) || !object(input.observation))
    fail('malformed_recording', 'bins, 시간대가 있는 asOf, profile, observation 항목을 확인해 주세요.');
  if (input.bins.length > MAX_INPUT_BINS) fail('too_many_bins', '한 번에 최대 2,000개 구간까지 분석할 수 있어요. 자료를 나눠 주세요.');
  const p = input.profile;
  if (!['id', 'deviceKey', 'provenance'].every(key => identity(p[key])) || !numericProfileKeys.every(key => number(p[key])))
    fail('malformed_profile', '기기별 기준값이 빠졌거나 숫자 형식이 달라요. 예제의 profile 구조를 확인해 주세요. 합성 예시 기준은 실측 보정값이 아니에요.');
  if (Object.hasOwn(input, 'energyCheck') && !object(input.energyCheck)) fail('malformed_energy', 'energyCheck는 같은 계량기의 구간 전력량 정보여야 해요.');
  for (const b of input.bins) {
    if (!object(b) || !identity(b.deviceKey) || !timestamp(b.start) || !timestamp(b.end) ||
        !number(b.meanW) || typeof b.unit !== 'string' || typeof b.complete !== 'boolean' ||
        (Object.hasOwn(b, 'maxW') && !number(b.maxW)))
      fail('malformed_bin', '각 구간의 기기, 시작·끝 시각, 평균 전력, 단위, 전체 관측 여부를 확인해 주세요. 순간값으로 빈 항목을 채우면 안 돼요.');
  }
}

function displayRows(input, result) {
  const asOf = parseTimestamp(input.asOf);
  const starts = input.bins.map(b => parseTimestamp(b.start)).filter(t => t <= asOf);
  const beginning = starts.length ? Math.min(...starts) : asOf;
  const minutes = (asOf - beginning) / 60;
  // Do not draw invalid/future/overlapping input as a verified waveform. The
  // original classifier's reasons remain visible in the returned result.
  const blocked = !Object.hasOwn(result.features, 'duplicatesRemoved') ||
    result.reasons.some(reason => /^(?:invalid_|profile_|future_|overlapping_|mixed_)/.test(reason)) ||
    input.observation.mode !== 'verified_interval_mean' || input.observation.filtered !== false;
  if (blocked) return {rows: [], beginning, minutes};
  const sorted = [...input.bins].sort((a, b) => parseTimestamp(a.start) - parseTimestamp(b.start) || parseTimestamp(a.end) - parseTimestamp(b.end));
  const rows = []; let previous = null, cursor = beginning;
  const gap = (start, end) => rows.push({minute: (end - beginning) / 60, startMinute: (start - beginning) / 60,
    endMinute: (end - beginning) / 60, start: new Date(start * 1000).toISOString(), end: new Date(end * 1000).toISOString(),
    complete: false, power: null, lower: null, upper: null});
  for (const b of sorted) {
    // This matches the original classifier's duplicate equality. No interpolation,
    // resampling or inference from a missing maxW/complete flag is performed.
    const start = parseTimestamp(b.start), end = parseTimestamp(b.end);
    const current = {start, end, meanW: b.meanW, maxW: b.maxW, complete: b.complete};
    if (previous && Object.keys(current).every(key => previous[key] === current[key])) continue;
    if (start > cursor) gap(cursor, start);
    const error = input.profile.measurementErrorW + input.profile.measurementErrorFraction * b.meanW;
    rows.push({minute: (end - beginning) / 60, startMinute: (start - beginning) / 60, endMinute: (end - beginning) / 60,
      start: b.start, end: b.end, complete: b.complete, power: b.complete ? b.meanW : null,
      lower: b.complete ? Math.max(0, b.meanW - error) : null, upper: b.complete ? b.meanW + error : null});
    previous = current; cursor = end;
  }
  if (cursor < asOf) gap(cursor, asOf);
  return {rows, beginning, minutes};
}
function frameFor(result, minute, rows) {
  const row = [...rows].reverse().find(row => row.minute === minute && row.complete);
  return {minute, state: result.state, subtype: result.subtype, candidateState: result.candidateState,
    phase: result.decisionPhase, meanW: row?.power ?? null,
    lowerW: row ? result.features.latest?.lowerMeanW ?? null : null,
    upperW: row ? result.features.latest?.upperMeanW ?? null : null,
    coverage: result.features.short?.coverage ?? null,
    highMinutes: result.features.short ? result.features.short.highSeconds / 60 : null,
    excessWh: result.features.short?.lowerExcessWh ?? null, runs: result.features.warm?.runCount ?? null,
    quietMinutes: (result.features.quietSeconds ?? result.features.warm?.quietSeconds ?? 0) / 60,
    confirmationSeconds: result.confirmation.seconds, reasons: [...result.reasons], trace: explainDecision(result),
    detail: describe(result), modeConfirmed: result.modeConfirmed, confidence: result.confidence,
    eligibleForNotification: result.eligibleForNotification};
}

/** Fresh computed synthetic examples; no reference to household profiles. */
export function getPowerScenarios() { return buildScenarios(); }

/** Single-window inspection only. No network, persistence or production effects. */
export function parsePowerInput(text) {
  if (typeof text !== 'string') fail('invalid_input', 'JSON 글자로 된 자료를 넣어 주세요.');
  if (text.length > MAX_INPUT_BYTES || new TextEncoder().encode(text).byteLength > MAX_INPUT_BYTES)
    fail('too_large', '파일이 너무 커요. 2 MiB 이하의 JSON 자료를 넣어 주세요.');
  let input;
  try { input = JSON.parse(text); } catch { fail('malformed_json', 'JSON을 읽을 수 없어요. 괄호와 따옴표를 확인하거나 예제 파일을 사용해 주세요.'); }
  inspectJson(input); checkInput(input);
  // Exactly one causal step: a long historical window does not manufacture the
  // subsequent independent observations needed for transition confirmation.
  const result = createStateTracker().step(input);
  const {rows, beginning, minutes} = displayRows(input, result);
  const frame = frameFor(result, minutes, rows);
  // Older downloads have no source tag. Recognize the original file, not every
  // recording that happens to use the example's calibration profile.
  const legacySample = input.profile.deviceKey === 'synthetic-cooker' && JSON.stringify(input) === legacySampleJSON;
  const synthetic = input.dataOrigin === 'SYNTHETIC_NOT_HOUSEHOLD_DATA' || legacySample;
  const dataOrigin = synthetic ? 'SYNTHETIC_NOT_HOUSEHOLD_DATA' : 'USER_SUPPLIED_LOCAL_ONLY';
  return {id: 'imported', name: '불러온 구간 기록', minutes, selected: minutes,
    maxW: Math.max(1, ...rows.map(row => row.upper ?? 0)), rows, frames: [frame],
    dataOrigin, source: 'imported',
    label: synthetic ? '가져온 합성 예시' : '가져온 파일 · 출처 미확인',
    privacy: 'local-only', analysisMode: 'single-window', result,
    metadata: {...input, dataOrigin, timeOrigin: new Date(beginning * 1000).toISOString()}};
}

// Entirely invented example. It does not contain a household name, appliance
// model, account identifier, secret or a calibrated device profile.
const exampleInput = demoInput(makeBins(30, () => 1050));
const legacySampleJSON = JSON.stringify(exampleInput);
export const sampleJSON = JSON.stringify({dataOrigin: 'SYNTHETIC_NOT_HOUSEHOLD_DATA', ...exampleInput}, null, 2);
