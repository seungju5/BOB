"use client";

import Image from "next/image";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { IconCheck, IconClock, IconLock } from "@/components/icons";
import { appPath } from "@/lib/app-path";
import { useMealPalette } from "@/lib/data/appearance";
import styles from "./meal-week.module.css";

type SlotState = "confirmed" | "unconfirmed" | "pending";
type DaySlots = readonly [SlotState, SlotState, SlotState];

const periods = ["아침", "점심", "저녁"] as const;
const labels: Record<SlotState, string> = {
  confirmed: "소식 있음",
  unconfirmed: "미확인",
  pending: "대기 중",
};

// These three example windows belong to the tutorial, independently of any household's settings.
const exampleWeek: ReadonlyArray<{ day: string; slots: DaySlots }> = [
  { day: "월", slots: ["confirmed", "confirmed", "confirmed"] },
  { day: "화", slots: ["confirmed", "confirmed", "confirmed"] },
  { day: "수", slots: ["confirmed", "confirmed", "unconfirmed"] },
  { day: "목", slots: ["confirmed", "confirmed", "confirmed"] },
  { day: "금", slots: ["unconfirmed", "confirmed", "unconfirmed"] },
  { day: "토", slots: ["pending", "pending", "pending"] },
  { day: "일", slots: ["unconfirmed", "unconfirmed", "unconfirmed"] },
];

function daySummary(slots: DaySlots) {
  const count = slots.filter((slot) => slot === "confirmed").length;
  if (count > 0) {
    return { tone: ["", "one", "two", "three"][count], count, label: `세 시간대 중 ${count}개 확인` };
  }
  return slots.includes("pending")
    ? { tone: "pending", count, label: "소식 대기 중" }
    : { tone: "unknown", count, label: "기록 미확인" };
}

function DayMark({ slots }: { slots: DaySlots }) {
  if (slots.every((slot) => slot === "pending")) return <IconClock className={styles.dayIcon} />;
  if (slots.every((slot) => slot === "unconfirmed")) {
    return <svg aria-hidden viewBox="0 0 20 20" className={styles.dayIcon}><circle cx="10" cy="10" r="6.7" strokeDasharray="2 3" /><path d="M7.5 10h5" /></svg>;
  }
  return <span aria-hidden className={styles.dayDots}>{slots.map((slot, i) => <i key={i} data-state={slot} />)}</span>;
}

function TimeMark({ period }: { period: typeof periods[number] }) {
  return (
    <svg aria-hidden className={styles.timeIcon} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {period === "아침" && <>
        <path d="M8 21a8 8 0 0 1 16 0" fill="var(--color-tangerine)" />
        <path d="M3 21h26M8 25h16M12 28h8M16 6v3m-9 .2 2 2m16-2-2 2M3 15l2.5.7m23.5-.7-2.5.7" />
      </>}
      {period === "점심" && <>
        <circle cx="16" cy="16" r="6.5" fill="var(--color-butter)" />
        <path d="M16 2.5v3m0 21v3M2.5 16h3m21 0h3M6.4 6.4l2.2 2.2m14.8 14.8 2.2 2.2m0-19.2-2.2 2.2M8.6 23.4l-2.2 2.2" />
      </>}
      {period === "저녁" && <>
        <path d="M21.8 22.2A11 11 0 0 1 9.4 7.6a10.8 10.8 0 1 0 15.1 13.6q-1.2.7-2.7 1Z" fill="var(--color-sky)" />
        <path d="m22 3 .9 2.8 2.8.9-2.8.9-.9 2.8-.9-2.8-2.8-.9 2.8-.9Z" fill="var(--color-butter)" />
      </>}
    </svg>
  );
}

export function MealWeekExample() {
  const [selected, setSelected] = useState(2);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const id = useId();
  const palette = useMealPalette();

  function changeByKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    switch (event.key) {
      case "ArrowRight": next = (index + 1) % exampleWeek.length; break;
      case "ArrowLeft": next = (index + exampleWeek.length - 1) % exampleWeek.length; break;
      case "Home": next = 0; break;
      case "End": next = exampleWeek.length - 1; break;
      default: return;
    }
    event.preventDefault();
    setSelected(next);
    tabs.current[next]?.focus();
  }

  return (
    <section className={styles.example} data-palette={palette} aria-labelledby={`${id}-heading`}>
      <header className={styles.header}>
        <h2 id={`${id}-heading`}>한 주의 밥상</h2>
        <span>예시 기록</span>
      </header>
      <div className={styles.week} role="tablist" aria-label="요일별 예시 기록">
        {exampleWeek.map(({ day, slots }, index) => {
          const summary = daySummary(slots);
          return (
            <button key={day} type="button" role="tab" className={styles.day} data-tone={summary.tone}
              id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`} aria-selected={index === selected}
              aria-label={`${day}요일, ${summary.label}`} tabIndex={index === selected ? 0 : -1}
              ref={(element) => { tabs.current[index] = element; }}
              onClick={() => setSelected(index)} onKeyDown={(event) => changeByKey(event, index)}>
              <span>{day}</span>
              <DayMark slots={slots} />
            </button>
          );
        })}
      </div>
      {exampleWeek.map(({ day, slots }, index) => {
        const summary = daySummary(slots);
        return (
          <div key={day} role="tabpanel" id={`${id}-panel-${index}`} aria-labelledby={`${id}-tab-${index}`}
            hidden={selected !== index} tabIndex={0} className={styles.detail}>
            <div className={styles.summary}>
              <div className={styles.summaryWords}>
                <h3>{day}요일 밥솥 소식</h3>
                {summary.count > 0 ? (
                  <>
                    <span className="sr-only">{summary.label}</span>
                    <p aria-hidden className={styles.metric}>
                      <strong>{summary.count}</strong><span className={styles.denominator}>/ 3</span><span>시간대 확인</span>
                    </p>
                  </>
                ) : <>
                  <p className={styles.emptyMetric}>{summary.label}</p>
                  <p className={styles.emptyHint}>{summary.tone === "pending" ? "아직 끼니 시간대가 끝나지 않았어요." : "이날은 밥솥에서 온 기록이 없어요."}</p>
                </>}
              </div>
              <span className={styles.summaryIcon} aria-hidden>
                {summary.count > 0 ? <Image src={appPath("/brand/rice-mark.png")} alt="" width={160} height={160} unoptimized />
                  : summary.tone === "pending" ? <IconClock /> : (
                    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 4h11l5 5v18H9z" fill="var(--color-paper)" /><path d="M19 4v6h6M13 15h8M13 20h4" />
                    </svg>
                  )}
              </span>
            </div>
            <dl className={styles.periods}>
              {slots.map((state, slot) => (
                <div key={periods[slot]} className={styles.period}>
                  <dt><TimeMark period={periods[slot]} /><span>{periods[slot]}</span></dt>
                  <dd data-state={state}>
                    {state === "confirmed" ? <IconCheck /> : state === "pending" ? <IconClock /> : <span aria-hidden>–</span>}
                    {labels[state]}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
      <p className={styles.privacy}><IconLock /><span>카메라·마이크 없이 밥솥 사용만 알려드려요. 실제 식사 여부는 알 수 없어요.</span></p>
    </section>
  );
}
