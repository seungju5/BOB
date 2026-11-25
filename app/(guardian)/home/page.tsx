"use client";

import Link from "next/link";
import { ImpactConnectionLinks } from "@/components/ImpactConnectionLinks";
import { ALERT_PRIORITY, ALERT_TONE, alertCopy, AlertShortcut, fmtDateLong, hasAlertCall, withWa } from "@/components/guardian";
import { IconArrowRight, IconBell, IconChart, IconClock, IconPhone, IconSuitcase } from "@/components/icons";
import { Logo } from "@/components/Mascot";
import { HomeLoadingCompanion, HomeMealCompanion } from "@/components/companions/CookerCompanion";
import { TodayMealList } from "@/components/TodayMeals";
import { buttonClass, Skeleton } from "@/components/ui";
import { countMissedMeals } from "@/lib/judge/evaluateAlerts";
import { kstDate } from "@/lib/judge/time";
import { useApp } from "@/lib/data/useApp";
import { recentSlots, reportSummary, slotsForDate, unackedAlerts } from "@/lib/data/view";

export default function HomePage() {
  const { view, now, actions } = useApp();
  if (!view || !now) {
    return (
      <main className="flex flex-col gap-4 p-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-20 w-60" />
        <Skeleton className="h-36" />
        <Skeleton className="h-24" />
        <HomeLoadingCompanion />
      </main>
    );
  }

  const today = kstDate(now);
  const relation = view.senior.relation;
  const slots = slotsForDate(view, today, now);
  const report = reportSummary(view, now);
  const away = view.absences.find((a) => a.startDate <= today && today <= a.endDate);
  const alerts = unackedAlerts(view).sort((a, b) => ALERT_PRIORITY.indexOf(a.type) - ALERT_PRIORITY.indexOf(b.type));
  const top = alerts[0];
  const callInAlert = hasAlertCall(top?.type, view.senior.phone);
  const copy = top
    ? alertCopy(top.type, relation, {
        missed: countMissedMeals(recentSlots(view, now, 3)),
        fasting: view.alertSettings.fastingHours,
        emergency: view.alertSettings.emergencyHours,
        plugRegistered: !!view.plug.deviceId,
        payload: top.payload,
        issuedAt: top.triggeredAt,
      })
    : null;

  return (
    <main className="flex flex-col px-5 pt-4 pb-8">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <Logo />
        <Link href="/alerts" className="flex min-h-12 items-center gap-1.5 rounded-full border border-line px-3 text-[16px] font-bold text-cocoa">
          <IconBell aria-hidden className="h-5 w-5" />알림{alerts.length > 0 ? ` ${alerts.length}개` : ""}
        </Link>
      </header>
      <p className="mt-5 text-[16px] text-muted">{fmtDateLong(today)}</p>
      <h1 className="mt-1 text-[28px] leading-tight font-extrabold tracking-tight text-cocoa">{withWa(relation)} 나누는 오늘의 안부</h1>
      {away ? <p className="mt-2 flex items-center gap-2 text-[17px] font-bold text-sky-deep"><IconSuitcase aria-hidden className="h-5 w-5" />{Number(away.endDate.slice(5, 7))}월 {Number(away.endDate.slice(8))}일까지 외출 중이에요</p> : null}

      {top && copy ? (
        <section className={`mt-4 rounded-[1.35rem] p-4 ${ALERT_TONE[top.type]}`} role="alert">
          <h2 className="text-[18px] font-bold text-cocoa">{copy.title}</h2>
          <p className="mt-1 text-[16px] leading-relaxed text-cocoa">{copy.body}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void actions.ackAlert(top.id)} className="min-h-12 rounded-full bg-cocoa px-4 text-[16px] font-bold text-paper">
              확인했어요
            </button>
            <AlertShortcut type={top.type} relation={relation} phone={view.senior.phone} />
          </div>
        </section>
      ) : null}

      <section aria-label="오늘의 끼니" className="mt-4 rounded-[1.5rem] border border-line bg-paper px-4 pt-2 pb-4">
        <HomeMealCompanion mealCount={view.mealProfile.windows.length} />
        <TodayMealList windows={view.mealProfile.windows} slots={slots} />
        {!slots.length && <p className="mt-2 text-[17px] font-semibold text-cocoa">아직 연결된 식사 기록이 없어요.</p>}
        <p className="mt-2 text-[16px] leading-relaxed text-muted">{slots.length ? "밥솥 사용 소식이에요. 드신 양은 알 수 없어요." : "기기를 연결하면 이곳에서 밥솥 소식을 볼 수 있어요."}</p>
        {!callInAlert && (
          <div className="mt-3">
            {view.senior.phone ? (
              <a href={`tel:${view.senior.phone.replace(/(?!^\+)\D/g, "")}`} className={buttonClass("dark", "min-h-14 text-lg")}>
                <IconPhone aria-hidden className="h-5 w-5" />{relation}께 전화하기
                <span className="sr-only"> · 등록한 가구 대표자 한 분에게 연결돼요.</span>
              </a>
            ) : (
              <Link href={view.seniorConsent ? "/settings/#settings-senior-phone" : "/settings/#device"} className={buttonClass("dark", "min-h-14 text-lg")}>
                <IconPhone aria-hidden className="h-5 w-5" />{relation} 연락처 등록하기
              </Link>
            )}
          </div>
        )}
        <Link href="/records" className="mt-2 flex min-h-12 items-center justify-between rounded-lg px-1 text-[17px] font-bold text-cocoa">
          <span className="inline-flex items-center gap-2"><IconClock aria-hidden className="h-5 w-5" />식사 기록 보기</span><IconArrowRight aria-hidden className="h-5 w-5" />
        </Link>
      </section>

      <Link href="/report" className={`mt-6 block border-y border-line py-4 hover:bg-cream ${report?.trend === "down" ? "text-blush-deep" : "text-cocoa"}`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-2 text-[18px] font-bold"><IconChart aria-hidden className="h-5 w-5" />최근 7일 리포트</h2>
          <IconArrowRight aria-hidden className="h-5 w-5 shrink-0" />
        </div>
        {report ? <>
          <p className="mt-2 text-[17px] text-cocoa">끼니 확인율 <strong>{report.r}%</strong> · {report.message}</p>
          <p className="mt-1 text-[16px] leading-relaxed text-muted">어제까지 7일을 그 전 4주 평균과 비교해요.</p>
        </> : <p className="mt-1 text-[16px] leading-relaxed text-muted">일주일 넘게 기록이 쌓이면 평소와 비교해 드려요.</p>}
      </Link>
      <ImpactConnectionLinks compact />
    </main>
  );
}
