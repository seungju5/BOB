export type PowerState = 'COOKING' | 'WARMING' | 'OFF' | 'UNKNOWN';
export type DecisionPhase = 'unresolved' | 'accumulating' | 'stable_candidate';
export type JsonValue = string | number | boolean | null | JsonValue[] | {[key: string]: JsonValue};
export interface PowerTrace {
  key: 'quality' | 'pattern' | 'persistence' | 'mode';
  label: string;
  status: 'blocked' | 'passed' | 'pending' | 'unverified';
}
export interface PowerRow {
  minute: number;
  power: number | null;
  lower: number | null;
  upper: number | null;
  /** Present for imports: complete original intervals; never fabricated minute bins. */
  startMinute?: number;
  endMinute?: number;
  start?: string;
  end?: string;
  complete?: boolean;
}
export interface PowerFrame {
  minute: number;
  state: PowerState;
  subtype: string | null;
  candidateState: PowerState;
  phase: DecisionPhase;
  meanW: number | null;
  lowerW: number | null;
  upperW: number | null;
  coverage: number | null;
  highMinutes: number | null;
  excessWh: number | null;
  runs: number | null;
  quietMinutes: number;
  confirmationSeconds: number;
  reasons: string[];
  trace: PowerTrace[];
  detail: string;
  modeConfirmed: false;
  confidence: null;
  eligibleForNotification: false;
}
export interface PowerScenario {
  id: string;
  name: string;
  minutes: number;
  selected: number;
  maxW: number;
  rows: PowerRow[];
  frames: PowerFrame[];
  dataOrigin: 'SYNTHETIC_NOT_HOUSEHOLD_DATA';
}
export interface PowerResult {
  version: string;
  asOf: string | null;
  profileId: string | null;
  state: PowerState;
  subtype: string | null;
  interpretation: 'research_candidate_only';
  confidence: null;
  modeConfirmed: false;
  supplyState: 'UNPROVEN' | 'CUT_REPORTED';
  observedThrough: string | null;
  eligibleForNotification: false;
  reasons: string[];
  features: {[key: string]: JsonValue};
  candidateState: PowerState;
  decisionPhase: DecisionPhase;
  lastStableState: PowerState | null;
  confirmation: {seconds: number; requiredSeconds: number | null};
}
export interface ImportedPowerRecording {
  id: 'imported';
  name: string;
  minutes: number;
  selected: number;
  maxW: number;
  rows: PowerRow[];
  /** One analysis at the supplied asOf. This is not a replay or a confirmed mode. */
  frames: [PowerFrame];
  dataOrigin: 'USER_SUPPLIED_LOCAL_ONLY';
  source: 'imported';
  label: string;
  privacy: 'local-only';
  analysisMode: 'single-window';
  result: PowerResult;
  metadata: {
    /** Preserved locally for audit; no upload, storage or altered measurements. */
    bins: {[key: string]: JsonValue}[];
    asOf: string;
    timeOrigin: string;
    profile: {[key: string]: JsonValue};
    observation: {[key: string]: JsonValue};
    energyCheck?: {[key: string]: JsonValue};
  };
}
export type PowerRecording = PowerScenario | ImportedPowerRecording;
export const MAX_INPUT_BYTES: 2097152;
export const MAX_INPUT_BINS: 2000;
export const VERSION: 'prism-research-0.2';
export class PowerInputError extends Error { readonly code: string; }
/** Fresh synthetic recordings, calculated by the unchanged research implementation. */
export function getPowerScenarios(): PowerScenario[];
/** Throws PowerInputError with a safe Korean message; never uploads or stores the text. */
export function parsePowerInput(text: string): ImportedPowerRecording;
/** Fully synthetic original-contract JSON, suitable for a local download. */
export const sampleJSON: string;
