import { ALERT_DEFAULTS } from "@/config/detection.ts";
import { inAbsence } from "./resolveMealSlots.ts";
import { addDays, HOUR_MS, kstDate, kstDateTime } from "./time.ts";
import type { Absence, AlertSettings, AlertType, MealSlot } from "./types.ts";

export type AlertInput = {
  now: Date;
  /** 최근 끼니 슬롯, 시간 순 */
  slots: MealSlot[];
  /** 마지막 취사·열림·시니어 버튼 시각 */
  lastActivityAt: Date | null;
  settings: AlertSettings;
  absences: Absence[];
  /** 플러그에서 마지막으로 값을 받은 시각 */
  lastReadingAt: Date | null;
  /** 마지막 활동 이후 플러그가 미수신이었던 누적 시간(ms). 공복시간에서 뺀다. */
  offlineMsSinceLastActivity?: number;
  /** 아직 해제되지 않은 알림 */
  openAlerts: AlertType[];
};

export type AlertResult = { create: AlertType[]; resolve: AlertType[] };

/** 이 함수가 조건을 판단하는 알림. help_request는 시니어 버튼으로 즉시 생긴다. */
const MANAGED: AlertType[] = ["missed_meals", "fasting", "emergency", "device_offline"];

/** 결식·공복·위험·기기 알림 판단. design.md 4.3. */
export function evaluateAlerts(input: AlertInput): AlertResult {
  const { now, settings, openAlerts } = input;
  const active = new Set<AlertType>();

  const offline =
    !input.lastReadingAt ||
    now.getTime() - input.lastReadingAt.getTime() >= ALERT_DEFAULTS.DEVICE_OFFLINE_HOURS * HOUR_MS;
  const away = inAbsence(kstDate(now), input.absences);

  if (offline) {
    // 기기 문제는 결식과 구분한다. 미수신 중에는 식사 관련 알림을 보내지 않는다.
    active.add("device_offline");
  } else if (!away) {
    if (countMissedMeals(input.slots) >= settings.missedMealsThreshold) active.add("missed_meals");

    const start = effectiveStart(input.lastActivityAt, input.absences, now);
    if (start) {
      const hours = (now.getTime() - start.getTime() - (input.offlineMsSinceLastActivity ?? 0)) / HOUR_MS;
      if (hours >= settings.fastingHours) active.add("fasting");
      if (hours >= settings.emergencyHours) active.add("emergency");
    }
  }

  return {
    create: MANAGED.filter((t) => active.has(t) && !openAlerts.includes(t)),
    resolve: MANAGED.filter((t) => !active.has(t) && openAlerts.includes(t)),
  };
}

/** 최근부터 거슬러 올라가며 연속 미확인 끼니 수. pending은 건너뛰고, 확인·외식·부재가 끊는다. */
export function countMissedMeals(slots: MealSlot[]): number {
  let count = 0;
  for (let i = slots.length - 1; i >= 0; i--) {
    const s = slots[i].status;
    if (s === "pending") continue;
    if (s !== "unconfirmed") break;
    count++;
  }
  return count;
}

/** 공복시간을 세기 시작하는 시각. 마지막 활동 이후 끝난 부재가 있으면 그 다음 날 0시부터. */
function effectiveStart(lastActivityAt: Date | null, absences: Absence[], now: Date): Date | null {
  if (!lastActivityAt) return null;
  let start = lastActivityAt;
  const today = kstDate(now);
  for (const a of absences) {
    if (a.endDate < kstDate(lastActivityAt) || a.endDate >= today) continue;
    const restart = kstDateTime(addDays(a.endDate, 1), "00:00");
    if (restart > start) start = restart;
  }
  return start;
}
