"use client";

import { MealWeek } from "@/components/HomeMealWeek";
import type { HomeMealDay, HomeMealPeriod } from "@/lib/data/meal-week";

const counts = [3, 3, 2, 3, 1, 0, 0];
const weekdays = ["월", "화", "수", "목", "금", "토", "일"];
const names = ["아침", "점심", "저녁"];
const ids = ["breakfast", "lunch", "dinner"] as const;

// These example keys and observations are never passed into household storage or navigation.
const examples: HomeMealDay[] = weekdays.map((weekday, index) => {
  const periods: HomeMealPeriod[] = ids.map((slot, i) => {
    const confirmed = index === 4 ? i === 1 : i < counts[index];
    return { slot, label: names[i], state: index === 5 ? "pending" : confirmed ? "confirmed" : "unconfirmed" };
  });
  return { date: "2026-11-" + String(16 + index), weekday, isToday: false, isFuture: false,
    periods, total: periods.length, confirmed: counts[index], eatOut: 0,
    tone: counts[index] === 3 ? "all" : counts[index] ? "some" : index === 5 ? "pending" : "unknown" };
});

export function MealWeekExample() {
  return <MealWeek days={examples} initialIndex={2} caption="예시 기록" />;
}
