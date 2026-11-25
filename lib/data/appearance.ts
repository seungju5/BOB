"use client";

import { useSyncExternalStore } from "react";
import type { MealDayTone } from "./view";
import type { MealStatus } from "@/lib/judge/types";

export type MealPaletteId = "soft" | "clear";
export const MEAL_PALETTES = [
  { id: "soft", label: "부드러운 색" },
  { id: "clear", label: "선명한 색" },
] as const;
export const MEAL_PALETTE_STORAGE_KEY = "bapmunna.meal-palette.v1";
const CHANGE_EVENT = "bapmunna:meal-palette";
let sessionPalette: MealPaletteId = "soft";
let sessionOnly = false;

export const validMealPalette = (value: unknown): MealPaletteId => value === "clear" ? "clear" : "soft";

function snapshot(): MealPaletteId {
  if (sessionOnly) return sessionPalette;
  try { return validMealPalette(localStorage.getItem(MEAL_PALETTE_STORAGE_KEY)); }
  catch { return sessionPalette; }
}

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}

/** 이 브라우저의 보기 설정만 저장한다. 계정·가족 기록은 포함하지 않는다. */
export function setMealPalette(value: MealPaletteId): boolean {
  sessionPalette = validMealPalette(value);
  let persisted = true;
  try { localStorage.setItem(MEAL_PALETTE_STORAGE_KEY, sessionPalette); }
  catch { persisted = false; }
  sessionOnly = !persisted;
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return persisted;
}

export function useMealPalette(): MealPaletteId {
  return useSyncExternalStore(subscribe, snapshot, () => "soft");
}

export const MEAL_STATUS_LABEL: Record<MealStatus, string> = {
  confirmed: "확인됨", eat_out: "외식", unconfirmed: "미확인", away: "부재", pending: "대기 중",
};

export const MEAL_DAY_LABEL: Record<MealDayTone, string> = {
  all: "모두 확인", half: "절반 이상 확인", low: "절반 미만 확인", pending: "진행 중", away: "부재", empty: "기록 없음",
};

/** 상태마다 라벨·기호도 표시한다. 색상만으로 상태를 전달하지 않는다. */
export function mealStatusClass(status: MealStatus, palette: MealPaletteId = "soft"): string {
  if (status === "confirmed") return palette === "clear" ? "bg-sage-deep text-white" : "bg-sage text-sage-deep";
  if (status === "eat_out") return palette === "clear" ? "bg-butter-deep text-cocoa" : "bg-butter text-cocoa";
  if (status === "away") return palette === "clear" ? "bg-sky-deep text-white" : "bg-sky text-sky-deep";
  if (status === "unconfirmed") return palette === "clear" ? "bg-neutral-500 text-white" : "bg-neutral-300 text-neutral-800";
  return "bg-paper text-muted ring-1 ring-inset ring-line";
}

export function mealDayClass(tone: MealDayTone, palette: MealPaletteId = "soft"): string {
  if (tone === "all") return mealStatusClass("confirmed", palette);
  if (tone === "away") return mealStatusClass("away", palette);
  if (tone === "half") return "bg-tangerine/20 text-cocoa ring-1 ring-inset ring-tangerine/60";
  if (tone === "low") return palette === "clear" ? "bg-blush-deep text-white" : "bg-blush text-blush-deep";
  if (tone === "pending") return "bg-white text-muted ring-1 ring-inset ring-line";
  return "bg-neutral-100 text-muted ring-1 ring-inset ring-neutral-200";
}
