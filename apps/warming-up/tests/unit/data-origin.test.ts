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
import { disablePush, enablePush, useAlertNotifications } from "@/lib/push";
import {matchesNoticeOwner, scopedNotice} from "@/public/notification-content";
import {closeOwnerNotices, saveQuietHours, showNewNotices} from "@/lib/push-device";
import { createDemoState } from "@/lib/demo/state";
import { toView } from "@/lib/demo/derive";

const key = "bapmutna.demo.v1";
const values = new Map<string,string>();
const storage = {
  getItem:vi.fn((id:string) => values.get(id) ?? null),
  setItem:vi.fn((id:string, value:string) => { values.set(id, value); }),
  removeItem:vi.fn((id:string) => { values.delete(id); }),
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
  vi.stubGlobal("navigator", {serviceWorker:{getRegistration:registration, register:vi.fn(), ready:Promise.resolve({showNotification:display})}});
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
    useAlertNotifications(view, "parent:1");
    expect(await enablePush("demo", "parent")).toBe("unsupported");
    expect(permission).not.toHaveBeenCalled();
    expect(registration).not.toHaveBeenCalled();
    expect(display).not.toHaveBeenCalled();
    const live: AppView = {...view,mode:"live",dataSource:"firebase",seniorConsent:true};
    useAlertNotifications(live, "parent:1");
    expect(display).not.toHaveBeenCalled();
    await enablePush("live", "parent");
    useAlertNotifications(live, "parent:2");
    expect(registration).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1200);
    live.alerts = [{...view.alerts[0], id:"a-new-alert", triggeredAt:new Date().toISOString()}];
    useAlertNotifications(live, "parent:2");
    await vi.waitFor(() => expect(display).toHaveBeenCalledTimes(1));
    expect(display).toHaveBeenCalledWith("밥뭇나", expect.objectContaining({body: "워밍이가 새 소식을 가져왔어요. 앱에서 확인해 주세요.", tag:"a-new-alert", data:{url:"/alerts/#notice-a-new-alert", scope:expect.any(String)}}));
    expect(await matchesNoticeOwner("parent", display.mock.calls[0][1].data.scope)).toBe(true);
  });

  it("only shows new real cooker signals for the opted-in account until it turns them off", async () => {
    const base = toView(createDemoState(new Date()), new Date());
    const live: AppView = {...base, mode:"live", dataSource:"firebase", seniorConsent:true, alerts:[],
      plug: {deviceId:"test-plug", online:true, lastReadingAt:null, status:"connected", isVirtual:false}};
    await enablePush("live", "parent");
    vi.advanceTimersByTime(1000);
    live.plug.powerNoticeAt = new Date().toISOString();
    useAlertNotifications(live, "other:1");
    useAlertNotifications({...live, seniorConsent:false}, "parent:1");
    useAlertNotifications({...live, plug:{...live.plug, isVirtual:true}}, "parent:1");
    expect(registration).not.toHaveBeenCalled();
    useAlertNotifications(live, "parent:1");
    await Promise.resolve();
    await vi.waitFor(() => expect(display).toHaveBeenCalledTimes(1));
    useAlertNotifications(live, "parent:2");
    await disablePush("parent");
    vi.advanceTimersByTime(1000);
    live.plug.powerNoticeAt = new Date().toISOString();
    useAlertNotifications(live, "parent:3");
    await vi.waitFor(() => expect(display).toHaveBeenCalledTimes(1));
  });

  it("never replays a locally muted signal and closes only the retiring account's notifications",async()=>{
    vi.setSystemTime(new Date("2026-11-25T15:01:00Z"));
    await enablePush("live","guardian-a"); vi.advanceTimersByTime(1000);
    const notices=[{at:new Date().toISOString(),kind:"cooker_signal",id:"muted"}];
    saveQuietHours("guardian-a",{start:"22:00",end:"07:00"});
    await showNewNotices("guardian-a",notices,()=>true);
    saveQuietHours("guardian-a",null);
    await showNewNotices("guardian-a",notices,()=>true);
    expect(display).not.toHaveBeenCalled();
    const cards=await Promise.all(["guardian-a","guardian-b"].map(async owner=>({close:vi.fn(),data:{scope:await scopedNotice(owner,"d".repeat(32))}})));
    registration.mockResolvedValueOnce({showNotification:display,getNotifications:async()=>cards} as Awaited<ReturnType<typeof registration>>);
    await closeOwnerNotices("guardian-a");
    expect(cards[0].close).toHaveBeenCalledOnce();expect(cards[1].close).not.toHaveBeenCalled();
  });
});
