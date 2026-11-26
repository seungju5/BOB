import { COOKER_RECORD_DAYS } from "@/config/detection";
import { continuesCookRun } from "../../server/smartthings/cooking-signal.mjs";
import type { CookerMealDay } from "@/lib/firebase/smartthings";
import { validMealWindows } from "@/lib/judge/resolveMealSlots";
import { DAY_MS, kstTime } from "@/lib/judge/time";
import type { MealWindow } from "@/lib/judge/types";

export type CaptureBucket = { day: number; windows: MealWindow[]; samples: Record<string, boolean> };
export type CapturedMealDay = CookerMealDay & { samples: number };

/** Deduplicate before assigning a cook to the Seoul day and slot of its first high sample. */
export function summarizeCaptureDays(buckets: CaptureBucket[], now = Date.now()): CapturedMealDay[] {
  const offset = 9 * 3600000;
  const today = Math.floor((now + offset) / DAY_MS);
  let previousHigh: number | null = null;
  return [...buckets].sort((a,b) => a.day - b.day).flatMap(({day, windows, samples}) => {
    if (!Number.isInteger(day) || day > today || day <= today - COOKER_RECORD_DAYS) return [];
    if (!validMealWindows(windows) || !samples || typeof samples !== "object")
      throw Error("저장한 캡처 기록을 확인하지 못했어요.");
    const date = new Date(day * DAY_MS).toISOString().slice(0,10);
    const result: CapturedMealDay = {date, windows, confirmed:[], cook:0, samples:0};
    for (const key of Object.keys(samples).sort((a,b) => Number(a) - Number(b))) {
      const seconds = Number(key);
      if (!Number.isInteger(seconds) || seconds < 0 || seconds >= 86400 || String(seconds) !== key || typeof samples[key] !== "boolean")
        throw Error("저장한 캡처의 측정 시각을 확인하지 못했어요.");
      const at = day * DAY_MS - offset + seconds * 1000;
      if (at > now) continue;
      result.samples++;
      if (!samples[key]) continue;
      if (!continuesCookRun(at, previousHigh)) {
        result.cook++;
        const clock = kstTime(new Date(at));
        const matched = windows.find(w => w.start <= clock && clock < w.end);
        if (matched && !result.confirmed.includes(matched.slot)) result.confirmed.push(matched.slot);
      }
      previousHigh = at;
    }
    return result.samples ? [result] : [];
  });
}
