"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DevicePushSettings } from "@/components/DevicePushSettings";
import { refreshHouseholdSignals } from "@/lib/data/firebase";
import { mealSlotLabel, type AppView } from "@/lib/data/view";
import { lastCookerPush, pushOwner } from "@/lib/push-device";
import { formatSmartThingsKst } from "@/lib/smartthings/account-model";
import { deviceStageCopy } from "@/lib/smartthings/presentation";

const stamp = (ms: number) => formatSmartThingsKst(new Date(ms).toISOString());

function DayLink({day}: {day:string}) {
  return <Link href={'/records/?account=mine&day=' + day} className="inline-flex min-h-11 items-center font-bold text-cocoa underline underline-offset-4">{day} 끼니 기록 보기</Link>;
}

export function HouseholdSignalCheck({view,accountKey}: {view:AppView; accountKey?:string}) {
  const owner = pushOwner(accountKey);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Awaited<ReturnType<typeof lastCookerPush>>>(null);
  useEffect(() => {
    if (!owner) return;
    let revision = 0;
    async function read() {
      const request = ++revision;
      const value = await lastCookerPush(owner!);
      if (request === revision) setReceipt(value);
    }
    function onMessage(e:MessageEvent) {
      if (e.data?.type === "bapmunna:cooker-received") {
        void read();
        void refreshHouseholdSignals();
      }
    }
    void read();
    window.addEventListener("focus",read);
    navigator.serviceWorker?.addEventListener("message",onMessage);
    return () => { revision++; window.removeEventListener("focus",read); navigator.serviceWorker?.removeEventListener("message",onMessage); };
  }, [owner]);
  if (view.mode !== "live" || !view.seniorConsent || !owner) return null;
  const plug = view.plug, physical = plug.status === "connected" && plug.isVirtual === false;
  const lastMeasurement = physical ? Math.max(Date.parse(plug.lastEventAt ?? "") || 0, Date.parse(plug.lastPolledMeasurementAt ?? "") || 0) : 0;
  const source = view.cookerDaySource ?? {};
  const signalDays = Object.keys(source).sort().reverse().filter(day => (view.stats[day]?.cook ?? 0) + (view.stats[day]?.estimated ?? 0) > 0);
  const recentDay = signalDays.find(day => source[day] === "automatic") ?? signalDays[0];
  const recordedMeals = recentDay ? view.slots.filter(s => s.date === recentDay && s.source === "cooker" && s.status === "confirmed") : [];
  const windows = view.cookerMealDays?.[recentDay] ?? [];
  const estimatedMeals = view.stats[recentDay]?.estimatedSlots ?? [];
  const imported = view.lastMeterImport;
  async function refresh() {
    if (busy || !owner) return;
    setBusy(true);
    try { await refreshHouseholdSignals(); setReceipt(await lastCookerPush(owner)); }
    finally { setBusy(false); }
  }
  return <section id="signal-check" aria-labelledby="signal-check-heading" className="scroll-mt-4 rounded-2xl border border-line bg-paper p-5 text-cocoa">
    <h2 id="signal-check-heading" className="text-xl font-bold">내 밥솥 연결 확인</h2>
    <dl className="mt-2 divide-y divide-line text-[15px] leading-relaxed">
      <div className="py-3"><dt className="font-bold">스마트싱스 자동 연결</dt>
        <dd>{physical ? (plug.online ? "실물 플러그의 자동 측정을 받았어요." : "실물 플러그를 연결했어요. 새 자동 신호를 기다려요.") :
          plug.status === "setup_required" ? "운영 서버 연결 대기" : plug.status === "connected" && plug.isVirtual === undefined ? "플러그 종류를 확인하고 있어요." : deviceStageCopy(plug.status ?? "checking",plug.isVirtual).title}</dd>
        {lastMeasurement > 0 && <dd>최근 자동 측정 · {stamp(lastMeasurement)}</dd>}
        {physical && plug.powerNoticeAt && <dd>최근 취사 신호 · {formatSmartThingsKst(plug.powerNoticeAt)}</dd>}
      </div>
      <div className="py-3"><dt className="font-bold">내 날짜별 기록</dt>
        {view.captureReadError && <dd role="status">가져온 기록을 읽지 못했어요. 다시 확인해 주세요.</dd>}
        {imported && <dd>가구에서 가져온 최근 측정 · {imported.measuredAt ? stamp(imported.measuredAt) : imported.date}</dd>}
        {recentDay ? <><dd>{source[recentDay] === "automatic" ? "최근 자동 취사 기록" : "가구에서 가져온 최근 취사 기록"} · {recentDay}</dd>
          <dd>취사 신호 {view.stats[recentDay].cook}회{view.stats[recentDay].estimated ? " · 취사 추정 " + view.stats[recentDay].estimated + "회" : ""}</dd>
          {recordedMeals.length > 0 && <dd>신호가 기록된 끼니 · {recordedMeals.map(s => mealSlotLabel(s.slot,windows)).join(", ")}</dd>}
          {estimatedMeals.length > 0 && <dd>취사로 추정한 끼니 · {estimatedMeals.map(slot => mealSlotLabel(slot,windows)).join(", ")}</dd>}
          <dd><DayLink day={recentDay}/></dd></> : !view.captureReadError && <dd>기록에 반영된 취사 신호를 기다리고 있어요.</dd>}
        {imported && imported.date !== recentDay && <dd><DayLink day={imported.date}/></dd>}
      </div>
      <div className="py-3"><dt className="font-bold">이 휴대폰의 취사 푸시</dt>
        <dd>{receipt?.observedAt ? "최근 수신 · " + stamp(receipt.receivedAt) + " (취사 신호 " + stamp(receipt.observedAt) + ")" : "최근 24시간 동안 이 기기에서 확인한 취사 푸시가 없어요."}</dd>
        {receipt?.openedAt && <dd>이 알림을 누른 시각 · {stamp(receipt.openedAt)}</dd>}
      </div>
    </dl>
    <button type="button" disabled={busy} onClick={() => void refresh()} className="min-h-11 rounded-full border border-line px-4 font-bold">{busy ? "조회하고 있어요…" : "연결 상태 다시 확인"}</button>
    <details className="mt-3 border-t border-line"><summary className="cursor-pointer py-3 font-bold">이 휴대폰 알림 설정</summary>
      <DevicePushSettings view={view} accountKey={accountKey}/></details>
  </section>;
}
