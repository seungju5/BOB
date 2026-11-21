import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DemoState } from "@/lib/demo/state";

const mocks = vi.hoisted(() => ({ updateDemo: vi.fn(), useApp: vi.fn(), router: { replace: vi.fn(), push: vi.fn() } }));
vi.mock("@/lib/data/useApp", () => ({ useApp: mocks.useApp }));
vi.mock("@/lib/demo/store", () => ({ updateDemo: mocks.updateDemo, resetDemo: vi.fn() }));
vi.mock("@/lib/data/mode", () => ({ setMode: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));

import { guardianStartPath, tutorialExitPath, visibleOnboardingStep, type AppView } from "@/lib/data/view";
import { defaultPreferences, firebaseActions, firebaseView, preferencesPatch } from "@/lib/data/firebase";
import { demoActions } from "@/lib/demo/actions";
import { createDemoState } from "@/lib/demo/state";
import OnboardingPage from "@/app/onboarding/page";
import TutorialPage from "@/app/tutorial/page";
import { PlugForm } from "@/components/PlugForm";
import SettingsPage from "@/app/(guardian)/settings/page";

const NOW = new Date("2026-11-13T03:00:00Z");
let demo: DemoState;
let view: AppView;
beforeEach(() => {
  demo = createDemoState(NOW);
  view = firebaseView({ settings: null, household: null });
  mocks.useApp.mockReset().mockImplementation(() => ({ view, actions: firebaseActions, now: NOW, mode: "live", provider: "firebase", needsLogin: false, error: null }));
  mocks.updateDemo.mockReset().mockImplementation((fn: (value: DemoState) => DemoState) => { demo = fn(demo); });
  vi.stubGlobal("window", Object.assign(new EventTarget(), { location: { href: "https://example.test/onboarding/" } }));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("compatible signup, tutorial, household, home routing", () => {
  it.each([1, 2])("routes legacy step %s through the signed-in tutorial and shows household without auto-saving", (step) => {
    expect(guardianStartPath(step)).toBe("/tutorial");
    expect(visibleOnboardingStep(step)).toBe(3);
    view.onboardingStep = step;
    const save = vi.fn();
    mocks.useApp.mockReturnValue({ view, actions: { ...firebaseActions, saveOnboarding: save }, mode: "live", needsLogin: false, error: null });
    const html = renderToStaticMarkup(createElement(OnboardingPage));
    expect(html).toContain("누구의 안부가");
    expect(html).toContain("저장하고 내용 확인");
    expect(html).not.toContain("SmartThings 테스트 토큰");
    expect(html).not.toContain("전력 신호를");
    expect(save).not.toHaveBeenCalled();
  });

  it.each([3, 4, 5, 6, 7])("preserves saved optional step %s without returning to device registration", (step) => {
    expect(guardianStartPath(step)).toBe("/onboarding");
    expect(visibleOnboardingStep(step)).toBe(step);
  });

  it("sends completed users and tutorial replay back to home", () => {
    expect(guardianStartPath(8)).toBe("/home");
    expect(tutorialExitPath(8)).toBe("/home");
    expect(tutorialExitPath(1)).toBe("/onboarding");
  });

  it("does not show the tutorial before authentication and does not silently enter demo", () => {
    mocks.useApp.mockReturnValue({ view: null, needsLogin: true, mode: null, error: null });
    const html = renderToStaticMarkup(createElement(TutorialPage));
    expect(html).not.toContain("밥솥이 안부를");
    expect(mocks.updateDemo).not.toHaveBeenCalled();
  });

  it("labels the simulation choice separately from real household consent", () => {
    view = { ...view, mode: "demo", dataSource: "demo" };
    mocks.useApp.mockReturnValue({ view, actions: demoActions, now: NOW, mode: "demo", provider: "demo", needsLogin: false, error: null });
    const html = renderToStaticMarkup(createElement(OnboardingPage));
    expect(html).toContain("가상의 가족 정보로 진행할게요.");
    expect(html).not.toContain("어르신께 안내하고 정보 이용 동의를 확인했어요.");
  });

  it("requires consent and opens the internal reader without an external login", () => {
    const html = renderToStaticMarkup(createElement(OnboardingPage));
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("어르신 정보 이용 동의 · 필수");
    expect(html).toMatch(/<input[^>]+type="checkbox"[^>]+required/);
    expect(html).toMatch(/<button[^>]+disabled=""[^>]*>저장하고 내용 확인/);
    expect(html).not.toMatch(/Notion|notion\.com|동의 안내 \(선택\)/);
  });

  it.each([4, 5, 6, 7])("returns unconsented saved step %s to the mandatory household form", step => {
    view.onboardingStep = step;
    const html = renderToStaticMarkup(createElement(OnboardingPage));
    expect(html).toContain("어르신 정보 이용 동의 · 필수");
    expect(html).toContain("저장하고 내용 확인");
    expect(html).not.toContain("홈에서 나중에 설정하기");
  });

  it("preserves completion in demo when a stale earlier-step save follows completion", async () => {
    demo.seniorConsent = true;
    await demoActions.saveOnboarding(8);
    await demoActions.saveOnboarding(4, { mealProfile: view.mealProfile });
    expect(demo.onboardingStep).toBe(8);
  });
});

describe("optional device registration requires consent and exposes no raw watts", () => {
  it("keeps unconfigured real device actions from creating a local pairing or fake event", async () => {
    await expect(firebaseActions.registerPlug("synthetic-device", "")).rejects.toThrow();
    await expect(firebaseActions.issuePairingCode()).rejects.toThrow();
    expect(mocks.updateDemo).not.toHaveBeenCalled();
  });

  it("does not connect a demo device on skip and requires consent for an explicit demo connection", async () => {
    demo.plug.deviceId = "";
    await demoActions.skipPlug();
    expect(demo.plug.deviceId).toBe("");
    await expect(demoActions.registerPlug("demo-device", "")).rejects.toThrow("동의를 확인");
    demo.seniorConsent = true;
    const result = await demoActions.registerPlug("demo-device", "");
    expect(result.connected).toBe(true);
    expect(Number.isFinite(Date.parse(result.checkedAt))).toBe(true);
    expect(result).not.toHaveProperty("watts");
  });

  it("does not ask demo users for a real SmartThings token", () => {
    const html = renderToStaticMarkup(createElement(PlugForm, { onSubmit: demoActions.registerPlug, consentConfirmed: true, isDemo: true }));
    expect(html).toContain("예시 기기 연결하기");
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain("토큰 붙여 넣기");
  });

  it("also rejects demo pairing requests before consent", async () => {
    await expect(demoActions.issuePairingCode()).rejects.toThrow("동의를 확인");
    demo.seniorConsent = true;
    await expect(demoActions.issuePairingCode()).resolves.toBeUndefined();
  });

  it("hides existing pairing codes and the issue action in settings before consent", () => {
    view.onboardingStep = 8;
    view.seniorConsent = false;
    view.pairingCode = "867530";
    const html = renderToStaticMarkup(createElement(SettingsPage));
    expect(html).toContain("어르신의 동의를 확인한 뒤 연결할 수 있어요");
    expect(html).not.toContain("867530");
    expect(html).not.toContain("연결 숫자 받기");
    expect(html).not.toContain("다른 휴대폰 연결하기");
  });

  it("keeps the completed user's meal and cooker settings editable from settings", async () => {
    view.onboardingStep = 8;
    view.seniorConsent = true;
    const html = renderToStaticMarkup(createElement(SettingsPage));
    for (const label of ["생활 기준", "하루 식사 시간대 수", "일주일에 외식은 몇 번쯤?", "보온 기능을 쓰시나요?", "일주일에 밥은 몇 번 지으세요?", "생활 기준 저장", "저장하지 않고 홈으로"]) expect(html).toContain(label);
    const settings = { ...defaultPreferences(), onboardingStep: 8, preparationAcknowledged: true };
    const mealProfile = { ...view.mealProfile, windows: [view.mealProfile.windows[0]], eatOutPerWeek: 5, usesKeepWarm: false, cooksPerWeek: 4 };
    const updated = preferencesPatch({ settings, household: null }, 8, { mealProfile });
    expect(updated.settings).toMatchObject({ onboardingStep: 8, ...mealProfile });
  });
});
