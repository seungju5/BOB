export type PowerReading = { measuredAt: Date; watts: number };

export type CookerEventType = "cook" | "lid_open";
export type CookerEvent = { type: CookerEventType; startedAt: Date; endedAt: Date };

export type MealSlotName = "breakfast" | "lunch" | "dinner";
export type MealWindow = { slot: MealSlotName; start: string; end: string }; // 'HH:MM' KST

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

export type AlertType = "missed_meals" | "fasting" | "emergency" | "help_request" | "device_offline";

export type AlertSettings = {
  missedMealsThreshold: number;
  fastingHours: number;
  emergencyHours: number;
};
