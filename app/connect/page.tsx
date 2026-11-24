"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SmartThingsAccountCard } from "@/components/SmartThingsAccountCard";
import { SmartThingsPanel } from "@/components/SmartThingsPanel";
import { Logo } from "@/components/Mascot";
import { MeterReadings } from "@/components/MeterReadings";
import { PersonalMeterCheck } from "@/components/PersonalMeterCheck";
import { PlugForm } from "@/components/PlugForm";
import { DETECTION } from "@/config/detection";
import { useApp } from "@/lib/data/useApp";
import { ONBOARDING_COMPLETE, type AppActions, type AppView } from "@/lib/data/view";
import { formatDeviceTime } from "@/lib/smartthings/account-model";

function DisconnectPlug({ deviceId, disconnect }: { deviceId: string; disconnect: NonNullable<AppActions["disconnectPlug"]> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true); setError("");
    try { await disconnect(deviceId); }
    catch { setError("연결을 지우지 못했어요. 잠시 뒤 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  return <details className="mt-3"><summary className="min-h-12 cursor-pointer content-center font-semibold">플러그 연결 해제</summary>
    <p className="text-[16px] leading-relaxed text-muted">이 플러그의 자동 조회와 사용 소식을 멈추고 저장한 토큰을 지워요. 지금까지의 안부 요약은 남아요.</p>
    <button type="button" className="mt-2 min-h-12 rounded-full border border-line px-4 font-bold" disabled={busy} onClick={remove}>
      {busy ? "해제하는 중…" : "확인하고 연결 해제하기"}</button>
    {error && <p role="alert">{error}</p>}
  </details>;
}

function SupabasePlug({ view, actions, now }: { view: AppView; actions: AppActions; now: Date | null }) {
  const { plug } = view;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const measured = plug.lastReadingAt ? Date.parse(plug.lastReadingAt) : NaN;
  async function toggleNotice() {
    if (busy || !actions.setPowerNotice) return;
    setBusy(true); setNotice("");
    try {
      await actions.setPowerNotice(plug.deviceId, !plug.powerNoticeEnabled);
    } catch {
      setNotice("설정을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally { setBusy(false); }
  }

  return <section className="rounded-2xl border border-line bg-paper p-4">
    <h2 className="text-[20px] font-bold text-cocoa">{plug.deviceId ? "등록한 플러그" : "우리 집 밥솥 플러그 등록"}</h2>
    {plug.deviceId && <>
      <p className="mt-2 text-[16px] leading-relaxed text-muted">{plug.meterKind === "virtual" ? "가상 기기 · 테스트용" :
        plug.meterKind === "recognized" ? "전력 측정 플러그" : "기기 종류 확인 대기"} · {plug.online ? "최근 조회에 응답했어요" : "연결 상태를 확인해 주세요"}</p>
      {plug.meterKind === "virtual" || plug.meterKind === "unknown"
        ? <p className="mt-2 text-sm leading-relaxed text-muted">이 기기의 측정은 점검용이에요. 가족의 밥솥 사용 기록과 안부 알림에는 실물 플러그의 측정만 반영해요.</p> : null}
      {Number.isFinite(measured) && typeof plug.lastSignalHigh === "boolean" && plug.meterKind === "recognized"
        ? <MeterReadings reading={{ measuredAt: measured, cooking: plug.lastSignalHigh }} energy={null} checkedAt={now?.getTime()} physicalPlug/>
        : <p role="status" className="mt-2 text-[16px] text-muted">{Number.isFinite(measured)
          ? "삼성 마지막 측정 · " + formatDeviceTime(measured) + " (한국 시간)" : "아직 시각을 확인할 수 있는 측정 기록이 없어요."}</p>}
      {plug.meterKind === "recognized" && actions.setPowerNotice && <div className="mt-4">
        <button type="button" role="switch" aria-checked={Boolean(plug.powerNoticeEnabled)} disabled={busy} onClick={toggleNotice}
          className="min-h-12 rounded-full border border-line px-4 font-bold text-cocoa">
          밥솥 사용 소식 {plug.powerNoticeEnabled ? "켜짐" : "꺼짐"}</button>
        <p className="mt-1 text-sm leading-relaxed text-muted">켜면 이 플러그에서 새 취사 신호가 왔을 때 앱에서 24시간 동안 볼 수 있어요.</p>
        {notice && <p role="alert" className="mt-2 text-cocoa">{notice}</p>}
      </div>}
    </>}
    <p className="my-3 text-[16px] leading-relaxed text-muted">밥솥만 꽂은 전력 측정 플러그를 선택해 주세요. {DETECTION.POWER_CHECK_INTERVAL_MIN}분마다 확인하고, {DETECTION.COOK_MIN_WATTS}W 이상이 측정되면 밥솥 사용 신호로 기록해요. 실제 식사는 어르신께 확인해 주세요.</p>
    {plug.deviceId
      ? <details><summary className="min-h-12 cursor-pointer content-center font-semibold">기기 변경 또는 테스트 토큰 갱신</summary><PlugForm onSubmit={actions.registerPlug} consentConfirmed/></details>
      : <PlugForm onSubmit={actions.registerPlug} consentConfirmed/>}
    {plug.deviceId && actions.disconnectPlug && <DisconnectPlug deviceId={plug.deviceId} disconnect={actions.disconnectPlug}/>}
    <PersonalMeterCheck/>
  </section>;
}

export default function ConnectPage() {
  const { view, actions, needsLogin, provider, accountKey, error, now } = useApp();
  const router = useRouter();
  useEffect(() => { if (needsLogin) router.replace("/login?next=connect"); }, [needsLogin, router]);
  const returnTo = view && view.onboardingStep < ONBOARDING_COMPLETE ? "/onboarding" : "/home";
  return <main className="flex flex-1 flex-col gap-5 px-5 pt-6 pb-8">
    <Logo/>
    <div><h1 className="text-[28px] leading-snug font-bold text-cocoa">우리 집 기기 연결</h1>
      <p className="mt-2 text-[16px] leading-relaxed text-muted">우리 집 밥솥 플러그를 등록하고 마지막으로 측정한 시각을 확인해요.</p></div>
    {!view || needsLogin ? <p role="status">{error || "내 계정을 확인하고 있어요…"}</p> : <>
      {provider === "demo" && <SmartThingsAccountCard/>}
      {provider !== "demo" && !view.seniorConsent && <div className="rounded-2xl bg-butter-soft p-4">
        <p>연결하기 전에 어르신과 안부 정보 이용에 동의해 주세요.</p>
        <Link href="/settings#device" className="mt-2 flex min-h-12 items-center font-bold underline">동의 확인하러 가기</Link></div>}
      {provider === "supabase" && accountKey && view.seniorConsent && <SupabasePlug key={accountKey + ":" + view.plug.deviceId} view={view} actions={actions} now={now}/>}
      {provider === "supabase" && accountKey && !view.seniorConsent && view.plug.deviceId && actions.disconnectPlug &&
        <DisconnectPlug key={accountKey} deviceId={view.plug.deviceId} disconnect={actions.disconnectPlug}/>}
      {provider === "firebase" && <SmartThingsPanel accountKey={accountKey} returnTo={returnTo}/>}
    </>}
    <Link href={returnTo} className="flex min-h-12 items-center justify-center rounded-full border border-line px-4 py-3 font-bold text-cocoa">
      {returnTo === "/onboarding" ? "우리 집 설정 이어가기" : "홈으로 돌아가기"}</Link>
  </main>;
}
