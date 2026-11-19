/**
 * [EN] Controller hook managing power data transcription, interpretation steps, and clean UI toggle state.
 * [KR] 밥솥 전력 데이터 전사, 단계별 AI 해석 프로토콜, 점진적 UI 개폐 상태를 관리하는 컨트롤러(Controller)입니다.
 */

import { useCallback, useMemo, useState } from "react";
import { useApp } from "@/lib/data/useApp";
import { DEFAULT_SMARTTHINGS_PROFILE } from "@/lib/smartthings/account-model";
import {
  classifyPowerState,
  type InterpretationStep,
  type PowerDailySummary,
  type PowerSample,
} from "./power-transcription-model";

export function usePowerTranscriptionController(selectedDate?: string) {
  const { view } = useApp();
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"protocol" | "telemetry" | "json">("protocol");
  const [copied, setCopied] = useState(false);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const deviceId = view?.plug.deviceId || DEFAULT_SMARTTHINGS_PROFILE.deviceId;
  const deviceLabel = DEFAULT_SMARTTHINGS_PROFILE.deviceLabel;
  const locationRoom = `${DEFAULT_SMARTTHINGS_PROFILE.locationName} · ${DEFAULT_SMARTTHINGS_PROFILE.roomName}`;

  const summary = useMemo<PowerDailySummary>(() => {
    const targetDate = selectedDate || "오늘 (실시간)";

    // [EN] Standardized timeline of representative power segments throughout the day
    // [KR] 하루 동안의 대표적인 밥솥 전력 측정 구간 전사 데이터
    const samples: PowerSample[] = [
      { time: "07:38", iso: "2026-11-18T07:38:00+09:00", watts: 840, voltage: 220.1, currentA: 3.82, ...classifyPowerState(840), stateLabel: "아침 고온 취사 시작" },
      { time: "07:55", iso: "2026-11-18T07:55:00+09:00", watts: 852, voltage: 219.8, currentA: 3.88, ...classifyPowerState(852), stateLabel: "가열 유지 (뜸 들이기)" },
      { time: "08:12", iso: "2026-11-18T08:12:00+09:00", watts: 38, voltage: 220.0, currentA: 0.17, ...classifyPowerState(38), stateLabel: "아침 보온 모드 전환" },
      { time: "11:42", iso: "2026-11-18T11:42:00+09:00", watts: 1.2, voltage: 220.4, currentA: 0.01, ...classifyPowerState(1.2), stateLabel: "뚜껑 열림 및 점심 식사" },
      { time: "14:10", iso: "2026-11-18T14:10:00+09:00", watts: 0.8, voltage: 220.5, currentA: 0.01, ...classifyPowerState(0.8), stateLabel: "초절전 대기 상태" },
      { time: "16:28", iso: "2026-11-18T16:28:00+09:00", watts: 845, voltage: 220.2, currentA: 3.84, ...classifyPowerState(845), stateLabel: "오후 밥솥 취사 시작 (실시간)" },
      { time: "16:45", iso: "2026-11-18T16:45:00+09:00", watts: 848, voltage: 220.0, currentA: 3.85, ...classifyPowerState(848), stateLabel: "최대 가열 압력 구간" },
      { time: "17:03", iso: "2026-11-18T17:03:00+09:00", watts: 39, voltage: 220.1, currentA: 0.18, ...classifyPowerState(39), stateLabel: "취사 완료 및 보온 전환" },
      { time: "17:40", iso: "2026-11-18T17:40:00+09:00", watts: 36, voltage: 220.2, currentA: 0.16, ...classifyPowerState(36), stateLabel: "따뜻한 밥 보온 유지" },
    ];

    // [EN] Step-by-step interpretation protocol explaining the transformation of raw watts into care insights
    // [KR] 원시 전력(W)을 안부 및 산책 하트로 변환하는 단계별 AI 해석 프로토콜
    const protocolSteps: InterpretationStep[] = [
      {
        stepNumber: 1,
        stageName: "텔레메트리 수신",
        title: "SmartThings 전력 패킷 실시간 수신",
        description: "사용자 삼성 계정에 연동된 클라우드 밥솥 플러그로부터 1분 단위 순시 전력(W)과 누적 전력량(kWh)을 안전하게 수신합니다.",
        ruleExplanation: "규격: IEEE 802.15.4 / SmartThings Cloud API, 파라미터화된 안전 Firestore 적재",
        detectedValue: "845 W · 220.2 V · 1.25 kWh",
        verdictBadge: "수신 정상 (Verified)",
        status: "verified",
      },
      {
        stepNumber: 2,
        stageName: "임계치 패턴 분류",
        title: "이중 임계치(Dual-Threshold) 가열 판정",
        description: "측정된 845 W는 가열 임계치(700 W)를 크게 상회하여 일반 대기나 보온이 아닌 순수 취사 가열 사이클로 분류됩니다.",
        ruleExplanation: "취사: ≥700W | 보온: 20~70W | 절전대기: <20W",
        detectedValue: "845 W > 700 W 임계치 돌파",
        verdictBadge: "취사(Cooking) 판정",
        status: "verified",
      },
      {
        stepNumber: 3,
        stageName: "지속시간 검증",
        title: "일시적 노이즈 및 타 기기 간섭 필터링",
        description: "순간적인 전자기기 기동 서지(Surge)와의 혼선을 방지하기 위해 최소 15분 이상 가열 지속 패턴을 검증합니다.",
        ruleExplanation: "검증 기준: 15분 이상 연속 가열 (실측 35분 지속)",
        detectedValue: "연속 35분 가열 유지 확인",
        verdictBadge: "사이클 유효성 확정",
        status: "verified",
      },
      {
        stepNumber: 4,
        stageName: "끼니 시간대 매핑",
        title: "가족 생활 패턴 기반 식사 소식 연동",
        description: "16:28 감지된 취사 이벤트를 가족 설정 생활 기준인 '오후/저녁 끼니 창(16:00~19:30)'과 대조하여 정상 식사 준비로 확정합니다.",
        ruleExplanation: "매핑 규칙: 16:00 ~ 19:30 구간 매칭",
        detectedValue: "16:28 취사 -> 저녁 식사 준비 판정",
        verdictBadge: "어르신 안부 확인",
        status: "verified",
      },
      {
        stepNumber: 5,
        stageName: "산책 하트 B안 연동",
        title: "오늘의 산책 첫 번째 하트(🍚 취사 소식) 자동 점등",
        description: "어르신의 식사 안부 확인 결과를 산책 하트 화면에 전달하여 첫 번째 하트를 자동으로 채우고 가족 응원 동기를 부여합니다.",
        ruleExplanation: "규칙: 당일 취사 1회 감지 시 1단계 하트(❤️) 즉시 지급",
        detectedValue: "취사 소식 하트 점등 완료",
        verdictBadge: "하트 B안 1단계 지급",
        status: "verified",
      },
    ];

    return {
      date: targetDate,
      deviceId,
      deviceLabel,
      locationRoom,
      currentWatts: 845,
      peakWatts: 852,
      totalKWh: 1.25,
      cookCount: 2,
      cookDurationMinutes: 69,
      warmDurationMinutes: 180,
      standbyDurationMinutes: 1191,
      confidenceRate: 99.4,
      samples,
      protocolSteps,
    };
  }, [deviceId, deviceLabel, locationRoom, selectedDate]);

  const copyJson = useCallback(() => {
    const rawPayload = {
      specVersion: "bapmunna-power-transcription-v2.1",
      exportedAt: new Date().toISOString(),
      device: {
        id: summary.deviceId,
        label: summary.deviceLabel,
        location: summary.locationRoom,
        capabilities: ["switch", "powerMeter", "energyMeter"],
      },
      metrics: {
        currentWatts: summary.currentWatts,
        peakWatts: summary.peakWatts,
        totalEnergyKWh: summary.totalKWh,
        confidencePercent: summary.confidenceRate,
      },
      samples: summary.samples,
      interpretation: summary.protocolSteps.map((step) => ({
        step: step.stepNumber,
        stage: step.stageName,
        verdict: step.verdictBadge,
        detected: step.detectedValue,
      })),
    };

    navigator.clipboard?.writeText(JSON.stringify(rawPayload, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [summary]);

  return {
    expanded,
    toggleExpanded,
    activeTab,
    setActiveTab,
    summary,
    copied,
    copyJson,
  };
}
