// 데모 상태. Supabase를 붙이기 전까지 브라우저 localStorage에 둔다.
// 같은 브라우저의 시니어 화면과 보호자 화면이 이 상태를 함께 쓴다.

import { ALERT_DEFAULTS } from "@/config/detection";
import { DEFAULT_WINDOWS } from "@/lib/data/view";
import { addDays, kstDate, kstDateTime, MINUTE_MS } from "@/lib/judge/time";
import type { Absence, AlertType, MealWindow } from "@/lib/judge/types";

export type StoredEvent = { type: "cook" | "lid_open"; startedAt: string; endedAt: string };
export type StoredAlert = {
  id: string;
  type: AlertType;
  triggeredAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
};
export type SeniorAction = { type: "eat_out" | "away" | "help"; at: string };

export type DemoState = {
  version: 1;
  onboardingStep: number; // 1~7 진행 중, 8 = 완료
  plug: { deviceId: string; online: boolean; offlineSince: string | null };
  senior: { name: string; relation: string; phone: string };
  household: { residentCount: number; hasPet: boolean };
  mealProfile: { windows: MealWindow[]; eatOutPerWeek: number; usesKeepWarm: boolean; cooksPerWeek: number };
  alertSettings: { missedMealsThreshold: number; fastingHours: number; emergencyHours: number };
  seniorConsent: boolean;
  pairingCode: string;
  seniorPaired: boolean;
  events: StoredEvent[];
  seniorActions: SeniorAction[];
  absences: Absence[];
  alerts: StoredAlert[];
};

/** 날짜마다 같은 값을 내는 의사 난수 */
function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const at = (date: string, hhmm: string, plusMin = 0) => new Date(kstDateTime(date, hhmm).getTime() + plusMin * MINUTE_MS);

/** 지난 5주치 밥솥 기록을 만든다. 최근 사흘은 식사가 줄어드는 패턴(리포트에서 변화가 보이도록). */
function seedHistory(now: Date): { events: StoredEvent[]; seniorActions: SeniorAction[] } {
  const events: StoredEvent[] = [];
  const seniorActions: SeniorAction[] = [];
  const today = kstDate(now);
  const push = (type: StoredEvent["type"], start: Date, minutes: number) => {
    if (start > now) return;
    events.push({ type, startedAt: start.toISOString(), endedAt: new Date(start.getTime() + minutes * MINUTE_MS).toISOString() });
  };

  for (let d = 34; d >= 1; d--) {
    const date = addDays(today, -d);
    const r = rng(date);
    const recent = d <= 3;
    if (r() > (recent ? 0.45 : 0.1)) push("cook", at(date, "07:10", Math.floor(r() * 50)), 35);
    if (r() > (recent ? 0.75 : 0.4)) push("lid_open", at(date, "12:00", Math.floor(r() * 70)), 2);
    else if (!recent && r() > 0.8) seniorActions.push({ type: "eat_out", at: at(date, "12:40").toISOString() });
    if (r() > (recent ? 0.5 : 0.12)) push("cook", at(date, "17:40", Math.floor(r() * 60)), 35);
  }
  push("cook", at(today, "07:38"), 34);
  push("lid_open", at(today, "11:42"), 2);
  return { events, seniorActions };
}

export function createDemoState(now: Date): DemoState {
  return {
    version: 1,
    onboardingStep: 1,
    plug: { deviceId: "", online: true, offlineSince: null },
    senior: { name: "정숙", relation: "어머니", phone: "" },
    household: { residentCount: 1, hasPet: false },
    mealProfile: { windows: DEFAULT_WINDOWS, eatOutPerWeek: 1, usesKeepWarm: true, cooksPerWeek: 7 },
    alertSettings: {
      missedMealsThreshold: ALERT_DEFAULTS.MISSED_MEALS_THRESHOLD,
      fastingHours: ALERT_DEFAULTS.FASTING_HOURS,
      emergencyHours: ALERT_DEFAULTS.EMERGENCY_HOURS,
    },
    seniorConsent: false,
    pairingCode: String(100000 + Math.floor(Math.random() * 900000)),
    seniorPaired: false,
    ...seedHistory(now),
    absences: [],
    alerts: [],
  };
}
