import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createDemoState } from "@/lib/demo/state";
import { toView } from "@/lib/demo/derive";
import { FOUR_MEAL_WINDOWS, slotsForDate, type AppView } from "@/lib/data/view";

const context = vi.hoisted(() => ({ view: null as unknown, now: new Date("2026-11-14T03:00:00Z") }));
vi.mock("@/lib/data/useApp", () => ({ useApp: () => context }));
import { firebaseView } from "@/lib/data/firebase";
import { demoPowerTranscript } from "@/lib/power/power-transcription-model";
import RecordsPage from "@/app/(guardian)/records/page";
import ReportPage from "@/app/(guardian)/report/page";

const disconnected = (): AppView => firebaseView({settings: null, household: null});

describe("기록·리포트 표시 계약 (서버 렌더, 실제 브라우저 검사 아님)", () => {
  it("Firebase 로그인만 된 계정에 식사 미확인·사용 0회·0%를 만들지 않는다", () => {
    context.view = disconnected();
    const records = renderToStaticMarkup(createElement(RecordsPage));
    expect(records).toContain("아직 연결된 식사 기록이 없어요");
    expect(records).not.toContain("cooker-use-heading");
    expect(records).not.toContain("끼니 상태 범례");
    const report = renderToStaticMarkup(createElement(ReportPage));
    expect(report).toContain("연결된 소식이 쌓이면 비교해 드릴게요");
    expect(report).not.toContain("끼니별 확인율");
    expect(report).not.toContain("0%");
    expect(records).not.toContain("전력 전사·해석 예시");
  });

  it("only an explicitly selected demo produces a synthetic transcript with its own fixed date and rule outputs", () => {
    for (const view of [null, disconnected(), {mode:"demo", dataSource:"firebase"} as const])
      expect(demoPowerTranscript(view)).toBeNull();
    const sample = demoPowerTranscript(toView(createDemoState(context.now), context.now))!;
    const payload = JSON.parse(JSON.stringify(sample));
    expect(payload).toMatchObject({source:"demo", dataOrigin:"SYNTHETIC_NOT_HOUSEHOLD_DATA", datasetDate:"2026-11-18",
      interpretation:{gapCount:8, peakSampleWatts:852, coverage:"gaps", events:[]}});
    expect(payload.samples).toHaveLength(9);
    expect(payload.samples.every((s: {timestamp:string}) => s.timestamp.startsWith(payload.datasetDate))).toBe(true);
    expect(JSON.stringify(payload)).not.toMatch(/confidence|currentWatts|totalEnergy|heart/i);
  });

  it("an enabled live connection with an empty day cannot create a missed meal from the clock", () => {
    const live = {...disconnected(), careAvailable:true};
    expect(slotsForDate(live, "2026-11-14", context.now)).toEqual([]);
  });

  it("네 끼 주간 기록은 상태→범례→밥솥 사용 순서와 탭 가능한 막대를 포함한다", () => {
    const state = createDemoState(context.now);
    state.mealProfile.windows = FOUR_MEAL_WINDOWS;
    context.view = toView(state, context.now);
    const html = renderToStaticMarkup(createElement(RecordsPage));
    expect(html).toContain("네 끼");
    expect(html.indexOf("meal-status-heading")).toBeLessThan(html.indexOf("끼니 상태 범례"));
    expect(html.indexOf("끼니 상태 범례")).toBeLessThan(html.indexOf("cooker-use-heading"));
    expect(html).toContain("이전 주 보기");
    expect(html).toContain("다음 주 보기");
    expect(html).toContain("키보드로 선택하면 횟수를 볼 수 있어요");
    expect(html).toContain('role="status"');
    expect(html).toContain("체험용 가상 기록");
    expect(html).toContain("고정 샘플");
    expect(html).toContain("2026-11-18");
  });

  it("실제 과거 기록이 있어도 수신 없는 날짜의 사용량은 기록 없음으로 구분한다", () => {
    const view = disconnected();
    view.slots = [{ date: "2026-11-13", slot: "lunch", status: "eat_out", source: "senior_check" }];
    context.view = view;
    const html = renderToStaticMarkup(createElement(RecordsPage));
    expect(html).toContain("이 기간에는 수신된 밥솥 사용 기록이 없어요");
    expect(html).toContain("기록 없음");
    expect(html).not.toContain("체험용 가상 기록");
    expect(html).not.toContain("전력 전사·해석 예시");
    expect(renderToStaticMarkup(createElement(ReportPage))).toContain("이 기간에 기록된 밥솥 사용 횟수가 없어요.");
  });
});
