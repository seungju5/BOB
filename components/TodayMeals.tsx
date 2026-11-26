"use client";

import Link from "next/link";

export function MealScheduleLink({ count }: { count: number }) {
  return <Link href="/settings/#settings-meal-count" aria-label={`하루 ${count}끼, 끼니 수와 시간 변경`}
    className="inline-flex min-h-11 items-center rounded-md text-[15px] font-semibold text-muted underline decoration-current/50 underline-offset-4 focus-visible:outline-2">
    하루 {count}끼 · 변경
  </Link>;
}
