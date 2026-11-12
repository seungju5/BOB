"use client";

import Link from "next/link";
import { DeviceCoach } from "@/components/DeviceCoach";
import { RiceFill } from "@/components/RiceFill";
import { ALERT_PRIORITY, ALERT_TONE, alertCopy, AlertShortcut, fmtDateLong, STATUS_META, StatusIcon, withWa } from "@/components/guardian";
import { IconArrowRight, IconChart, IconClock, IconPhone, IconSuitcase, IconWifi } from "@/components/icons";
import { Logo, CookerMascot } from "@/components/Mascot";
import { buttonClass, Skeleton } from "@/components/ui";
import { countMissedMeals } from "@/lib/judge/evaluateAlerts";
import { kstDate, kstTime } from "@/lib/judge/time";
import { useApp } from "@/lib/data/useApp";
import { recentSlots, reportSummary, SLOT_LABEL, slotsForDate, unackedAlerts } from "@/lib/data/view";

export default function HomePage() {
  const { view, now, actions, mode, ownerId } = useApp();
  if (!view || !now) {
    return (
      <main className="flex flex-col gap-4 p-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-20 w-60" />
        <Skeleton className="h-36" />
        <Skeleton className="h-24" />
      </main>
    );
  }

  const today = kstDate(now);
  const monitoring = view.mode === "demo" || view.seniorConsent;
  const relation = view.senior.relation;
  const slots = slotsForDate(view, today, now);
  const mealNotes = slots.filter((slot) => slot.status === "confirmed" || slot.status === "eat_out").length;
  const report = reportSummary(view, now);
  const reading = view.plug.lastReadingAt ? new Date(view.plug.lastReadingAt) : null;
  const away = view.absences.find((a) => a.startDate <= today && today <= a.endDate);
  const alerts = unackedAlerts(view)
    .filter((alert) => alert.type !== "device_offline" || !!view.plug.deviceId)
    .sort((a, b) => ALERT_PRIORITY.indexOf(a.type) - ALERT_PRIORITY.indexOf(b.type));
  const top = alerts[0];
  const copy = top
    ? alertCopy(top.type, relation, {
        missed: countMissedMeals(recentSlots(view, now, 3)),
        fasting: view.alertSettings.fastingHours,
        emergency: view.alertSettings.emergencyHours,
        plugRegistered: !!view.plug.deviceId,
        payload: top.payload,
      })
    : null;

  return (
    <main className="flex flex-col px-6 pt-6 pb-8">
      <header className="flex items-center justify-between">
        <Logo />
        {mode === "demo" ? <span className="rounded-full bg-butter-soft px-3 py-1 text-xs font-semibold text-cocoa/70">데모</span> : null}
      </header>

      <h1 className="animate-rise mt-7 text-[30px] leading-tight font-extrabold text-cocoa">
        {withWa(relation)} 나누는
        <br />
        오늘의 안부
      </h1>
      <p className="mt-2 text-[15px] text-muted">{fmtDateLong(today)}</p>

      {!view.plug.deviceId && <DeviceCoach scope={ownerId ?? "demo"} />}

      {top && copy ? (
        <section className={`animate-rise mt-5 rounded-[1.75rem] p-5 ${ALERT_TONE[top.type]}`} role="alert">
          <p className="text-[18px] font-extrabold text-cocoa">{copy.title}</p>
          <p className="mt-1 text-[15px] text-cocoa/75">{copy.body}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => void actions.ackAlert(top.id)} className="h-10 rounded-full bg-cocoa px-5 text-sm font-bold text-paper">
              확인했어요
            </button>
            <AlertShortcut type={top.type} relation={relation} phone={view.senior.phone} />
            {alerts.length > 1 ? (
              <Link href="/alerts" className="flex h-10 items-center rounded-full px-4 text-sm font-semibold text-cocoa/70">
                알림 {alerts.length}개 보기
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      {monitoring ? <Link
        href="/report"
        className={`mt-5 block rounded-[1.75rem] p-6 transition-colors ${report?.trend === "down" ? "bg-blush hover:bg-blush/70" : "bg-butter-soft hover:bg-butter/60"}`}
      >
        <div className="flex items-center justify-between text-[15px] text-cocoa/70">
          <span className="flex items-center gap-1.5">
            <IconChart className="h-4 w-4" />
            이번 주 리포트
          </span>
          <IconArrowRight className="h-5 w-5 text-cocoa" />
        </div>
        {away ? (
          <p className="mt-3 flex items-center gap-2 text-[22px] leading-snug font-extrabold text-cocoa">
            <IconSuitcase className="h-6 w-6 text-sky-deep" />
            {Number(away.endDate.slice(5, 7))}월 {Number(away.endDate.slice(8))}일까지 외출 중이에요
          </p>
        ) : report ? (
          <>
            <p className="mt-3 flex items-baseline gap-2 text-cocoa">
              <span className="text-[40px] leading-none font-extrabold tracking-tight">{report.r}%</span>
              <span className="text-[14px] text-cocoa/70">최근 7일 끼니 확인율</span>
            </p>
            <p className="mt-2 text-[18px] leading-snug font-extrabold text-cocoa">{report.message}</p>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-paper/80" aria-hidden>
              <div className="h-full rounded-full bg-butter-deep" style={{ width: `${report.r}%` }} />
            </div>
          </>
        ) : (
          <>
            <p className="mt-3 text-[20px] font-extrabold text-cocoa">리포트를 준비하고 있어요.</p>
            <p className="mt-1 text-[14px] text-cocoa/70">일주일 넘게 기록이 쌓이면 평소와 비교해 드릴게요.</p>
          </>
        )}
        <p className="mt-3 flex items-center gap-1.5 text-[13px] text-cocoa/60">
          <IconWifi className="h-4 w-4" />
          {!view.plug.deviceId
            ? "밥솥 플러그를 아직 연결하지 않았어요"
            : reading
              ? `마지막 기기 수신 ${kstDate(reading) === today ? "오늘" : kstDate(reading).slice(5).replace("-", "/")} ${kstTime(reading)}`
              : "기기 연결을 확인해 주세요"}
        </p>
      </Link> : (
        <section className="mt-5 rounded-[1.75rem] bg-butter-soft p-5">
          <h2 className="text-[17px] font-bold">안부 알림·생활 리포트는 아직 꺼져 있어요.</h2>
          <p className="mt-1 text-[15px]">어르신이 별도로 동의하시면 기기 설정에서 시작할 수 있어요.</p>
        </section>
      )}

      {monitoring && <section className="mt-4 rounded-[1.75rem] border border-line p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-[17px] font-bold text-cocoa">오늘의 끼니</h2>
            <p className="mt-1 text-[14px] text-cocoa/80">{mealNotes ? `확인된 끼니 소식 ${mealNotes}개` : "아직 확인할 끼니 소식이 없어요."}</p>
          </div>
          <RiceFill key={mealNotes} count={mealNotes || null} className="size-16 shrink-0" />
        </div>
        <ul className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(slots.length, 1)}, minmax(0, 1fr))` }}>
          {slots.map((s) => (
            <li key={s.slot} className={`flex flex-col items-center gap-1.5 rounded-2xl py-3 ${STATUS_META[s.status].className}`}>
              <span className="text-[13px] font-semibold opacity-80">{SLOT_LABEL[s.slot]}</span>
              <span className="flex items-center gap-1 text-[15px] font-bold">
                <StatusIcon status={s.status} />
                {STATUS_META[s.status].label}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[13px] leading-relaxed text-cocoa/70">그림 속 밥의 양은 기록 수를 뜻해요. 실제 드신 양은 알 수 없어요.</p>
      </section>}

      <div className="mt-6 flex items-end gap-3">
        <CookerMascot className="h-16 w-16 shrink-0" mood={top ? "worried" : "happy"} />
        <p className="pb-2 text-[15px] leading-relaxed text-cocoa/80">
          {top ? "소식이 뜸할 땐 목소리가 제일 좋아요." : "편한 때 짧게 안부를 전해 보세요."}
        </p>
      </div>

      {view.senior.phone ? (
        <a href={`tel:${view.senior.phone.replace(/\D/g, "")}`} className={buttonClass("dark", "mt-4 min-h-16 text-[18px]")}>
          <IconPhone className="h-5 w-5" />
          {relation}께 전화하기
        </a>
      ) : (
        <Link href="/settings" className={buttonClass("dark", "mt-4 min-h-16 text-[18px]")}>
          <IconPhone className="h-5 w-5" />
          {relation} 연락처 등록하기
        </Link>
      )}
      <Link href="/records" className="mt-3 flex items-center justify-center gap-1.5 py-2 text-[15px] font-semibold text-cocoa/70">
        <IconClock className="h-4 w-4" />
        식사 기록 보기
      </Link>
    </main>
  );
}
