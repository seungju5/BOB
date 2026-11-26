"use client";

import Link from "next/link";
import { StatusIcon } from "@/components/guardian";
import { MEAL_STATUS_LABEL, mealStatusClass, useMealPalette } from "@/lib/data/appearance";
import { mealSlotLabel, type AppView } from "@/lib/data/view";
import type { MealSlot, MealWindow } from "@/lib/judge/types";

export function MealScheduleLink({ count }: { count: number }) {
  return <Link href="/settings/#settings-meal-count" aria-label={`하루 ${count}끼, 끼니 수와 시간 변경`}
    className="inline-flex min-h-11 items-center rounded-md text-[15px] font-semibold text-muted underline decoration-current/50 underline-offset-4 focus-visible:outline-2">
    하루 {count}끼 · 변경
  </Link>;
}

export function CaptureDayNote({view, date}:{view:AppView; date:string}) {
  const source = view.captureSources?.[date];
  if (!source) return null;
  const slots = view.slots.filter(s => s.date === date && s.status === "confirmed").length;
  return <section className="my-3 rounded-xl bg-butter-soft px-4 py-3" aria-label="이 날짜의 측정 출처">
    <p className="text-sm font-semibold text-muted">{source.automatic ? "삼성 자동 기록" : "직접 반영한 캡처 " + source.samples + "건"}</p>
    <p className="mt-1 font-bold text-cocoa">확인된 취사 {view.stats[date].cook}회 · 끼니 시간대 {slots}개</p>
    <p className="mt-1 text-sm leading-relaxed text-muted">{source.automatic ? "이 날짜는 삼성 자동 집계를 사용해요. 같은 날짜의 캡처는 더하지 않아요." : "캡처에서 확인할 수 있었던 횟수예요. 측정 사이에 어떻게 식사하셨는지는 알 수 없어요."}</p>
  </section>;
}

export function TodayMealList({ windows, slots }: { windows: MealWindow[]; slots: MealSlot[] }) {
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
        <strong className="flex flex-wrap items-center justify-center gap-1 text-[16px]"><StatusIcon status={status} />{observation ? MEAL_STATUS_LABEL[status] : "기록 대기"}</strong>
        <span className="text-sm tabular-nums">{window.start}–<wbr />{window.end}</span>
      </li>;
    })}
  </ul>;
}
