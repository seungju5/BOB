"use client";

import { useEffect, useRef, useState } from "react";
import { NoticePreview } from "@/components/NoticePreview";
import { ALERT_TONE, alertCopy, AlertShortcut } from "@/components/guardian";
import { IconBell, IconCheck } from "@/components/icons";
import { PageHeader, Skeleton } from "@/components/ui";
import { kstDate, kstTime } from "@/lib/judge/time";
import { recentPowerNotice } from "@/lib/data/view";
import { useApp } from "@/lib/data/useApp";
import { Mascot } from "@/components/Mascot";
import type { AppView } from "@/lib/data/view";
import { backgroundAvailable, disablePush, enablePush, useDelivery } from "@/lib/push";
import { testDeviceNotice, pushOwner, usePushState } from "@/lib/push-device";

export default function AlertsPage() {
  const { view, actions, accountKey, now } = useApp();
  const notice = view && now ? recentPowerNotice(view, now) : null;
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
        {notice && <article className="rounded-2xl bg-butter-soft p-5 text-cocoa">
          <h2 className="text-[17px] font-bold">밥솥 플러그의 전력이 높아졌어요</h2>
          <p className="mt-1 text-[16px]">{kstDate(new Date(notice))} {kstTime(new Date(notice))} · 플러그가 보낸 전력 신호예요. 실제 식사 여부는 알 수 없어요.</p>
        </article>}
        {!view ? (
          <Skeleton className="h-24" />
        ) : alerts.length === 0 && !notice ? (
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
  const delivery = useDelivery(owner, view.dataSource);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tested, setTested] = useState("");
  const remote = backgroundAvailable(view.dataSource);
  const eligible = view.seniorConsent && (view.seniorPaired || view.careAvailable !== false);
  const enabled = delivery === "foreground" || delivery === "background";
  const canAsk = eligible && owner && (permission === "default" || permission === "granted");
  let detail: string;
  if (view.mode === "demo") detail = "소식을 골라 잠금화면 예시를 확인해 보세요. 이 체험에서는 휴대폰으로 발송하지 않아요.";
  else if (permission === "install") detail = "아이폰은 공유 버튼에서 ‘홈 화면에 추가’를 누른 뒤 밥뭇나 아이콘으로 열어 주세요.";
  else if (permission === "denied") detail = "기기 설정에서 밥뭇나 알림을 허용하면 여기서 켤 수 있어요.";
  else if (permission === "unsupported") detail = "이 브라우저에서는 앱 안의 알림 목록을 확인해 주세요.";
  else if (!eligible) detail = "가족 휴대폰이나 밥솥 플러그를 연결하고 기기 알림을 켜면 새 소식을 알려 드려요.";
  else if (delivery === "checking") detail = "이 기기의 알림 연결을 확인하고 있어요.";
  else if (delivery === "unknown") detail = "홈 화면 알림 연결을 확인하지 못했어요. 다시 연결할 수 있어요.";
  else if (delivery === "background") detail = "이 기기에 홈 화면 알림을 등록했어요. 자세한 내용은 밥뭇나에서 확인해 주세요.";
  else if (remote) detail = "앱을 닫아도 새 소식이 오면 이 기기로 알려 드려요.";
  else detail = "현재는 앱을 열어 둔 동안 알림을 받을 수 있어요. 앱을 닫은 뒤 받는 알림은 준비 중이에요.";

  async function change(enable: boolean) {
    if (!owner) return;
    setBusy(true);
    setError("");
    try {
      if (enable) {
        const state = await enablePush(view.mode, owner, view.dataSource);
        if (state === "default") setError("알림을 켜려면 기기에서 ‘허용’을 선택해 주세요.");
      } else await disablePush(owner, view.dataSource);
    } catch {
      setError(enable ? "알림을 연결하지 못했어요. 잠시 후 다시 눌러 주세요." : "알림 끄기를 마치지 못했어요. 다시 눌러 주세요.");
    } finally { setBusy(false); }
  }

  return <section aria-label="기기 알림 설정" className="rounded-[1.5rem] border border-line bg-butter-soft p-4 text-cocoa">
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className="shrink-0"><Mascot variant="bunny" className="h-12 w-12" /></span>
      <div><h2 className="text-[16px] font-bold">워밍이의 안부 알림</h2>
        <p className="mt-1 text-[14px] leading-relaxed">{detail}</p></div>
    </div>
    {view.mode === "live" && (canAsk || enabled || delivery === "unknown") && delivery !== "checking" && <div className="mt-2 flex flex-wrap gap-2">
      {canAsk && (!enabled || (remote && delivery !== "background")) &&
        <button type="button" disabled={busy} onClick={() => void change(true)} className="min-h-11 rounded-full bg-cocoa px-5 text-[15px] font-bold text-paper disabled:opacity-50">
          {remote ? "홈 화면 알림 연결" : "앱 사용 중 알림 켜기"}</button>}
      {(enabled || delivery === "unknown") && <button type="button" disabled={busy} onClick={() => void change(false)} className="min-h-11 rounded-full border border-cocoa/35 px-5 text-[15px] font-semibold disabled:opacity-50">이 기기 알림 끄기</button>}
    </div>}
    {view.mode === "live" && owner && (permission === "default" || permission === "granted") &&
      <button type="button" disabled={busy} className="mt-2 min-h-11 rounded-full border border-cocoa/35 bg-paper px-4 font-semibold" onClick={async () => {
        setBusy(true); setTested(""); setError("");
        try {
          if (await testDeviceNotice()) setTested("이 기기에 시험 알림을 표시했어요. 알림 센터에서 눌러 보세요.");
          else setError("기기 알림을 허용한 뒤 다시 눌러 주세요.");
        } catch { setError("시험 알림을 표시하지 못했어요. 기기의 알림 설정을 확인해 주세요."); }
        finally { setBusy(false); }
      }}>이 기기에 시험 알림</button>}
    <NoticePreview key={owner ?? "demo"} owner={owner} enabled={enabled} demo={view.mode === "demo"}/>
    {tested && <p role="status" className="mt-2 text-sm">{tested}</p>}
    {error && <p role="alert" className="mt-2 text-sm font-semibold">{error}</p>}
  </section>;
}
