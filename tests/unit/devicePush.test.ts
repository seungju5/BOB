import { afterEach, beforeEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({user: "owner", row: null as string | null, failWrite: false, failDelete: false}));
const remove = vi.hoisted(() => vi.fn());
const signOut = vi.hoisted(() => vi.fn<(input: {scope: string}) => Promise<{error: Error | null}>>(async () => ({error:null})));
vi.mock("@/lib/supabase", () => ({
  supabaseConfigured: true,
  supabase: () => ({
    auth: {getUser: async () => ({data:{user:{id:db.user}}, error:null}), getSession: async () => ({data:{session:{user:{id:db.user}}}}), signOut},
    from: () => ({
      select: () => ({eq: () => ({eq: () => ({maybeSingle: async () => ({data:db.row ? {id:db.row} : null, error:null})})})}),
      upsert: async ({user_id}: {user_id:string}) => {
        if (db.failWrite) return {error: new Error("synthetic failure")};
        db.row = user_id;
        return {error:null};
      },
      delete: () => ({eq: () => ({eq: async () => {
        remove();
        if (db.failDelete) return {error: new Error("synthetic server offline")};
        db.row=null;
        return {error:null};
      }})}),
    }),
  }),
}));

const stores = new Map<string, string>();
const unsub = vi.fn(async () => { current = null; return true; });
const sub = {endpoint: "https://push.example.invalid/device", options:{applicationServerKey:Uint8Array.of(1,2,3).buffer},
  toJSON: () => ({endpoint:"https://push.example.invalid/device", keys:{auth:"test",p256dh:"test"}}), unsubscribe:unsub};
let current: typeof sub | null = null;
const subscribe = vi.fn(async () => { current=sub; return sub; });
const reg = {pushManager:{getSubscription:async () => current, subscribe}, unregister:vi.fn(async () => true)};
const ask = vi.fn(async () => "granted");
const regWorker = vi.fn();
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "AQID");
  vi.clearAllMocks();
  current=null; db.row=null; db.user="owner"; db.failWrite=false; db.failDelete=false; stores.clear();
  const notification = {permission:"granted", requestPermission:ask};
  vi.stubGlobal("window", Object.assign(new EventTarget(), {Notification:notification, PushManager: {}}));
  vi.stubGlobal("Notification", notification);
  vi.stubGlobal("navigator", {userAgent:"test browser",serviceWorker:{register:regWorker, ready:Promise.resolve(reg), getRegistration:async () => reg}});
  vi.stubGlobal("localStorage", {getItem:(k:string)=>stores.get(k) ?? null,setItem:(k:string,v:string)=>stores.set(k,v),removeItem:(k:string)=>stores.delete(k)});
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("saves the authenticated own subscription and can stop delivery on this device", async () => {
  const {enablePush, disablePush} = await import("@/lib/push");
  const {enabledSince} = await import("@/lib/push-device");
  await expect(enablePush("live","owner","supabase")).resolves.toBe("granted");
  expect(db.row).toBe("owner");
  expect(enabledSince("owner")).toBeGreaterThan(0);
  expect(enabledSince("other")).toBe(0);
  await disablePush("owner","supabase");
  expect(unsub).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledOnce();
  expect(enabledSince("owner")).toBe(0);
});

it("does not mark enrollment as complete if the server rejects the subscription", async () => {
  const {enablePush} = await import("@/lib/push");
  const {enabledSince} = await import("@/lib/push-device");
  db.failWrite=true;
  await expect(enablePush("live","owner","supabase")).rejects.toThrow();
  expect(unsub).toHaveBeenCalledOnce();
  expect(enabledSince("owner")).toBe(0);
  db.failWrite=false;
  await expect(enablePush("live","owner","supabase")).resolves.toBe("granted");
  expect(subscribe).toHaveBeenCalledTimes(2);
});

it("keeps demo and mismatched or separate account providers off the push server", async () => {
  const {enablePush} = await import("@/lib/push");
  db.user="other";
  await expect(enablePush("demo","owner","supabase")).resolves.toBe("unsupported");
  expect(regWorker).not.toHaveBeenCalled();
  await expect(enablePush("live","owner","supabase")).rejects.toThrow();
  expect(subscribe).not.toHaveBeenCalled();
  await expect(enablePush("live","owner","firebase")).resolves.toBe("granted");
  expect(subscribe).not.toHaveBeenCalled();
});

it("suggests adding iPhone to the home screen without requesting permission in a tab", async () => {
  const {permissionState} = await import("@/lib/push-device");
  vi.stubGlobal("navigator", {userAgent:"iPhone"});
  expect(permissionState()).toBe("install");
  const {enablePush} = await import("@/lib/push");
  await expect(enablePush("live","owner","supabase")).resolves.toBe("install");
  expect(ask).not.toHaveBeenCalled();
  expect(regWorker).not.toHaveBeenCalled();
});

it("revokes this device before signing out and preserves the caller's session scope", async () => {
  const {enablePush, signOutWithNotifications} = await import("@/lib/push");
  const {enabledSince} = await import("@/lib/push-device");
  await enablePush("live","owner","supabase");
  signOut.mockImplementationOnce(async () => { expect(current).toBeNull(); return {error:new Error("synthetic sign-out failed")}; });
  await expect(signOutWithNotifications("local")).rejects.toThrow("sign-out failed");
  expect(enabledSince("owner")).toBe(0);
  await signOutWithNotifications("global","owner");
  expect(signOut).toHaveBeenLastCalledWith({scope:"global"});
});

it("removes the notifications-only worker when both endpoints for stopping dispatch fail at sign-out", async () => {
  const {enablePush, signOutWithNotifications} = await import("@/lib/push");
  const {enabledSince} = await import("@/lib/push-device");
  await enablePush("live","owner","supabase");
  unsub.mockRejectedValueOnce(new Error("synthetic browser offline"));
  db.failDelete=true;
  await signOutWithNotifications("local");
  expect(reg.unregister).toHaveBeenCalledOnce();
  expect(enabledSince("owner")).toBe(0);
  expect(signOut).toHaveBeenCalledWith({scope:"local"});
});

it("reports subscription changes from another tab without reacting to unrelated storage", async () => {
  const {listenForPushChanges} = await import("@/lib/push-device");
  const updated=vi.fn();
  const stop=listenForPushChanges(updated);
  const dispatch=(key:string) => window.dispatchEvent(Object.assign(new Event("storage"), {key}));
  dispatch("an-unrelated-setting");
  expect(updated).not.toHaveBeenCalled();
  dispatch("bapmunna.notifications.owner");
  expect(updated).toHaveBeenCalledOnce();
  stop();
  dispatch("bapmunna.notifications.owner");
  expect(updated).toHaveBeenCalledOnce();
});
