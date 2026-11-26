"use client";

import Link from "next/link";
import { StatusIcon } from "@/components/guardian";
import { MEAL_STATUS_LABEL, mealStatusClass, useMealPalette } from "@/lib/data/appearance";
import { mealSlotLabel } from "@/lib/data/view";
import type { MealSlot, MealSlotName, MealWindow } from "@/lib/judge/types";

export function MealScheduleLink({ count }: { count: number }) {
  return <Link href="/settings/#settings-meal-count" aria-label={`하루 ${count}끼, 끼니 수와 시간 변경`}
    className="inline-flex min-h-11 items-center rounded-md text-[15px] font-semibold text-muted underline decoration-current/50 underline-offset-4 focus-visible:outline-2">
    하루 {count}끼 · 변경
  </Link>;
}

export function TodayMealList({ windows, slots, estimatedSlots }: { windows: MealWindow[]; slots: MealSlot[]; estimatedSlots?: MealSlotName[] }) {
  const palette = useMealPalette();
  if (!windows.length) return null;
  // At narrow widths or larger text sizes, cards wrap without squeezing a fifth column in.
  const columns = windows.length === 4 ? "repeat(auto-fit, minmax(min(100%, max(7rem, 42%)), 1fr))"
    : "repeat(auto-fit, minmax(min(100%, max(6rem, 28%)), 1fr))";
  return <ul aria-label="오늘의 식사 시간대" className="mt-2 grid gap-2" style={{ gridTemplateColumns: columns }}>
    {windows.map(window => {
      const observation = slots.find(slot => slot.slot === window.slot);
      const status = observation?.status ?? "pending";
      return <li key={window.slot} data-meal-slot={window.slot}
        className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-3 text-center ${mealStatusClass(status, palette)}`}>
        <span className="text-[16px]">{mealSlotLabel(window.slot, windows)}</span>
        <strong className="flex flex-wrap items-center justify-center gap-1 text-[16px]">{!observation && estimatedSlots?.includes(window.slot) ? "취사 추정" : <><StatusIcon status={status} />{observation ? MEAL_STATUS_LABEL[status] : "기록 대기"}</>}</strong>
        <span className="text-sm tabular-nums">{window.start}–<wbr />{window.end}</span>
      </li>;
    })}
  </ul>;
}
