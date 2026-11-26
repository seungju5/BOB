import { describe, expect, it } from "vitest";
import { createDemoState } from "@/lib/demo/state";
import { syncAlerts } from "@/lib/demo/derive";
import { addDays, kstDate, kstDateTime } from "@/lib/judge/time";

describe("extended missed-meal alert window", () => {
  it.each([9, 10])("evaluates %i consecutive misses with one meal a day", (missed) => {
    const now = new Date("2026-11-26T12:00:00Z");
    const state = createDemoState(now);
    const lastMeal = kstDateTime(addDays(kstDate(now), -missed), "07:30").toISOString();
    state.onboardingStep = 8;
    state.seniorConsent = true;
    state.mealProfile.windows = [{ slot: "breakfast", start: "07:00", end: "09:00" }];
    state.alertSettings.missedMealsThreshold = 10;
    state.events = [{ type: "cook", startedAt: lastMeal, endedAt: lastMeal }];
    state.seniorActions = [];
    const active = syncAlerts(state, now).alerts.filter(a => !a.resolvedAt).map(a => a.type);
    expect(active.includes("missed_meals")).toBe(missed === 10);
  });
});
