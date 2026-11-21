"use client";

import { useState } from "react";
import { useApp } from "@/lib/data/useApp";
import { isDemoView } from "@/lib/data/view";
import { updateDemo } from "@/lib/demo/store";
import { DEMO_SMARTTHINGS_PROFILE, formatSmartThingsKst } from "@/lib/smartthings/account-model";

export function SmartThingsAccountCard({ compact = false }: { compact?: boolean }) {
  const { mode, view } = useApp();
  const [sampleAdded, setSampleAdded] = useState(false);
  if (!view) return null;
  const demo = mode === "demo" && isDemoView(view);
  const readError = view.plug.status === "read_error";
  const checking = view.plug.status === "checking";
  const linked = Boolean(view.plug.deviceId);
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
      <h2 className="text-[17px] font-bold text-cocoa">{demo ? DEMO_SMARTTHINGS_PROFILE.deviceLabel : checking ? "기기 상태를 확인하고 있어요" : readError ? "기기 상태를 확인하지 못했어요" : linked ? "연결한 밥솥 플러그" : "연결된 기기가 없어요"}</h2>
      {demo ? <p className="mt-1 text-[15px] text-muted">체험용 기기 · 이 화면의 취사 신호는 예시예요.</p> : null}
      {readError && <p role="status" className="mt-1 text-[15px] text-muted">마지막 수신 여부를 알 수 없어요. 잠시 후 다시 확인해 주세요.</p>}
      {linked ? <p className="mt-1 text-[15px] text-muted">{demo ? "최근 예시 신호" : "마지막 수신"} · {formatSmartThingsKst(view.plug.lastReadingAt)}</p> : null}
      {demo && !compact ? <>
        <button type="button" className="mt-4 min-h-12 rounded-full bg-butter px-5 font-bold text-cocoa" disabled={sampleAdded} onClick={addDemoSignal}>
          {sampleAdded ? "예시 신호를 추가했어요" : "취사 신호 체험하기"}
        </button>
        {sampleAdded ? <p role="status" className="mt-2 text-[15px] text-muted">이 브라우저의 체험 기록에 추가했어요.</p> : null}
      </> : null}
    </section>
  );
}
