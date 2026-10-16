"use client";

import { ALERT_TONE, alertCopy } from "@/components/guardian";
import { IconBell, IconCheck } from "@/components/icons";
import { PageHeader, Skeleton } from "@/components/ui";
import { kstDate, kstTime } from "@/lib/judge/time";
import { useApp } from "@/lib/data/useApp";

export default function AlertsPage() {
  const { view, actions } = useApp();
  const alerts = view ? [...view.alerts].sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt)) : [];

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
        {!view ? (
          <Skeleton className="h-24" />
        ) : alerts.length === 0 ? (
          <div className="mt-12 flex flex-col items-center text-center text-muted">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-butter-soft text-cocoa">
              <IconBell className="h-7 w-7" />
            </span>
            <p className="mt-4 text-[17px] font-bold text-cocoa">아직 받은 알림이 없어요</p>
            <p className="mt-1 text-[14px]">끼니 소식이 끊기면 여기로 알려 드릴게요.</p>
          </div>
        ) : (
          alerts.map((a) => {
            const copy = alertCopy(a.type, view.senior.relation, {
              missed: view.alertSettings.missedMealsThreshold,
              fasting: view.alertSettings.fastingHours,
              emergency: view.alertSettings.emergencyHours,
              plugRegistered: !!view.plug.deviceId,
            });
            const t = new Date(a.triggeredAt);
            const done = !!a.acknowledgedAt;
            return (
              <article key={a.id} className={`rounded-[1.5rem] p-5 ${done ? "border border-line" : ALERT_TONE[a.type]}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className={`text-[16px] font-bold ${done ? "text-cocoa/60" : "text-cocoa"}`}>{copy.title}</p>
                  <time className="shrink-0 text-[12px] text-muted">
                    {kstDate(t).slice(5).replace("-", "/")} {kstTime(t)}
                  </time>
                </div>
                <p className="mt-1 text-[14px] text-cocoa/70">{copy.body}</p>
                <div className="mt-3 flex items-center gap-3 text-[13px]">
                  {done ? (
                    <span className="flex items-center gap-1 font-semibold text-sage-deep">
                      <IconCheck className="h-4 w-4" /> 확인함
                    </span>
                  ) : (
                    <button className="h-9 rounded-full bg-cocoa px-4 font-bold text-paper" onClick={() => void actions.ackAlert(a.id)}>
                      확인했어요
                    </button>
                  )}
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
