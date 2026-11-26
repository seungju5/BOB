import { describe, expect, it } from "vitest";
import { firebaseView } from "@/lib/data/firebase";
import { householdReportNotices } from "@/lib/report/household-inbox";
import { dailyEncouragement } from "@/components/senior/messages";
import { motionStepsOn, type MotionWalk } from "@/lib/walking/motion-diary";
import { kstDate } from "@/lib/judge/time";

describe("가구별 주간 리포트", () => {
  const view = firebaseView({ settings: null, household: null });
  const measured = { ...view, seniorConsent:true, cookerMealDays:{"2026-11-22":view.mealProfile.windows},
    stats:{"2026-11-22":{cook:1,lid:null}} };
  it("makes a report available for an observed week once Monday 09:00 arrives in Seoul", () => {
    expect(householdReportNotices(measured, new Date("2026-11-22T23:59:59Z"))).toEqual([]);
    const alerts = householdReportNotices(measured, new Date("2026-11-23T00:00:00Z"));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({id:"report-2026-11-22",payload:{startDate:"2026-11-16",endDate:"2026-11-22"}});
  });
  it("never issues a report for an empty household, a demo, or withdrawn consent", () => {
    const now = new Date("2026-11-26T15:02:00Z");
    for (const input of [view, {...measured, mode:"demo" as const}, {...measured, seniorConsent:false}, {...measured, cookerMealDays:{}}]) {
      expect(householdReportNotices(input, now)).toEqual([]);
    }
  });
});
it("rotates the senior message at Seoul midnight, consistently across both layouts", () => {
  const greeting = (instant: string) => dailyEncouragement(kstDate(new Date(instant)));
  expect(greeting("2026-11-26T14:59:59Z")).not.toBe(greeting("2026-11-26T15:00:00Z"));
  expect(greeting("2026-11-26T15:00:00Z")).toBe(greeting("2026-11-27T14:59:59Z"));
});

it("adds walks on the Korean day and splits a midnight walk using measured checkpoints", () => {
  const a = Date.parse("2026-11-26T14:55:00Z"), b = Date.parse("2026-11-26T15:05:00Z");
  const walk = (steps: number, startedAt: number, lastStepAt = startedAt): MotionWalk =>
    ({ id: String(startedAt), source: "device-motion", startedAt, lastStepAt, steps });
  const walks = [walk(7, a), walk(8, b), walk(12, b + 1000),
    { ...walk(15, a, b), dailySteps: { "2026-11-26": 5, "2026-11-27": 10 } }, walk(23, a, b)];
  expect(motionStepsOn(walks, "2026-11-26")).toBe(12);
  expect(motionStepsOn(walks, "2026-11-27")).toBe(30);
  expect(motionStepsOn(walks, "2026-11-28")).toBeNull();
});
