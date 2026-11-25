export type PowerReading = { measuredAt: Date; watts: number };

export type CookerEventType = "cook" | "lid_open";
export type CookerEvent = { type: CookerEventType; startedAt: Date; endedAt: Date };

// 저장된 슬롯 ID는 끼니 수가 바뀌어도 유지한다.
export const MEAL_SLOT_NAMES = ["breakfast", "lunch", "dinner", "fourth", "fifth"] as const;
export type MealSlotName = (typeof MEAL_SLOT_NAMES)[number];
export type MealWindow = { slot: MealSlotName; start: string; end: string }; // 'HH:MM' KST
export type MealScheduleChange = { through: string; windows: MealWindow[] };

export type MealStatus = "confirmed" | "unconfirmed" | "eat_out" | "away" | "pending";
export type MealSource = "cooker" | "senior_check" | "absence" | null;
export type MealSlot = {
  date: string; // KST 'YYYY-MM-DD'
  slot: MealSlotName;
  status: MealStatus;
  source: MealSource;
};

/** 부재 기간. 날짜는 KST, 양 끝 포함. */
export type Absence = { startDate: string; endDate: string };

/**
 * 알림 종류. 위 다섯은 판단 로직(evaluateAlerts)이 만들고 해제한다.
 * eat_out·away는 어르신 버튼, weekly_report는 주간 작업이 만드는 '소식' 알림이라 해제 대상이 아니다.
 */
export type AlertType = "missed_meals" | "fasting" | "emergency" | "help_request" | "device_offline" | "eat_out" | "away" | "weekly_report";

/** 알림에 붙는 부가 정보 (alerts.payload jsonb) */
export type AlertPayload = { meterObserved?: boolean; seniorReported?: boolean; startDate?: string; endDate?: string; meal?: { date: string; label: string }; rate?: number };

export type AlertSettings = {
  missedMealsThreshold: number;
  fastingHours: number;
  emergencyHours: number;
};
