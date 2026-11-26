import { describe, expect, it } from "vitest";
import { homeMealDay, homeMealWeek } from "@/lib/data/meal-week";
import { mealWindowsForCount, type AppView } from "@/lib/data/view";
import { createDemoState } from "@/lib/demo/state";
import { toView } from "@/lib/demo/derive";

// Presentation fixtures only; none of these records are stored in a live account.
const NOW = new Date("2026-11-26T03:00:00Z");
const TODAY = "2026-11-26";
const liveView = (): AppView => ({ ...toView(createDemoState(NOW), NOW), mode: "live", dataSource: "firebase", slots: [], stats: {}, mealScheduleHistory: [] });

describe("홈의 한 주의 밥상", () => {
  it("한국 시간 기준 월요일부터 일요일까지 연도 경계를 넘겨 표시한다", () => {
    const days = homeMealWeek(liveView(), new Date("2026-12-31T15:10:00Z"));
    expect(days.map(day => day.date)).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
    expect(days.filter(day => day.isToday).map(day => day.weekday)).toEqual(["금"]);
  });

  it("실제 미연결 계정에 예시 기록이나 결식 판정을 만들지 않는다", () => {
    const view = liveView();
    view.careAvailable = false;
    view.plug.online = false;
    const day = homeMealDay(view, TODAY, NOW);
    expect(day.periods.map(period => period.state)).toEqual(["no_record", "no_record", "no_record"]);
    expect(day).toMatchObject({ confirmed: 0, eatOut: 0, tone: "empty" });
    expect(homeMealDay(view, "2026-11-25", NOW).periods).toEqual([]);
    expect(view.slots).toEqual([]);
  });

  it("미래 날짜에 잘못 들어온 기록을 확인된 식사로 보여주지 않는다", () => {
    const view = liveView();
    view.slots = [{ date: "2026-11-27", slot: "breakfast", status: "confirmed", source: "cooker" }];
    view.stats["2026-11-27"] = { cook: 1, lid: null, estimatedSlots: ["lunch"] };
    const day = homeMealDay(view, "2026-11-27", NOW);
    expect(day).toMatchObject({ isFuture: true, confirmed: 0, tone: "pending" });
    expect(day.periods.every(period => period.state === "pending")).toBe(true);
  });

  it("설정을 다섯 끼에서 두 끼로 바꿔도 어제의 분모와 시간을 보존한다", () => {
    const view = liveView();
    view.mealProfile.windows = mealWindowsForCount(2);
    view.cookerMealDays = { "2026-11-25": mealWindowsForCount(5) };
    view.slots = [{ date: "2026-11-25", slot: "fifth", status: "confirmed", source: "cooker" }];
    const previous = homeMealDay(view, "2026-11-25", NOW);
    expect(previous.periods).toHaveLength(5);
    expect(previous.periods[4]).toMatchObject({ label: "다섯 끼", state: "confirmed", start: mealWindowsForCount(5)[4].start });
    expect(previous.confirmed).toBe(1);
    expect(homeMealDay(view, TODAY, NOW).periods.map(period => period.label)).toEqual(["첫 끼", "두 끼"]);
  });

  it("관측 일정이 없을 때 저장된 설정 이력을 사용한다", () => {
    const view = liveView();
    view.mealProfile.windows = mealWindowsForCount(2);
    view.mealScheduleHistory = [{ through: "2026-11-23", windows: mealWindowsForCount(3) }, { through: "2026-11-25", windows: mealWindowsForCount(4) }];
    expect(homeMealDay(view, "2026-11-24", NOW).periods).toHaveLength(4);
  });

  it("이력이 없는 과거 다섯째 기록을 첫 끼로 잘못 바꾸지 않는다", () => {
    const view = liveView();
    view.slots = [{ date: "2026-11-23", slot: "fifth", status: "confirmed", source: "cooker" }];
    expect(homeMealDay(view, "2026-11-23", NOW).periods).toEqual([{ slot: "fifth", label: "다섯 끼", state: "confirmed" }]);
  });

  it("추정 신호를 확인 수에 더하지 않고 기록 없음과 구별한다", () => {
    const view = liveView();
    view.stats[TODAY] = { cook: 0, lid: null, estimated: 1, estimatedSlots: ["breakfast"] };
    const day = homeMealDay(view, TODAY, NOW);
    expect(day.periods.map(period => period.state)).toEqual(["estimated", "no_record", "no_record"]);
    expect(day.confirmed).toBe(0);
  });

  it("기기 연결이 끊겨도 저장된 확인·외식·부재 상태를 그대로 표시한다", () => {
    const view = liveView();
    view.careAvailable = false;
    view.plug.online = false;
    view.slots = [
      { date: TODAY, slot: "breakfast", status: "confirmed", source: "cooker" },
      { date: TODAY, slot: "lunch", status: "eat_out", source: "senior_check" },
      { date: TODAY, slot: "dinner", status: "away", source: "absence" },
    ];
    const day = homeMealDay(view, TODAY, NOW);
    expect(day.periods.map(period => period.state)).toEqual(["confirmed", "eat_out", "away"]);
    expect(day).toMatchObject({ confirmed: 1, eatOut: 1, tone: "some" });
  });

  it("하루 전체 부재를 미확인으로 바꾸지 않는다", () => {
    const view = liveView();
    view.slots = view.mealProfile.windows.map(({ slot }) => ({ date: TODAY, slot, status: "away", source: "absence" }));
    expect(homeMealDay(view, TODAY, NOW)).toMatchObject({ tone: "away", confirmed: 0, eatOut: 0 });
  });
});
