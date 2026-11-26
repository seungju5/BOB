"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { canReadConnection, isFirebaseSessionCurrent, refreshFirebaseAccount, updateFirebaseConnection, useFirebaseAccount } from "@/lib/data/firebase";
import { useMode } from "@/lib/data/mode";
import { ONBOARDING_COMPLETE } from "@/lib/data/view";
import { ACCOUNT_CONSENT_VERSION } from "@/lib/firebase/bridge";
import { openSmartThings, SMARTTHINGS_CONSENT_VERSION, SmartThingsError, type CheckedConnection, type SmartThingsConnection, type SmartThingsDevice } from "@/lib/firebase/smartthings";
import { COOKER_RECORD_DAYS, DETECTION } from "@/config/detection";
import { MeterReadings } from "./MeterReadings";
import { PersonalMeterCheck } from "./PersonalMeterCheck";
import { callbackMessage, deviceStageCopy, formatDeviceTime, smartThingsErrorMessage, type DisplayStage } from "@/lib/smartthings/presentation";
import { returnedToAccount } from "@/lib/smartthings/pending";

type Client = Awaited<ReturnType<typeof openSmartThings>>;
type Operation = "status" | "start" | "list" | "select" | "check" | "remove" | "power-notice" | "meal-records";
const panelClass = "rounded-2xl border border-line bg-paper p-5";
const textClass = "text-[16px] leading-relaxed text-muted";

export function SmartThingsPanel({ showConsentLink = false }: { showConsentLink?: boolean }) {
  const mode = useMode();
  const account = useFirebaseAccount(false);
  if (mode !== "live") return null;
  const { user, profile, saved, revision } = account;
  if (!user?.verified || profile?.ownerUid !== user.uid || profile.consentVersion !== ACCOUNT_CONSENT_VERSION || !saved) {
    return <p role="status" className={textClass}>기기 연결에는 밥뭇나 로그인과 이메일 확인이 필요해요.</p>;
  }
  const consent = saved.settings?.preparationAcknowledged === true;
  if (consent && !canReadConnection(user.uid, revision)) {
    return account.connection?.stage === "read_error" ? <ConsentRetry /> : <p role="status" className={textClass}>어르신의 동의 상태를 다시 확인하고 있어요…</p>;
  }
  const onboarding = (account.view?.onboardingStep ?? saved.settings?.onboardingStep ?? 1) < ONBOARDING_COMPLETE;
  return <AccountPanel key={`${user.uid}:${revision}:${consent}`} uid={user.uid} revision={revision} consent={consent} latest={account.connection} showConsentLink={showConsentLink} onboarding={onboarding} />;
}

function ConsentRetry() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return <section className={panelClass} aria-label="가구 동의 확인">
    <h2 className="text-[20px] font-bold text-cocoa">기기 정보를 볼 수 있는지 확인하지 못했어요</h2>
    <p className={`mt-2 ${textClass}`}>내 계정에 저장한 어르신의 동의 상태를 다시 확인해 주세요.</p>
    <Button type="button" variant="outline" className="mt-3" disabled={busy} onClick={async () => {
      setBusy(true); setError(false);
      try { await refreshFirebaseAccount(); } catch { setError(true); } finally { setBusy(false); }
    }}>{busy ? "동의를 확인하고 있어요…" : "동의 상태 다시 확인"}</Button>
    {error && <p role="alert" className={`mt-2 ${textClass}`}>인터넷 연결을 확인하고 다시 시도해 주세요.</p>}
  </section>;
}

