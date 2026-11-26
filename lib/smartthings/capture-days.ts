import criteria from "../../server/smartthings/power-criteria.json" with {type:"json"};
import { continuesCookRun } from "../../server/smartthings/cooking-signal.mjs";
import type { CookerMealDay } from "@/lib/firebase/smartthings";
import { validMealWindows } from "../judge/resolveMealSlots.ts";
import { DAY_MS, kstTime } from "../judge/time.ts";
import type { MealWindow, MealSlotName } from "../judge/types.ts";

export type CaptureBucket = { day: number; windows: MealWindow[]; samples: Record<string, boolean> };
type PeakSummary = {estimated?:number; estimatedSlots?:CookerMealDay["confirmed"]; estimatedBySlot?:Partial<Record<MealSlotName,number>>};
export type PublishedBucket = PeakSummary & {day:number; windows:MealWindow[]; cook:number; confirmed:CookerMealDay["confirmed"]; count:number; lastMeasuredMinute?: number};
export type CapturedMealDay = CookerMealDay & PeakSummary & { samples: number; lastMeasuredAt?: number };

/** Deduplicate before assigning a cook to the Seoul day and slot of its first high sample. */
export function summarizeCaptureDays(buckets: (CaptureBucket | PublishedBucket)[], now = Date.now()): CapturedMealDay[] {
  const offset = 9 * 3600000;
  const today = Math.floor((now + offset) / DAY_MS);
  let previousHigh: number | null = null;
  return [...buckets].sort((a,b) => a.day - b.day).flatMap(bucket => {
    const {day, windows} = bucket;
    if (!Number.isInteger(day) || day > today || day <= today - criteria.mealRecordDays) return [];
    const date = new Date(day * DAY_MS).toISOString().slice(0,10);
    if (!validMealWindows(windows)) throw Error("저장한 끼니 시간대를 확인하지 못했어요.");
    if ("count" in bucket) {
      const {cook, confirmed, count} = bucket;
      if (!Number.isSafeInteger(count) || count < 1 || count > 86400 || !Number.isSafeInteger(cook) ||
          cook < 0 || cook > count || !Array.isArray(confirmed) || confirmed.length > cook ||
          new Set(confirmed).size !== confirmed.length || !confirmed.every(slot => windows.some(w => w.slot === slot)))
        throw Error("저장한 밥솥 기록을 확인하지 못했어요.");
      const {estimated, estimatedSlots, estimatedBySlot} = bucket;
      const minute = bucket.lastMeasuredMinute;
      if (minute !== undefined && (!Number.isInteger(minute) || minute < 0 || minute >= 1440))
        throw Error("저장한 측정 시각을 확인하지 못했어요.");
      const time = minute === undefined ? null : day * DAY_MS - offset + minute * 60000;
      if (time !== null && time > now) throw Error("미래의 측정 시각을 확인해 주세요.");
      const summary = {date, windows, cook, confirmed, samples:count, ...(time !== null && {lastMeasuredAt:time})};
      if (estimated === undefined && estimatedSlots === undefined && estimatedBySlot === undefined) return [summary];
      if (typeof estimated !== "number" || !Number.isSafeInteger(estimated) || estimated < 1 || estimated + cook > count ||
          !Array.isArray(estimatedSlots) || estimatedSlots.length > estimated || new Set(estimatedSlots).size !== estimatedSlots.length ||
          !estimatedSlots.every(slot => windows.some(w => w.slot === slot))) throw Error("저장한 추정 신호를 확인하지 못했어요.");
      if (estimatedBySlot !== undefined) {
        if (!estimatedBySlot || typeof estimatedBySlot !== "object" || Array.isArray(estimatedBySlot)) throw Error("추정 시간대를 확인하지 못했어요.");
        const entries = Object.entries(estimatedBySlot);
        if (entries.length !== estimatedSlots.length || entries.some(([slot,n]) => !estimatedSlots.includes(slot as MealSlotName) || !Number.isSafeInteger(n) || n < 1) ||
            entries.reduce((sum,[,n]) => sum + n, 0) > estimated) throw Error("추정 시간대의 횟수를 확인하지 못했어요.");
      }
      return [{...summary, estimated, estimatedSlots, ...(estimatedBySlot && {estimatedBySlot})}];
    }
    const {samples} = bucket;
    if (!samples || typeof samples !== "object") throw Error("저장한 밥솥 기록을 확인하지 못했어요.");
    const result: CapturedMealDay = {date, windows, confirmed:[], cook:0, samples:0};
    for (const key of Object.keys(samples).sort((a,b) => Number(a) - Number(b))) {
      const seconds = Number(key);
      if (!Number.isInteger(seconds) || seconds < 0 || seconds >= 86400 || String(seconds) !== key || typeof samples[key] !== "boolean")
        throw Error("저장한 기록의 측정 시각을 확인하지 못했어요.");
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
