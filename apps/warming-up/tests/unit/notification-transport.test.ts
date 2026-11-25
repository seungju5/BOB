import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TEAM_PROJECT_ID } from "@/config/team";
import {checkBackgroundPush, disableBackgroundPush, enableBackgroundPush, readBackgroundQuiet, setBackgroundQuiet, testBackgroundPush} from "@/lib/notification-transport";
import {localQuietHours, type QuietHours} from "@/lib/push-device";

const identity = vi.hoisted(() => ({ token: vi.fn() }));
vi.mock("@/lib/firebase/bridge", () => ({connectFirebase: async () => ({getIdToken: identity.token})}));
const publicKey = new Uint8Array(65); publicKey[0] = 4;
const key = Buffer.from(publicKey).toString("base64url");
const endpoint = "https://web.push.apple.com/fixture";
const unsubscribe = vi.fn(), subscribe = vi.fn(), getSubscription = vi.fn();
const sub = {endpoint, options:{applicationServerKey:publicKey.buffer}, unsubscribe, toJSON:()=>({endpoint,keys:{}})};
const worker = {pushManager:{getSubscription,subscribe}} as unknown as ServiceWorkerRegistration;
let config: object;
let ops: string[];
let registered: boolean;
let quiet: QuietHours | null;
const fetcher = vi.fn(async (url: string, init: RequestInit) => {
  if (url.endsWith("/config")) {
    expect(init.headers).not.toHaveProperty("Authorization");
    return Response.json(config);
  }
  expect(init.credentials).toBe("omit");
  expect(init.redirect).toBe("error");
  expect(init.headers).toHaveProperty("Authorization","Bearer fixture-auth");
  const body = JSON.parse(String(init.body)); ops.push(body.op);
  expect(body).not.toHaveProperty("uid");
  if (body.op === "register") registered=true;
  if (body.op === "remove") registered=false;
  if (body.op === "quiet" && registered) quiet=body.quietHours;
  return Response.json(body.op === "test" ? {accepted:true} : {registered,quietHours:quiet});
});
beforeEach(()=>{
  config={projectId:TEAM_PROJECT_ID,webPush:{publicKey:key}};
  ops=[]; registered=false; quiet=null;
  const saved = new Map<string, string>();
  vi.stubGlobal("localStorage",{getItem:(id:string)=>saved.get(id) ?? null, setItem:(id:string,v:string)=>saved.set(id,v), removeItem:(id:string)=>saved.delete(id)});
  identity.token.mockResolvedValue("fixture-auth");
  unsubscribe.mockResolvedValue(true); subscribe.mockResolvedValue(sub); getSubscription.mockResolvedValue(null);
  vi.stubGlobal("window",{PushManager:class {}});
  vi.stubGlobal("navigator",{serviceWorker:{getRegistration:async()=>worker}});
  vi.stubGlobal("fetch",fetcher);
});
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});

it("a hosting-only or foreign config never requests a token or creates a subscription",async()=>{
  config={projectId:TEAM_PROJECT_ID,enabled:false};
  expect(await checkBackgroundPush("owner")).toBe("unavailable");
  expect(await enableBackgroundPush("owner",worker)).toBe(false);
  config={projectId:"other",webPush:{publicKey:key}};
  await expect(enableBackgroundPush("owner",worker)).rejects.toThrow("팀 알림 서버");
  getSubscription.mockResolvedValue(sub);
  await expect(testBackgroundPush("owner")).rejects.toThrow("팀 알림 서버");
  expect(identity.token).not.toHaveBeenCalled();
  expect(subscribe).not.toHaveBeenCalled();
});

it("checks the actual owner-bound subscription and requests a remote test only for the local device",async()=>{
  expect(await enableBackgroundPush("owner",worker)).toBe(true);
  getSubscription.mockResolvedValue(sub);
  expect(await checkBackgroundPush("owner")).toBe("background");
  await testBackgroundPush("owner");
  await disableBackgroundPush("owner");
  expect(ops).toEqual(["register","check","test","remove"]);
  expect(subscribe).toHaveBeenCalledWith({userVisibleOnly:true,applicationServerKey:publicKey});
  expect(identity.token.mock.calls.every(([owner]) => owner==="owner")).toBe(true);
});

it("rotates an unowned endpoint, and a failed enrollment revokes the new endpoint",async()=>{
  getSubscription.mockResolvedValue(sub);
  fetcher.mockImplementationOnce(async()=>Response.json(config))
    .mockImplementationOnce(async()=>Response.json({registered:false}))
    .mockImplementationOnce(async()=>Response.json({}, {status:403}));
  await expect(enableBackgroundPush("owner",worker)).rejects.toThrow("동의");
  expect(unsubscribe).toHaveBeenCalledTimes(2);
});

it("an offline logout retires this browser independently of the unavailable server",async()=>{
  getSubscription.mockResolvedValue(sub);
  fetcher.mockRejectedValueOnce(new TypeError("offline"));
  await disableBackgroundPush("owner");
  expect(unsubscribe).toHaveBeenCalledOnce();
  unsubscribe.mockResolvedValueOnce(false); fetcher.mockRejectedValueOnce(new TypeError("offline"));
  await expect(disableBackgroundPush("owner")).rejects.toThrow("해제");
});

it("round trips opted-in hours for this owner's enrolled device and does not remember a denied update",async()=>{
  getSubscription.mockResolvedValue(sub);
  const hours = {start:"22:00", end:"07:00"};
  await expect(setBackgroundQuiet("owner",hours)).rejects.toThrow("저장");
  expect(localQuietHours("owner")).toBeNull();
  registered=true;
  await setBackgroundQuiet("owner", hours);
  expect(await readBackgroundQuiet("owner")).toEqual(hours);
  expect(localQuietHours("other")).toBeNull();
  await setBackgroundQuiet("owner",null);
  expect(await readBackgroundQuiet("owner")).toBeNull();
  await expect(setBackgroundQuiet("owner",{start:"06:30",end:"06:30"})).rejects.toThrow("서로 다른");
  expect(ops).toEqual(["quiet","quiet","check","quiet","check"]);
});
