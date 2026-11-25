import { kstDate, kstDateTime } from "./time.ts";
import { MEAL_SLOT_NAMES, type Absence, type CookerEvent, type MealScheduleChange, type MealSlot, type MealWindow } from "./types.ts";

export function validMealWindows(value: unknown): value is MealWindow[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MEAL_SLOT_NAMES.length) return false;
  const slots = new Set<string>();
  const clock = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;
  let end = "";
  for (const window of value) {
    if (!window || Object.keys(window).length !== 3 || !Object.hasOwn(window, "slot") || !Object.hasOwn(window, "start")
      || !Object.hasOwn(window, "end") || !MEAL_SLOT_NAMES.includes(window.slot) || slots.has(window.slot)
      || typeof window.start !== "string" || typeof window.end !== "string"
      || !clock.test(window.start) || !clock.test(window.end) || window.start < end || window.start >= window.end) return false;
    slots.add(window.slot);
    end = window.end;
  }
  return true;
}

/** The former schedule covers completed KST days; edits apply on the day they are made. */
export function mealWindowsOn(date: string, current: MealWindow[], history: MealScheduleChange[] = []): MealWindow[] {
  return history.find(change => date <= change.through)?.windows ?? current;
}

/** Days before the first saved change can contain records from earlier, unknown settings. */
export function recordedMealWindows(date: string, today: string, current: MealWindow[], history: MealScheduleChange[] = []): MealWindow[] | null {
  return date === today || (history.length > 0 && date > history[0].through) ? mealWindowsOn(date, current, history) : null;
}

export type ResolveInput = {
  date: string; // KST 'YYYY-MM-DD'
  windows: MealWindow[];
  events: CookerEvent[];
  /** 시니어가 "외식했어요"를 누른 시각들 */
  eatOutChecks: Date[];
  absences: Absence[];
  now: Date;
};

export const inAbsence = (date: string, absences: Absence[]) =>
  absences.some((a) => a.startDate <= date && date <= a.endDate);

/**
 * 하루치 끼니 상태. design.md 4.2.
 * 우선순위: 취사·열림(confirmed) > 외식(eat_out) > 부재(away) > 시간대 종료 여부(unconfirmed/pending)
 */
export function resolveMealSlots({ date, windows, events, eatOutChecks, absences, now }: ResolveInput): MealSlot[] {
  const ranges = windows.map((w) => ({
    slot: w.slot,
    start: kstDateTime(date, w.start).getTime(),
    end: kstDateTime(date, w.end).getTime(),
  }));
  const within = (t: number, r: (typeof ranges)[number]) => t >= r.start && t < r.end;

  // 외식 체크는 그날 것만, 시간대 밖이면 가장 가까운 슬롯(동률이면 앞 슬롯)에 붙인다.
  const eatOutSlots = new Set<string>();
  for (const check of eatOutChecks) {
    if (kstDate(check) !== date || ranges.length === 0) continue;
    const t = check.getTime();
    let best = ranges[0];
    let bestDist = Infinity;
    for (const r of ranges) {
      if (within(t, r)) {
        best = r;
        break;
      }
      const dist = Math.min(Math.abs(t - r.start), Math.abs(t - r.end));
      if (dist < bestDist) {
        best = r;
        bestDist = dist;
      }
    }
    eatOutSlots.add(best.slot);
  }

  const away = inAbsence(date, absences);

  return ranges.map((r): MealSlot => {
    const base = { date, slot: r.slot };
    const cooked = events.some((e) => kstDate(e.startedAt) === date && within(e.startedAt.getTime(), r));
    if (cooked) return { ...base, status: "confirmed", source: "cooker" };
    if (eatOutSlots.has(r.slot)) return { ...base, status: "eat_out", source: "senior_check" };
    if (away) return { ...base, status: "away", source: "absence" };
    if (now.getTime() >= r.end) return { ...base, status: "unconfirmed", source: null };
    return { ...base, status: "pending", source: null };
  });
}
