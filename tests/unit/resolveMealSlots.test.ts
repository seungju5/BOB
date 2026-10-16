import { describe, expect, it } from "vitest";
import { resolveMealSlots } from "@/lib/judge/resolveMealSlots";
import type { CookerEvent, MealWindow } from "@/lib/judge/types";
import { at } from "./helpers";

const windows: MealWindow[] = [
  { slot: "breakfast", start: "06:00", end: "10:00" },
  { slot: "lunch", start: "11:00", end: "14:00" },
  { slot: "dinner", start: "17:00", end: "21:00" },
];
const date = "2026-10-16";
const cook = (s: string, e: string): CookerEvent => ({ type: "cook", startedAt: at(s), endedAt: at(e) });
const statusOf = (slots: ReturnType<typeof resolveMealSlots>) =>
  Object.fromEntries(slots.map((s) => [s.slot, s.status]));

describe("resolveMealSlots (test.md 1.2)", () => {
  it("T-MEAL-01: 이벤트 없이 하루 시작 → 시간대 수만큼 pending", () => {
    const slots = resolveMealSlots({ date, windows, events: [], eatOutChecks: [], absences: [], now: at("2026-10-16 00:00") });
    expect(slots).toHaveLength(3);
    expect(slots.every((s) => s.status === "pending")).toBe(true);
  });

  it("T-MEAL-02: 점심 시간대 취사 → lunch confirmed, source=cooker", () => {
    const slots = resolveMealSlots({
      date, windows, events: [cook("2026-10-16 11:30", "2026-10-16 12:00")], eatOutChecks: [], absences: [],
      now: at("2026-10-16 12:30"),
    });
    expect(slots.find((s) => s.slot === "lunch")).toMatchObject({ status: "confirmed", source: "cooker" });
  });

  it("T-MEAL-03: 저녁 시간대 외식했어요 → dinner eat_out", () => {
    const slots = resolveMealSlots({
      date, windows, events: [], eatOutChecks: [at("2026-10-16 18:20")], absences: [], now: at("2026-10-16 18:30"),
    });
    expect(slots.find((s) => s.slot === "dinner")).toMatchObject({ status: "eat_out", source: "senior_check" });
  });

  it("T-MEAL-04: 시간대 밖(15:30) 외식했어요 → 가장 가까운 슬롯(lunch, 14:00 끝)", () => {
    const slots = resolveMealSlots({
      date, windows, events: [], eatOutChecks: [at("2026-10-16 15:30")], absences: [], now: at("2026-10-16 15:31"),
    });
    expect(statusOf(slots).lunch).toBe("eat_out");
  });

  it("T-MEAL-05: 슬롯 종료까지 이벤트 없음 → unconfirmed, 아직 안 끝난 슬롯은 pending", () => {
    const slots = resolveMealSlots({ date, windows, events: [], eatOutChecks: [], absences: [], now: at("2026-10-16 15:00") });
    expect(statusOf(slots)).toEqual({ breakfast: "unconfirmed", lunch: "unconfirmed", dinner: "pending" });
  });

  it("T-MEAL-06: 부재 기간에 걸린 날 → 모든 슬롯 away", () => {
    const slots = resolveMealSlots({
      date, windows, events: [], eatOutChecks: [], absences: [{ startDate: "2026-10-15", endDate: "2026-10-17" }],
      now: at("2026-10-16 23:00"),
    });
    expect(slots.every((s) => s.status === "away" && s.source === "absence")).toBe(true);
  });

  it("T-MEAL-07: 하루 두 번 취사 → 해당 슬롯 각각 confirmed", () => {
    const slots = resolveMealSlots({
      date, windows,
      events: [cook("2026-10-16 07:00", "2026-10-16 07:30"), cook("2026-10-16 18:00", "2026-10-16 18:30")],
      eatOutChecks: [], absences: [], now: at("2026-10-16 23:00"),
    });
    expect(statusOf(slots)).toEqual({ breakfast: "confirmed", lunch: "unconfirmed", dinner: "confirmed" });
  });

  it("T-EDGE-05: 부재 중이라도 취사가 감지되면 confirmed가 우선", () => {
    const slots = resolveMealSlots({
      date, windows, events: [cook("2026-10-16 18:00", "2026-10-16 18:30")], eatOutChecks: [],
      absences: [{ startDate: "2026-10-15", endDate: "2026-10-17" }], now: at("2026-10-16 23:00"),
    });
    expect(statusOf(slots)).toEqual({ breakfast: "away", lunch: "away", dinner: "confirmed" });
  });

  it("T-EDGE-06: 자정을 걸친 취사는 시작 시각 날짜로 매칭 (다음 날 슬롯에 안 들어감)", () => {
    const nightWindows: MealWindow[] = [{ slot: "dinner", start: "21:00", end: "23:59" }];
    const ev = cook("2026-10-16 23:50", "2026-10-17 00:20");
    const today = resolveMealSlots({ date, windows: nightWindows, events: [ev], eatOutChecks: [], absences: [], now: at("2026-10-17 01:00") });
    const tomorrow = resolveMealSlots({ date: "2026-10-17", windows: nightWindows, events: [ev], eatOutChecks: [], absences: [], now: at("2026-10-17 01:00") });
    expect(today[0].status).toBe("confirmed");
    expect(tomorrow[0].status).toBe("pending");
  });

  it("뚜껑 열림(lid_open)도 식사 확인으로 본다", () => {
    const slots = resolveMealSlots({
      date, windows,
      events: [{ type: "lid_open", startedAt: at("2026-10-16 12:10"), endedAt: at("2026-10-16 12:11") }],
      eatOutChecks: [], absences: [], now: at("2026-10-16 12:30"),
    });
    expect(statusOf(slots).lunch).toBe("confirmed");
  });
});
