// 화면이 읽는 공통 모양. 데모(localStorage)와 실서비스(Supabase) 모두 이 모양으로 바꿔서 넘긴다.
// 가족 화면에 필요한 요약만 담는다: 끼니 상태, 날짜별 횟수, 마지막 시각. (취사 시각 목록은 없음)

import { resolveMealSlots } from "@/lib/judge/resolveMealSlots";
import { addDays, kstDate } from "@/lib/judge/time";
import type { Absence, AlertType, MealSlot, MealWindow } from "@/lib/judge/types";

export type ViewAlert = {
  id: string;
  type: AlertType;
  triggeredAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
};

export type AppView = {
  mode: "demo" | "live";
  onboardingStep: number; // 1~7 진행 중, 8 = 완료
  plug: { deviceId: string; online: boolean; lastReadingAt: string | null };
  senior: { name: string; relation: string; phone: string };
  household: { residentCount: number; hasPet: boolean };
  mealProfile: { windows: MealWindow[]; eatOutPerWeek: number; usesKeepWarm: boolean; cooksPerWeek: number };
  alertSettings: { missedMealsThreshold: number; fastingHours: number; emergencyHours: number };
  seniorConsent: boolean;
  pairingCode: string | null;
  seniorPaired: boolean;
  /** 최근 35일 끼니 상태 (있는 날만) */
  slots: MealSlot[];
  /** 날짜별 취사·열림 횟수 */
  stats: Record<string, { cook: number; lid: number }>;
  lastCookerAt: string | null;
  lastActivityAt: string | null;
  absences: Absence[];
  alerts: ViewAlert[];
};

export type OnboardingPatch = Partial<Pick<AppView, "senior" | "household" | "mealProfile" | "alertSettings" | "seniorConsent">>;

/** 화면에서 쓰는 동작. 데모와 실서비스가 각각 구현한다. */
export type AppActions = {
  saveOnboarding(step: number, patch?: OnboardingPatch): Promise<void>;
  registerPlug(deviceId: string, token: string): Promise<{ watts: number }>;
  skipPlug(): Promise<void>;
  issuePairingCode(): Promise<void>;
  ackAlert(id: string): Promise<void>;
  ackAll(): Promise<void>;
  saveAlertSettings(s: AppView["alertSettings"]): Promise<void>;
  saveWindows(w: MealWindow[]): Promise<void>;
  saveSenior(s: Partial<AppView["senior"]>): Promise<void>;
  addAbsence(a: Absence): Promise<void>;
  removeAbsence(a: Absence): Promise<void>;
};

export const DEFAULT_WINDOWS: MealWindow[] = [
  { slot: "breakfast", start: "06:00", end: "10:00" },
  { slot: "lunch", start: "11:00", end: "14:30" },
  { slot: "dinner", start: "17:00", end: "21:00" },
];

export const SLOT_LABEL = { breakfast: "아침", lunch: "점심", dinner: "저녁" } as const;

const ORDER = { breakfast: 0, lunch: 1, dinner: 2 } as const;

/** 하루치 끼니. 아직 서버 판정이 없는 오늘은 시간대 기준으로 채운다. */
export function slotsForDate(v: AppView, date: string, now: Date): MealSlot[] {
  const found = v.slots.filter((s) => s.date === date).sort((a, b) => ORDER[a.slot] - ORDER[b.slot]);
  if (found.length || date !== kstDate(now)) return found;
  return resolveMealSlots({ date, windows: v.mealProfile.windows, events: [], eatOutChecks: [], absences: v.absences, now });
}

export function recentSlots(v: AppView, now: Date, days: number): MealSlot[] {
  const today = kstDate(now);
  const out: MealSlot[] = [];
  for (let d = days - 1; d >= 0; d--) out.push(...slotsForDate(v, addDays(today, -d), now));
  return out;
}

export function statsRange(v: AppView, from: string, to: string) {
  const out: Record<string, { cook: number; lid: number }> = {};
  for (let d = from; d <= to; d = addDays(d, 1)) out[d] = v.stats[d] ?? { cook: 0, lid: 0 };
  return out;
}

export const unackedAlerts = (v: AppView) => v.alerts.filter((a) => !a.resolvedAt && !a.acknowledgedAt);

/** 패턴 변화 리포트: 최근 7일 vs 그 전 28일 끼니 확인율 (어제까지) */
export function patternReport(v: AppView, now: Date) {
  const today = kstDate(now);
  const rate = (fromDay: number, toDay: number) => {
    let ok = 0;
    let total = 0;
    for (let d = fromDay; d <= toDay; d++) {
      for (const slot of slotsForDate(v, addDays(today, -d), now)) {
        if (slot.status === "away" || slot.status === "pending") continue;
        total++;
        if (slot.status === "confirmed" || slot.status === "eat_out") ok++;
      }
    }
    return { ok, total, rate: total ? ok / total : null };
  };
  return { recent: rate(1, 7), before: rate(8, 35) };
}
