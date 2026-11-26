"use client";

import Link from "next/link";
import { useLayoutEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { fmtDateLong, fmtMonthDay, StatusIcon } from "@/components/guardian";
import { MealStatusChip, MealStatusLegend } from "@/components/MealStatus";
import { PageHeader, Skeleton } from "@/components/ui";
import { monthLeadingDays, navigateRecords, recordPeriod } from "@/components/records/period";
import { MEAL_DAY_LABEL, MEAL_STATUS_LABEL, mealDayClass, mealStatusClass, useMealPalette } from "@/lib/data/appearance";
import { kstDate } from "@/lib/judge/time";
import { datedMealSlots, mealPositionRows } from "@/lib/report/metrics";
import { useApp } from "@/lib/data/useApp";
import { careDataAvailable, mealDaySummary, type AppView } from "@/lib/data/view";
import { demoPowerTranscript } from "@/lib/power/power-transcription-model";
import { PowerTranscriptionSection } from "@/components/power/PowerTranscriptionSection";
import { PowerNotice } from "@/components/SmartThingsAccountCard";
import { noticeDay, noticeSlot } from "@/public/notification-content";

const RANGES = [{ id: "day", label: "일" }, { id: "week", label: "주" }, { id: "month", label: "월" }] as const;

function listenRecordLink(refresh: () => void) {
  window.addEventListener("popstate", refresh);
  return () => window.removeEventListener("popstate", refresh);
}

export default function RecordsPage() {
  const { view, now } = useApp();
  const [selection, navigate] = useReducer(navigateRecords, { range: "week", date: null });
  const { range, date: selectedDate, openedFrom } = selection;
  const sectionRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef<"title" | "date" | "linkedDay" | "meal" | null>(null);
  const today = now ? kstDate(now) : null;
  const launchDay = useRef<string | null>(null);
  const search = useSyncExternalStore(listenRecordLink, () => location.search, () => "");
  const query = new URLSearchParams(search);
  const linkedDate = noticeDay(query.get("day"));
  const linkedSlot = noticeSlot(query.get("slot"));
  useLayoutEffect(() => {
    if (!today || !linkedDate || linkedDate > today) return;
    const target = linkedDate + "/" + (linkedSlot ?? "");
    if (launchDay.current === target) return;
    launchDay.current = target;
    pendingFocus.current = linkedSlot ? "meal" : "linkedDay";
    navigate({type: "day", date: linkedDate});
  }, [today, linkedDate, linkedSlot]);
  const anchor = selectedDate ?? today;
  const period = anchor ? recordPeriod(anchor, range) : null;
  const currentPeriod = today ? recordPeriod(today, range) : null;
  const rangeLabel = RANGES.find((item) => item.id === range)?.label;

  function openDay(date: string) {
    pendingFocus.current = "title";
    navigate({ type: "day", date });
  }

  function goToToday() {
    pendingFocus.current = "title";
    navigate({ type: "today" });
  }

  function returnToOverview() {
    pendingFocus.current = "date";
    navigate({ type: "overview" });
  }

  useLayoutEffect(() => {
    const focus = pendingFocus.current;
    if (!focus || !anchor || !titleRef.current) return;
    if ((focus === "meal" || focus === "linkedDay") && (range !== "day" || anchor !== linkedDate)) return;
    const meal = focus === "meal" ? sectionRef.current?.querySelector<HTMLElement>("[data-notice-meal]") : null;
    if (focus === "meal" && view?.mode === "live" && view.seniorConsent && !meal && !view.cookerMealDays) return;
    pendingFocus.current = null;
    const calendarDate = focus === "date"
      ? sectionRef.current?.querySelector<HTMLButtonElement>(`[data-record-date="${anchor}"]`)
      : null;
    (meal ?? calendarDate ?? titleRef.current).focus({ preventScroll: true });
    if (meal || calendarDate) (meal ?? calendarDate)?.scrollIntoView({ block: "center", inline: "nearest" });
    else sectionRef.current?.scrollIntoView({ block: "start" });
  }, [selection, range, anchor, linkedDate, view]);

  const demoTranscript = demoPowerTranscript(view);
  const noCareData = view && !careDataAvailable(view) && !view.slots.length && !Object.keys(view.stats).length;
  const signal = view?.plug.powerNoticeAt;
  const daySignal = range === "day" && signal && view.mode === "live" && view.seniorConsent &&
    view.plug.status === "connected" && view.plug.isVirtual === false &&
    kstDate(new Date(signal)) === anchor ? signal : null;

  return (
    <main className="flex flex-col pb-8">
      <PageHeader title="식사 기록" />
      <div ref={sectionRef} className="scroll-mt-2 px-6">
        <div role="group" aria-label="기록 기간" className="grid grid-cols-3 rounded-full bg-butter-soft p-1">
          {RANGES.map((item) => (
            <button key={item.id} type="button" aria-pressed={range === item.id} onClick={() => navigate({ type: "range", range: item.id })}
              className={`min-h-11 rounded-full text-[15px] font-bold transition-colors ${range === item.id ? "bg-paper text-cocoa shadow-sm" : "text-cocoa/60"}`}>
              {item.label}별
            </button>
          ))}
        </div>
        {!view || !now || !period || !anchor || !today ? <Skeleton className="mt-6 h-64" /> : (
          <>
            <div className="mt-5 grid grid-cols-[44px_1fr_44px] items-center gap-2">
              <button type="button" aria-label={`이전 ${rangeLabel} 보기`} onClick={() => navigate({ type: "move", direction: -1, today })} className="h-11 rounded-full border border-line text-xl font-bold text-cocoa">‹</button>
              <h2 ref={titleRef} tabIndex={-1} aria-live="polite" aria-atomic="true" className="rounded-xl text-center text-xl font-extrabold leading-snug text-cocoa">
                {range === "day" ? <time dateTime={anchor}>
                  <span className="block text-sm font-semibold text-muted">{anchor.slice(0, 4)}년{anchor === today ? " · 오늘" : ""}</span>
                  {fmtDateLong(anchor)}<span className="sr-only"> 일별 기록</span>
                </time> : range === "month" ? `${anchor.slice(0, 4)}년 ${Number(anchor.slice(5, 7))}월` : `${period.from.slice(0, 4)}년 ${fmtMonthDay(period.from)} – ${fmtMonthDay(period.to)}`}
              </h2>
              <button type="button" aria-label={`다음 ${rangeLabel} 보기`} disabled={period.from >= (currentPeriod?.from ?? today)} onClick={() => navigate({ type: "move", direction: 1, today })} className="h-11 rounded-full border border-line text-xl font-bold text-cocoa disabled:cursor-not-allowed disabled:opacity-30">›</button>
            </div>
            <div className="my-3 flex flex-wrap items-center justify-end gap-2">
              {openedFrom && <button type="button" onClick={returnToOverview} className="mr-auto min-h-11 rounded-full px-2 text-sm font-bold text-cocoa underline underline-offset-4">
                {openedFrom === "month" ? `${Number(anchor.slice(5, 7))}월 달력으로` : "주간 기록으로"}
              </button>}
              <button type="button" onClick={goToToday} className="min-h-11 rounded-full bg-butter-soft px-4 text-sm font-bold text-cocoa">오늘로 돌아가기</button>
            </div>
            {view.mode === "demo" ? <p className="mb-3 text-[12px] text-muted">체험용 가상 기록이에요.</p> : null}
            {daySignal && <PowerNotice at={daySignal}/>}
            {view.captureReadError && <p role="status" className="py-2 text-muted">저장한 밥솥 기록을 불러오지 못했어요. 잠시 후 다시 열어 주세요.</p>}
            {noCareData && daySignal ? <p className="py-4 text-[15px] text-muted">이날의 끼니별 기록은 아직 없어요.</p> : noCareData ? (
              <section className="mt-3 rounded-[1.75rem] border border-line bg-paper p-6">
                <h2 className="text-[18px] font-bold text-cocoa">아직 연결된 식사 기록이 없어요</h2>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">가족과 기기의 실제 소식이 연결되면 이곳에 기록을 보여 드려요. 연결 전에는 식사 여부를 판단하지 않아요.</p>
                <Link href="/settings" className="mt-4 inline-flex min-h-11 items-center font-bold text-cocoa underline underline-offset-4">연결 설정 보기</Link>
              </section>
            ) : (
              <div key={`${range}:${period.from}`} className={range === "day" ? "mt-2 animate-rise" : "mt-2"}>
                <section aria-labelledby="meal-status-heading" className="rounded-[1.75rem] border border-line p-4">
                  <h2 id="meal-status-heading" className="text-[17px] font-bold text-cocoa">끼니 상태</h2>
                  {range === "day" ? <DayMeals view={view} date={anchor} now={now} highlight={linkedDate === anchor && view.mode === "live" && view.seniorConsent && view.cookerMealDays?.[anchor]?.some(w => w.slot === linkedSlot) ? linkedSlot : null} /> : range === "week" ? <WeekMeals view={view} dates={period.dates} now={now} onOpenDay={openDay} /> : <MonthGrid view={view} dates={period.dates} now={now} onOpenDay={openDay} />}
                </section>
                {range === "month" ? <MonthLegend /> : <MealStatusLegend />}
                <p className="mt-2 text-[12px] leading-relaxed text-muted">소식 확인은 밥솥 사용이나 어르신의 외식 알림을 뜻해요. 실제 식사·건강 상태의 판단은 아니에요.</p>
                <CookerUsage view={view} dates={period.dates} now={now} day={range === "day"} onOpenDay={openDay} />
                {demoTranscript && <PowerTranscriptionSection transcript={demoTranscript} />}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function DayMeals({ view, date, now, highlight }: { view: AppView; date: string; now: Date; highlight: string | null }) {
  const slots = datedMealSlots(view, date, now);
  if (!slots.length) return <p className="py-5 text-[15px] text-muted">{view.stats[date] ? "이날 측정에서 취사 신호가 확인된 끼니 시간대는 없어요." : "이날의 끼니 기록이 없어요."}</p>;
  return <ul className="mt-3 flex flex-col gap-2">{slots.map((slot) => {
    const match = slot.slot === highlight && slot.status === "confirmed" && slot.source === "cooker";
    return <li key={slot.slot} tabIndex={-1} data-notice-meal={match || undefined} className={'flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-4 py-4 ' + (match ? "border-cocoa bg-butter-soft" : "border-line")}>
      <span className="text-[16px] font-bold text-cocoa">{slot.label}</span>
      <MealStatusChip status={slot.status} />
    </li>;
  })}</ul>;
}

function WeekMeals({ view, dates, now, onOpenDay }: { view: AppView; dates: string[]; now: Date; onOpenDay: (date: string) => void }) {
  const palette = useMealPalette();
  const today = kstDate(now);
  const days = dates.map(date => ({ date, slots: date <= today ? datedMealSlots(view, date, now) : [] }));
  const rows = mealPositionRows(days, dates.includes(today) ? view.mealProfile.windows.length : 0);
  return <div className="mt-3 overflow-x-auto pb-2">
    <table className="w-full min-w-[360px] border-separate border-spacing-1 text-center text-[12px]">
      <caption className="sr-only">날짜별 끼니 상태. 날짜를 누르면 하루 기록을 확인할 수 있어요.</caption>
      <thead><tr><th scope="col" className="w-12"><span className="sr-only">끼니</span></th>{dates.map((date) => <th key={date} scope="col" className="font-medium text-muted"><button type="button" data-record-date={date} disabled={date > today} onClick={() => onOpenDay(date)} aria-current={date === today ? "date" : undefined} className="min-h-11 min-w-10 rounded-lg disabled:opacity-40" aria-label={`${fmtDateLong(date)} 하루 기록 보기`}>{fmtMonthDay(date)}</button></th>)}</tr></thead>
      <tbody>{rows.map(({ position, label }) => (
        <tr key={position}>
          <th scope="row" className="text-left font-semibold text-cocoa">{label}</th>
          {days.map(({ date, slots }) => {
            const found = slots.find(item => item.position === position);
            return <td key={date}>{found ? <span role="img" className={`mx-auto grid h-9 w-9 place-items-center rounded-xl ${mealStatusClass(found.status, palette)}`} aria-label={`${fmtMonthDay(date)} ${label} ${MEAL_STATUS_LABEL[found.status]}`}><StatusIcon status={found.status} className="h-4 w-4" /></span> : <span className="text-muted" aria-label={date > today ? "아직 오지 않은 날" : "기록 없음"}>–</span>}</td>;
          })}
        </tr>
      ))}</tbody>
    </table>
    {!rows.length && <p className="py-4 text-center text-sm text-muted">이 주에는 끼니 기록이 없어요.</p>}
  </div>;
}

function MonthGrid({ view, dates, now, onOpenDay }: { view: AppView; dates: string[]; now: Date; onOpenDay: (date: string) => void }) {
  const palette = useMealPalette();
  const today = kstDate(now);
  return <>
    <p className="mt-2 text-sm text-muted">날짜를 누르면 그날의 끼니와 밥솥 사용 기록이 열려요.</p>
    <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[12px] text-muted">{["월", "화", "수", "목", "금", "토", "일"].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="mt-2 grid grid-cols-7 gap-1">
      {Array.from({ length: monthLeadingDays(dates[0]) }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
      {dates.map((date) => {
        const { tone, ok, total } = mealDaySummary(view, date, now);
        const future = date > today;
        const description = future ? "아직 오지 않은 날" : `${MEAL_DAY_LABEL[tone]}${total ? `, ${ok}/${total}끼 소식 확인` : ""}`;
        return <button key={date} type="button" data-record-date={date} disabled={future} onClick={() => onOpenDay(date)} aria-current={date === today ? "date" : undefined} aria-label={`${fmtDateLong(date)}, ${description}${future ? "" : ". 하루 기록 보기"}`} className={`flex min-h-12 flex-col items-center justify-center rounded-xl px-0.5 py-2 text-[12px] disabled:opacity-35 ${mealDayClass(tone, palette)} ${date === today ? "ring-2 ring-inset ring-cocoa" : ""}`}>
          <span className="font-bold">{Number(date.slice(8))}</span>
          {date === today && <span className="text-[10px] font-bold">오늘</span>}
          {total ? <span className="text-[10px]">{ok}/{total}</span> : <span aria-hidden="true" className="text-[10px]">{tone === "away" ? "부재" : tone === "pending" ? "대기" : "–"}</span>}
        </button>;
      })}
    </div>
  </>;
}

function MonthLegend() {
  const palette = useMealPalette();
  return <div aria-label="하루 확인 비율 범례" className="mt-4 flex flex-wrap gap-2">{(["all", "half", "low", "pending", "away", "empty"] as const).map((tone) => <span key={tone} className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${mealDayClass(tone, palette)}`}>{MEAL_DAY_LABEL[tone]}</span>)}</div>;
}

function usageText(stats: {cook:number; lid:number | null}) {
  return `취사 ${stats.cook}회 · 뚜껑 열림 ${stats.lid === null ? "미측정" : stats.lid + "회"}`;
}

function CookerUsage({ view, dates, now, day, onOpenDay }: { view: AppView; dates: string[]; now: Date; day: boolean; onOpenDay: (date: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const today = kstDate(now);
  const knownDates = dates.filter((date) => date <= today && view.stats[date]);
  const max = Math.max(3, ...knownDates.map((date) => view.stats[date].cook + (view.stats[date].lid ?? 0)));
  const totals = knownDates.reduce((sum, date) => ({ cook: sum.cook + view.stats[date].cook, lid: sum.lid + (view.stats[date].lid ?? 0) }), { cook: 0, lid: 0 });
  const lidUnmeasured = knownDates.some(date => view.stats[date].lid === null);
  const selectedStats = selected ? view.stats[selected] : null;
  return <section aria-labelledby="cooker-use-heading" className="mt-6 rounded-[1.75rem] border border-line p-4">
    <h2 id="cooker-use-heading" className="text-[17px] font-bold text-cocoa">밥솥 사용</h2>
    <div className="mt-3 grid grid-cols-2 gap-3"><Stat label="취사" value={knownDates.length ? totals.cook : null} /><Stat label="뚜껑 열림" value={knownDates.length && !lidUnmeasured ? totals.lid : null} missing={lidUnmeasured ? "미측정" : "기록 없음"} /></div>
    {!day ? <>
      <p className="mt-4 text-sm text-muted">막대를 누르면 그날의 기록이 열려요.</p>
      <div className="mt-2 overflow-x-auto pb-2">
        <div className="flex h-44 gap-1" style={{ minWidth: `${dates.length * 44}px` }} role="group" aria-label="날짜별 취사와 뚜껑 열림 횟수">
          {dates.map((date) => {
            const stats = date <= today ? view.stats[date] : null;
            const future = date > today;
            const label = `${fmtDateLong(date)} ${stats ? usageText(stats) : future ? "아직 오지 않은 날" : "기록 없음"}`;
            return <button key={date} type="button" disabled={future} onClick={() => onOpenDay(date)} onFocus={() => setSelected(date)} onPointerEnter={() => { if (!future) setSelected(date); }} aria-label={future ? label : `${label}. 하루 기록 보기`} className={`flex min-w-10 flex-1 flex-col rounded-lg px-1 pt-1 disabled:opacity-30 ${selected === date ? "ring-2 ring-cocoa" : "hover:bg-butter-soft"}`}>
              <span className="flex w-full flex-1 flex-col justify-end gap-0.5" aria-hidden="true">
                {stats && stats.cook + (stats.lid ?? 0) > 0 ? <>{stats.lid !== null && <span className="min-h-0 rounded-t-md bg-butter-deep/45" style={{ height: `${stats.lid / max * 100}%` }} />}<span className={`bg-butter-deep ${stats.lid ? "" : "rounded-t-md"}`} style={{ height: `${stats.cook / max * 100}%` }} /></> : <span className="mb-1 text-[12px] text-muted">{stats ? "0" : "–"}</span>}
              </span>
              <span className="py-2 text-[11px] text-muted">{fmtMonthDay(date)}</span>
            </button>;
          })}
        </div>
      </div>
      <p role="status" className="mt-3 min-h-11 rounded-xl bg-butter-soft px-3 py-3 text-[13px] text-cocoa">{selected ? `${fmtDateLong(selected)} · ${selectedStats ? usageText(selectedStats) : "기록 없음"}` : "막대에 마우스를 올리거나 키보드로 선택하면 횟수를 볼 수 있어요."}</p>
      <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-muted"><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-butter-deep" />취사</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-butter-deep/45" />뚜껑 열림</span></div>
    </> : null}
    {!knownDates.length ? <p className="mt-3 text-[13px] text-muted">이 기간에는 수신된 밥솥 사용 기록이 없어요.</p> : knownDates.length < dates.filter((date) => date <= today).length ? <p className="mt-3 text-[12px] text-muted">수신된 {knownDates.length}일의 사용 횟수만 합산했어요. 기록 없는 날은 0회로 판단하지 않아요.</p> : null}
  </section>;
}

function Stat({ label, value, missing = "기록 없음" }: { label: string; value: number | null; missing?: string }) {
  return <div className="rounded-2xl bg-butter-soft px-4 py-4"><p className="text-[13px] text-cocoa/70">{label}</p><p className="mt-1 text-[28px] font-extrabold text-cocoa">{value ?? "–"}{value !== null ? <span className="ml-0.5 text-[15px] font-bold">회</span> : <span className="ml-1 text-[12px] font-medium">{missing}</span>}</p></div>;
}
