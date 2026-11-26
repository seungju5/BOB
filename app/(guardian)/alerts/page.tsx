"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ALERT_TONE, alertCopy, AlertShortcut } from "@/components/guardian";
import { DevicePushSettings } from "@/components/DevicePushSettings";
import { pushOwner } from "@/lib/push-device";
import { IconArrowRight, IconBell, IconChart, IconCheck } from "@/components/icons";
import { PageHeader, Skeleton } from "@/components/ui";
import { kstDate, kstTime } from "@/lib/judge/time";
import { useApp } from "@/lib/data/useApp";
import { PowerNotice } from "@/components/SmartThingsAccountCard";
import { unackedAlerts } from "@/lib/data/view";

export default function AlertsPage() {
  const { view, actions, accountKey } = useApp();
  const alerts = view ? [...view.alerts].sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt)) : [];
  const [filter, setFilter] = useState<"all" | "unread" | "reports">("all");
  const unread = view ? unackedAlerts(view) : [];
  const reports = alerts.filter((a) => a.type === "weekly_report");
  const visibleAlerts = filter === "reports" ? reports : filter === "unread" ? unread : alerts;

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
          unread.length > 0 ? (
            <button className="text-sm font-semibold text-cocoa/70" onClick={() => void actions.ackAll()}>
              모두 확인
            </button>
          ) : null
        }
      />
      <div className="flex flex-col gap-3 px-6">
        <p className="text-[16px] text-muted">리포트와 가족의 소식을 모아 봐요.</p>
        <Link href="/report" className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-sage p-4 text-cocoa">
          <IconChart aria-hidden className="h-6 w-6 shrink-0" />
          <span className="flex-1"><strong className="block text-[17px]">최근 7일 리포트</strong><span className="text-[14px]">끼니 기록과 한 주의 변화를 확인해요</span></span>
          <IconArrowRight aria-hidden className="h-5 w-5 shrink-0" />
        </Link>
        <div role="group" aria-label="알림 종류" className="flex flex-wrap gap-2">
          {([
            ["all", "전체", alerts.length],
            ["unread", "미확인", unread.length],
            ["reports", "리포트", reports.length],
          ] as const).map(([key, label, count]) => (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)} className={`min-h-12 rounded-full border px-3 text-[15px] font-bold ${filter === key ? "border-cocoa bg-cocoa text-paper" : "border-line bg-paper text-cocoa"}`}>
              {label} {count}
            </button>
          ))}
        </div>
        {view?.mode === "live" && view.plug.powerNoticeAt && <PowerNotice at={view.plug.powerNoticeAt}/>}
        {!view ? (
          <Skeleton className="h-24" />
        ) : visibleAlerts.length === 0 ? (
          <div className="mt-12 flex flex-col items-center text-center text-muted">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-butter-soft text-cocoa">
              <IconBell className="h-7 w-7" />
            </span>
            <p className="mt-4 text-[17px] font-bold text-cocoa">{filter === "unread" ? "모든 알림을 확인했어요" : filter === "reports" ? "아직 리포트 발행 알림이 없어요" : "아직 받은 알림이 없어요"}</p>
            <p className="mt-1 text-[14px]">{view.careAvailable === false ? "연결 전에는 식사 여부를 판단하지 않아요." : "새로운 리포트와 가족 소식이 오면 여기서 확인할 수 있어요."}</p>
          </div>
        ) : (
          visibleAlerts.map((a) => {
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
        {view && <details className="mt-4 rounded-2xl border border-line p-4">
          <summary className="cursor-pointer py-2 text-[16px] font-bold text-cocoa">이 휴대폰 알림 설정</summary>
          <div className="mt-3"><DevicePushSettings key={pushOwner(accountKey) ?? view.mode} view={view} accountKey={accountKey} /></div>
        </details>}
      </div>
    </main>
  );
}
