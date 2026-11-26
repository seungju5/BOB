"use client";

import Image from "next/image";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { IconCheck, IconClock, IconLock, IconSuitcase } from "@/components/icons";
import { MealScheduleLink } from "@/components/TodayMeals";
import { appPath } from "@/lib/app-path";
import { useMealPalette } from "@/lib/data/appearance";
import { homeMealStateLabel, homeMealWeek, type HomeMealDay, type HomeMealPeriod } from "@/lib/data/meal-week";
import { isDemoView, type AppView } from "@/lib/data/view";
import styles from "./home-meal-week.module.css";

function PeriodIcon({ start, slot }: Pick<HomeMealPeriod, "start" | "slot">) {
  const hour = start ? Number(start.split(":")[0]) : slot === "breakfast" ? 6 : slot === "lunch" ? 12 : 18;
  return <svg aria-hidden viewBox="0 0 32 32" className={styles.timeIcon} data-time={hour < 10 ? "dawn" : hour < 17 ? "day" : "night"}
    fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {hour < 10 ? <><path d="M8 21a8 8 0 0 1 16 0" fill="var(--color-tangerine)" /><path d="M3 21h26M8 25h16M12 28h8M16 6v3m-9 .2 2 2m16-2-2 2M3 15l2.5.7m23.5-.7-2.5.7" /></>
      : hour < 17 ? <><circle cx="16" cy="16" r="6.5" fill="var(--color-butter)" /><path d="M16 2.5v3m0 21v3M2.5 16h3m21 0h3M6.4 6.4l2.2 2.2m14.8 14.8 2.2 2.2m0-19.2-2.2 2.2M8.6 23.4l-2.2 2.2" /></>
        : <><path d="M21.8 22.2A11 11 0 0 1 9.4 7.6a10.8 10.8 0 1 0 15.1 13.6q-1.2.7-2.7 1Z" fill="var(--color-sky)" /><path d="m22 3 .9 2.8 2.8.9-2.8.9-.9 2.8-.9-2.8-2.8-.9 2.8-.9Z" fill="var(--color-butter)" /></>}
  </svg>;
}

function DayMark({ day }: { day: HomeMealDay }) {
  if (day.isFuture || day.tone === "pending") return <IconClock aria-hidden className={styles.dayIcon} />;
  if (day.tone === "away") return <IconSuitcase aria-hidden className={styles.dayIcon} />;
  if (!day.periods.length || day.tone === "empty") return <span aria-hidden className={styles.emptyDay}>–</span>;
  return <span aria-hidden className={styles.dots}>{day.periods.map(period => <i key={period.slot} data-state={period.state} />)}</span>;
}

function StatusMark({ state }: Pick<HomeMealPeriod, "state">) {
  if (state === "confirmed" || state === "eat_out") return <IconCheck aria-hidden />;
  if (state === "pending") return <IconClock aria-hidden />;
  if (state === "away") return <IconSuitcase aria-hidden />;
  return <span aria-hidden>–</span>;
}

function dayDescription(day: HomeMealDay) {
  if (day.isFuture) return "예정된 시간대";
  if (day.tone === "away") return "외출 중";
  if (day.confirmed + day.eatOut > 0) return `${day.periods.length}개 시간대 중 ${day.confirmed + day.eatOut}개 확인`;
  return day.tone === "unknown" ? "미확인 시간대 있음" : day.tone === "pending" ? "소식 대기 중" : "기록 없음";
}

