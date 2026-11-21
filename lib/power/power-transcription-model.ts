/**
 * [EN] Data model for SmartThings power telemetry transcription and AI interpretation protocol.
 * [KR] SmartThings 밥솥 플러그 전력 사용량 데이터 전사 및 AI 해석 프로토콜을 정의하는 모델(Model)입니다.
 */

export type CookerPowerState = "COOKING" | "WARMING" | "STANDBY" | "OFF";

export interface PowerSample {
  time: string; // "16:28"
  iso: string;
  watts: number;
  voltage: number;
  currentA: number;
  state: CookerPowerState;
  stateLabel: string;
}

export interface InterpretationStep {
  stepNumber: number;
  stageName: string;
  title: string;
  description: string;
  ruleExplanation: string;
  detectedValue: string;
  verdictBadge: string;
  status: "verified" | "active" | "standby";
}

export interface PowerDailySummary {
  date: string; // YYYY-MM-DD
  deviceId: string;
  deviceLabel: string;
  locationRoom: string;
  currentWatts: number;
  peakWatts: number;
  totalKWh: number;
  cookCount: number;
  cookDurationMinutes: number;
  warmDurationMinutes: number;
  standbyDurationMinutes: number;
  confidenceRate: number;
  samples: PowerSample[];
  protocolSteps: InterpretationStep[];
}

/**
 * [EN] Classifies raw power in Watts into cooking, warming, or standby states.
 * [KR] 실측 와트(W) 값을 취사, 보온, 대기 상태로 판별합니다.
 */
export function classifyPowerState(watts: number): { state: CookerPowerState; label: string } {
  if (watts >= 700) {
    return { state: "COOKING", label: "고온 취사 (가열)" };
  }
  if (watts >= 20 && watts < 70) {
    return { state: "WARMING", label: "온도 유지 (보온)" };
  }
  if (watts > 0 && watts < 20) {
    return { state: "STANDBY", label: "절전 대기 (표시창)" };
  }
  return { state: "OFF", label: "전원 꺼짐 / 미측정" };
}
