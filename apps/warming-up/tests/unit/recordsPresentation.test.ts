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
import { PowerSampleFigure } from "@/components/power/PowerSampleFigure";
import RecordsPage from "@/app/(guardian)/records/page";
import ReportPage from "@/app/(guardian)/report/page";
import HomePage from "@/app/(guardian)/home/page";

const disconnected = (): AppView => firebaseView({settings: null, household: null});

describe("보호자 홈의 다음 행동", () => {
  it("keeps device setup and contact registration available on an empty account", () => {
    const view = disconnected();
    context.view = view;
    const html = renderToStaticMarkup(createElement(HomePage));
    expect(html).toContain("기기 연결 준비하기");
    expect(html).toContain("연락처 등록하기");
    expect(html).toContain("아직 연결된 식사 기록이 없어요");
    expect(html).not.toMatch(/href="tel:|끼니 확인율/);
    expect(html).toMatch(/href="\/settings\/?#device"/);
    view.seniorConsent = true;
    expect(renderToStaticMarkup(createElement(HomePage))).toMatch(/href="\/settings\/?#settings-senior-phone"/);
  });

  it("offers one call action and moves it into a help alert when needed", () => {
    const view = disconnected();
    view.senior.phone = "+123";
    context.view = view;
    const ordinary = renderToStaticMarkup(createElement(HomePage));
    expect(ordinary.match(/href="tel:\+123"/g)).toHaveLength(1);
    view.alerts = [{ id: "example-help", type: "help_request", triggeredAt: context.now.toISOString(), acknowledgedAt: null, resolvedAt: null }];
    const alert = renderToStaticMarkup(createElement(HomePage));
    expect(alert.match(/href="tel:\+123"/g)).toHaveLength(1);
    expect(alert.indexOf('href="tel:+123"')).toBeLessThan(alert.indexOf("오늘의 끼니"));
    expect(alert).toContain("확인했어요");
    for (const path of ["records", "report", "alerts", "connect"]) {
      expect(alert).toMatch(new RegExp(`href="/${path}/?"`));
    }
  });
});

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
      interpretation:{minimumCookWatts:700, minimumCookSamples:1, cookMergeGapMinutes:10, checkIntervalMinutes:10,
        gapCount:1, peakSampleWatts:852, coverage:"gaps"}});
    const iso = (hhmm: string) => new Date(payload.datasetDate + "T" + hhmm + ":00+09:00").toISOString();
    expect(payload.interpretation.events).toEqual([
      {type:"cook",startedAt:iso("07:40"),endedAt:iso("07:50")}, {type:"cook",startedAt:iso("08:30"),endedAt:iso("08:30")},
    ]);
    const figure = renderToStaticMarkup(createElement(PowerSampleFigure, {transcript: sample}));
    expect(figure.match(/data-sample=/g)).toHaveLength(payload.samples.length);
    expect(figure).toContain("07:30 · 699.9W · 기준 미만");
    expect(figure).toContain("07:40 · 700W · 사용 시작");
    expect(figure).toContain("07:50 · 852W · 같은 사용");
    expect(figure).not.toContain('data-sample="08:10"');
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
