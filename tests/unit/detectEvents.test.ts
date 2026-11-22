import { describe, expect, it } from "vitest";
import { detectEvents } from "@/lib/judge/detectEvents";
import { at, series } from "./helpers";

describe("detectEvents (test.md 1.1)", () => {
  it("T-DET-01: 900W 30분 → cook 1건, 구간 경계 일치", () => {
    const events = detectEvents(series("2026-10-16 07:00", [[0, 5], [900, 30], [0, 5]]));
    expect(events).toEqual([
      { type: "cook", startedAt: at("2026-10-16 07:05"), endedAt: at("2026-10-16 07:34") },
    ]);
  });

  it("T-DET-02: 연속 고전력은 첫 신호부터 한 건", () => {
    expect(detectEvents(series("2026-10-16 07:00", [[900, 2], [0, 10]]))).toEqual([
      { type: "cook", startedAt: at("2026-10-16 07:00"), endedAt: at("2026-10-16 07:01") },
    ]);
  });

  it("T-DET-03: 20분 → 5분 끊김 → 20분 → 2건 (병합 간격 3분 초과)", () => {
    const events = detectEvents(series("2026-10-16 07:00", [[900, 20], [0, 5], [900, 20]]));
    expect(events.filter((e) => e.type === "cook")).toHaveLength(2);
  });

  it("T-DET-03b: 20분 → 2분 끊김 → 20분 → 1건 (병합)", () => {
    const events = detectEvents(series("2026-10-16 07:00", [[900, 20], [0, 2], [900, 20]]));
    expect(events.filter((e) => e.type === "cook")).toHaveLength(1);
  });

  it("T-DET-04: 보온 45W 중 순간 상승 → lid_open 1건", () => {
    const events = detectEvents(series("2026-10-16 12:00", [[45, 30], [150, 2], [45, 30]]));
    expect(events).toEqual([
      { type: "lid_open", startedAt: at("2026-10-16 12:30"), endedAt: at("2026-10-16 12:32") },
    ]);
  });

  it("T-DET-05: 보온 중 작은 자연 히터 사이클 → lid_open 없음", () => {
    const cycle: Array<[number, number]> = [];
    for (let i = 0; i < 6; i++) cycle.push([40, 15], [70, 2]);
    expect(detectEvents(series("2026-10-16 13:00", cycle))).toEqual([]);
  });

  it("T-DET-05b: 보온이 10분 이상 이어지기 전의 상승은 열림이 아님", () => {
    expect(detectEvents(series("2026-10-16 13:00", [[45, 5], [150, 2], [45, 5]]))).toEqual([]);
  });

  it("T-DET-06: 하루 종일 0W → 이벤트 없음", () => {
    expect(detectEvents(series("2026-10-16 00:00", [[0, 24 * 60]]))).toEqual([]);
  });

  it("T-DET-08: 취사 경계 — 700W는 취사, 699W는 아님", () => {
    const observed = at("2026-10-16 07:00");
    expect(detectEvents([{measuredAt: observed, watts: 700}])).toEqual([{type:"cook",startedAt:observed,endedAt:observed}]);
    expect(detectEvents(series("2026-10-16 07:00", [[699.99, 20]]))).toEqual([]);
  });

  it("T-DET-09: 중복 시각은 한 건, 잘못된 값과 빈 입력은 신호 없음", () => {
    const measuredAt = at("2026-10-16 07:00");
    const high = {measuredAt,watts:700};
    expect(detectEvents([high, high])).toEqual([{type:"cook",startedAt:measuredAt,endedAt:measuredAt}]);
    expect(detectEvents([{measuredAt:new Date(NaN),watts:800}, ...[Infinity,NaN,-1].map(watts=>({watts,measuredAt}))])).toEqual([]);
    expect(detectEvents([])).toEqual([]);
  });

  it("T-DET-10: 보온 경계 — 20W·70W 보온 중 상승은 열림, 19W는 보온 아님", () => {
    expect(detectEvents(series("2026-10-16 12:00", [[20, 30], [150, 2], [20, 30]])).map((e) => e.type)).toEqual(["lid_open"]);
    expect(detectEvents(series("2026-10-16 12:00", [[70, 30], [200, 2], [70, 30]])).map((e) => e.type)).toEqual(["lid_open"]);
    expect(detectEvents(series("2026-10-16 12:00", [[19, 30], [150, 2], [19, 30]]))).toEqual([]);
  });

  it("열림 상승이 디바운스 시간 안에 반복되면 1건", () => {
    const events = detectEvents(
      series("2026-10-16 12:00", [[45, 20], [150, 1], [45, 3], [150, 1], [45, 20]]),
    );
    expect(events.filter((e) => e.type === "lid_open")).toHaveLength(1);
  });

  it("취사 직후 보온 전환은 열림으로 보지 않는다", () => {
    const events = detectEvents(series("2026-10-16 07:00", [[900, 30], [45, 60]]));
    expect(events.map((e) => e.type)).toEqual(["cook"]);
  });

  it("수신이 끊긴 구간(3분 초과)은 구간을 나눈다", () => {
    const a = series("2026-10-16 07:00", [[900, 4]]);
    const b = series("2026-10-16 07:10", [[900, 4]]);
    expect(detectEvents([...a, ...b]).map(e => e.startedAt)).toEqual([a[0].measuredAt, b[0].measuredAt]);
  });

  it("does not combine isolated 4-minute readings or cook runs across an unobserved gap", () => {
    const sparse = series("2026-10-16 07:00", [[845, 57]]).filter((_, i) => i % 4 === 0);
    expect(detectEvents(sparse)).toEqual(sparse.map(r => ({type:"cook",startedAt:r.measuredAt,endedAt:r.measuredAt})));
    const observed = [...series("2026-10-16 07:00", [[845, 8]]), ...series("2026-10-16 07:11", [[845, 8]])];
    expect(detectEvents(observed)).toHaveLength(2);
  });

  it("입력 순서가 섞여 있어도 같은 결과", () => {
    const readings = series("2026-10-16 07:00", [[0, 5], [900, 30], [0, 5]]);
    const shuffled = [...readings].reverse();
    expect(detectEvents(shuffled)).toEqual(detectEvents(readings));
  });
});
