import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect, it, vi} from "vitest";
import {firebaseView} from "@/lib/data/firebase";
import type {AppView} from "@/lib/data/view";
import RecordsPage from "@/app/(guardian)/records/page";

const state = vi.hoisted(() => ({view:null as AppView | null,now:new Date("2026-11-25T23:10:00Z")}));
vi.mock("@/lib/data/useApp", () => ({useApp:() => state}));

it("keeps real cooker counts and distinguishes an unmeasured lid from a measured zero in the chart and summary", () => {
  const view = firebaseView({settings:null,household:null});
  state.view = view;
  view.seniorConsent = true;
  view.cookerMealDays = {"2026-11-26":view.mealProfile.windows};
  view.slots = [{date:"2026-11-26",slot:"breakfast",status:"confirmed",source:"cooker"}];
  view.stats = {"2026-11-26":{cook:2,lid:null}};
  const real = renderToStaticMarkup(createElement(RecordsPage));
  expect(real).toContain("취사 신호 2회 · 뚜껑 열림 미측정. 하루 기록 보기");
  expect(real).toContain(">미측정</span>");
  expect(real).not.toMatch(/뚜껑 열림 (0|null)회|height:0%/);
  view.stats["2026-11-26"].lid = 0;
  expect(renderToStaticMarkup(createElement(RecordsPage))).toContain("취사 신호 2회 · 뚜껑 열림 0회. 하루 기록 보기");
  Object.assign(view.stats["2026-11-26"],{estimated:1,estimatedSlots:["lunch"],estimatedBySlot:{lunch:1}});
  const inferred = renderToStaticMarkup(createElement(RecordsPage));
  expect(inferred).toContain("취사 신호 2회 · 취사 추정 1회 · 뚜껑 열림 0회");
  expect(inferred).toContain("전력 변화로 추정한 취사");
});
