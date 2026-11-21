import { describe, expect, it } from "vitest";
import { evaluateAlerts, type AlertInput } from "@/lib/judge/evaluateAlerts";
import type { MealSlot, MealStatus } from "@/lib/judge/types";
import { at } from "./helpers";

const settings = { missedMealsThreshold: 2, fastingHours: 48, emergencyHours: 72 };

function slots(statuses: MealStatus[]): MealSlot[] {
  const names = ["breakfast", "lunch", "dinner"] as const;
  return statuses.map((status, i) => ({
    date: `2026-10-${String(14 + Math.floor(i / 3)).padStart(2, "0")}`,
    slot: names[i % 3],
    status,
    source: null,
  }));
}

function input(over: Partial<AlertInput>): AlertInput {
  return {
    now: at("2026-10-16 15:00"),
    slots: [],
    lastActivityAt: at("2026-10-16 12:00"),
    settings,
    absences: [],
    lastReadingAt: at("2026-10-16 14:59"),
    openAlerts: [],
    ...over,
  };
}

describe("evaluateAlerts (test.md 1.3)", () => {
  it("T-ALR-01: unconfirmed 2끼 연속 → missed_meals 생성", () => {
    const r = evaluateAlerts(input({ slots: slots(["confirmed", "unconfirmed", "unconfirmed"]) }));
    expect(r.create).toEqual(["missed_meals"]);
  });

  it("T-ALR-02: unconfirmed → eat_out → unconfirmed → 알림 없음", () => {
    const r = evaluateAlerts(input({ slots: slots(["unconfirmed", "eat_out", "unconfirmed"]) }));
    expect(r.create).toEqual([]);
  });

  it("T-ALR-03: 기준 3끼일 때 2끼 연속 → 알림 없음", () => {
    const r = evaluateAlerts(
      input({ slots: slots(["confirmed", "unconfirmed", "unconfirmed"]), settings: { ...settings, missedMealsThreshold: 3 } }),
    );
    expect(r.create).toEqual([]);
  });

  it("pending은 건너뛰고 센다", () => {
    const r = evaluateAlerts(input({ slots: slots(["unconfirmed", "unconfirmed", "pending"]) }));
    expect(r.create).toEqual(["missed_meals"]);
  });

  it("away는 연속을 끊는다 (부재가 끝난 뒤부터 다시 센다)", () => {
    const r = evaluateAlerts(input({ slots: slots(["unconfirmed", "away", "unconfirmed", "pending"]) }));
    expect(r.create).toEqual([]);
  });

  it("T-ALR-04: 마지막 활동 후 48시간 → fasting", () => {
    const r = evaluateAlerts(input({ lastActivityAt: at("2026-10-14 15:00") }));
    expect(r.create).toEqual(["fasting"]);
  });

  it("T-ALR-05: 마지막 활동 후 72시간 → fasting + emergency", () => {
    const r = evaluateAlerts(input({ lastActivityAt: at("2026-10-13 15:00") }));
    expect(r.create.sort()).toEqual(["emergency", "fasting"]);
  });

  it("T-ALR-06: 이미 열린 알림은 다시 만들지 않는다", () => {
    const r = evaluateAlerts(
      input({ slots: slots(["unconfirmed", "unconfirmed"]), openAlerts: ["missed_meals"] }),
    );
    expect(r.create).toEqual([]);
    expect(r.resolve).toEqual([]);
  });

  it("T-ALR-08: 조건이 풀리면 열린 알림을 해제한다", () => {
    const r = evaluateAlerts(
      input({ slots: slots(["unconfirmed", "unconfirmed", "confirmed"]), openAlerts: ["missed_meals", "fasting"] }),
    );
    expect(r.resolve.sort()).toEqual(["fasting", "missed_meals"]);
  });

  it("help_request는 이 함수가 만들거나 해제하지 않는다", () => {
    const r = evaluateAlerts(input({ openAlerts: ["help_request"] }));
    expect(r.resolve).toEqual([]);
  });

  it("부재 기간 중에는 결식·공복·위험 알림을 보내지 않는다", () => {
    const r = evaluateAlerts(
      input({
        lastActivityAt: at("2026-10-12 08:00"),
        slots: slots(["unconfirmed", "unconfirmed"]),
        absences: [{ startDate: "2026-10-12", endDate: "2026-10-17" }],
      }),
    );
    expect(r.create).toEqual([]);
  });

  it("T-EDGE-04: 부재가 끝난 다음 날 0시부터 다시 센다", () => {
    // 부재 10/10~10/14, 마지막 활동 10/10 08:00. 10/15 00:00부터 세면 10/16 15:00은 39시간 → 아직 아님
    const r = evaluateAlerts(
      input({ lastActivityAt: at("2026-10-10 08:00"), absences: [{ startDate: "2026-10-10", endDate: "2026-10-14" }] }),
    );
    expect(r.create).toEqual([]);
    // 10/17 01:00이면 49시간 → fasting
    const r2 = evaluateAlerts(
      input({
        now: at("2026-10-17 01:00"),
        lastReadingAt: at("2026-10-17 00:59"),
        lastActivityAt: at("2026-10-10 08:00"),
        absences: [{ startDate: "2026-10-10", endDate: "2026-10-14" }],
      }),
    );
    expect(r2.create).toEqual(["fasting"]);
  });

  it("T-EDGE-01: 플러그 3시간 미수신 → device_offline만", () => {
    const r = evaluateAlerts(input({ lastReadingAt: at("2026-10-16 12:00"), lastActivityAt: at("2026-10-14 10:00") }));
    expect(r.create).toEqual(["device_offline"]);
  });

  it("T-EDGE-02: 오프라인 중 72시간이 지나도 emergency 미발송", () => {
    const r = evaluateAlerts(input({ lastReadingAt: at("2026-10-14 12:00"), lastActivityAt: at("2026-10-13 10:00") }));
    expect(r.create).toEqual(["device_offline"]);
  });

  it("미수신 시간은 공복시간에 넣지 않는다", () => {
    // 마지막 활동 10/14 12:00, 10/15 12:00~10/16 12:00 미수신(offlineMs 24h). 10/16 15:00은 실제 51h, 보정 27h
    const r = evaluateAlerts(
      input({ lastActivityAt: at("2026-10-14 12:00"), offlineMsSinceLastActivity: 24 * 3600 * 1000 }),
    );
    expect(r.create).toEqual([]);
  });

  it("기기가 다시 수신되면 device_offline 해제", () => {
    const r = evaluateAlerts(input({ openAlerts: ["device_offline"] }));
    expect(r.resolve).toEqual(["device_offline"]);
  });
});
