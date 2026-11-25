import { describe, expect, it, vi } from "vitest";
import { createDemoState } from "@/lib/demo/state";
import { toView } from "@/lib/demo/derive";
import { DEFAULT_WINDOWS, FIVE_MEAL_WINDOWS, FOUR_MEAL_WINDOWS, initialMealWindowOverrides, mealWindowsForCount, mealDaySummary, mealSlotLabel, mealSlotsForCount, patternReport, slotsForDate, type AppView } from "@/lib/data/view";
import { resolveMealSlots, validMealWindows } from "@/lib/judge/resolveMealSlots";
import { kstDateTime } from "@/lib/judge/time";
import type { MealSlot, MealStatus } from "@/lib/judge/types";
import { datedMealSlots, slotRates } from "@/lib/report/metrics";
import { monthLeadingDays, recordPeriod, shiftRecordPeriod } from "@/components/records/period";
import { mealStatusClass, validMealPalette } from "@/lib/data/appearance";

// 아래 데이터·이벤트는 단위 검사용 가상 기록이다. 실제 기기 수신 증거가 아니다.
const NOW = new Date("2026-11-14T03:00:00Z");
const DATE = "2026-11-13";
const base = (): AppView => ({ ...toView(createDemoState(NOW), NOW), slots: [], stats: {} });
const slots = (statuses: MealStatus[], date = DATE): MealSlot[] => statuses.map((status, index) => ({ date, slot: FOUR_MEAL_WINDOWS[index].slot, status, source: null }));
const fourView = (statuses: MealStatus[], date = DATE): AppView => {
  const view = base();
  return { ...view, mealProfile: { ...view.mealProfile, windows: FOUR_MEAL_WINDOWS }, slots: slots(statuses, date) };
};

