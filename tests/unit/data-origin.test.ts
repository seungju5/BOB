import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppView } from "@/lib/data/view";

const hooks = vi.hoisted(() => ({
  mode: null as "demo" | "live" | null,
  cleanups: [] as (() => void)[],
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read(),
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) hooks.cleanups.push(cleanup);
  },
  useMemo: (build: () => unknown) => build(),
  useCallback: (fn: unknown) => fn,
  useState: (initial: unknown) => [initial, vi.fn()],
}));
vi.mock("@/lib/data/mode", () => ({useMode: () => hooks.mode}));
vi.mock("@/lib/data/firebase", () => ({
  useFirebaseAccount: () => ({view:null, user:null, error:"조회 실패"}),
  firebaseActions:{}, signOutFirebase:vi.fn(),
}));
import { useApp } from "@/lib/data/useApp";
import { useSenior } from "@/lib/data/senior";
import { enablePush, useAlertNotifications } from "@/lib/push";
import { createDemoState } from "@/lib/demo/state";
import { toView } from "@/lib/demo/derive";

const key = "bapmutna.demo.v1";
const values = new Map<string,string>();
const storage = {
  getItem:vi.fn((id:string) => values.get(id) ?? null),
  setItem:vi.fn((id:string, value:string) => { values.set(id, value); }),
};
const permission = vi.fn(async () => "granted");
const display = vi.fn();
const registration = vi.fn(async () => ({showNotification:display}));
beforeEach(() => {
  vi.clearAllMocks();
  values.clear();
  hooks.mode = null;
  vi.useFakeTimers();
  const notification = Object.assign(vi.fn(), {permission:"granted", requestPermission:permission});
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", Object.assign(new EventTarget(), {Notification:notification}));
  vi.stubGlobal("Notification", notification);
  vi.stubGlobal("navigator", {serviceWorker:{getRegistration:registration}});
});
afterEach(() => {
  for (const cleanup of hooks.cleanups.splice(0)) cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("출처에 따른 기기 저장소와 알림 격리", () => {
  it("never reads or creates sample data for a signed-out, failed live, or unpaired senior session", async () => {
    const anonymous = useApp();
    await expect(anonymous.actions.skipPlug()).rejects.toThrow();
    useSenior();
    hooks.mode = "live";
    expect(useApp()).toMatchObject({mode:"live",provider:"firebase",view:null,error:"조회 실패"});
    expect(storage.getItem).not.toHaveBeenCalledWith(key);
    expect(storage.setItem).not.toHaveBeenCalled();
    hooks.mode = "demo";
    useApp();
    expect(storage.setItem).toHaveBeenCalledWith(key, expect.any(String));
    vi.clearAllMocks();
    hooks.mode = "live";
    expect(useApp().view).toBeNull();
    expect(storage.getItem).not.toHaveBeenCalledWith(key);
  });

  it("keeps sample alerts in the app even with pre-existing notification permission", async () => {
    const now = new Date();
    const view = toView(createDemoState(now), now);
    view.alerts = [{id:"example",type:"help_request",triggeredAt:now.toISOString(),acknowledgedAt:null,resolvedAt:null}];
    useAlertNotifications(view);
    expect(await enablePush("demo", ["example"])).toBe("unsupported");
    expect(permission).not.toHaveBeenCalled();
    expect(registration).not.toHaveBeenCalled();
    expect(display).not.toHaveBeenCalled();
    const live: AppView = {...view,mode:"live",dataSource:"firebase"};
    useAlertNotifications(live);
    await Promise.resolve();
    expect(display).toHaveBeenCalledTimes(1);
  });
});
