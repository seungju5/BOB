"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { fmtDateLong, fmtMonthDay, StatusIcon } from "@/components/guardian";
import { MealStatusChip, MealStatusLegend } from "@/components/MealStatus";
import { PageHeader, Skeleton } from "@/components/ui";
import { monthLeadingDays, recordPeriod, shiftRecordPeriod, type RecordRange } from "@/components/records/period";
import { MEAL_DAY_LABEL, MEAL_STATUS_LABEL, mealDayClass, mealStatusClass, useMealPalette } from "@/lib/data/appearance";
import { kstDate } from "@/lib/judge/time";
import { useApp } from "@/lib/data/useApp";
import { careDataAvailable, mealDaySummary, mealSlotLabel, slotsForDate, type AppView } from "@/lib/data/view";
import { PowerTranscriptionSection } from "@/components/power/PowerTranscriptionSection";

const RANGES = [{ id: "day", label: "일" }, { id: "week", label: "주" }, { id: "month", label: "월" }] as const;

export default function RecordsPage() {
  const { view, now } = useApp();
  const [range, setRange] = useState<RecordRange>("week");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const today = now ? kstDate(now) : null;
  const anchor = selectedDate ?? today;
  const period = anchor ? recordPeriod(anchor, range) : null;
  const currentPeriod = today ? recordPeriod(today, range) : null;
  const openDay = (date: string) => { setSelectedDate(date); setRange("day"); };
  const noCareData = view && !careDataAvailable(view) && !view.slots.length && !Object.keys(view.stats).length;

  return (
    <main className="flex flex-col pb-8">
      <PageHeader title="식사 기록" />
      <div className="px-6">
        <div aria-label="기록 기간" className="grid grid-cols-3 rounded-full bg-butter-soft p-1">
          {RANGES.map((item) => (
            <button key={item.id} type="button" aria-pressed={range === item.id} onClick={() => setRange(item.id)}
              className={`min-h-11 rounded-full text-[15px] font-bold transition-colors ${range === item.id ? "bg-paper text-cocoa shadow-sm" : "text-cocoa/60"}`}>
              {item.label}
            </button>
          ))}
        </div>
        {!view || !now || !period || !anchor || !today ? <Skeleton className="mt-6 h-64" /> : (
          <>
            <div className="mt-5 grid grid-cols-[44px_1fr_44px] items-center gap-2">
              <button type="button" aria-label={`이전 ${RANGES.find((item) => item.id === range)?.label} 보기`} onClick={() => setSelectedDate(shiftRecordPeriod(anchor, range, -1))} className="h-11 rounded-full border border-line text-xl font-bold text-cocoa">‹</button>
              <p aria-live="polite" className="text-center text-[15px] font-bold text-cocoa">{range === "day" ? `${anchor.slice(0, 4)}년 ${fmtDateLong(anchor)}` : range === "month" ? `${anchor.slice(0, 4)}년 ${Number(anchor.slice(5, 7))}월` : `${period.from.slice(0, 4)}년 ${fmtMonthDay(period.from)} – ${fmtMonthDay(period.to)}`}</p>
              <button type="button" aria-label={`다음 ${RANGES.find((item) => item.id === range)?.label} 보기`} disabled={period.from >= (currentPeriod?.from ?? today)} onClick={() => setSelectedDate(shiftRecordPeriod(anchor, range, 1) > today ? today : shiftRecordPeriod(anchor, range, 1))} className="h-11 rounded-full border border-line text-xl font-bold text-cocoa disabled:cursor-not-allowed disabled:opacity-30">›</button>
            </div>
            <div className="mt-1 flex justify-end"><button type="button" onClick={() => setSelectedDate(null)} className="min-h-11 px-2 text-[13px] font-semibold text-cocoa underline underline-offset-4">오늘로 돌아가기</button></div>
            {view.mode === "demo" ? <p className="mb-3 text-[12px] text-muted">체험용 가상 기록이에요.</p> : null}
            {noCareData ? (
              <section className="mt-3 rounded-[1.75rem] border border-line bg-paper p-6">
                <h2 className="text-[18px] font-bold text-cocoa">아직 연결된 식사 기록이 없어요</h2>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">가족과 기기의 실제 소식이 연결되면 이곳에 기록을 보여 드려요. 연결 전에는 식사 여부를 판단하지 않아요.</p>
                <Link href="/settings" className="mt-4 inline-flex min-h-11 items-center font-bold text-cocoa underline underline-offset-4">연결 설정 보기</Link>
              </section>
            ) : (
              <div key={`${range}:${period.from}`} className="mt-2">
                <section aria-labelledby="meal-status-heading" className="rounded-[1.75rem] border border-line p-4">
                  <h2 id="meal-status-heading" className="text-[17px] font-bold text-cocoa">끼니 상태</h2>
                  {range === "day" ? <DayMeals view={view} date={anchor} now={now} /> : range === "week" ? <WeekMeals view={view} dates={period.dates} now={now} onOpenDay={openDay} /> : <MonthGrid view={view} dates={period.dates} now={now} onOpenDay={openDay} />}
                </section>
                {range === "month" ? <MonthLegend /> : <MealStatusLegend />}
                <p className="mt-2 text-[12px] leading-relaxed text-muted">소식 확인은 밥솥 사용이나 어르신의 외식 알림을 뜻해요. 실제 식사·건강 상태의 판단은 아니에요.</p>
                <CookerUsage view={view} dates={period.dates} now={now} day={range === "day"} />
                {view.mode === "demo" && <section aria-label="예시 전력 해석"><p className="mt-4 text-sm font-semibold text-muted">체험용 예시 전력입니다.</p><PowerTranscriptionSection selectedDate={anchor} /></section>}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function DayMeals({ view, date, now }: { view: AppView; date: string; now: Date }) {
  const slots = slotsForDate(view, date, now);
  if (!slots.length) return <p className="py-5 text-[15px] text-muted">이 날에는 기록이 없어요.</p>;
  return <ul className="mt-3 flex flex-col gap-2">{slots.map((slot) => (
    <li key={slot.slot} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line px-4 py-4">
      <span className="text-[16px] font-bold text-cocoa">{mealSlotLabel(slot.slot, slots)}</span>
      <MealStatusChip status={slot.status} />
    </li>
  ))}</ul>;
}

function WeekMeals({ view, dates, now, onOpenDay }: { view: AppView; dates: string[]; now: Date; onOpenDay: (date: string) => void }) {
  const palette = useMealPalette();
  const today = kstDate(now);
  return <div className="mt-3 overflow-x-auto pb-2">
    <table className="w-full min-w-[360px] border-separate border-spacing-1 text-center text-[12px]">
      <caption className="sr-only">날짜별 끼니 상태. 날짜를 누르면 하루 기록을 확인할 수 있어요.</caption>
      <thead><tr><th scope="col" className="w-12"><span className="sr-only">끼니</span></th>{dates.map((date) => <th key={date} scope="col" className="font-medium text-muted"><button type="button" disabled={date > today} onClick={() => onOpenDay(date)} className="min-h-11 min-w-10 rounded-lg disabled:opacity-40" aria-label={`${fmtDateLong(date)} 하루 기록 보기`}>{fmtMonthDay(date)}</button></th>)}</tr></thead>
      <tbody>{view.mealProfile.windows.map(({ slot }) => (
        <tr key={slot}>
          <th scope="row" className="text-left font-semibold text-cocoa">{mealSlotLabel(slot, view.mealProfile.windows)}</th>
          {dates.map((date) => {
            const found = date <= today ? slotsForDate(view, date, now).find((item) => item.slot === slot) : null;
            return <td key={date}>{found ? <span role="img" className={`mx-auto grid h-9 w-9 place-items-center rounded-xl ${mealStatusClass(found.status, palette)}`} aria-label={`${fmtMonthDay(date)} ${mealSlotLabel(slot, view.mealProfile.windows)} ${MEAL_STATUS_LABEL[found.status]}`}><StatusIcon status={found.status} className="h-4 w-4" /></span> : <span className="text-muted" aria-label={date > today ? "아직 오지 않은 날" : "기록 없음"}>–</span>}</td>;
          })}
        </tr>
      ))}</tbody>
    </table>
  </div>;
}

function MonthGrid({ view, dates, now, onOpenDay }: { view: AppView; dates: string[]; now: Date; onOpenDay: (date: string) => void }) {
  const palette = useMealPalette();
  const today = kstDate(now);
  return <>
    <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[12px] text-muted">{["월", "화", "수", "목", "금", "토", "일"].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="mt-2 grid grid-cols-7 gap-1">
      {Array.from({ length: monthLeadingDays(dates[0]) }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
      {dates.map((date) => {
        const { tone, ok, total } = mealDaySummary(view, date, now);
        const future = date > today;
        const description = future ? "아직 오지 않은 날" : `${MEAL_DAY_LABEL[tone]}${total ? `, ${ok}/${total}끼 소식 확인` : ""}`;
        return <button key={date} type="button" disabled={future} onClick={() => onOpenDay(date)} aria-current={date === today ? "date" : undefined} aria-label={`${fmtDateLong(date)}: ${description}. 하루 기록 보기`} className={`flex min-h-12 flex-col items-center justify-center rounded-xl px-0.5 py-2 text-[12px] disabled:opacity-35 ${mealDayClass(tone, palette)}`}>
          <span className="font-bold">{Number(date.slice(8))}</span>
          {total ? <span className="text-[10px]">{ok}/{total}</span> : <span aria-hidden="true" className="text-[10px]">{tone === "away" ? "부재" : tone === "pending" ? "대기" : "–"}</span>}
        </button>;
      })}
    </div>
    <p className="mt-3 text-[12px] text-muted">날짜를 누르면 그날의 끼니 기록을 볼 수 있어요.</p>
  </>;
}

function MonthLegend() {
  const palette = useMealPalette();
  return <div aria-label="하루 확인 비율 범례" className="mt-4 flex flex-wrap gap-2">{(["all", "half", "low", "pending", "away", "empty"] as const).map((tone) => <span key={tone} className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${mealDayClass(tone, palette)}`}>{MEAL_DAY_LABEL[tone]}</span>)}</div>;
}

function CookerUsage({ view, dates, now, day }: { view: AppView; dates: string[]; now: Date; day: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const tooltipId = useId();
  const today = kstDate(now);
  const knownDates = dates.filter((date) => date <= today && view.stats[date]);
  const max = Math.max(3, ...knownDates.map((date) => view.stats[date].cook + view.stats[date].lid));
  const totals = knownDates.reduce((sum, date) => ({ cook: sum.cook + view.stats[date].cook, lid: sum.lid + view.stats[date].lid }), { cook: 0, lid: 0 });
  const selectedStats = selected ? view.stats[selected] : null;
  return <section aria-labelledby="cooker-use-heading" className="mt-6 rounded-[1.75rem] border border-line p-4">
    <h2 id="cooker-use-heading" className="text-[17px] font-bold text-cocoa">밥솥 사용</h2>
    <div className="mt-3 grid grid-cols-2 gap-3"><Stat label="취사" value={knownDates.length ? totals.cook : null} /><Stat label="뚜껑 열림" value={knownDates.length ? totals.lid : null} /></div>
    {!day ? <>
      <div className="mt-5 overflow-x-auto pb-2">
        <div className="flex h-44 gap-1" style={{ minWidth: `${dates.length * 44}px` }} aria-label="날짜별 취사와 뚜껑 열림 횟수. 막대를 누르면 설명을 볼 수 있어요.">
          {dates.map((date) => {
            const stats = date <= today ? view.stats[date] : null;
            const future = date > today;
            const label = `${fmtDateLong(date)} ${stats ? `취사 ${stats.cook}회, 뚜껑 열림 ${stats.lid}회` : future ? "아직 오지 않은 날" : "기록 없음"}`;
            return <button key={date} type="button" disabled={future} onClick={() => setSelected(date)} onFocus={() => setSelected(date)} aria-pressed={selected === date} aria-label={label} aria-describedby={selected === date ? tooltipId : undefined} className={`flex min-w-10 flex-1 flex-col rounded-lg px-1 pt-1 disabled:opacity-30 ${selected === date ? "ring-2 ring-cocoa" : "hover:bg-butter-soft"}`}>
              <span className="flex w-full flex-1 flex-col justify-end gap-0.5" aria-hidden="true">
                {stats && stats.cook + stats.lid > 0 ? <><span className="min-h-0 rounded-t-md bg-butter-deep/45" style={{ height: `${stats.lid / max * 100}%` }} /><span className={`bg-butter-deep ${stats.lid ? "" : "rounded-t-md"}`} style={{ height: `${stats.cook / max * 100}%` }} /></> : <span className="mb-1 text-[12px] text-muted">{stats ? "0" : "–"}</span>}
              </span>
              <span className="py-2 text-[11px] text-muted">{fmtMonthDay(date)}</span>
            </button>;
          })}
        </div>
      </div>
      <p id={tooltipId} role="status" aria-live="polite" className="mt-3 min-h-11 rounded-xl bg-butter-soft px-3 py-3 text-[13px] text-cocoa">{selected ? `${fmtDateLong(selected)} · ${selectedStats ? `취사 ${selectedStats.cook}회 · 뚜껑 열림 ${selectedStats.lid}회` : "기록 없음"}` : "막대를 누르거나 키보드로 선택하면 횟수를 볼 수 있어요."}</p>
      <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-muted"><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-butter-deep" />취사</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-butter-deep/45" />뚜껑 열림</span></div>
    </> : null}
    {!knownDates.length ? <p className="mt-3 text-[13px] text-muted">이 기간에는 수신된 밥솥 사용 기록이 없어요.</p> : knownDates.length < dates.filter((date) => date <= today).length ? <p className="mt-3 text-[12px] text-muted">수신된 {knownDates.length}일의 사용 횟수만 합산했어요. 기록 없는 날은 0회로 판단하지 않아요.</p> : null}
  </section>;
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return <div className="rounded-2xl bg-butter-soft px-4 py-4"><p className="text-[13px] text-cocoa/70">{label}</p><p className="mt-1 text-[28px] font-extrabold text-cocoa">{value ?? "–"}{value !== null ? <span className="ml-0.5 text-[15px] font-bold">회</span> : <span className="ml-1 text-[12px] font-medium">기록 없음</span>}</p></div>;
}
