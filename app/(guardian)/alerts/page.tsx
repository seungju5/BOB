"use client";

import { useState } from "react";
import { ALERT_TONE, alertCopy, AlertShortcut } from "@/components/guardian";
import { IconBell, IconCheck } from "@/components/icons";
import { PageHeader, Skeleton } from "@/components/ui";
import { kstDate, kstTime } from "@/lib/judge/time";
import { useApp } from "@/lib/data/useApp";
import { enablePush, usePushState } from "@/lib/push";

export default function AlertsPage() {
  const { view, actions, mode } = useApp();
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
        {view?.careAvailable === false ? <p className="rounded-2xl bg-butter-soft p-4 text-[16px]">가족과 기기를 연결하면 실제 알림을 받을 수 있어요. 지금은 설정한 기준만 저장돼요.</p> : <PushCard mode={mode} alertIds={alerts.map((a) => a.id)} />}
        {!view ? (
          <Skeleton className="h-24" />
        ) : alerts.length === 0 ? (
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

/** 휴대폰 알림 켜기. 켜져 있으면 작게, 막혀 있으면 브라우저 설정 안내 */
function PushCard({ mode, alertIds }: { mode: "demo" | "live" | null; alertIds: string[] }) {
  const state = usePushState();
  const [busy, setBusy] = useState(false);
  if (state === "unsupported") return null;
  if (state === "granted")
    return (
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-sage-deep">
        <IconCheck className="h-4 w-4" /> 휴대폰 알림을 받고 있어요
      </p>
    );
  return (
    <section className="rounded-[1.5rem] border-2 border-butter bg-butter-soft p-5">
      <p className="flex items-center gap-2 text-[16px] font-bold text-cocoa">
        <IconBell className="h-5 w-5" /> 휴대폰으로 알림 받기
      </p>
      {state === "denied" ? (
        <p className="mt-1 text-[14px] leading-relaxed text-cocoa/75">알림이 꺼져 있어요. 브라우저(또는 휴대폰) 설정에서 밥뭇나 알림을 허용해 주세요.</p>
      ) : (
        <>
          <p className="mt-1 text-[14px] leading-relaxed text-cocoa/75">식사 소식이 끊기거나 어르신이 버튼을 누르시면 바로 알려 드려요. iPhone은 홈 화면에 추가한 뒤 켤 수 있어요.</p>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await enablePush(mode, alertIds);
              } finally {
                setBusy(false);
              }
            }}
            className="mt-3 h-10 rounded-full bg-cocoa px-5 text-sm font-bold text-paper disabled:opacity-50"
          >
            {busy ? "켜는 중…" : "알림 켜기"}
          </button>
        </>
      )}
    </section>
  );
}