function AccountPanel({ uid, revision, consent, latest, showConsentLink, onboarding }: { uid: string; revision: number; consent: boolean; latest: SmartThingsConnection | null; showConsentLink: boolean; onboarding: boolean }) {
  const [api, setApi] = useState<Client | null>(null);
  const [local, setState] = useState<SmartThingsConnection | null>(null);
  const state = latest ?? local;
  const [allow, setAllow] = useState(false);
  const [devices, setDevices] = useState<SmartThingsDevice[] | null>(null);
  const [measurement, setMeasurement] = useState<CheckedConnection | null>(null);
  const [confirm, setConfirm] = useState<"none" | "remove" | "expired">("none");
  const [busy, setBusy] = useState<Operation | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [returned] = useState(() => typeof window === "undefined" ? "" : callbackMessage(new URL(window.location.href).searchParams.get("smartthings")));
  const active = useRef<AbortController | null>(null);

  const publish = useCallback((next: SmartThingsConnection) => {
    setState(next);
    if (consent) updateFirebaseConnection(uid, next, revision);
  }, [consent, uid, revision]);

  const run = useCallback(async (operation: Operation, task: (signal: AbortSignal, current: () => void) => Promise<void>) => {
    const sessionCurrent = () => operation === "remove" ? isFirebaseSessionCurrent(uid, revision) : canReadConnection(uid, revision);
    if (active.current || !sessionCurrent()) return;
    const controller = new AbortController();
    active.current = controller;
    const valid = () => active.current === controller && !controller.signal.aborted && sessionCurrent();
    const current = () => { if (!valid()) throw new DOMException("Aborted", "AbortError"); };
    setBusy(operation); setError(""); setNotice("");
    try {
      await task(controller.signal, current);
    } catch (cause) {
      if (!valid()) return;
      const code = cause instanceof SmartThingsError ? cause.code : "unavailable";
      if (code === "revoke_in_smartthings" && operation === "remove") {
        setConfirm("expired");
      } else {
        setError(smartThingsErrorMessage(code));
        if (operation === "status" || code === "reconnect_required" || code === "setup_required") {
          publish({ stage: code === "reconnect_required" || code === "setup_required" ? code : "read_error" });
          setMeasurement(null); setDevices(null);
        }
      }
    } finally {
      if (valid()) setBusy(null);
      if (active.current === controller) active.current = null;
    }
  }, [uid, revision, publish]);

  const refresh = useCallback(() => run("status", async (signal, current) => {
    const client = await openSmartThings(uid, signal);
    current(); setApi(client);
    const next = await client.status(signal);
    current(); publish(next); setDevices(null); setMeasurement(null);
  }), [uid, run, publish]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("smartthings")) {
      if (callbackMessage(url.searchParams.get("smartthings"))) void returnedToAccount(uid);
      url.searchParams.delete("smartthings");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    let mounted = true;
    if (consent) queueMicrotask(() => { if (mounted) void refresh(); });
    return () => { mounted = false; active.current?.abort(); active.current = null; };
  }, [uid, consent, refresh]);

  const stage: DisplayStage = !consent ? "consent_required" : state?.stage ?? "checking";
  const startStage = stage === "disconnected" || stage === "reconnect_required";
  const outdated = !!api && startStage && api.config.consentVersion !== SMARTTHINGS_CONSENT_VERSION;
  const canStart = startStage && api?.config.connectionReady === true && !outdated;
  const canRemove = !consent || ["choose_device", "subscribing", "connected", "reconnect_required"].includes(stage);
  const selected = state?.device;
  const copy = deviceStageCopy(stage, selected?.isVirtual);
  const setMealRecords = (enabled: boolean) => {
    if (!api || !selected) return;
    void run("meal-records", async (signal, current) => {
      await api.setMealRecords(selected.id, enabled, signal);
      current();
      const next = await api.status(signal);
      current(); publish(next);
      setNotice(enabled ? "이제 새로 들어오는 취사 소식을 날짜별로 모을게요." : "날짜별 끼니 기록을 끄고 저장한 요약을 지웠어요.");
    });
  };
  const setCookerNotice = (enabled: boolean) => {
    if (!api || !selected) return;
    void run("power-notice", async (signal, current) => {
      await api.setPowerNotice(selected.id, enabled, signal);
      current();
      const next = await api.status(signal);
      current(); publish(next);
      if (!enabled && !next.powerNotice) setNotice("취사 신호 알림과 정기 조회를 껐어요.");
      else if (next.powerChecks) setNotice("밥솥 사용 시각을 확인할게요.");
    });
  };
  const select = (id: string) => {
    if (!api) return;
    void run("select", async (signal, current) => {
      const result = await api.select(id, signal);
      current(); publish(result.connection); setMeasurement(result); setDevices(null);
    });
  };
  const remove = () => {
    void run("remove", async (signal, current) => {
      const client = api ?? await openSmartThings(uid, signal);
      current();
      const next = await client.disconnect(confirm === "expired", signal);
      current(); publish(next); setAllow(false); setConfirm("none"); setDevices(null); setMeasurement(null);
      setNotice("밥뭇나에 남아 있는 삼성 기기 연결이 없음을 확인했어요.");
    });
  };

  return <section className={panelClass} aria-label="삼성 기기 연결 관리">
    <h2 className="text-[20px] font-bold text-cocoa">{copy.title}</h2>
    <p className={`mt-2 ${textClass}`}>{stage === "consent_required" && onboarding ? "우리 집 설정에서 어떤 기기 정보를 쓸지 함께 읽고 동의 확인을 저장해 주세요." : copy.detail}</p>
    {returned && <p role="status" className="mt-3 rounded-xl bg-butter-soft p-3 text-[16px] text-cocoa">{returned}</p>}
    {showConsentLink && !consent && <Link href={onboarding ? "/onboarding/" : "/settings/#device"} className="mt-2 inline-flex min-h-12 items-center font-bold text-cocoa underline">{onboarding ? "우리 집 설정에서 동의하기" : "설정에서 동의 확인하기"}</Link>}
    {outdated && <div className="mt-3"><p role="status" className={textClass}>{smartThingsErrorMessage("consent_updated")}</p><Button type="button" variant="outline" className="mt-2" onClick={() => window.location.reload()}>화면 새로 열기</Button></div>}
    {canStart && <div className="mt-4 rounded-xl bg-butter-soft p-4">
      <p className="font-bold text-cocoa">내가 고른 기기만, 내 계정에</p>
      <p className={`mt-1 ${textClass}`}>삼성에서 기기 읽기를 허용한 뒤, 밥뭇나에서 전력과 신호를 받을 플러그를 하나 선택해요.</p>
      <Link href="/privacy/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-[15px] text-muted underline">개인정보 처리방침 보기 <span className="sr-only">(새 창)</span></Link>
      <label className="flex min-h-12 items-center gap-3 text-[16px] font-semibold text-cocoa"><input type="checkbox" className="h-5 w-5 shrink-0 accent-cocoa" checked={allow} disabled={!!busy} onChange={e => setAllow(e.target.checked)} />확인하고 연결할게요.</label>
      <Button type="button" className="mt-2" disabled={!allow || !!busy} onClick={() => {
        if (!allow || !api) return;
        void run("start", async (signal, current) => {
          const url = await api.start(signal);
          current(); window.location.assign(url);
        });
      }}>{stage === "reconnect_required" ? "삼성 계정 다시 연결" : "삼성 계정 연결"}</Button>
    </div>}
    {!canStart && <Link href="/privacy/" target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-11 items-center text-[15px] text-muted underline">기기 정보 이용 안내 <span className="sr-only">(새 창)</span></Link>}
    {stage === "reconnect_required" && !canStart && !outdated && <p className={textClass}>지금은 새 삼성 연결을 준비하고 있어요. 기존 연결은 아래에서 관리할 수 있어요.</p>}
    {stage === "choose_device" && api && <div className="mt-3 space-y-2">
      <Button type="button" variant="soft" disabled={!!busy} onClick={() => void run("list", async (signal, current) => {
        const items = await api.devices(signal); current(); setDevices(items);
      })}>{devices ? "플러그 목록 다시 보기" : "허용한 플러그 보기"}</Button>
      {devices?.length === 0 && <p role="status" className={textClass}>전력을 읽을 수 있는 플러그가 없어요. SmartThings 앱에서 플러그가 등록됐는지, 삼성 연결에서 그 기기를 허용했는지 확인해 주세요.</p>}
      {devices && devices.length > 0 && devices.every(item => item.isVirtual === true) && <p role="status" className={textClass}>지금 보이는 플러그는 모두 테스트용이에요. SmartThings 앱의 ‘기기’에서 밥솥 플러그가 있는 장소와 이름을 확인한 뒤 목록을 다시 열어 주세요.</p>}
      {devices?.map(item => <Button type="button" variant="outline" disabled={!!busy} key={item.id} onClick={() => select(item.id)}><span className="break-words">{item.label}{item.isVirtual && <span className="block text-[15px] font-normal">가상 기기 · 테스트용</span>}<span className="sr-only"> 선택</span></span></Button>)}
    </div>}
    {consent && selected && (stage === "subscribing" || stage === "connected") && <div className="mt-3 rounded-xl bg-butter-soft p-4">
      <p className="break-words text-[17px] font-bold text-cocoa">{selected.label}{selected.isVirtual && <span className="block text-[15px]">가상 기기 · 테스트용</span>}</p>
      {stage === "subscribing" ? <Button type="button" className="mt-3" disabled={!!busy} onClick={() => select(selected.id)}>자동 알림 연결 다시 시도</Button> : <>
        <dl aria-live="polite" className={`mt-2 space-y-2 ${textClass}`}>
          <div><dt>자동으로 받은 마지막 신호</dt><dd className="font-semibold text-cocoa">{state?.lastReceivedAt ? formatDeviceTime(state.lastReceivedAt) : "아직 도착한 신호가 없어요"}</dd></div>
          {state?.lastReceivedAt && state.lastEventAt && state.lastEventAt <= state.lastReceivedAt && <div><dt>삼성이 기록한 신호 시각</dt><dd className="font-semibold text-cocoa">{formatDeviceTime(state.lastEventAt)}</dd></div>}
          {state?.lastCheckedAt && <div><dt>마지막 직접 조회</dt><dd className="font-semibold text-cocoa">{formatDeviceTime(state.lastCheckedAt)}</dd></div>}
        </dl>
        <Button type="button" variant="outline" className="mt-3" disabled={!!busy} onClick={() => {
          if (!api) return;
          void run("check", async (signal, current) => {
            const result = await api.check(signal);
            current(); publish(result.connection); setMeasurement(result);
          });
        }}>플러그 전력 직접 조회</Button>
        {measurement && measurement.connection.device?.id === selected.id && <MeterReadings reading={measurement.reading} energy={measurement.energy} checkedAt={measurement.connection.lastCheckedAt} physicalPlug={selected.isVirtual === false}/>}
        {selected.isVirtual === false && <div className="mt-4 border-t border-line pt-3">
          <h3 className="text-[17px] font-bold text-cocoa">밥솥 취사 신호 알림</h3>
          <p className={textClass}>밥솥만 꽂은 플러그를 {DETECTION.POWER_CHECK_INTERVAL_MIN}분마다 확인해요. 삼성이 중간에 보낸 신호도 받아요. {DETECTION.COOK_MIN_WATTS}W 이상이 한 번 측정되면 처음 측정한 시각을 홈과 알림에 표시해요.</p>
          <p className="mt-2 text-[15px] text-muted">기준 이상인 두 측정이 {DETECTION.COOK_MERGE_GAP_MIN}분 이내로 이어지면 같은 사용이에요.</p>
          {state?.powerChecks?.checkedAt && <p className="mt-2 text-[15px] text-cocoa">마지막 정기 조회 · {formatDeviceTime(state.powerChecks.checkedAt)}</p>}
          {state?.powerChecks?.measuredAt && <p className="text-[15px] text-cocoa">정기 조회에서 찾은 최근 측정 · {formatDeviceTime(state.powerChecks.measuredAt)}</p>}
          {state?.powerNotice?.enabled && !state.powerChecks && <Button type="button" variant="outline" className="mt-2" disabled={!!busy || !api} onClick={() => setCookerNotice(true)}>
            {DETECTION.POWER_CHECK_INTERVAL_MIN}분마다 전력 확인도 켜기
          </Button>}
          <Button type="button" variant="outline" className="mt-2" disabled={!!busy || !api} onClick={() => setCookerNotice(!state?.powerNotice?.enabled)}>
            {state?.powerNotice?.enabled ? "취사 신호 알림 끄기" : "이 플러그에 밥솥을 꽂았어요 · 알림 켜기"}
          </Button>
          {state?.powerNotice?.enabled && <div className="mt-4 border-t border-line pt-3">
            <h3 className="text-[17px] font-bold text-cocoa">날짜별 끼니 기록</h3>
            <p className={textClass}>켜면 지금부터 들어온 밥솥 소식을 우리 집 끼니 시간대에 맞춰 기록해요. 내 계정에 최근 {COOKER_RECORD_DAYS}일의 날짜별 요약을 보관해요. 끄면 저장한 요약도 지워져요.</p>
            {state.mealRecords && <Link href="/records/" className="mt-2 inline-flex min-h-12 items-center font-bold text-cocoa underline">우리 집 기록 보기</Link>}
            <Button type="button" variant="outline" className="mt-2" disabled={!!busy || !api} onClick={() => setMealRecords(!state.mealRecords)}>
              {state.mealRecords ? "날짜별 기록 끄고 지우기" : "동의하고 날짜별 기록 켜기"}
            </Button>
          </div>}
        </div>}
      </>}
    </div>}
    {consent && <Button type="button" variant="outline" className="mt-3" disabled={!!busy} onClick={() => void refresh()}>{stage === "setup_required" ? "연결 준비 상태 다시 확인" : "연결 상태 다시 확인"}</Button>}
    {canRemove && confirm === "none" && <button type="button" disabled={!!busy} onClick={() => setConfirm("remove")} className="mt-2 min-h-12 text-[16px] font-semibold text-cocoa underline">{!consent ? "이전에 연결한 기기 해제하기" : "기존 연결 해제하기"}</button>}
    {confirm !== "none" && <div className="mt-3 rounded-xl border border-line p-4">
      <p className="font-bold text-cocoa">{confirm === "expired" ? "삼성 앱에서도 권한을 해제해 주세요" : "밥뭇나에서 기기 연결을 해제할까요?"}</p>
      <p className={`mt-1 ${textClass}`}>{confirm === "expired" ? "기존 삼성 허용이 만료됐어요. SmartThings에서 밥뭇나에 준 권한을 해제한 뒤 이 계정의 연결 기록을 지워 주세요." : "이 계정의 플러그에서 자동 신호가 들어오는 것을 멈추고 연결 정보를 지워요."}</p>
      <Button type="button" variant="dark" className="mt-3" disabled={!!busy} onClick={remove}>{confirm === "expired" ? "삼성에서 해제했고, 연결 기록 지우기" : "확인하고 연결 해제"}</Button>
      <Button type="button" variant="ghost" disabled={!!busy} onClick={() => setConfirm("none")}>취소</Button>
    </div>}
    {busy && <p role="status" className={`mt-3 ${textClass}`}>{busy === "start" ? "삼성 연결 화면을 열고 있어요…" : "요청을 확인하고 있어요…"}</p>}
    {error && <p role="alert" className="mt-3 text-[16px] font-semibold text-blush-deep">{error}</p>}
    {notice && <p role="status" className={`mt-3 ${textClass}`}>{notice}</p>}
    {consent && (stage === "setup_required" || stage === "disconnected") && <PersonalMeterCheck uid={uid} revision={revision}/>}
  </section>;
}
