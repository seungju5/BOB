import { afterEach, describe, expect, it, vi } from "vitest";
import { alertCopy, weeklyReportLabel } from "../../lib/alerts/copy";
import { missedMealsHint } from "../../components/forms";
import { mealRecordTime, performSeniorAction } from "../../lib/data/senior";
import { createDemoState, type DemoState } from "../../lib/demo/state";

describe("주간 리포트 이름", () => {
  it("월요일 발행분은 전주가 속한 주차로 센다", () => {
    // 2026-11-23(월) 09:00 KST 발행 → 11/16~22 주(목 11/19) → 11월 3주차
    expect(weeklyReportLabel(new Date("2026-11-23T00:00:00Z"))).toBe("11월 3주차");
    // 11/9 발행 → 11/2~8 주 → 11월 1주차
    expect(weeklyReportLabel(new Date("2026-11-09T00:00:00Z"))).toBe("11월 1주차");
  });
  it("월말에 걸친 주는 목요일이 있는 달로 센다", () => {
    // 11/2(월) 발행 → 10/26~11/1 주(목 10/29) → 10월 5주차
    expect(weeklyReportLabel(new Date("2026-11-02T00:00:00Z"))).toBe("10월 5주차");
  });
});

describe("결식 알림 안내", () => {
  it("하루 2끼에 2끼면 하루", () => expect(missedMealsHint(2, 2)).toContain("2끼면 하루 동안"));
  it("하루 3끼에 2끼면 하루가 안 됨", () => expect(missedMealsHint(2, 3)).toContain("하루가 채 안 되는 동안"));
  it("하루 3끼에 6끼면 이틀", () => expect(missedMealsHint(6, 3)).toContain("이틀 동안"));
  it("하루 2끼에 5끼면 이틀 하고 1끼", () => expect(missedMealsHint(5, 2)).toContain("이틀 하고 1끼 동안"));
});

describe("어르신이 선택한 날짜와 보호자 알림", () => {
  const date = "2026-11-23";
  const now = new Date(date + "T07:10:00+09:00");
  const settings = { missed: 2, fasting: 48, emergency: 72 };
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("시작한 끼니는 중간 시각 전에도 고를 수 있고 미래 끼니는 기다린다", () => {
    const window = { start: "07:00", end: "09:00" };
    expect(mealRecordTime(date, window, now)).toEqual(now);
    expect(mealRecordTime(date, window, new Date(date + "T07:00:00+09:00"))?.getTime()).toBe(now.getTime() - 600000);
    expect(mealRecordTime(date, window, new Date(date + "T06:59:59+09:00"))).toBeNull();
    expect(mealRecordTime("2026-11-22", window, now)).toEqual(new Date("2026-11-22T08:00:00+09:00"));
  });

  it("어제 고른 끼니와 내일 시작하는 외출 기간을 보호자에게 그대로 표시한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const key = "bapmutna.demo.v1";
    const saved = new Map([[key, JSON.stringify(createDemoState(now))], ["bapmutna.senior.token", "demo"]]);
    vi.stubGlobal("localStorage", { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => saved.set(k, v) });
    vi.stubGlobal("window", new EventTarget());
    await performSeniorAction("demo", "eat_out", undefined, { meal: { date: "2026-11-22", slot: "breakfast" } });
    await performSeniorAction("demo", "away", 2, { startDate: "2026-11-24" });
    const state: DemoState = JSON.parse(saved.get(key)!);
    const meal = state.alerts.findLast(a => a.type === "eat_out")!;
    expect(alertCopy(meal.type, "어머니", { ...settings, payload: meal.payload }).body).toContain("11월 22일 첫 끼");
    const away = state.alerts.findLast(a => a.type === "away")!;
    expect(alertCopy(away.type, "어머니", { ...settings, payload: away.payload }).title).toContain("11월 24일부터 11월 25일까지");
    expect(alertCopy("away", "어머니", { ...settings, payload: { endDate: "2026-11-25" } }).title).toContain("11월 25일까지");
    expect(alertCopy("away", "어머니", { ...settings, payload: { startDate: date, endDate: date } }).title).toContain("11월 23일 하루");
  });
});