export function HomeMealWeek({ view, now }: { view: AppView; now: Date }) {
  const days = homeMealWeek(view, now);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selected = days.findIndex(day => day.date === selectedDate);
  const activeIndex = selected < 0 ? days.findIndex(day => day.isToday) : selected;
  const day = days[activeIndex];
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const id = useId();
  const palette = useMealPalette();
  const known = day.confirmed + day.eatOut;
  const selectedStats = view.stats[day.date];
  const dateLabel = `${Number(day.date.slice(5, 7))}월 ${Number(day.date.slice(8))}일`;
  const range = `${Number(days[0].date.slice(5, 7))}.${Number(days[0].date.slice(8))} - ${Number(days[6].date.slice(5, 7))}.${Number(days[6].date.slice(8))}`;

  function changeByKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    switch (event.key) {
      case "ArrowRight": next = (index + 1) % 7; break;
      case "ArrowLeft": next = (index + 6) % 7; break;
      case "Home": next = 0; break;
      case "End": next = 6; break;
      default: return;
    }
    event.preventDefault();
    setSelectedDate(days[next].date);
    tabs.current[next]?.focus();
  }

  return <section className={styles.weekCard} data-palette={palette} aria-labelledby={`${id}-heading`}>
    <header className={styles.header}>
      <div><h2 id={`${id}-heading`}>한 주의 밥상</h2><p>{range}{isDemoView(view) ? " · 예시 기록" : ""}</p></div>
      <button type="button" className={styles.today} onClick={() => setSelectedDate(null)} aria-label="오늘의 끼니 소식 보기">오늘</button>
    </header>
    <div className={styles.week} role="tablist" aria-label="한 주의 끼니 소식">
      {days.map((item, index) => <button key={item.date} type="button" role="tab" className={styles.day} data-tone={item.tone}
        id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`} aria-selected={index === activeIndex}
        aria-label={`${Number(item.date.slice(5, 7))}월 ${Number(item.date.slice(8))}일 ${item.weekday}요일${item.isToday ? ", 오늘" : ""}, ${dayDescription(item)}`}
        tabIndex={index === activeIndex ? 0 : -1} ref={element => { tabs.current[index] = element; }}
        onClick={() => setSelectedDate(item.date)} onKeyDown={event => changeByKey(event, index)}>
        <span>{item.weekday}</span><DayMark day={item} />
      </button>)}
    </div>
    {days.map((item, index) => <div key={item.date} role="tabpanel" id={`${id}-panel-${index}`} aria-labelledby={`${id}-tab-${index}`}
      hidden={index !== activeIndex} tabIndex={0} className={styles.detail}>
      {index === activeIndex && <>
        <div className={styles.summary}>
          <div className={styles.words}>
            <h3>{day.isToday ? "오늘" : `${day.weekday}요일`}의 끼니 소식 <span>· {dateLabel}</span></h3>
            {known > 0 || day.tone === "unknown" ? <p className={styles.metric}><strong>{known}</strong><span className={styles.denominator}>/ {day.periods.length}</span><span>시간대 확인</span></p>
              : <p className={styles.emptyMetric}>{day.isFuture ? "소식을 기다려요" : day.tone === "away" ? "외출 중이에요" : day.tone === "pending" ? "소식을 기다려요" : "아직 기록이 없어요"}</p>}
            {day.eatOut > 0 && <p className={styles.summaryNote}>외식으로 남긴 {day.eatOut}개 시간대 포함</p>}
          </div>
          <span className={styles.cooker} aria-hidden><Image src={appPath("/brand/rice-mark.png")} alt="" width={160} height={160} unoptimized /></span>
        </div>
        {day.periods.length > 0 && <dl className={styles.periods} data-count={day.periods.length}>
          {day.periods.map(period => <div key={period.slot} className={styles.period} data-meal-slot={period.slot}>
            <dt><PeriodIcon start={period.start} slot={period.slot} /><span>{period.label}</span></dt>
            <dd data-state={period.state}><StatusMark state={period.state} />{homeMealStateLabel(period.state, day.isFuture)}</dd>
            {period.start && <dd className={styles.time}>{period.start}–<wbr />{period.end}</dd>}
          </div>)}
        </dl>}
        {!day.periods.length && <p className={styles.emptyHint}>이날 저장된 시간대별 기록이 없어요.</p>}
      </>}
    </div>)}
    {view.captureReadError && <p role="status" className={styles.message}>저장한 밥솥 기록을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.</p>}
    {!day.isFuture && !!selectedStats?.estimated && <p className={styles.message}>이날 취사로 추정한 소식이 있어요. 확인된 시간대와는 따로 표시해요.</p>}
    {!day.isFuture && !known && !!selectedStats?.cook && <p className={styles.message}>취사 소식은 있지만 어느 시간대인지는 확인되지 않았어요.</p>}
    <p className={styles.privacy}><IconLock aria-hidden /><span>밥솥 사용과 직접 남긴 소식이에요.<br />실제 식사 여부나 드신 양은 알 수 없어요.</span></p>
    <div className={styles.settings}><MealScheduleLink count={view.mealProfile.windows.length} /></div>
  </section>;
}
