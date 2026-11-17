import { classifyPower, parseTimestamp, VERSION } from './prism.mjs';

/**
 * Causal confirmation of research candidates, never a calibrated posterior.
 * One tracker per device/session. Any unknown/conflict clears the current state.
 * The previous state is exposed only as history, never silently held as current.
 */
export function createStateTracker() {
  let identity = null, lastClock = null, lastObserved = null;
  let pending = null, previousOutput = null, previousSignature = null, lastStableState = null;
  const clear = () => { pending = null; };
  return {
    reset() {
      identity = lastClock = lastObserved = pending = previousOutput = previousSignature = lastStableState = null;
    },
    step(input) {
      const raw = classifyPower(input);
      const now = parseTimestamp(raw.asOf), observed = parseTimestamp(raw.observedThrough);
      const key = JSON.stringify([input?.profile, input?.observation?.sessionId ?? null]);
      const signature = JSON.stringify(raw);
      const resetForIdentity = identity !== key;
      if (resetForIdentity) {
        identity = key; lastClock = lastObserved = previousOutput = previousSignature = lastStableState = null; clear();
      }
      const output = { ...raw, version: VERSION, candidateState: raw.state,
        decisionPhase: 'unresolved', lastStableState,
        confirmation: { seconds: 0, requiredSeconds: input?.profile?.transitionConfirmSeconds ?? null },
        reasons: [...raw.reasons] };
      const unresolved = (reason, resetPending = true) => {
        if (resetPending) clear();
        output.state = 'UNKNOWN'; output.subtype = null; output.supplyState = 'UNPROVEN';
        if (reason) output.reasons.push(reason);
        output.decisionPhase = 'unresolved';
        return output;
      };
      if (!Number.isFinite(now)) return unresolved('invalid_tracker_clock');
      if (lastClock !== null && now < lastClock) {
        previousSignature = previousOutput = null;
        return unresolved('out_of_order_tracker_clock');
      }
      if (lastClock === now) {
        if (previousSignature === signature && previousOutput) return structuredClone(previousOutput);
        // A conflicting replay invalidates the cached result too.
        const result = unresolved('conflicting_replay_at_same_time');
        previousSignature = signature; previousOutput = structuredClone(result);
        return result;
      }
      const gapLimit = input?.profile?.maxBinSeconds ?? 0;
      const clockGap = lastClock !== null && now - lastClock > gapLimit;
      lastClock = now;
      if (raw.state === 'UNKNOWN' || !Number.isFinite(observed))
        unresolved(Number.isFinite(observed) && lastObserved !== null && observed <= lastObserved ? 'no_new_power_evidence' : null);
      else if (lastObserved !== null && observed <= lastObserved) {
        const samePending = pending?.key === `${raw.state}:${raw.subtype}` && observed === lastObserved;
        unresolved('no_new_power_evidence', !samePending);
        if (samePending) output.confirmation.seconds = observed - pending.since;
      }
      else {
        if (clockGap || (lastObserved !== null && observed - lastObserved > gapLimit)) {
          clear(); output.reasons.push('confirmation_restarted_after_gap');
        }
        const candidateKey = `${raw.state}:${raw.subtype}`;
        if (!pending || pending.key !== candidateKey) pending = { key: candidateKey, since: observed };
        const seconds = observed - pending.since;
        // OFF already requires a contiguous measured quiet span in classifyPower.
        const required = raw.state === 'OFF' ? 0 : input.profile.transitionConfirmSeconds;
        output.confirmation = { seconds, requiredSeconds: required };
        if (seconds >= required) {
          output.decisionPhase = 'stable_candidate'; lastStableState = raw.state;
          output.reasons.push('candidate_persisted_on_new_measurements');
        } else {
          output.state = 'UNKNOWN'; output.subtype = null; output.supplyState = 'UNPROVEN';
          output.decisionPhase = 'accumulating'; output.reasons.push('awaiting_transition_confirmation');
        }
      }
      if (Number.isFinite(observed)) lastObserved = observed;
      previousSignature = signature; previousOutput = structuredClone(output);
      return output;
    },
  };
}

/** Explain actual gates; these values are not synthetic confidence percentages. */
export function explainDecision(result) {
  const reasons = result.reasons ?? [];
  const qualityFailures = [
    'invalid_', 'missing_', 'stale_', 'offline_', 'filtered_', 'future_', 'overlapping_',
    'mixed_', 'interval_observation_', 'dedicated_', 'profile_', 'insufficient_recent_',
    'peak_unknown_', 'power_energy_', 'switch_off_power_', 'out_of_order_', 'conflicting_',
    'no_new_power_',
  ];
  const failedQuality = reasons.some(r => qualityFailures.some(prefix => r.startsWith(prefix)));
  const candidate = result.candidateState ?? result.state;
  return [
    { key: 'quality', label: '자료 확인', status: failedQuality ? 'blocked' : result.features?.short ? 'passed' : 'pending' },
    { key: 'pattern', label: '크기·지속·반복', status: failedQuality ? 'blocked' : candidate === 'UNKNOWN' ? 'pending' : 'passed' },
    { key: 'persistence', label: '새 측정으로 재확인', status: result.decisionPhase === 'stable_candidate' ? 'passed' : 'pending' },
    { key: 'mode', label: '실제 모드 검증', status: 'unverified' },
  ];
}
