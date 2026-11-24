import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DemoState } from "@/lib/demo/state";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(), updateDemo: vi.fn(), configured: true,
  useSenior: vi.fn(), now: new Date("2026-11-13T03:00:00Z"),
}));
vi.mock("@/lib/supabase", () => ({
  get supabaseConfigured() { return mocks.configured; },
  supabase: () => ({ functions: { invoke: mocks.invoke } }),
}));
vi.mock("@/lib/demo/store", () => ({ updateDemo: mocks.updateDemo, useDemo: vi.fn(), useNow: () => mocks.now }));
vi.mock("@/lib/data/senior", async (original) => ({ ...await original<typeof import("@/lib/data/senior")>(), useSenior: mocks.useSenior }));

import { pairSenior, startSeniorDemo, disconnectSenior, performSeniorAction, type SeniorOp } from "@/lib/data/senior";
import { seniorActionMessage } from "@/components/senior/messages";
import { createDemoState } from "@/lib/demo/state";
import SeniorPage from "@/app/s/page";

const TOKEN_KEY = "bapmutna.senior.token";
const LIVE_TOKEN = "synthetic-device-token-with-more-than-32-characters";
let demo: DemoState;

beforeEach(() => {
  mocks.configured = true;
  mocks.invoke.mockReset().mockResolvedValue({ data: { ok: true }, error: null });
  mocks.updateDemo.mockReset().mockImplementation((fn: (state: DemoState) => DemoState) => { demo = fn(demo); });
  demo = createDemoState(mocks.now);
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
  vi.stubGlobal("window", Object.assign(new EventTarget(), { location: { href: "https://example.test/s/" } }));
  mocks.useSenior.mockReturnValue({ token: "demo", paired: true, isDemo: true, status: { seniorName: "예시 어르신", lastCookerAt: null, absence: null }, act: vi.fn(), disconnect: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

describe("senior pairing requires explicit demo selection", () => {
  it("does not replace a failed live pair with the matching local demo code", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: new Error("network unavailable") });
    await expect(pairSenior(demo.pairingCode)).rejects.toThrow();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(mocks.updateDemo).not.toHaveBeenCalled();
  });

  it("does not fall back to demo when the live service is unconfigured", async () => {
    mocks.configured = false;
    await expect(pairSenior(demo.pairingCode)).rejects.toThrow("준비 중");
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.updateDemo).not.toHaveBeenCalled();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it.each(["demo", "", null])("rejects an invalid live token response (%s)", async (token) => {
    mocks.invoke.mockResolvedValue({ data: { token }, error: null });
    await expect(pairSenior("123456")).rejects.toThrow("연결을 확인하지 못했어요");
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(mocks.updateDemo).not.toHaveBeenCalled();
  });

  it("stores only the live token after a successful real pairing response", async () => {
    mocks.invoke.mockResolvedValue({ data: { token: LIVE_TOKEN }, error: null });
    await pairSenior("123456");
    expect(mocks.invoke).toHaveBeenCalledWith("senior", { body: { op: "pair", code: "123456" } });
    expect(localStorage.getItem(TOKEN_KEY)).toBe(LIVE_TOKEN);
    expect(mocks.updateDemo).not.toHaveBeenCalled();
  });

  it("starts and ends demo only through the explicit commands, without any API call", () => {
    startSeniorDemo();
    expect(localStorage.getItem(TOKEN_KEY)).toBe("demo");
    expect(demo.seniorPaired).toBe(true);
    expect(mocks.invoke).not.toHaveBeenCalled();
    disconnectSenior();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("does not replace a newly selected demo with a late real pairing result", async () => {
    let finish!: (value: { data: { token: string }; error: null }) => void;
    mocks.invoke.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = pairSenior("123456");
    startSeniorDemo();
    finish({ data: { token: LIVE_TOKEN }, error: null });
    await expect(pending).rejects.toThrow("연결이 바뀌었어요");
    expect(localStorage.getItem(TOKEN_KEY)).toBe("demo");
  });
});

describe("senior actions never claim delivery from demo or failed requests", () => {
  it("keeps a demo help request local and marks its result as a simulation", async () => {
    startSeniorDemo();
    const previous = demo.alerts.length;
    await performSeniorAction("demo", "help");
    expect(demo.alerts).toHaveLength(previous + 1);
    expect(demo.alerts.at(-1)?.type).toBe("help_request");
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(seniorActionMessage("help", true)).toContain("실제 가족에게 보내지 않아요");
  });

  it.each<SeniorOp>(["eat_out", "away", "back", "help"])("identifies %s completion as demo without delivery claims", (op) => {
    const message = seniorActionMessage(op, true);
    expect(message).toContain("체험했어요");
    expect(message).toContain("실제 가족에게 보내지 않아요");
    expect(message).not.toMatch(/곧 연락|가족에게 알렸어요|가족에게 전할게요/);
  });

  it("a failed real help request rejects and does not create a local demo alert", async () => {
    localStorage.setItem(TOKEN_KEY, LIVE_TOKEN);
    mocks.invoke.mockResolvedValue({ data: null, error: new Error("offline") });
    await expect(performSeniorAction(LIVE_TOKEN, "help")).rejects.toThrow();
    expect(mocks.updateDemo).not.toHaveBeenCalled();
    expect(localStorage.getItem(TOKEN_KEY)).toBe(LIVE_TOKEN);
  });

  it("only accepts an explicit server acknowledgement and never promises a family response", async () => {
    localStorage.setItem(TOKEN_KEY, LIVE_TOKEN);
    mocks.invoke.mockResolvedValueOnce({ data: {}, error: null });
    await expect(performSeniorAction(LIVE_TOKEN, "help")).rejects.toThrow("접수를 확인하지 못했어요");
    await performSeniorAction(LIVE_TOKEN, "help");
    expect(seniorActionMessage("help", false)).toContain("접수했어요");
    expect(seniorActionMessage("help", false)).not.toMatch(/곧 연락|가족에게 알렸어요|바로 알림/);
    expect(mocks.updateDemo).not.toHaveBeenCalled();
  });

  it("sends a distinct verb for a prior meal and requires the server to confirm the chosen slot", async () => {
    localStorage.setItem(TOKEN_KEY, LIVE_TOKEN);
    const meal = {date: "2026-11-12", slot: "lunch" as const};
    await expect(performSeniorAction(LIVE_TOKEN, "eat_out", undefined, {meal})).rejects.toThrow("접수를 확인하지 못했어요");
    expect(mocks.invoke).toHaveBeenCalledWith("senior", {body: {op: "selected_meal", token: LIVE_TOKEN, days: undefined, meal}});
    mocks.invoke.mockResolvedValueOnce({data: {ok: true, applied: {meal}}, error: null});
    await expect(performSeniorAction(LIVE_TOKEN, "eat_out", undefined, {meal})).resolves.toBeUndefined();
    expect(mocks.updateDemo).not.toHaveBeenCalled();
  });

  it("does not accept an old service response that could silently turn tomorrow into today", async () => {
    localStorage.setItem(TOKEN_KEY, LIVE_TOKEN);
    const startDate = "2026-11-14";
    await expect(performSeniorAction(LIVE_TOKEN, "away", 2, {startDate})).rejects.toThrow("접수를 확인하지 못했어요");
    expect(mocks.invoke).toHaveBeenCalledWith("senior", {body: {op: "planned_away", token: LIVE_TOKEN, days: 2, startDate}});
  });

  it("rejects an action from a stale screen before calling another device's API", async () => {
    localStorage.setItem(TOKEN_KEY, "another-synthetic-device-token-with-32-characters");
    await expect(performSeniorAction(LIVE_TOKEN, "help")).rejects.toThrow("연결이 바뀌었어요");
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.updateDemo).not.toHaveBeenCalled();
  });

  it("does not turn a late reply into success after a token change", async () => {
    localStorage.setItem(TOKEN_KEY, LIVE_TOKEN);
    let finish!: (value: { data: { ok: boolean }; error: null }) => void;
    mocks.invoke.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = performSeniorAction(LIVE_TOKEN, "help");
    disconnectSenior();
    finish({ data: { ok: true }, error: null });
    await expect(pending).rejects.toThrow("연결이 바뀌었어요");
  });
});

describe("senior page propagates demo status", () => {
  it("shows a persistent demo notice and keeps the three senior actions", () => {
    const html = renderToStaticMarkup(createElement(SeniorPage));
    expect(html).toContain("예시 체험 중이에요");
    expect(html).toContain("실제 가족에게 보내지 않아요");
    for (const label of ["외식했어요", "놀러가요", "도와줘요"]) expect(html).toContain(label);
    expect(html).not.toMatch(/곧 연락|가족에게 알렸어요/);
  });

  it("follows S-02 by removing the misleading cooker status card while preserving the actions", () => {
    mocks.useSenior.mockReturnValue({ ...mocks.useSenior(), token: LIVE_TOKEN, isDemo: false });
    const html = renderToStaticMarkup(createElement(SeniorPage));
    expect(html).toContain("필요한 소식만 가볍게 남겨요");
    expect(html).toContain("오늘의 작은 응원");
    expect(html).toContain("개인정보 이용·제공 안내");
    for (const label of ["외식했어요", "놀러가요", "도와줘요"]) expect(html).toContain(`aria-label="${label}"`);
    expect(html).not.toContain("밥솥 소식이 도착했어요");
    expect(html).not.toContain("사용 움직임");
    expect(html).not.toContain("예시 체험 중이에요");
  });
});
