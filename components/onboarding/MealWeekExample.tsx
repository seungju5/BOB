"use client";

import { useState } from "react";
import { IconClock, IconLock } from "@/components/icons";
import { useMealPalette } from "@/lib/data/appearance";
import styles from "./meal-week.module.css";

const states = {
  three:   { short: "3끼", label: "세 끼 소식", grains: 3, detail: "세 끼 시간대 모두 밥솥에서 소식이 왔어요." },
  two:     { short: "2끼", label: "두 끼 소식", grains: 2, detail: "세 끼 중 두 끼 시간대에 밥솥에서 소식이 왔어요." },
  one:     { short: "1끼", label: "한 끼 소식", grains: 1, detail: "세 끼 중 한 끼 시간대에 밥솥에서 소식이 왔어요." },
  pending: { short: "대기", label: "대기 중", grains: 0, detail: "아직 끼니 시간대가 끝나지 않아 소식을 기다려요." },
  unknown: { short: "미확인", label: "미확인", grains: 0, detail: "확인된 소식이 없어 식사 여부를 알 수 없어요." },
} as const;

type State = keyof typeof states;
const week: ReadonlyArray<{ day: string; state: State }> = [
  { day: "월", state: "three" }, { day: "화", state: "three" },
  { day: "수", state: "two" }, { day: "목", state: "three" },
  { day: "금", state: "one" }, { day: "토", state: "pending" },
  { day: "일", state: "unknown" },
];

function Bowl({ state }: { state: State }) {
  if (state === "pending") return <IconClock aria-hidden className={styles.clock} />;
  return (
    <span className={styles.bowl} aria-hidden>
      <span className={styles.grains}>
        {Array.from({ length: states[state].grains }, (_, index) => <i key={index} />)}
      </span>
    </span>
  );
}

export function MealWeekExample() {
  const [selected, setSelected] = useState(2);
  const palette = useMealPalette();
  const { day, state } = week[selected];
  return (
    <section className={styles.example} data-palette={palette} aria-labelledby="example-week-heading">
      <header className={styles.header}>
        <h2 id="example-week-heading">한 주의 밥상</h2>
        <span>예시 기록</span>
      </header>
      <div className={styles.week} role="group" aria-label="요일을 눌러 예시 소식 보기">
        {week.map((entry, index) => (
          <button key={entry.day} type="button" className={styles.day} data-tone={entry.state}
            aria-label={`${entry.day}요일, ${states[entry.state].label}`}
            aria-pressed={index === selected} aria-controls="example-day-report" onClick={() => setSelected(index)}>
            <span className={styles.weekday}>{entry.day}</span>
            <Bowl state={entry.state} />
            <strong>{states[entry.state].short}</strong>
          </button>
        ))}
      </div>
      <div id="example-day-report" className={styles.detail} data-tone={state} role="status" aria-atomic="true">
        <h3>{day}요일 <span>·</span> {states[state].label}</h3>
        <p>{states[state].detail}</p>
      </div>
      <p className={styles.privacy}><IconLock aria-hidden /> <span>카메라와 마이크는 사용하지 않아요.<br />가족에게는 끼니별 요약만 보여요.</span></p>
    </section>
  );
}