describe("1~5끼 계약", () => {
  it("기존 세 끼 기본값과 기존 1·2끼 슬롯 ID를 바꾸지 않는다", () => {
    expect(DEFAULT_WINDOWS).toEqual([
      { slot: "breakfast", start: "06:00", end: "10:00" },
      { slot: "lunch", start: "11:00", end: "14:30" },
      { slot: "dinner", start: "17:00", end: "21:00" },
    ]);
    expect(createDemoState(NOW).mealProfile.windows).toEqual(DEFAULT_WINDOWS);
    expect(mealSlotsForCount(1)).toEqual(["lunch"]);
    expect(mealSlotsForCount(2)).toEqual(["breakfast", "dinner"]);
    expect(mealSlotsForCount(4)).toEqual(["breakfast", "lunch", "dinner", "fourth"]);
  });

  it("선택 수에 맞춰 첫 끼부터 라벨을 정한다", () => {
    for (let count = 1; count <= 5; count++) {
      const windows = mealSlotsForCount(count).map((slot) => ({ slot }));
      expect(windows.map(({ slot }) => mealSlotLabel(slot, windows))).toEqual(["첫 끼", "두 끼", "세 끼", "네 끼", "다섯 끼"].slice(0, count));
    }
  });

  it("네 번째 시간대의 취사·외식·부재·종료 판정을 기존 규칙으로 처리한다", () => {
    const input = { date: DATE, windows: FOUR_MEAL_WINDOWS, events: [], eatOutChecks: [], absences: [], now: kstDateTime(DATE, "23:30") };
    expect(resolveMealSlots(input).at(-1)).toMatchObject({ slot: "fourth", status: "unconfirmed" });
    const time = kstDateTime(DATE, "21:30");
    expect(resolveMealSlots({ ...input, events: [{ type: "cook", startedAt: time, endedAt: time }] }).at(-1)).toMatchObject({ slot: "fourth", status: "confirmed" });
    expect(resolveMealSlots({ ...input, eatOutChecks: [time] }).at(-1)).toMatchObject({ slot: "fourth", status: "eat_out" });
    expect(resolveMealSlots({ ...input, absences: [{ startDate: DATE, endDate: DATE }] }).at(-1)).toMatchObject({ slot: "fourth", status: "away" });
    expect(resolveMealSlots({ ...input, now: kstDateTime(DATE, "22:59") }).at(-1)).toMatchObject({ slot: "fourth", status: "pending" });
  });

  it("두·네·다섯 끼 저장 후 다시 읽어도 오늘 설정과 이전 날짜 기록을 각각 보존한다", async () => {
    const saved = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) });
    vi.stubGlobal("window", new EventTarget());
    vi.useFakeTimers();
    try {
      vi.setSystemTime(NOW);
      const { demoActions } = await import("@/lib/demo/actions");
      for (const count of [2, 4, 5]) {
        await demoActions.saveWindows(mealWindowsForCount(count));
        const restored = JSON.parse(saved.get("bapmutna.demo.v1")!);
        const view = toView(restored, NOW);
        expect(view.mealProfile.windows).toEqual(mealWindowsForCount(count));
        expect(slotsForDate(view, "2026-11-14", NOW).map(row => row.slot)).toEqual(mealSlotsForCount(count));
        expect(slotsForDate(view, DATE, NOW).map(row => row.slot)).toEqual(mealSlotsForCount(3));
      }
      const tomorrow = kstDateTime("2026-11-15", "10:00");
      vi.setSystemTime(tomorrow);
      await demoActions.saveWindows(mealWindowsForCount(2));
      const view = toView(JSON.parse(saved.get("bapmutna.demo.v1")!), tomorrow);
      expect(datedMealSlots(view, "2026-11-14", tomorrow).at(-1)).toMatchObject({position:5,label:"다섯 끼"});
      expect(datedMealSlots(view, "2026-11-15", tomorrow).at(-1)).toMatchObject({position:2,label:"두 끼",slot:"dinner"});
      expect(slotRates(view, tomorrow).at(-1)?.total).toBe(1);
    } finally { vi.useRealTimers(); vi.unstubAllGlobals(); }
  });

  it("다섯 끼 기본값과 편집한 시간대를 구분하고 잘못된 조합을 거부한다", () => {
    expect(validMealWindows(FIVE_MEAL_WINDOWS)).toBe(true);
    const custom = mealWindowsForCount(2);
    custom[0].start = "05:00";
    const overrides = initialMealWindowOverrides(custom);
    const expanded = mealWindowsForCount(5, overrides);
    expect(expanded[0].start).toBe("05:00");
    expect(expanded.slice(1)).toEqual(FIVE_MEAL_WINDOWS.slice(1));
    expect(initialMealWindowOverrides(mealWindowsForCount(2), overrides)).toEqual({});
    const legacy = [FIVE_MEAL_WINDOWS[1], FIVE_MEAL_WINDOWS[3]];
    expect(mealWindowsForCount(2, initialMealWindowOverrides(legacy))).toEqual(legacy);
    for (const invalid of [[], [...expanded, expanded[0]], [...expanded.slice(0,4), {...expanded[4], slot:"lunch"}],
      [...expanded.slice(0,4), {...expanded[4], slot:"sixth"}], [...expanded.slice(0,4), {...expanded[4], start:"16:59"}],
      [...expanded.slice(0,4), {...expanded[4], end:"24:00"}]]) expect(validMealWindows(invalid)).toBe(false);
  });

  it("맞닿은 다섯째 시작 시각 외식은 그 끼니에만 붙이고 전력 신호 우선순위를 지킨다", () => {
    const windows = mealWindowsForCount(5);
    windows[4].start = windows[3].end;
    const time = kstDateTime(DATE, windows[4].start);
    const input = {date:DATE,windows,events:[],eatOutChecks:[time],absences:[],now:kstDateTime(DATE,"23:00")};
    expect(resolveMealSlots(input).filter(row => row.status === "eat_out").map(row => row.slot)).toEqual(["fifth"]);
    expect(resolveMealSlots({...input,events:[{type:"cook",startedAt:time,endedAt:time}]}).at(-1)?.status).toBe("confirmed");
  });

  it("이전 저장본에서 두 끼와 다섯 끼가 섞인 주라도 그날 순서와 분모를 유지한다", () => {
    const view = base();
    view.mealProfile.windows = mealWindowsForCount(2);
    for (const [date, count] of [["2026-11-12",2],[DATE,5]] as const) {
      view.slots.push(...mealSlotsForCount(count).map(slot => ({date, slot, status:"confirmed" as const, source:"cooker" as const})));
    }
    expect(datedMealSlots(view,"2026-11-12",NOW).at(-1)).toMatchObject({position:2,label:"두 끼",slot:"dinner"});
    expect(slotRates(view,NOW).map(row => row.total)).toEqual([2,2,1,1,1]);
  });

  it("네 끼는 비율 분모에 포함되고 외식은 확인, 부재·대기는 제외된다", () => {
    const view = fourView(["confirmed", "unconfirmed", "unconfirmed", "eat_out"]);
    expect(patternReport(view, NOW).recent).toEqual({ ok: 2, total: 4, rate: 0.5 });
    expect(slotRates(view, NOW).at(-1)).toEqual({ position: 4, label: "네 끼", ok: 1, total: 1, rate: 1 });
    expect(patternReport(fourView(["confirmed", "away", "pending", "eat_out"]), NOW).recent).toEqual({ ok: 2, total: 2, rate: 1 });
  });
});

