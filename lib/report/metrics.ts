// 리포트 계산 (순수 함수). 화면은 결과만 그린다.
// 가족 화면 원칙: 끼니 상태와 날짜별 횟수 요약만 쓴다. 취사 시각 목록·원시 전력값은 쓰지 않는다.

import { addDays, kstDate } from "@/lib/judge/time";
import type { MealSlotName, MealStatus } from "@/lib/judge/types";
import { slotsForDate, type AppView } from "@/lib/data/view";

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

/** 끼니별(아침·점심·저녁) 최근 7일 확인율. 저장된 시간대만 */
export function slotRates(v: AppView, now: Date) {
  const days = daysAgo(now, 1, RECENT_DAYS);
  return v.mealProfile.windows.map(({ slot }) => {
    let hit = 0;
    let total = 0;
    for (const d of days) {
      const s = slotsForDate(v, d, now).find((x) => x.slot === slot);
      if (!s || !counts(s.status)) continue;
      total++;
      if (ok(s.status)) hit++;
    }
    return { slot, ok: hit, total, rate: total ? hit / total : null };
  });
}

/** 최근 7일 하루별 끼니 상태 (달력 줄) */
export function dailyMeals(v: AppView, now: Date): { date: string; slots: { slot: MealSlotName; status: MealStatus }[] }[] {
  return daysAgo(now, 1, RECENT_DAYS).map((date) => ({ date, slots: slotsForDate(v, date, now).map(({ slot, status }) => ({ slot, status })) }));
}

/** 밥솥 사용 횟수: 최근 7일 vs 이전 4주의 주 평균, 그리고 온보딩에서 알려 준 평소 횟수 */
export function cookerUsage(v: AppView, now: Date) {
  const sum = (dates: string[], key: "cook" | "lid") => dates.reduce((n, d) => n + (v.stats[d]?.[key] ?? 0), 0);
  const recent = daysAgo(now, 1, RECENT_DAYS);
  const before = daysAgo(now, RECENT_DAYS + 1, RECENT_DAYS + BEFORE_DAYS);
  const weeks = BEFORE_DAYS / 7;
  return {
    cook: sum(recent, "cook"),
    lid: sum(recent, "lid"),
    cookWeeklyBefore: Math.round((sum(before, "cook") / weeks) * 10) / 10,
    lidWeeklyBefore: Math.round((sum(before, "lid") / weeks) * 10) / 10,
    cooksPerWeekTold: v.mealProfile.cooksPerWeek,
    /** 하루별 취사 횟수 (막대) */
    perDay: recent.map((d) => ({ date: d, cook: v.stats[d]?.cook ?? 0 })),
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
