"use client";

import { StatusIcon } from "./guardian";
import { MEAL_STATUS_LABEL, mealStatusClass, useMealPalette } from "@/lib/data/appearance";
import type { MealStatus } from "@/lib/judge/types";

export function MealStatusChip({ status }: { status: MealStatus }) {
  const palette = useMealPalette();
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[16px] font-bold ${mealStatusClass(status, palette)}`}>
      <StatusIcon status={status} className="h-3.5 w-3.5" />
      {MEAL_STATUS_LABEL[status]}
    </span>
  );
}

export function MealStatusLegend() {
  return (
    <div aria-label="끼니 상태 범례" className="mt-4 flex flex-wrap gap-2">
      {(["confirmed", "eat_out", "unconfirmed", "away", "pending"] as const).map((status) => <MealStatusChip key={status} status={status} />)}
    </div>
  );
}
