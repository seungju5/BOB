import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DemoState } from "@/lib/demo/state";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), invoke: vi.fn(), updateDemo: vi.fn(), useApp: vi.fn(), router: { replace: vi.fn(), push: vi.fn() } }));
vi.mock("@/lib/supabase", () => ({ supabase: () => ({ rpc: mocks.rpc, from: mocks.from, functions: { invoke: mocks.invoke } }) }));
vi.mock("@/lib/data/useApp", () => ({ useApp: mocks.useApp }));
vi.mock("@/lib/demo/store", () => ({ updateDemo: mocks.updateDemo, resetDemo: vi.fn() }));
vi.mock("@/lib/data/mode", () => ({ useSession: () => null, setMode: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));

import { guardianStartPath, tutorialExitPath, visibleOnboardingStep, type AppView } from "@/lib/data/view";
import { liveActions, clearLive, readLiveForUser, refreshLive, setLiveUser } from "@/lib/data/live";
import { demoActions } from "@/lib/demo/actions";
import { createDemoState } from "@/lib/demo/state";
import { toView } from "@/lib/demo/derive";
import OnboardingPage from "@/app/onboarding/page";
import TutorialPage from "@/app/tutorial/page";
import { PlugForm } from "@/components/PlugForm";
import SettingsPage from "@/app/(guardian)/settings/page";

const NOW = new Date("2026-11-13T03:00:00Z");
let demo: DemoState;
let view: AppView;
let house: Record<string, unknown>;
let mutations: Array<{ table: string; patch: Record<string, unknown> }>;
let failTable: string | null;

beforeEach(() => {
  setLiveUser(null); clearLive();
  demo = createDemoState(NOW);
  view = { ...toView(demo, NOW), mode: "live", onboardingStep: 1, plug: { deviceId: "", online: false, lastReadingAt: null } };
  house = { onboarding_step: 1, senior_name: "", senior_relation: "어머니", senior_phone: "", resident_count: 1, has_pet: false, senior_consent_at: null };
  mutations = []; failTable = null;
  mocks.useApp.mockReset().mockImplementation(() => ({ view, actions: { ...liveActions, saveOnboarding: vi.fn() }, now: NOW, mode: view?.mode ?? "live", needsLogin: false, error: null }));
  // This suite exercises accounts on the original schema before the transactional RPC migration.
  mocks.rpc.mockReset().mockImplementation(async (name) => name === "save_household_setup"
    ? { data: null, error: { code: "PGRST202", message: "function not in schema cache" } }
    : { data: "synthetic-household", error: null });
  mocks.invoke.mockReset().mockResolvedValue({ data: { connected: true, checkedAt: NOW.toISOString() }, error: null });
  mocks.updateDemo.mockReset().mockImplementation((fn: (value: DemoState) => DemoState) => { demo = fn(demo); });
  mocks.from.mockReset().mockImplementation((table: string) => {
    let patch: Record<string, unknown> | null = null;
    const rows: Record<string, unknown> = {
      households: house,
      meal_profiles: { meal_windows: view.mealProfile.windows, eat_out_per_week: 0, uses_keep_warm: true, cooks_per_week: 7 },
      alert_settings: { missed_meals_threshold: 2, fasting_hours: 48, emergency_hours: 72 },
      smart_plugs: null,
    };
    const result = () => {
      if (patch && table === failTable) return { data: null, error: { message: "synthetic write failure" } };
      if (patch && table === "households") Object.assign(house, patch);
      return { data: Object.hasOwn(rows, table) ? rows[table] : [], error: null };
    };
    const builder = {
      select: () => builder, eq: () => builder, gte: () => builder, order: () => builder, limit: () => builder,
      update: (value: Record<string, unknown>) => { patch = value; mutations.push({ table, patch: value }); return builder; },
      single: () => Promise.resolve(result()), maybeSingle: () => Promise.resolve(result()),
      then: <T, U>(resolve: (value: ReturnType<typeof result>) => T, reject?: (reason: unknown) => U) => Promise.resolve(result()).then(resolve, reject),
    };
    return builder;
  });
  setLiveUser("synthetic-user");
  vi.stubGlobal("window", Object.assign(new EventTarget(), { location: { href: "https://example.test/onboarding/" } }));
});
afterEach(() => { setLiveUser(null); clearLive(); vi.unstubAllGlobals(); });

describe("compatible signup, tutorial, household, home routing", () => {
  it.each([1, 2])("routes legacy step %s through the signed-in tutorial and shows household without auto-saving", (step) => {
    expect(guardianStartPath(step)).toBe("/tutorial");
    expect(visibleOnboardingStep(step)).toBe(3);
    view.onboardingStep = step;
    const save = vi.fn();
    mocks.useApp.mockReturnValue({ view, actions: { ...liveActions, saveOnboarding: save }, mode: "live", needsLogin: false, error: null });
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
    expect(mocks.invoke).not.toHaveBeenCalled();
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

  it("rejects household saving and completion without consent before any writes", async () => {
    await expect(liveActions.saveOnboarding(8, { senior: { name: "예시 어르신", relation: "어머니", phone: "" }, household: { residentCount: 1, hasPet: false }, seniorConsent: false })).rejects.toThrow("동의를 확인");
    expect(house.onboarding_step).toBe(1);
    expect(house.senior_consent_at).toBeNull();
    expect(mutations).toEqual([]);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("saves explicit consent without claiming a connected device", async () => {
    await liveActions.saveOnboarding(4, { senior: { name: "예시 어르신", relation: "어머니", phone: "" }, seniorConsent: true });
    expect(house.onboarding_step).toBe(4);
    expect(house.senior_consent_at).toEqual(expect.any(String));
    expect(readLiveForUser("synthetic-user").view?.plug.deviceId).toBe("");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("does not mark onboarding complete if a selected settings write fails", async () => {
    house.senior_consent_at = NOW.toISOString();
    failTable = "meal_profiles";
    await expect(liveActions.saveOnboarding(8, { mealProfile: view.mealProfile })).rejects.toThrow("synthetic write failure");
    expect(house.onboarding_step).toBe(1);
    expect(mutations.some((entry) => entry.table === "households" && entry.patch.onboarding_step === 8)).toBe(false);
  });

  it.each([false, true])("awaits a fresh post-save read and ignores an old polling result (old error=%s)", async (oldError) => {
    house.onboarding_step = 7;
    house.senior_consent_at = NOW.toISOString();
    await refreshLive();
    const originalFrom = mocks.from.getMockImplementation()!;
    let hold = true;
    let release: (() => void) | undefined;
    mocks.from.mockImplementation((table: string) => {
      const builder = originalFrom(table);
      if (table === "households" && hold) {
        hold = false;
        const oldHouse = { ...house };
        builder.single = () => new Promise((resolve) => { release = () => resolve({ data: oldHouse, error: oldError ? { message: "obsolete polling failure" } : null }); });
      }
      return builder;
    });
    const polling = refreshLive();
    await vi.waitFor(() => expect(release).toBeDefined());
    await liveActions.saveOnboarding(8);
    expect(readLiveForUser("synthetic-user").view?.onboardingStep).toBe(8);
    release!();
    await polling;
    expect(readLiveForUser("synthetic-user").view?.onboardingStep).toBe(8);
    expect(readLiveForUser("synthetic-user").error).toBeNull();
  });

  it("serializes overlapping saves and prevents a late step-4 action from undoing completed step 8", async () => {
    house.onboarding_step = 3;
    house.senior_consent_at = NOW.toISOString();
    await refreshLive();
    await Promise.all([liveActions.saveOnboarding(8), liveActions.saveOnboarding(4, { mealProfile: view.mealProfile })]);
    expect(house.onboarding_step).toBe(8);
    expect(readLiveForUser("synthetic-user").view?.onboardingStep).toBe(8);
    expect(mutations.filter((entry) => entry.table === "households").map((entry) => entry.patch.onboarding_step)).toEqual([8, 8]);
  });

  it("preserves completion in demo when a stale earlier-step save follows completion", async () => {
    demo.seniorConsent = true;
    await demoActions.saveOnboarding(8);
    await demoActions.saveOnboarding(4, { mealProfile: view.mealProfile });
    expect(demo.onboardingStep).toBe(8);
  });
});

describe("optional device registration requires consent and exposes no raw watts", () => {
  it("blocks the client request when the refreshed household has no consent", async () => {
    await expect(liveActions.registerPlug("synthetic-device", "synthetic-token")).rejects.toThrow("동의를 확인");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("returns only an acknowledged connection and check time, dropping unexpected raw data", async () => {
    house.senior_consent_at = NOW.toISOString();
    mocks.invoke.mockResolvedValue({ data: { connected: true, checkedAt: NOW.toISOString(), watts: 999 }, error: null });
    const result = await liveActions.registerPlug("synthetic-device", "synthetic-token");
    expect(result).toEqual({ connected: true, checkedAt: NOW.toISOString() });
    expect(result).not.toHaveProperty("watts");
  });

  it.each([{ watts: 45 }, { connected: true, checkedAt: "invalid" }, { connected: false, checkedAt: NOW.toISOString() }])("rejects an unconfirmed or old-format response %j", async (data) => {
    house.senior_consent_at = NOW.toISOString();
    mocks.invoke.mockResolvedValue({ data, error: null });
    await expect(liveActions.registerPlug("synthetic-device", "synthetic-token")).rejects.toThrow("확인 결과");
  });

  it("keeps API errors as failures without creating a demo device", async () => {
    house.senior_consent_at = NOW.toISOString();
    mocks.invoke.mockResolvedValue({ data: null, error: new Error("offline") });
    await expect(liveActions.registerPlug("synthetic-device", "synthetic-token")).rejects.toThrow("연결하지 못했어요");
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

  it("does not issue a live pairing code without freshly confirmed consent", async () => {
    await expect(liveActions.issuePairingCode()).rejects.toThrow("동의를 확인");
    expect(mocks.rpc.mock.calls.some(([name]) => name === "issue_pairing_code")).toBe(false);
  });

  it("issues a live pairing code only after the household consent read succeeds", async () => {
    house.senior_consent_at = NOW.toISOString();
    await liveActions.issuePairingCode();
    expect(mocks.rpc).toHaveBeenCalledWith("issue_pairing_code", { h: "synthetic-household" });
  });

  it("also rejects demo pairing requests before consent", async () => {
    await expect(demoActions.issuePairingCode()).rejects.toThrow("동의를 확인");
    demo.seniorConsent = true;
    await expect(demoActions.issuePairingCode()).resolves.toBeUndefined();
    expect(mocks.rpc).not.toHaveBeenCalled();
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
    house.onboarding_step = 8;
    house.senior_consent_at = NOW.toISOString();
    view.seniorConsent = true;
    const html = renderToStaticMarkup(createElement(SettingsPage));
    for (const label of ["생활 기준", "하루 식사 시간대 수", "일주일에 외식은 몇 번쯤?", "보온 기능을 쓰시나요?", "일주일에 밥은 몇 번 지으세요?", "생활 기준 저장", "저장하지 않고 홈으로"]) expect(html).toContain(label);
    await liveActions.saveOnboarding(8, { mealProfile: { ...view.mealProfile, windows: [view.mealProfile.windows[0]], eatOutPerWeek: 5, usesKeepWarm: false, cooksPerWeek: 4 } });
    expect(house.onboarding_step).toBe(8);
    expect(mutations.find((entry) => entry.table === "meal_profiles")?.patch).toMatchObject({ meals_per_day: 1, eat_out_per_week: 5, uses_keep_warm: false, cooks_per_week: 4 });
  });
});
