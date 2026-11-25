// 리포트 계산 (순수 함수). 화면은 결과만 그린다.
// 가족 화면 원칙: 끼니 상태와 날짜별 횟수 요약만 쓴다. 취사 시각 목록·원시 전력값은 쓰지 않는다.

import { recordedMealWindows } from "@/lib/judge/resolveMealSlots";
import { addDays, kstDate } from "@/lib/judge/time";
import { MEAL_SLOT_NAMES, type MealStatus } from "@/lib/judge/types";
import { mealSlotsForCount, SLOT_LABEL, slotsForDate, type AppView } from "@/lib/data/view";

/** 리포트 기간: 어제까지 최근 7일, 그 전 28일을 '평소'로 본다 (patternReport와 같다) */
export const RECENT_DAYS = 7;
export const BEFORE_DAYS = 28;

/** 오늘 기준 fromDay~toDay일 전 날짜 (오래된 순) */
export function daysAgo(now: Date, fromDay: number, toDay: number): string[] {
  const today = kstDate(now);
  const out: string[] = [];
  for (let d = toDay; d >= fromDay; d--) out.push(addDays(today, -d));
  return out;
}

const counts = (s: MealStatus) => s !== "away" && s !== "pending";
const ok = (s: MealStatus) => s === "confirmed" || s === "eat_out";

/** Retain each recorded day's meal order when a household later changes its routine. */
export function datedMealSlots(view: AppView, date: string, now: Date) {
  const slots = slotsForDate(view, date, now);
  const ids = slots.map(row => row.slot);
  const preset = mealSlotsForCount(ids.length);
  // Older summaries may have only some observed slots. Keep their IDs unless the
  // saved combination identifies a complete historical one- or two-meal profile.
  const firstChange = view.mealScheduleHistory?.[0];
  const lastKnown = date === firstChange?.through && ids.every(id => firstChange.windows.some(window => window.slot === id))
    ? firstChange.windows : null;
  const configured = recordedMealWindows(date, kstDate(now), view.mealProfile.windows, view.mealScheduleHistory) ?? lastKnown;
  const legacyOrder = preset.length === ids.length && preset.every((id, i) => ids[i] === id) ? preset : MEAL_SLOT_NAMES;
  const order = configured?.map(window => window.slot) ?? legacyOrder;
  return slots.map(row => {
    const index = order.indexOf(row.slot);
    const position = (index < 0 ? MEAL_SLOT_NAMES.indexOf(row.slot) : index) + 1;
    return { ...row, position, label: SLOT_LABEL[MEAL_SLOT_NAMES[position - 1]] };
  });
}

export function dailyMeals(view: AppView, now: Date) {
  return daysAgo(now, 1, RECENT_DAYS).map(date => ({ date, slots: datedMealSlots(view, date, now) }));
}

export function mealPositionRows(days: { slots: { position: number }[] }[], minCount = 0) {
  const count = Math.max(0, minCount, ...days.flatMap(day => day.slots.map(row => row.position)));
  return MEAL_SLOT_NAMES.slice(0, count).map((id, index) => ({ position: index + 1, label: SLOT_LABEL[id] }));
}

/** Slot numbers follow each day's schedule, independently of today's selected count. */
export function slotRates(view: AppView, now: Date) {
  const week = dailyMeals(view, now);
  return mealPositionRows(week, view.mealProfile.windows.length).map(({ position, label }) => {
    const statuses = week.flatMap(day => day.slots.filter(row => row.position === position && counts(row.status)));
    const hit = statuses.filter(row => ok(row.status)).length;
    return { position, label, ok: hit, total: statuses.length, rate: statuses.length ? hit / statuses.length : null };
  });
}

/** 밥솥 사용 횟수: 최근 7일 vs 이전 4주의 주 평균, 그리고 온보딩에서 알려 준 평소 횟수 */
export function cookerUsage(v: AppView, now: Date) {
  const sum = (dates: string[], key: "cook" | "lid") => dates.reduce((n, d) => n + v.stats[d][key], 0);
  const recent = daysAgo(now, 1, RECENT_DAYS);
  const before = daysAgo(now, RECENT_DAYS + 1, RECENT_DAYS + BEFORE_DAYS);
  const recorded = recent.filter((date) => v.stats[date]);
  const fullBaseline = before.every((date) => v.stats[date]);
  const weeklyBefore = (key: "cook" | "lid") => fullBaseline ? Math.round(sum(before, key) / (BEFORE_DAYS / 7) * 10) / 10 : null;
  return {
    recordedDays: recorded.length,
    cook: recorded.length ? sum(recorded, "cook") : null,
    lid: recorded.length ? sum(recorded, "lid") : null,
    cookWeeklyBefore: weeklyBefore("cook"),
    lidWeeklyBefore: weeklyBefore("lid"),
    cooksPerWeekTold: v.mealProfile.cooksPerWeek,
    /** 하루별 취사 횟수 (막대) */
    perDay: recent.map((d) => ({ date: d, cook: v.stats[d]?.cook ?? null })),
  };
}

/**
 * 전기요금 단가 (원/kWh). (가정) 주택용 저압 평균에 가까운 값으로 둔 임시값이다.
 * 실제 표시 전에 한전 요금표(누진 구간·기본요금)를 확인해 adr.md에 근거를 남긴다.
 */
export const WON_PER_KWH = 120;

/**
 * 최근 7일 전기 사용량. 서버가 하루 전력량 합계(stats[date].energyWh)를 저장하기 전에는 null.
 * 원시 전력값이 아니라 하루 합계만 쓴다 (CLAUDE.md 금지 항목).
 */
export function energyUsage(v: AppView, now: Date) {
  const recent = daysAgo(now, 1, RECENT_DAYS);
  const days = recent.filter((d) => typeof v.stats[d]?.energyWh === "number");
  if (!days.length) return null;
  const wh = days.reduce((n, d) => n + (v.stats[d]?.energyWh ?? 0), 0);
  const kwh = wh / 1000;
  return { days: days.length, kwh: Math.round(kwh * 100) / 100, won: Math.round(kwh * WON_PER_KWH) };
}
