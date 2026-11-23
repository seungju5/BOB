import { STATES, parseTimestamp } from './prism.mjs';
const truthStates = ['COOKING', 'WARMING', 'OFF', 'OTHER'];
const sources = ['device_display', 'independent_observer_log'];
const group = row => JSON.stringify([row.deviceKey, row.sessionId]);
const seconds = value => {
  const t = parseTimestamp(value);
  if (!Number.isFinite(t)) throw new TypeError('Invalid evaluation timestamp.');
  return t;
};

function normalize(rows, kind) {
  if (!Array.isArray(rows)) throw new TypeError(`${kind} must be an array.`);
  const ids = new Set();
  const normalized = rows.map(row => {
    if (!row || typeof row !== 'object' || [row.deviceKey, row.sessionId, row.id].some(x => typeof x !== 'string' || !x.trim()) || ids.has(row.id))
      throw new TypeError(`Missing or duplicate ${kind} identity.`);
    ids.add(row.id);
    const start = seconds(row.start), end = seconds(row.end);
    if (end <= start) throw new TypeError('Evaluation intervals must have positive duration.');
    if (kind === 'truth' && (!truthStates.includes(row.state) || !sources.includes(row.source) || !row.evidenceId))
      throw new TypeError('Ground truth needs an independent mode observation, not a power-derived label.');
    if (kind === 'predictions' && (!STATES.includes(row.state) || seconds(row.availableAt) > start))
      throw new TypeError('Predictions must be available by interval start; no future leakage.');
    return { ...row, start, end, key: group(row) };
  }).sort((a, b) => a.deviceKey.localeCompare(b.deviceKey) || a.start - b.start);
  for (let i = 1; i < normalized.length; i++) {
    const a = normalized[i - 1], b = normalized[i];
    if (a.deviceKey === b.deviceKey && b.start < a.end) throw new TypeError(`Overlapping ${kind} intervals on one physical device.`);
  }
  return normalized;
}

/**
 * Honest, duration-weighted holdout scoring. Missing predictions count as UNKNOWN.
 * Exact duplicate/overlap rejects prevent pseudo-replication; seconds are NOT trials.
 * OTHER labels (reheat, cleaning etc.) stay in false-positive denominators.
 * This validates metadata contracts, not the authenticity of supplied ground truth.
 */
export function evaluateHoldout({ truth, predictions, training = [], split = 'temporal', profileId } = {}) {
  if (!profileId || !['temporal', 'unseen_device'].includes(split)) throw new TypeError('Frozen profile and split required.');
  const labels = normalize(truth, 'truth'), predicted = normalize(predictions, 'predictions');
  if (predicted.some(p => p.profileId !== profileId)) throw new TypeError('Prediction profile differs from frozen evaluation profile.');
  const fitted = normalize(training, 'training');
  if (!labels.length) throw new TypeError('No independent held-out labels.');
  const fitCompleted = fitted.length ? Math.max(...fitted.map(r => r.end)) : -Infinity;
  if (predicted.some(p => seconds(p.availableAt) < fitCompleted))
    throw new TypeError('Training/test leakage: predictions predate completed calibration.');
  for (const test of labels) for (const train of fitted) {
    if ((split === 'unseen_device' && test.deviceKey === train.deviceKey) ||
        (split === 'temporal' && train.end > test.start))
      throw new TypeError('Training/test leakage: same device or future/overlapping training data.');
  }
  const matrixSeconds = Object.fromEntries(truthStates.map(s => [s, Object.fromEntries(STATES.map(p => [p, 0]))]));
  let labeled = 0, missing = 0;
  for (const label of labels) {
    let covered = 0;
    for (const p of predicted.filter(x => x.key === label.key)) {
      const duration = Math.min(label.end, p.end) - Math.max(label.start, p.start);
      if (duration <= 0) continue;
      matrixSeconds[label.state][p.state] += duration; covered += duration;
    }
    const uncovered = label.end - label.start - covered;
    matrixSeconds[label.state].UNKNOWN += uncovered;
    labeled += label.end - label.start; missing += uncovered;
  }
  const perState = {};
  let correct = 0, accepted = 0;
  for (const state of STATES.slice(0, 3)) {
    const truthSeconds = Object.values(matrixSeconds[state]).reduce((a, b) => a + b, 0);
    const predictedSeconds = truthStates.reduce((sum, actual) => sum + matrixSeconds[actual][state], 0);
    const hit = matrixSeconds[state][state]; correct += hit; accepted += predictedSeconds;
    perState[state] = { precision: predictedSeconds ? hit / predictedSeconds : null,
      recallIncludingAbstentions: truthSeconds ? hit / truthSeconds : null, truthSeconds, predictedSeconds };
  }
  return { profileId, split, matrixSeconds, perState, labeledSeconds: labeled,
    predictionMissingSeconds: missing, decisionCoverage: accepted / labeled,
    correctDecisionFractionAllLabeledTime: correct / labeled,
    selectiveAccuracy: accepted ? correct / accepted : null,
    warmingMisclassifiedOffSeconds: matrixSeconds.WARMING.OFF,
    outOfScopeFalseDecisionSeconds: STATES.slice(0, 3).reduce((n, s) => n + matrixSeconds.OTHER[s], 0),
    independentDevices: new Set(labels.map(x => x.deviceKey)).size,
    labeledSessions: new Set(labels.map(x => x.key)).size,
    uncertainty: null, productionValidated: false,
    note: 'Time samples are correlated. Report device/session counts, coverage and independent prospective tests; no 100% guarantee.',
  };
}
