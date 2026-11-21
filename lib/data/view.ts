// 화면이 읽는 공통 모양. 데모(localStorage)와 실서비스(Firebase) 모두 이 모양으로 바꿔서 넘긴다.
// 가족 화면에 필요한 요약만 담는다: 끼니 상태, 날짜별 횟수, 마지막 시각. (취사 시각 목록은 없음)

import { resolveMealSlots } from "@/lib/judge/resolveMealSlots";
import { addDays, kstDate } from "@/lib/judge/time";
import type { Absence, AlertPayload, AlertType, MealSlot, MealSlotName, MealWindow } from "@/lib/judge/types";

export type ViewAlert = {
  id: string;
  type: AlertType;
  triggeredAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  payload?: AlertPayload;
};

export type AppView = {
  mode: "demo" | "live";
  /** 실제 계정의 저장소. 데모의 가상 기록과 섞지 않는다. */
  dataSource?: "firebase";
  /** 가족·기기 기록을 사용할 수 있는지. 계정 로그인 성공과는 별개다. */
  careAvailable?: boolean;
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
  /**
   * 날짜별 취사·열림 횟수.
   * energyWh: 하루 전력량 합계(Wh). 아직 서버가 저장하지 않아 비어 있다 (리포트 전기요금용, 원시값 아님).
   */
  stats: Record<string, { cook: number; lid: number; energyWh?: number }>;
  lastCookerAt: string | null;
  lastActivityAt: string | null;
  absences: Absence[];
  alerts: ViewAlert[];
};

export type OnboardingPatch = Partial<Pick<AppView, "senior" | "household" | "mealProfile" | "alertSettings" | "seniorConsent">>;

/** 기존 저장 번호를 유지한다. 1·2번 기기 단계는 이제 홈 이후의 선택 기능이다. */
export const ONBOARDING_COMPLETE = 8;
export const HOUSEHOLD_STEP = 3;
export function visibleOnboardingStep(savedStep: number): number {
  return Number.isInteger(savedStep) && savedStep >= HOUSEHOLD_STEP ? Math.min(savedStep, ONBOARDING_COMPLETE) : HOUSEHOLD_STEP;
}
export function guardianStartPath(savedStep: number): "/home" | "/tutorial" | "/onboarding" {
  if (savedStep >= ONBOARDING_COMPLETE) return "/home";
  return savedStep >= HOUSEHOLD_STEP ? "/onboarding" : "/tutorial";
}
export function tutorialExitPath(savedStep: number): "/home" | "/onboarding" {
  return savedStep >= ONBOARDING_COMPLETE ? "/home" : "/onboarding";
}

/** 기기 접근 확인 시각만 전달한다. 원시 전력값은 클라이언트 계약에 없다. */
export type RegisterPlugResult = { connected: true; checkedAt: string };

/** 화면에서 쓰는 동작. 데모와 실서비스가 각각 구현한다. */
export type AppActions = {
  saveOnboarding(step: number, patch?: OnboardingPatch): Promise<void>;
  registerPlug(deviceId: string, token: string): Promise<RegisterPlugResult>;
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

/** 네 끼를 새로 선택할 때만 쓰는 편집 가능한 초기 시간. 기본값은 여전히 세 끼다. */
export const FOUR_MEAL_WINDOWS: MealWindow[] = [
  ...DEFAULT_WINDOWS,
  { slot: "fourth", start: "21:00", end: "23:00" },
];

export const SLOT_LABEL = { breakfast: "첫 끼", lunch: "두 끼", dinner: "세 끼", fourth: "네 끼" } as const;
const ORDINAL_LABELS = ["첫 끼", "두 끼", "세 끼", "네 끼"] as const;

/** 1·2끼 기존 저장 ID를 유지한다. 표시 순서는 mealSlotLabel로 정한다. */
export function mealSlotsForCount(count: number): MealSlotName[] {
  if (count === 1) return ["lunch"];
  if (count === 2) return ["breakfast", "dinner"];
  if (count === 4) return ["breakfast", "lunch", "dinner", "fourth"];
  return ["breakfast", "lunch", "dinner"];
}

export function mealSlotLabel(slot: MealSlotName, windows: Pick<MealWindow, "slot">[]): string {
  const index = windows.findIndex((window) => window.slot === slot);
  return ORDINAL_LABELS[index] ?? SLOT_LABEL[slot];
}

/** 실제 가족 데이터가 아직 연결되지 않았다면 미확인을 새로 판정하지 않는다. */
export function careDataAvailable(v: AppView): boolean {
  return v.careAvailable ?? (v.dataSource !== "firebase");
}

const ORDER = { breakfast: 0, lunch: 1, dinner: 2, fourth: 3 } as const;

/** 하루치 끼니. 아직 서버 판정이 없는 오늘은 시간대 기준으로 채운다. */
export function slotsForDate(v: AppView, date: string, now: Date): MealSlot[] {
  const found = v.slots.filter((s) => s.date === date).sort((a, b) => ORDER[a.slot] - ORDER[b.slot]);
  if (found.length || date !== kstDate(now)) return found;
  if (!careDataAvailable(v)) return [];
  return resolveMealSlots({ date, windows: v.mealProfile.windows, events: [], eatOutChecks: [], absences: v.absences, now });
}

export type MealDayTone = "all" | "half" | "low" | "pending" | "away" | "empty";
/** 하루 색은 확인 비율로 정한다. 외식은 확인, 부재는 제외한다. 진행일은 예정된 끼니 수도 보여 준다. */
export function mealDaySummary(v: AppView, date: string, now: Date): { tone: MealDayTone; ok: number; total: number } {
  const slots = slotsForDate(v, date, now);
  const counted = slots.filter((slot) => slot.status !== "away");
  const ok = counted.filter((slot) => slot.status === "confirmed" || slot.status === "eat_out").length;
  const total = slots.length && date === kstDate(now) ? Math.max(counted.length, v.mealProfile.windows.length - (slots.length - counted.length)) : counted.length;
  if (!slots.length) return { tone: "empty", ok, total };
  if (slots.every((slot) => slot.status === "away")) return { tone: "away", ok: 0, total: 0 };
  // 오늘 진행 중인 시간대나 아직 수신되지 않은 슬롯이 남으면 완료 비율로 오해하지 않게 한다.
  if (slots.some((slot) => slot.status === "pending") || (date === kstDate(now) && slots.length < v.mealProfile.windows.length)) {
    return { tone: "pending", ok, total };
  }
  return { tone: !total ? "empty" : ok === total ? "all" : ok / total >= 0.5 ? "half" : "low", ok, total };
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

/** 리포트 요약: 홈 카드와 리포트 화면이 같은 문구를 쓰도록. 데이터가 모자라면 null. */
export function reportSummary(v: AppView, now: Date) {
  const { recent, before } = patternReport(v, now);
  if (recent.rate === null || before.total < 14) return null;
  const r = Math.round(recent.rate * 100);
  const b = Math.round((before.rate ?? 0) * 100);
  const diff = r - b;
  const trend = diff <= -10 ? "down" : diff >= 10 ? "up" : "same";
  const message =
    trend === "down" ? `평소(${b}%)보다 식사 소식이 줄었어요.` : trend === "up" ? `평소(${b}%)보다 소식이 많아졌어요.` : `평소(${b}%)와 비슷하게 지내고 계세요.`;
  return { recent, before, r, b, trend, message } as const;
}
