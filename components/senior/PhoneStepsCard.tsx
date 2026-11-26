"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isPhoneStepsNativeAvailable, PhoneSteps } from "@bapmunna/phone-steps";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui";
import { SeniorSheet } from "./SeniorSheet";
import { emptySteps, stepsMessage } from "@/lib/steps/state";
import { createStepsSession, type StepsView } from "@/lib/steps/session";
import { seniorPhoneSteps } from "@/lib/steps/consent";
import { MotionSummaryLink } from "@/components/walking/MotionSummaryLink";
import { HealthConnectionLink } from "./HealthConnectionLink";

const subscribePlatform = () => () => {};
const serverPlatform = () => false;
const isNativeShell = () => Capacitor.isNativePlatform();

export function PhoneStepsCard({ demo, localOnly = false }: { demo: boolean; localOnly?: boolean }) {
  // Synthetic account previews must never request/read the owner's actual motion data.
  if (demo) return <section className="rounded-3xl border border-line bg-paper p-5" aria-label="오늘의 걸음 안내">
    <h2 className="text-2xl font-bold text-cocoa">오늘의 걸음</h2>
    <p className="mt-2 text-2xl text-muted">예시 체험에서는 휴대폰 걸음수를 읽지 않아요.</p>
  </section>;
  return <LivePhoneStepsCard localOnly={localOnly} />;
}

