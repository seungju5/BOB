"use client";

/**
 * [EN] View component presenting power usage telemetry transcription and AI interpretation protocol.
 * [KR] 밥솥 전력 사용량 데이터 전사 및 단계별 AI 해석 프로토콜을 깔끔하게 보여주는 뷰(View) 컴포넌트입니다.
 */

import { useState } from "react";
import { IconCheck, IconInfo, IconPlug } from "@/components/icons";
import { usePowerTranscriptionController } from "@/lib/power/usePowerTranscriptionController";

export function PowerTranscriptionSection({ selectedDate }: { selectedDate?: string }) {
  const {
    expanded,
    toggleExpanded,
    activeTab,
    setActiveTab,
    summary,
    copied,
    copyJson,
  } = usePowerTranscriptionController(selectedDate);

  return (
    <section
      id="power-transcription"
      aria-label="밥솥 전력 데이터 전사 및 AI 해석 프로토콜"
      className="mt-6 rounded-[1.75rem] border border-line bg-paper p-5 shadow-xs transition-all"
    >
      {/* [EN] Clean, non-intrusive header with key summary badges */}
      {/* [KR] 유저가 번잡하지 않도록 핵심 지표만 담은 깔끔한 상단 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-butter-soft text-cocoa">
            <IconPlug className="h-4 w-4" />
          </span>
          <h2 className="text-[17px] font-extrabold text-cocoa">밥솥 전력 데이터 & AI 해석 과정</h2>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-sage px-3 py-1 text-[12px] font-bold text-cocoa">
          <IconCheck className="h-3.5 w-3.5" />
          해석 신뢰도 {summary.confidenceRate}%
        </span>
      </div>

      <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
        단순 식사 여부뿐 아니라, SmartThings 플러그의 실측 전력(W)과 AI 안부 판정 과정을 투명하게 확인할 수 있어요.
      </p>

      {/* [EN] Key metrics overview bar */}
      {/* [KR] 핵심 요약 뱃지 (실시간 전력, 누적 사용량, 기기 위치) */}
      <div className="mt-3.5 flex flex-wrap gap-2 text-[13px]">
        <span className="rounded-full bg-butter-soft/80 px-3 py-1 font-bold text-cocoa">
          실시간 ⚡ {summary.currentWatts} W (취사 중)
        </span>
        <span className="rounded-full bg-butter-soft/80 px-3 py-1 font-bold text-cocoa">
          누적 전력량 🔋 {summary.totalKWh} kWh
        </span>
        <span className="rounded-full bg-paper border border-line px-3 py-1 font-semibold text-cocoa/70">
          {summary.deviceLabel}
        </span>
      </div>

      {/* [EN] Progressive disclosure button: Keeps UI clutter-free */}
      {/* [KR] 점진적 공개 버튼: 평소에는 복잡하지 않게 접어두고 원할 때만 확장 */}
      <button
        type="button"
        onClick={toggleExpanded}
        aria-expanded={expanded}
        className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-line bg-butter-soft/50 px-4 py-2.5 text-[15px] font-bold text-cocoa transition-colors hover:bg-butter-soft"
      >
        <span>{expanded ? "상세 전사 데이터 및 해석 과정 접기" : "상세 전력 전사 데이터 & AI 해석 과정 보기"}</span>
        <span className="text-sm font-normal">{expanded ? "▴" : "▾"}</span>
      </button>

      {/* [EN] Expanded detailed view containing interpretation protocol, telemetry logs, and raw JSON */}
      {/* [KR] 확장 시 표시되는 3가지 탭 (해석 프로토콜, 전력 전사 데이터, 원문 JSON) */}
      {expanded ? (
        <div className="mt-5 border-t border-line/60 pt-4">
          <div className="flex gap-1.5 rounded-2xl bg-butter-soft/40 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("protocol")}
              className={`flex-1 rounded-xl py-2 text-[13px] font-bold transition-colors ${
                activeTab === "protocol" ? "bg-paper text-cocoa shadow-xs" : "text-cocoa/60"
              }`}
            >
              🔍 AI 해석 프로토콜
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("telemetry")}
              className={`flex-1 rounded-xl py-2 text-[13px] font-bold transition-colors ${
                activeTab === "telemetry" ? "bg-paper text-cocoa shadow-xs" : "text-cocoa/60"
              }`}
            >
              📊 전력 전사 데이터
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("json")}
              className={`flex-1 rounded-xl py-2 text-[13px] font-bold transition-colors ${
                activeTab === "json" ? "bg-paper text-cocoa shadow-xs" : "text-cocoa/60"
              }`}
            >
              📜 규격 JSON
            </button>
          </div>

          {/* 탭 1: AI 해석 프로토콜 */}
          {activeTab === "protocol" ? (
            <div className="mt-4 flex flex-col gap-3">
              {summary.protocolSteps.map((step) => (
                <div
                  key={step.stepNumber}
                  className="rounded-2xl border border-line/70 bg-cream/50 p-4 transition-all"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-extrabold text-butter-deep">
                      STEP {step.stepNumber} · {step.stageName}
                    </span>
                    <span className="rounded-full bg-sage px-2.5 py-0.5 text-[11px] font-bold text-cocoa">
                      {step.verdictBadge}
                    </span>
                  </div>
                  <h3 className="mt-1 text-[15px] font-extrabold text-cocoa">{step.title}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-cocoa/80">{step.description}</p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-xl bg-paper/80 px-3 py-2 text-[12px]">
                    <span className="font-semibold text-cocoa/60">판정 기준:</span>
                    <span className="font-mono text-cocoa/90">{step.ruleExplanation}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {/* 탭 2: 전력 사용량 전사 데이터 */}
          {activeTab === "telemetry" ? (
            <div className="mt-4">
              <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                <div className="rounded-2xl bg-cream/70 p-3">
                  <p className="text-[11px] font-semibold text-cocoa/60">최고 전력</p>
                  <p className="text-[18px] font-extrabold text-cocoa">{summary.peakWatts} W</p>
                </div>
                <div className="rounded-2xl bg-cream/70 p-3">
                  <p className="text-[11px] font-semibold text-cocoa/60">당일 전력량</p>
                  <p className="text-[18px] font-extrabold text-cocoa">{summary.totalKWh} kWh</p>
                </div>
                <div className="rounded-2xl bg-cream/70 p-3">
                  <p className="text-[11px] font-semibold text-cocoa/60">취사 시간</p>
                  <p className="text-[18px] font-extrabold text-cocoa">{summary.cookDurationMinutes} 분</p>
                </div>
                <div className="rounded-2xl bg-cream/70 p-3">
                  <p className="text-[11px] font-semibold text-cocoa/60">보온 시간</p>
                  <p className="text-[18px] font-extrabold text-cocoa">{summary.warmDurationMinutes} 분</p>
                </div>
              </div>

              <div className="mt-3.5 divide-y divide-line/40 rounded-2xl border border-line bg-paper">
                <div className="grid grid-cols-[60px_1fr_80px] p-2.5 text-[11px] font-bold text-muted">
                  <span>시각</span>
                  <span>상태 및 전력 파형</span>
                  <span className="text-right">측정값</span>
                </div>
                {summary.samples.map((s, idx) => (
                  <div key={idx} className="grid grid-cols-[60px_1fr_80px] items-center p-2.5 text-[13px]">
                    <span className="font-mono font-bold text-cocoa">{s.time}</span>
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-block h-2 w-2 rounded-full ${
                          s.state === "COOKING" ? "bg-blush-deep" : s.state === "WARMING" ? "bg-butter-deep" : "bg-muted/40"
                        }`} />
                        <span className="truncate text-[12px] font-semibold text-cocoa">{s.stateLabel}</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full rounded-full bg-line/50">
                        <div
                          className={`h-1.5 rounded-full ${
                            s.state === "COOKING" ? "bg-blush-deep" : s.state === "WARMING" ? "bg-butter-deep" : "bg-muted/40"
                          }`}
                          style={{ width: `${Math.min(100, (s.watts / 855) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-right font-mono font-bold text-cocoa">{s.watts} W</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* 탭 3: 규격 원문 JSON */}
          {activeTab === "json" ? (
            <div className="mt-4">
              <div className="flex justify-end pb-2">
                <button
                  type="button"
                  onClick={copyJson}
                  className="rounded-xl border border-line bg-paper px-3 py-1.5 text-[12px] font-bold text-cocoa transition-colors hover:bg-butter-soft"
                >
                  {copied ? "✓ 복사 완료" : "JSON 복사하기"}
                </button>
              </div>
              <pre className="max-h-72 overflow-auto rounded-2xl bg-cocoa p-4 text-[11px] leading-relaxed text-paper">
                <code>{JSON.stringify({
                  spec: "bapmunna-smartthings-power-transcription-v2.1",
                  device: { id: summary.deviceId, label: summary.deviceLabel, location: summary.locationRoom },
                  metrics: { currentWatts: summary.currentWatts, peakWatts: summary.peakWatts, totalKWh: summary.totalKWh },
                  interpretationSteps: summary.protocolSteps.map((s) => ({ step: s.stepNumber, stage: s.stageName, verdict: s.verdictBadge })),
                  recentSamples: summary.samples.slice(-4),
                }, null, 2)}</code>
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