describe("실제 계정 미연결과 하루 상태", () => {
  it("Firebase 미연결 계정에 가짜 미확인 끼니를 만들지 않는다", () => {
    const view: AppView = { ...base(), mode: "live", dataSource: "firebase", careAvailable: false };
    expect(slotsForDate(view, "2026-11-14", NOW)).toEqual([]);
    expect(mealDaySummary(view, "2026-11-14", NOW)).toEqual({ tone: "empty", ok: 0, total: 0 });
    expect(patternReport(view, NOW).recent.rate).toBeNull();
    expect(slotsForDate({ ...view, careAvailable: undefined }, "2026-11-14", NOW)).toEqual([]);
    expect(slotsForDate({ ...view, dataSource: undefined, careAvailable: true }, "2026-11-14", NOW)).toEqual([]);
  });

  it("가장 이른 설정 이력 이전의 다섯째 실측 기록이 월·일 화면에도 남는다", () => {
    const view = base();
    view.mode = "live";
    view.mealProfile.windows = mealWindowsForCount(2);
    view.mealScheduleHistory = [{through:"2026-11-12",windows:mealWindowsForCount(3)}];
    const date = "2026-10-18";
    view.slots = [{date,slot:"fifth",source:"cooker",status:"confirmed"}];
    expect(slotsForDate(view,date,NOW)).toEqual(view.slots);
    expect(datedMealSlots(view,date,NOW)[0]).toMatchObject({slot:"fifth",position:5,label:"다섯 끼"});
    expect(mealDaySummary(view,date,NOW)).toEqual({tone:"all",ok:1,total:1});
    view.mealScheduleHistory = [{through:"2026-11-12",windows:mealWindowsForCount(2)}];
    view.slots = [{date:"2026-11-12",slot:"dinner",source:"cooker",status:"confirmed"}];
    expect(datedMealSlots(view,"2026-11-12",NOW)[0]).toMatchObject({slot:"dinner",position:2,label:"두 끼"});
  });

  it("연결이 끊겨도 이전에 저장된 실제 기록은 숨기거나 다시 판정하지 않는다", () => {
    const view: AppView = { ...fourView(["confirmed", "unconfirmed", "eat_out", "away"]), mode: "live", dataSource: "firebase", careAvailable: false };
    expect(slotsForDate(view, DATE, NOW)).toEqual(view.slots);
  });

  it.each([
    [["confirmed", "unconfirmed", "unconfirmed"], "low"],
    [["confirmed", "eat_out", "unconfirmed"], "half"],
    [["confirmed", "unconfirmed", "unconfirmed", "unconfirmed"], "low"],
    [["confirmed", "eat_out", "unconfirmed", "unconfirmed"], "half"],
    [["confirmed", "eat_out", "confirmed", "confirmed"], "all"],
    [["unconfirmed", "unconfirmed", "unconfirmed", "unconfirmed"], "low"],
    [["away", "away", "away", "away"], "away"],
  ] as [MealStatus[], string][]) ("확인 비율 %j → %s", (statuses, tone) => {
    expect(mealDaySummary(fourView(statuses), DATE, NOW).tone).toBe(tone);
  });

  it("진행 중인 오늘은 이미 확인된 끼니가 있어도 완료 색을 쓰지 않는다", () => {
    expect(mealDaySummary(fourView(["confirmed", "eat_out", "confirmed", "pending"], "2026-11-14"), "2026-11-14", NOW)).toEqual({ tone: "pending", ok: 3, total: 4 });
    expect(mealDaySummary(fourView(["confirmed"], "2026-11-14"), "2026-11-14", NOW)).toEqual({ tone: "pending", ok: 1, total: 4 });
    expect(mealDaySummary(fourView(["away"], "2026-11-14"), "2026-11-14", NOW)).toEqual({ tone: "away", ok: 0, total: 0 });
  });

  it("어느 팔레트에서도 외식·확인·미확인·대기 중은 서로 다른 색이다 (2026-11-22 피드백)", () => {
    expect(validMealPalette("unknown")).toBe("soft");
    for (const palette of ["soft", "clear"] as const) {
      const classes = (["confirmed", "eat_out", "unconfirmed", "pending"] as const).map((s) => mealStatusClass(s, palette));
      expect(new Set(classes).size).toBe(classes.length);
      expect(mealStatusClass("eat_out", palette)).toContain("butter");
    }
  });
});

describe("일·주·월 달력 탐색", () => {
  it("주간은 월요일~일요일이고 월간은 실제 달력 일수다", () => {
    expect(recordPeriod("2026-11-14", "week")).toMatchObject({ from: "2026-11-09", to: "2026-11-15" });
    expect(recordPeriod("2028-02-14", "month").dates).toHaveLength(29);
    expect(recordPeriod("2026-02-14", "month").dates).toHaveLength(28);
    expect(recordPeriod("2026-11-14", "day").dates).toEqual(["2026-11-14"]);
  });

  it("월말·연도 경계를 넘을 때 달을 건너뛰지 않는다", () => {
    expect(shiftRecordPeriod("2026-01-31", "month", 1)).toBe("2026-02-28");
    expect(shiftRecordPeriod("2026-01-01", "month", -1)).toBe("2025-12-01");
    expect(shiftRecordPeriod("2026-01-02", "week", -1)).toBe("2025-12-26");
    expect(shiftRecordPeriod("2026-01-01", "day", -1)).toBe("2025-12-31");
    expect(monthLeadingDays("2026-11-01")).toBe(6);
  });
});
