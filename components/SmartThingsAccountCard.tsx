"use client";

import { useState } from "react";
import { useApp } from "@/lib/data/useApp";
import { isDemoView } from "@/lib/data/view";
import { updateDemo } from "@/lib/demo/store";
import { DEMO_SMARTTHINGS_PROFILE, formatSmartThingsKst } from "@/lib/smartthings/account-model";
import { deviceStageCopy } from "@/lib/smartthings/presentation";

export function SmartThingsAccountCard({ compact = false }: { compact?: boolean }) {
  const { mode, view } = useApp();
  const [sampleAdded, setSampleAdded] = useState(false);
  if (!view) return null;
  const demo = mode === "demo" && isDemoView(view);
  const stage = view.plug.status ?? "checking";
  const copy = deviceStageCopy(stage, view.plug.isVirtual);
  const addDemoSignal = () => {
    if (!demo) return;
    const endedAt = new Date();
    const startedAt = new Date(endedAt.getTime() - 30 * 60 * 1000);
    updateDemo(state => ({
      ...state,
      plug: {deviceId: DEMO_SMARTTHINGS_PROFILE.deviceId, online: true, offlineSince: null},
      events: [...state.events, {type: "cook", startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString()}],
    }));
    setSampleAdded(true);
  };
  return (
    <section className="mt-3 rounded-2xl border border-line bg-paper p-4" aria-label={demo ? "기기 신호 체험" : "우리 집 기기 상태"}>
      <h2 className="text-[17px] font-bold text-cocoa">{demo ? DEMO_SMARTTHINGS_PROFILE.deviceLabel : copy.title}</h2>
      {demo ? <>
        <p className="mt-1 text-[15px] text-muted">체험용 기기 · 이 화면의 취사 신호는 예시예요.</p>
        {view.plug.deviceId && <p className="mt-1 text-[15px] text-muted">최근 예시 신호 · {formatSmartThingsKst(view.plug.lastReadingAt)}</p>}
      </> : stage === "connected" ? <>
        {view.plug.isVirtual && <p className="mt-1 text-[15px] font-semibold text-cocoa">가상 기기 · 테스트용</p>}
        <p className="mt-1 text-[15px] text-muted">자동으로 받은 마지막 신호 · {formatSmartThingsKst(view.plug.lastReadingAt)}</p>
        {view.plug.lastEventAt && <p className="mt-1 text-[15px] text-muted">삼성이 기록한 신호 시각 · {formatSmartThingsKst(view.plug.lastEventAt)}</p>}
        {view.plug.lastCheckedAt && <p className="mt-1 text-[15px] text-muted">마지막 직접 조회 · {formatSmartThingsKst(view.plug.lastCheckedAt)}</p>}
      </> : <p className="mt-1 text-[15px] text-muted">{copy.detail}</p>}
      {demo && !compact ? <>
        <button type="button" className="mt-4 min-h-12 rounded-full bg-butter px-5 font-bold text-cocoa" disabled={sampleAdded} onClick={addDemoSignal}>
          {sampleAdded ? "예시 신호를 추가했어요" : "취사 신호 체험하기"}
        </button>
        {sampleAdded ? <p role="status" className="mt-2 text-[15px] text-muted">이 브라우저의 체험 기록에 추가했어요.</p> : null}
      </> : null}
    </section>
  );
}
