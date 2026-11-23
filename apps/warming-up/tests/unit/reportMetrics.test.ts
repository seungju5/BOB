import { describe, expect, it } from "vitest";
import { DEFAULT_WINDOWS, type AppView } from "@/lib/data/view";
import type { MealSlot } from "@/lib/judge/types";
import { cookerUsage, daysAgo, energyUsage, slotRates, WON_PER_KWH } from "@/lib/report/metrics";

// 2026-11-12 정오(KST) 기준. 리포트는 어제까지 7일(11-05~11-11)을 본다.
const NOW = new Date("2026-11-12T03:00:00Z");

function view(partial: Partial<AppView> = {}): AppView {
  return {
    mode: "demo",
    onboardingStep: 8,
    plug: { deviceId: "p", online: true, lastReadingAt: null },
    senior: { name: "정숙", relation: "어머니", phone: "" },
    household: { residentCount: 1, hasPet: false },
    mealProfile: { windows: DEFAULT_WINDOWS, eatOutPerWeek: 1, usesKeepWarm: true, cooksPerWeek: 7 },
    alertSettings: { missedMealsThreshold: 2, fastingHours: 48, emergencyHours: 72 },
    seniorConsent: true,
    pairingCode: null,
    seniorPaired: true,
    slots: [],
    stats: {},
    lastCookerAt: null,
    lastActivityAt: null,
    absences: [],
    alerts: [],
    ...partial,
  };
}

describe("report metrics", () => {
  it("daysAgo: 어제부터 7일, 오래된 순", () => {
    expect(daysAgo(NOW, 1, 7)).toEqual(["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11"]);
  });

  it("slotRates: 끼니별로 세고, 부재·대기는 빼고, 외식은 확인으로 본다", () => {
    const slots: MealSlot[] = [
      { date: "2026-11-10", slot: "breakfast", status: "confirmed", source: "cooker" },
      { date: "2026-11-11", slot: "breakfast", status: "unconfirmed", source: null },
      { date: "2026-11-11", slot: "lunch", status: "eat_out", source: "senior_check" },
      { date: "2026-11-11", slot: "dinner", status: "away", source: "absence" },
    ];
    const rows = slotRates(view({ slots }), NOW);
    expect(rows).toEqual([
      { slot: "breakfast", ok: 1, total: 2, rate: 0.5 },
      { slot: "lunch", ok: 1, total: 1, rate: 1 },
      { slot: "dinner", ok: 0, total: 0, rate: null },
    ]);
  });

  it("slotRates: 저장된 시간대만 (2끼면 두 줄)", () => {
    const rows = slotRates(view({ mealProfile: { windows: [DEFAULT_WINDOWS[0], DEFAULT_WINDOWS[2]], eatOutPerWeek: 1, usesKeepWarm: true, cooksPerWeek: 7 } }), NOW);
    expect(rows.map((r) => r.slot)).toEqual(["breakfast", "dinner"]);
  });

  it("keeps missing records distinct from observed zero and does not infer an incomplete baseline", () => {
    const recent = daysAgo(NOW, 1, 7);
    const empty = cookerUsage(view({stats:{}}), NOW);
    expect(empty).toMatchObject({cook:null,lid:null,cookWeeklyBefore:null,recordedDays:0});
    expect(empty.perDay.every((d) => d.cook === null)).toBe(true);
    const partial = cookerUsage(view({stats:{[recent[1]]:{cook:0,lid:0}}}), NOW);
    expect(partial).toMatchObject({cook:0,lid:0,cookWeeklyBefore:null,recordedDays:1});
    expect(partial.perDay.map((d) => d.cook)).toEqual([null,0,null,null,null,null,null]);
  });

  it("cookerUsage: 최근 7일 합계와 이전 4주 주 평균", () => {
    const stats: AppView["stats"] = {};
    for (const d of daysAgo(NOW, 1, 7)) stats[d] = { cook: 1, lid: 2 };
    for (const d of daysAgo(NOW, 8, 35)) stats[d] = { cook: 2, lid: 0 };
    const u = cookerUsage(view({ stats }), NOW);
    expect(u.cook).toBe(7);
    expect(u.lid).toBe(14);
    expect(u.cookWeeklyBefore).toBe(14);
    expect(u.perDay).toHaveLength(7);
  });

  it("energyUsage: 하루 합계가 없으면 null (요금 '준비 중')", () => {
    expect(energyUsage(view({ stats: { "2026-11-11": { cook: 1, lid: 0 } } }), NOW)).toBeNull();
  });

  it("energyUsage: 하루 합계(Wh)를 더해 kWh와 어림 요금을 낸다", () => {
    const e = energyUsage(view({ stats: { "2026-11-10": { cook: 1, lid: 0, energyWh: 500 }, "2026-11-11": { cook: 1, lid: 0, energyWh: 1500 } } }), NOW);
    expect(e).toEqual({ days: 2, kwh: 2, won: 2 * WON_PER_KWH });
  });
});