function LivePhoneStepsCard({ localOnly }: { localOnly: boolean }) {
  const [view, setView] = useState<StepsView>(() => ({ snapshot: emptySteps(), busy: true }));
  const native = useSyncExternalStore(subscribePlatform, isPhoneStepsNativeAvailable, serverPlatform);
  const nativeShell = useSyncExternalStore(subscribePlatform, isNativeShell, serverPlatform);
  const [consent, setConsent] = useState(false);
  const [settingsError, setSettingsError] = useState(false);
  const session = useRef<ReturnType<typeof createStepsSession> | null>(null);

  useEffect(() => {
    // The plugin's web implementation returns unsupported, without asking for
    // health access. The same async lifecycle handles browser and native safely.
    const controller = createStepsSession(seniorPhoneSteps, setView);
    session.current = controller;
    void controller.run("status");
    const refresh = () => { if (document.visibilityState === "visible") { controller.invalidateDate(); void controller.run("readToday"); } };
    const onClock = () => { if (controller.invalidateDate()) refresh(); };
    let disposed = false;
    let removeResume: (() => Promise<void>) | undefined;
    if (isPhoneStepsNativeAvailable()) {
      void PhoneSteps.addListener("appResumed", refresh).then(handle => {
        if (disposed) void handle.remove();
        else removeResume = () => handle.remove();
      }).catch(() => { /* Visibility/focus and explicit retry remain available. */ });
    }
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    const timer = setInterval(onClock, 15_000);
    // Poll only while this page is visible. Native reads never request permission
    // unless the user deliberately presses connect; there is no background sync.
    const foregroundTimer = isPhoneStepsNativeAvailable() ? setInterval(refresh, 60_000) : null;
    return () => {
      controller.dispose(); session.current = null;
      disposed = true; void removeResume?.();
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh); clearInterval(timer);
      if (foregroundTimer) clearInterval(foregroundTimer);
    };
  }, []);

  const { snapshot, busy } = view;
  const canConnect = native && ["not-connected", "permission-required"].includes(snapshot.status);
  const connected = native && ["ready", "no-data", "error"].includes(snapshot.status);
  const canOpenSettings = native && (snapshot.status === "permission-denied" || snapshot.status === "no-data" || snapshot.reason === "health-connect-update-required");
  const openSettings = () => { setSettingsError(false); void seniorPhoneSteps.openSettings().catch(() => setSettingsError(true)); };
  const checkedTime = snapshot.updatedAt ? new Intl.DateTimeFormat("ko", { hour: "2-digit", minute: "2-digit", timeZone: snapshot.timeZone }).format(new Date(snapshot.updatedAt)) : null;

  if (!nativeShell && !busy) return <section aria-label="내 걸음" className="rounded-3xl border border-line bg-paper px-4 py-2">
    <MotionSummaryLink />
    <details><summary className="min-h-12 cursor-pointer py-3 text-lg font-semibold text-muted">건강 앱 걸음수 연결</summary><HealthConnectionLink /></details>
  </section>;

  return <section className="rounded-3xl border border-line bg-paper p-5" aria-labelledby="phone-steps-title">
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" className="h-8 w-8 shrink-0 text-cocoa" aria-hidden><path d="M11 3c-3 0-5 5-4 8s6 2 7-1S14 3 11 3Zm-1 13c-3 0-4 2-3 4s4 2 5 0 1-4-2-4Zm12-5c3 0 5 5 4 8s-6 2-7-1-1-7 3-7Zm0 13c3 0 4 2 3 4s-4 2-5 0-1-4 2-4Z" /></svg>
      <h2 id="phone-steps-title" className="text-2xl font-bold text-cocoa">오늘의 걸음</h2>
    </div>
    <div className="mt-3" role="status" aria-live="polite" aria-busy={busy}>
      {busy ? <p className="text-2xl text-muted">걸음수를 확인하고 있어요.</p> : <>
        {snapshot.status === "ready" ? <p className="text-[36px] font-extrabold tabular-nums text-cocoa">{snapshot.count!.toLocaleString("ko-KR")}<span className="ml-2 text-2xl font-bold">걸음</span></p> : null}
        <p className="mt-1 text-2xl text-muted">{stepsMessage(snapshot)}</p>
        {snapshot.source ? <p className="mt-2 text-2xl text-muted">{snapshot.source === "ios-healthkit" ? "Apple 건강" : "삼성 헬스"}{checkedTime ? ` · ${checkedTime}에 확인` : ""}</p> : null}
      </>}
    </div>
    {nativeShell && !native ? <p role="alert" className="mt-3 text-2xl text-muted">앱의 건강 연결 기능을 시작하지 못했어요. 최신 설치 파일인지 확인해 주세요.</p> : null}
    {canConnect ? <Button onClick={() => setConsent(true)} disabled={busy} className="mt-4 min-h-14 text-2xl">걸음수 연결</Button> : null}
    {canOpenSettings ? <Button variant="outline" onClick={openSettings} disabled={busy} className="mt-4 min-h-14 text-2xl">{snapshot.reason === "health-connect-update-required" ? "Health Connect 설치·업데이트" : "휴대폰 설정 열기"}</Button> : null}
    {connected ? <Button variant="outline" onClick={() => void session.current?.run("readToday")} disabled={busy} className="mt-4 min-h-14 text-2xl">걸음수 다시 확인</Button> : null}
    {settingsError ? <p role="alert" className="mt-3 text-2xl text-blush-deep">설정을 열지 못했어요. 건강 앱에서 밥뭇나의 걸음수 읽기 권한을 확인해 주세요.</p> : null}
    <details className="mt-3 text-2xl text-muted">
      <summary className="min-h-12 cursor-pointer py-2 underline underline-offset-4">걸음수 이용 안내</summary>
      <p className="mt-2">동의하시면 Apple 건강 또는 삼성 헬스의 오늘 걸음수를 이 휴대폰에서 읽어요. 읽기 연결만으로는 서버에 보내지 않아요.</p>
      <p className="mt-3">랭킹에서 따로 공유에 동의하고 연결한 경우에만, 한국 시간 기준 오늘 걸음수 합계를 별명과 함께 전체 참여자에게 보여 드려요.</p>
      <p className="mt-3">걷지 않은 날과 기록을 확인할 수 없는 날은 다르게 표시해요.</p>
      {!nativeShell ? <p className="mt-3">웹의 ‘내 걸음 측정’에서 휴대폰으로 걸은 산책을 기록할 수 있어요.</p> : null}
      <p className="mt-3">삼성 헬스의 설정에서 Health Connect에 걸음수 공유를 켜 주세요. 아이폰은 건강 앱 → 공유 → 앱에서 밥뭇나의 걸음수 읽기 권한을 확인해 주세요.</p>
      {native && !canOpenSettings ? <>
        <p className="mt-3">권한 창이 열리지 않으면 휴대폰 설정에서 밥뭇나의 걸음수 읽기를 확인해 주세요.</p>
        <Button variant="outline" onClick={openSettings} disabled={busy} className="mt-3 min-h-14 text-2xl">휴대폰 설정 열기</Button>
      </> : null}
      {native ? <button onClick={() => void session.current?.run("disconnect")} disabled={busy} className="mt-3 min-h-12 py-2 text-2xl text-cocoa underline underline-offset-4">밥뭇나 걸음수 연결 끄기</button> : null}
      <p className="mt-3">건강 앱의 읽기 권한은 설정에서 언제든 바꿀 수 있어요.</p>
      <p className="mt-3">{localOnly ? "이 휴대폰 소유자의 건강 기록을 기준으로 표시해요." : "가족 연결을 바꾸면 걸음수 연결도 다시 동의해 주세요."}</p>
    </details>
    <SeniorSheet open={consent} onClose={() => setConsent(false)} label="걸음수 연결 안내">
      <h2 className="text-[28px] font-extrabold text-cocoa">오늘의 걸음을<br />휴대폰으로 확인할까요?</h2>
      <p className="mt-4 text-2xl text-muted">Apple 건강 또는 삼성 헬스의 오늘 걸음수를 읽어 보여 드려요. 이 연결만으로는 서버에 보내지 않아요. 랭킹 공유는 별도로 동의하고 연결할 때만 시작해요.</p>
      <p className="mt-3 text-2xl text-muted">{localOnly ? "연결하지 않아도 밥뭇나 웹앱을 사용할 수 있어요." : "연결하지 않아도 세 가지 소식 버튼은 그대로 쓸 수 있어요."}</p>
      <Button className="mt-6 min-h-16 text-2xl" onClick={() => { setConsent(false); void session.current?.run("connect"); }}>동의하고 연결하기</Button>
      <Button variant="outline" className="mt-3 min-h-16 text-2xl" onClick={() => setConsent(false)}>다음에 할게요</Button>
    </SeniorSheet>
  </section>;
}
