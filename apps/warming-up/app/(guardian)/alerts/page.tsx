"use client";

import { useEffect, useRef, useState } from "react";
import { ALERT_TONE, alertCopy, AlertShortcut } from "@/components/guardian";
import { IconBell, IconCheck } from "@/components/icons";
import { PageHeader, Skeleton } from "@/components/ui";
import { kstDate, kstTime } from "@/lib/judge/time";
import { useApp } from "@/lib/data/useApp";
import { Mascot } from "@/components/Mascot";
import type { AppView } from "@/lib/data/view";
import { disablePush, enablePush, useDelivery } from "@/lib/push";
import { pushOwner, testDeviceNotice, useEnabledSince, usePushState } from "@/lib/push-device";
import { NoticePreview } from "@/components/NoticePreview";
import { testBackgroundPush } from "@/lib/notification-transport";
import { PowerNotice } from "@/components/SmartThingsAccountCard";

export default function AlertsPage() {
  const { view, actions, accountKey } = useApp();
  const alerts = view ? [...view.alerts].sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt)) : [];

  const opened = useRef("");
  useEffect(() => {
    const hash = window.location.hash;
    if (!/^#notice-[a-zA-Z0-9_-]{1,100}$/.test(hash) || opened.current === hash) return;
    const article = document.getElementById(hash.slice(1));
    if (article) { opened.current = hash; article.focus(); }
  }, [view]);

  return (
    <main className="flex flex-col pb-8">
      <PageHeader
        title="알림"
        right={
          alerts.some((a) => !a.acknowledgedAt) ? (
            <button className="text-sm font-semibold text-cocoa/70" onClick={() => void actions.ackAll()}>
              모두 확인
            </button>
          ) : null
        }
      />
      <div className="flex flex-col gap-3 px-6">
        {view && <PushCard view={view} accountKey={accountKey} />}
        {view?.mode === "live" && view.plug.powerNoticeAt && <PowerNotice at={view.plug.powerNoticeAt}/>}
        {!view ? (
          <Skeleton className="h-24" />
        ) : alerts.length === 0 && !view.plug.powerNoticeAt ? (
          <div className="mt-12 flex flex-col items-center text-center text-muted">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-butter-soft text-cocoa">
              <IconBell className="h-7 w-7" />
            </span>
            <p className="mt-4 text-[17px] font-bold text-cocoa">아직 받은 알림이 없어요</p>
            <p className="mt-1 text-[14px]">{view.careAvailable === false ? "연결 전에는 식사 여부를 판단하지 않아요." : "끼니 소식이 끊기면 여기로 알려 드릴게요."}</p>
          </div>
        ) : (
          alerts.map((a) => {
            const copy = alertCopy(a.type, view.senior.relation, {
              missed: view.alertSettings.missedMealsThreshold,
              fasting: view.alertSettings.fastingHours,
              emergency: view.alertSettings.emergencyHours,
              plugRegistered: !!view.plug.deviceId,
              payload: a.payload,
              issuedAt: a.triggeredAt,
            });
            const t = new Date(a.triggeredAt);
            const done = !!a.acknowledgedAt;
            return (
              <article key={a.id} id={"notice-" + a.id} tabIndex={-1} className={`rounded-[1.5rem] p-5 ${done ? "border border-line" : ALERT_TONE[a.type]}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className={`text-[16px] font-bold ${done ? "text-cocoa/60" : "text-cocoa"}`}>{copy.title}</p>
                  <time className="shrink-0 text-[12px] text-muted">
                    {kstDate(t).slice(5).replace("-", "/")} {kstTime(t)}
                  </time>
                </div>
                <p className="mt-1 text-[14px] text-cocoa/70">{copy.body}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px]">
                  {done ? (
                    <span className="flex items-center gap-1 font-semibold text-sage-deep">
                      <IconCheck className="h-4 w-4" /> 확인함
                    </span>
                  ) : (
                    <button className="h-9 rounded-full bg-cocoa px-4 font-bold text-paper" onClick={() => void actions.ackAlert(a.id)}>
                      확인했어요
                    </button>
                  )}
                  <AlertShortcut type={a.type} relation={view.senior.relation} phone={view.senior.phone} />
                  {a.resolvedAt ? <span className="text-muted">상황 해제됨</span> : null}
                </div>
              </article>
            );
          })
        )}
      </div>
    </main>
  );
}

function PushCard({ view, accountKey }: { view: AppView; accountKey?: string }) {
  const owner = pushOwner(accountKey);
  const permission = usePushState();
  const enabled = Boolean(useEnabledSince(owner));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tested, setTested] = useState("");
  const delivery = useDelivery(owner, view.mode === "live" && view.seniorConsent);
  const eligible = view.mode === "live" && !!owner && view.seniorConsent;
  const canAsk = permission === "default" || permission === "granted";
  const remote = delivery === "off" || delivery === "background";
  let detail: string;
  if (view.mode === "demo") detail = "소식이 오면 어떻게 보일지 골라 보세요. 이 체험에서는 휴대폰으로 발송하지 않아요.";
  else if (permission === "install") detail = "아이폰에서는 공유 → ‘홈 화면에 추가’를 누른 뒤 밥뭇나 아이콘으로 열어 주세요.";
  else if (permission === "denied") detail = "기기 설정에서 밥뭇나 알림을 허용하면 여기서 켤 수 있어요.";
  else if (permission === "unsupported") detail = "이 브라우저에서는 아래 알림함에서 소식을 볼 수 있어요.";
  else if (!eligible) detail = "가구 정보 이용에 동의하고 밥솥을 연결하면 소식을 받을 수 있어요. 이 기기에 시험 알림을 보내 볼 수 있어요.";
  else if (delivery === "background") detail = "앱을 닫아도 연결한 밥솥에서 취사 신호가 오면 이 기기로 알려 드려요.";
  else if (delivery === "off") detail = "홈 화면 알림을 켜면 앱을 닫아도 밥솥 소식을 받을 수 있어요.";
  else if (delivery === "unknown") detail = "알림 서버 상태를 확인하지 못했어요. 잠시 후 다시 확인해 주세요.";
  else detail = "밥솥을 연결하고 취사 신호 알림을 켜면 앱을 열어 둔 동안 새 소식을 받아요. 현재 팀 서버의 닫힌 앱 발송은 준비 중이에요.";

  async function change(enable: boolean) {
    if (!owner) return;
    setBusy(true);
    setError("");
    try {
      if (enable) {
        const state = await enablePush(view.mode, owner);
        if (state !== "granted") setError("기기에서 알림 권한을 허용해 주세요.");
      } else await disablePush(owner);
    } catch {
      setError(enable ? "알림을 연결하지 못했어요. 잠시 후 다시 눌러 주세요." : "알림 끄기를 마치지 못했어요. 다시 눌러 주세요.");
    } finally { setBusy(false); }
  }

  async function test() {
    if (!owner || busy) return;
    setBusy(true); setTested(""); setError("");
    try {
      if (delivery === "background") {
        await testBackgroundPush(owner);
        setTested("이 기기로 시험 발송을 요청했어요. 알림 센터에서 도착을 확인해 주세요.");
      } else if (await testDeviceNotice()) {
        setTested("이 기기에 시험 알림을 표시했어요. 알림 센터에서 눌러 보세요.");
      } else setError("기기 알림을 허용한 뒤 다시 눌러 주세요.");
    } catch (e) {
      setError(e instanceof Error && delivery === "background" ? e.message : "시험 알림을 표시하지 못했어요. 기기의 알림 설정을 확인해 주세요.");
    } finally { setBusy(false); }
  }

  return <section aria-label="기기 알림 설정" className="rounded-[1.5rem] border border-line bg-butter-soft p-4 text-cocoa">
    <div className="flex items-start gap-3">
      <span aria-hidden="true" className="shrink-0"><Mascot variant="bunny" className="h-12 w-12" /></span>
      <div><h2 className="text-[17px] font-bold">워밍이의 안부 알림</h2>
        <p className="mt-1 text-[15px] leading-relaxed">{detail}</p></div>
    </div>
    {view.mode === "live" && owner && <div className="mt-3 flex flex-wrap gap-2">
      {canAsk && eligible && (!enabled || (remote && delivery !== "background")) &&
        <button type="button" disabled={busy} onClick={() => void change(true)} className="min-h-11 rounded-full bg-cocoa px-5 text-[15px] font-bold text-paper disabled:opacity-50">
          {remote ? "홈 화면 알림 연결" : "앱 사용 중 알림 켜기"}</button>}
      {(enabled || delivery === "background" || delivery === "unknown") && <button type="button" disabled={busy} onClick={() => void change(false)} className="min-h-11 rounded-full border border-cocoa/35 px-4 text-[15px] font-semibold">이 기기 알림 끄기</button>}
      {canAsk && <button type="button" disabled={busy} onClick={() => void test()} className="min-h-11 rounded-full border border-cocoa/35 bg-paper px-4 text-[15px] font-semibold">이 기기에 시험 알림</button>}
    </div>}
    {error && <p role="alert" className="mt-2 text-sm font-semibold">{error}</p>}
    {tested && <p role="status" className="mt-2 text-sm">{tested}</p>}
    <NoticePreview key={owner ?? "demo"} owner={owner} enabled={enabled || delivery === "background"} demo={view.mode === "demo"}/>
  </section>;
}
