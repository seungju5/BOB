import { describe, expect, it } from "vitest";
import { weeklyReportLabel } from "../../lib/alerts/copy";
import { missedMealsHint } from "../../components/forms";

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
