import { describe, expect, it } from "vitest";
import { navigateRecords, recordPeriod, type RecordRange, type RecordSelection } from "@/components/records/period";
import { kstDate } from "@/lib/judge/time";

describe("기록 화면에서 날짜 이동", () => {
  it.each(["week", "month"] as const)("선택한 날짜만 열고 %s 화면으로 돌아온다", (range) => {
    const date = "2028-02-29";
    const detail = navigateRecords({ range, date: "2028-02-01" }, { type: "day", date });
    expect(recordPeriod(detail.date!, detail.range).dates).toEqual([date]);
    expect(navigateRecords(detail, { type: "overview" })).toEqual({ range, date });
  });

  it.each<RecordRange>(["day", "week", "month"])("%s 화면의 오늘 버튼은 한국 시간 오늘 하루를 연다", (range) => {
    const selected = navigateRecords({ range, date: "2026-11-02" }, { type: "today" });
    for (const [instant, expected] of [
      ["2026-12-31T14:59:59Z", "2026-12-31"], ["2026-12-31T15:00:00Z", "2027-01-01"],
    ]) {
      const anchor = selected.date ?? kstDate(new Date(instant));
      expect(recordPeriod(anchor, selected.range).dates).toEqual([expected]);
    }
    expect(selected.openedFrom).toBeUndefined();
  });

  it("월말을 넘겨 하루씩 이동해도 돌아갈 달력과 미래 날짜 상한을 지킨다", () => {
    const today = "2026-12-01";
    const detail: RecordSelection = { range: "day", date: "2026-11-30", openedFrom: "month" };
    const next = navigateRecords(detail, { type: "move", direction: 1, today });
    expect(next.date).toBe(today);
    expect(navigateRecords(next, { type: "move", direction: 1, today }).date).toBe(today);
    expect(navigateRecords(next, { type: "overview" })).toEqual({ range: "month", date: today });
  });
});
