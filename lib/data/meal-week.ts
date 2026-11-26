import { recordedMealWindows } from "@/lib/judge/resolveMealSlots";
import { addDays, kstDate } from "@/lib/judge/time";
import { MEAL_SLOT_NAMES, type MealStatus, type MealSlotName } from "@/lib/judge/types";
import { mealSlotLabel, slotsForDate, type AppView } from "./view";

export type HomeMealState = MealStatus | "no_record" | "estimated";
export type HomeMealPeriod = {
  slot: MealSlotName;
  label: string;
  state: HomeMealState;
  start?: string;
  end?: string;
};
export type HomeMealDay = {
  date: string;
  weekday: string;
  isToday: boolean;
  isFuture: boolean;
  periods: HomeMealPeriod[];
  confirmed: number;
  eatOut: number;
  tone: "all" | "some" | "unknown" | "pending" | "away" | "empty";
};

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

/** Presentation only: reuse saved judgments; absent device data is never a missed meal. */
export function homeMealDay(view: AppView, date: string, now: Date): HomeMealDay {
  const today = kstDate(now);
  const isFuture = date > today;
  const slots = isFuture ? [] : slotsForDate(view, date, now);
  const windows = isFuture ? view.mealProfile.windows : view.cookerMealDays?.[date]
    ?? recordedMealWindows(date, today, view.mealProfile.windows, view.mealScheduleHistory);
  // Unknown old schedules use only the saved slots, not today's meal count or times.
  const configured = windows ?? slots.map(({ slot }) => ({ slot }));
  const estimated = isFuture ? [] : view.stats[date]?.estimatedSlots ?? [];
  const periods: HomeMealPeriod[] = configured.map(window => {
    const observation = slots.find(slot => slot.slot === window.slot);
    const timeWindow = windows?.find(item => item.slot === window.slot);
    const labelSlots = windows ?? (configured.length === 1 ? MEAL_SLOT_NAMES.map(slot => ({ slot })) : configured);
    return {
      slot: window.slot,
      label: mealSlotLabel(window.slot, labelSlots),
      state: isFuture ? "pending" : observation?.status ?? (estimated.includes(window.slot) ? "estimated" : "no_record"),
      ...(timeWindow ? { start: timeWindow.start, end: timeWindow.end } : {}),
    };
  });
  const confirmed = periods.filter(period => period.state === "confirmed").length;
  const eatOut = periods.filter(period => period.state === "eat_out").length;
  const known = confirmed + eatOut;
  const tone = periods.length && periods.every(period => period.state === "away") ? "away"
    : known > 0 ? (known === periods.length ? "all" : "some")
    : periods.some(period => period.state === "unconfirmed") ? "unknown"
    : periods.some(period => period.state === "pending") ? "pending" : "empty";
  return { date, weekday: weekdays[new Date(`${date}T12:00:00Z`).getUTCDay()],
    isToday: date === today, isFuture, periods, confirmed, eatOut, tone };
}

export function homeMealWeek(view: AppView, now: Date): HomeMealDay[] {
  const today = kstDate(now);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday = addDays(today, -((weekday + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => homeMealDay(view, addDays(monday, index), now));
}

export function homeMealStateLabel(state: HomeMealState, future = false): string {
  return ({ confirmed: "소식 있음", unconfirmed: "미확인", eat_out: "외식", away: "부재",
    pending: future ? "예정" : "대기 중", no_record: "기록 없음", estimated: "취사 추정" })[state];
}
