"use client";

import Link from "next/link";
import { ALERT_PRIORITY, ALERT_TONE, alertCopy, fmtDateLong, STATUS_META, StatusIcon } from "@/components/guardian";
import { IconArrowRight, IconClock, IconPhone, IconSuitcase, IconWifi } from "@/components/icons";
import { Logo, Mascot } from "@/components/Mascot";
import { buttonClass, Skeleton } from "@/components/ui";
import { countMissedMeals } from "@/lib/judge/evaluateAlerts";
import { kstDate, kstTime } from "@/lib/judge/time";
import { useApp } from "@/lib/data/useApp";
import { recentSlots, SLOT_LABEL, slotsForDate, unackedAlerts } from "@/lib/data/view";

export default function HomePage() {
  const { view, now, actions, mode } = useApp();
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
  const relation = view.senior.relation;
  const slots = slotsForDate(view, today, now);
  const lastCook = view.lastCookerAt ? new Date(view.lastCookerAt) : null;
  const reading = view.plug.lastReadingAt ? new Date(view.plug.lastReadingAt) : null;
  const away = view.absences.find((a) => a.startDate <= today && today <= a.endDate);
  const alerts = unackedAlerts(view).sort((a, b) => ALERT_PRIORITY.indexOf(a.type) - ALERT_PRIORITY.indexOf(b.type));
  const top = alerts[0];
  const copy = top
    ? alertCopy(top.type, relation, {
        missed: countMissedMeals(recentSlots(view, now, 3)),
        fasting: view.alertSettings.fastingHours,
        emergency: view.alertSettings.emergencyHours,
        plugRegistered: !!view.plug.deviceId,
      })
    : null;

  return (
    <main className="flex flex-col px-6 pt-6 pb-8">
      <header className="flex items-center justify-between">
        <Logo />
        {mode === "demo" ? <span className="rounded-full bg-butter-soft px-3 py-1 text-xs font-semibold text-cocoa/70">데모</span> : null}
      </header>

      <h1 className="animate-rise mt-7 text-[30px] leading-tight font-extrabold text-cocoa">
        {relation}와 나누는
        <br />
        오늘의 안부
      </h1>
      <p className="mt-2 text-[15px] text-muted">{fmtDateLong(today)}</p>

      {top && copy ? (
        <section className={`animate-rise mt-5 rounded-[1.75rem] p-5 ${ALERT_TONE[top.type]}`} role="alert">
          <p className="text-[18px] font-extrabold text-cocoa">{copy.title}</p>
          <p className="mt-1 text-[15px] text-cocoa/75">{copy.body}</p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => void actions.ackAlert(top.id)} className="h-10 rounded-full bg-cocoa px-5 text-sm font-bold text-paper">
              확인했어요
            </button>
            {alerts.length > 1 ? (
              <Link href="/alerts" className="flex h-10 items-center rounded-full px-4 text-sm font-semibold text-cocoa/70">
                알림 {alerts.length}개 보기
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      <Link href="/records" className="mt-5 block rounded-[1.75rem] bg-butter-soft p-6 transition-colors hover:bg-butter/60">
        <div className="flex items-center justify-between text-[15px] text-cocoa/70">
          밥솥이 전한 소식
          <IconArrowRight className="h-5 w-5 text-cocoa" />
        </div>
        {away ? (
          <p className="mt-3 flex items-center gap-2 text-[22px] leading-snug font-extrabold text-cocoa">
            <IconSuitcase className="h-6 w-6 text-sky-deep" />
            {Number(away.endDate.slice(5, 7))}월 {Number(away.endDate.slice(8))}일까지 외출 중이에요
          </p>
        ) : lastCook ? (
          <>
            <p className="mt-3 text-[34px] leading-none font-extrabold tracking-tight text-cocoa">
              {kstDate(lastCook) === today ? kstTime(lastCook) : `${Number(kstDate(lastCook).slice(8))}일 ${kstTime(lastCook)}`}
            </p>
            <p className="mt-1 text-[22px] font-extrabold text-cocoa">움직임이 전해졌어요.</p>
          </>
        ) : (
          <p className="mt-3 text-[22px] font-extrabold text-cocoa">아직 전해진 소식이 없어요.</p>
        )}
        <p className="mt-3 flex items-center gap-1.5 text-[13px] text-cocoa/60">
          <IconWifi className="h-4 w-4" />
          {!view.plug.deviceId
            ? "밥솥 플러그를 아직 연결하지 않았어요"
            : reading
              ? `마지막 기기 수신 ${kstDate(reading) === today ? "오늘" : kstDate(reading).slice(5).replace("-", "/")} ${kstTime(reading)}`
              : "기기 연결을 확인해 주세요"}
        </p>
      </Link>

      <section className="mt-4 rounded-[1.75rem] border border-line p-5">
        <h2 className="text-[15px] font-bold text-cocoa">오늘의 끼니</h2>
        <ul className="mt-3 grid grid-cols-3 gap-2">
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
        <p className="mt-3 text-[12px] leading-relaxed text-muted">밥솥 사용 여부만 전해요. 무엇을 얼마나 드셨는지는 알 수 없어요.</p>
      </section>

      <div className="mt-6 flex items-end gap-3">
        <Mascot className="h-16 w-16 shrink-0" mood={top ? "worried" : "happy"} />
        <p className="pb-2 text-[15px] leading-relaxed text-cocoa/80">
          {top ? "소식이 뜸할 땐 목소리가 제일 좋아요." : "오늘도 평소처럼 지내고 계세요."}
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
