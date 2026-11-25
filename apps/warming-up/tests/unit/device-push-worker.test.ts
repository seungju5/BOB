import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { expect, it, vi } from "vitest";
import { noticeDay, noticeText, scopedNotice } from "@/public/notification-content";

type WorkerEvent = {data?: {json(): unknown}; notification?: object; waitUntil(task: Promise<unknown>): void};
const source = readFileSync("public/sw.js", "utf8");
const content = readFileSync("public/notification-content.js", "utf8");
const ticket = "n1." + "t".repeat(84);

function worker(previews = false, withWindow = true, delivery?:object) {
  const events: Record<string, (event: WorkerEvent) => void> = {};
  const show = vi.fn(), focus = vi.fn(), openWindow = vi.fn();
  const navigate = vi.fn(async () => ({focus}));
  const scope = "https://example.invalid/app/";
  const postMessage = vi.fn(), put = vi.fn();
  const cacheMatch=async (path:string) => path.endsWith("/.notice-delivery")
    ? delivery && Response.json(delivery) : previews ? new Response("this-device-owner") : undefined;
  const context = createContext({URL, crypto, TextEncoder, Response, self: {
    registration:{scope, showNotification:show},
    caches: {match:cacheMatch, open:async()=>({match:cacheMatch,put})},
    clients:{openWindow, matchAll:async () => withWindow ? [{url:scope, navigate, postMessage}] : []},
    addEventListener:(key:string, fn:(event: WorkerEvent) => void) => { events[key]=fn; },
  }});
  context.importScripts = (url: string) => { expect(url).toBe("./notification-content.js"); runInContext(content, context); };
  runInContext(source, context);
  async function fire(type: string, event: Partial<WorkerEvent>) {
    let done: Promise<unknown> | undefined;
    events[type]({...event, waitUntil:task=>{done = task;}});
    await done;
  }
  return {show, scope, focus, navigate, openWindow, fire, put, postMessage};
}

it("records remote test receipt only after a system notification is accepted for the current owner",async()=>{
  const owner="this-device-owner", scope=await scopedNotice(owner,"r".repeat(32));
  const packet={data:{json:()=>({kind:"delivery_test",tag:"bapmunna-delivery-test",scope})}};
  const w=worker(false,true,{enabled:true,owner});
  w.show.mockRejectedValueOnce(Error("notification rejected"));
  await expect(w.fire("push",packet)).rejects.toThrow();
  expect(w.put).not.toHaveBeenCalled();
  await w.fire("push",packet);
  expect(w.put.mock.calls[0][0]).toBe(w.scope+".notice-test-receipt");
  expect(await (w.put.mock.calls[0][1] as Response).json()).toEqual({scope,receivedAt:expect.any(Number)});
  expect(w.postMessage).toHaveBeenCalledWith({type:"bapmunna:server-test-received"});
  expect(noticeText("device_preview",false).title).not.toBe(w.show.mock.calls[1][0]);
  for(const policy of [{enabled:false},{enabled:true,owner:"other"}]){
    const stale=worker(false,true,policy); await stale.fire("push",packet);
    expect(stale.show).not.toHaveBeenCalled();
    expect(stale.put).not.toHaveBeenCalled();
  }
});

it("keeps family details private unless this device opts in and handles prior notification versions", async () => {
  const w = worker();
  for (const json of [() => ({kind:"cooker_signal",at:"2026-11-24T15:02:03Z", title:"개인 호칭",body:"기기 원값"}),
      () => ({tag:"abc",url:"/report"}), () => null, () => {throw Error("plain old message");}]) {
    await w.fire("push", {data:{json}});
  }
  expect(w.show).toHaveBeenCalledTimes(4);
  for (const [title, opts] of w.show.mock.calls) {
    expect(title).toBe("밥뭇나");
    expect(opts.body).toBe("워밍이가 새 소식을 가져왔어요. 앱에서 확인해 주세요.");
  }
  expect(w.show.mock.calls[0][1].data.url).toBe(w.scope + "alerts/");
  expect(w.show.mock.calls[1][1].data.url).toBe(w.scope + "report/");
  expect(w.show.mock.calls[2][1].data.url).toBe(w.scope + "alerts/");
});

it.each([
  ["cooker_signal","밥솥에서 소식이 왔어요","records/?day=2026-11-25"],
  ["eat_out","밥뭇나 · 끼니 소식이 왔어요","records/?day=2026-11-23"],
  ["weekly_report","밥뭇나 · 한 주 리포트가 왔어요","report/"],
  ["help_request","밥뭇나 · 확인할 안부가 왔어요","alerts/#notice-abc"],
  ["device_offline","밥뭇나 · 기기 연결을 살펴봐요","settings/#device"],
  ["not-supported","밥뭇나","alerts/"], ["constructor","밥뭇나","alerts/"],
])("shows fixed local copy and opens the correct screen for %s", async (kind, title, route) => {
  const w = worker(true);
  const scope = await scopedNotice("this-device-owner", "a".repeat(32));
  await w.fire("push", {data:{json:() => ({kind,scope,ticket,at:"2026-11-24T15:02:03Z",tag:"abc",
    date: kind === "eat_out" ? "2026-11-23" : undefined, body:"private", url:"https://foreign.invalid/"})}});
  expect(w.show.mock.calls[0][0]).toBe(title);
  expect(w.show.mock.calls[0][1].data.url).toBe(w.scope + route);
  expect(w.show.mock.calls[0][1].body).not.toContain("private");
});

it("opens a matching in-app destination before focusing the existing window", async () => {
  const w = worker();
  await w.fire("notificationclick", {notification:{data:{url:w.scope+"report/"},close:vi.fn()}});
  expect(w.navigate).toHaveBeenCalledWith(w.scope+"report/?from=notice");
  expect(w.focus).toHaveBeenCalledOnce();
  expect(w.openWindow).not.toHaveBeenCalled();
});

it("opens a new app window, rejects foreign and unrelated targets and removes extra parameters", async () => {
  const w = worker(false, false);
  for (const url of ["https://foreign.invalid/report", "/admin", "/app/records/?day=2026-11-23&family=private"]) {
    await w.fire("notificationclick", {notification:{data:{url},close:vi.fn()}});
  }
  expect(w.openWindow.mock.calls.map(v=>v[0])).toEqual([w.scope+"alerts/?from=notice", w.scope+"alerts/?from=notice",
    w.scope+"alerts/?from=notice"]);
  expect(noticeDay("2026-02-30")).toBeNull();
});


it("retains only a matching KST day and an allowed meal, including after a cold start", async () => {
  const scope = await scopedNotice("this-device-owner", "c".repeat(32));
  const w = worker(true,false);
  await w.fire("push",{data:{json:()=>({kind:"cooker_signal",at:"2026-11-24T15:01:00Z",date:"2026-11-25",slot:"fourth",scope,ticket})}});
  const notification = w.show.mock.calls[0][1];
  expect(notification.data.url).toBe(w.scope+"records/?day=2026-11-25&slot=fourth");
  await w.fire("notificationclick",{notification:{...notification,close:vi.fn()}});
  const opened = new URL(w.openWindow.mock.calls[0][0]);
  expect(opened.pathname).toBe("/app/alerts/");
  expect(opened.searchParams.has("slot")).toBe(false);
  expect(opened.searchParams.get("cookTicket")).toBe(ticket);
  expect(opened.searchParams.get("noticeFor")).toBe(scope);
  expect(opened.searchParams.get("from")).toBe("notice");
  await w.fire("push",{data:{json:()=>({kind:"cooker_signal",scope,ticket,at:"2026-11-24T15:01:00Z",date:"2026-11-24",slot:"fourth"})}});
  expect(w.show.mock.calls[1][1].data.url).toBe(w.scope+"records/?day=2026-11-25");
});

it("hides other-account previews and does not show an expired cooker signal", async () => {
  const w = worker(true);
  const scope = await scopedNotice("previous-user", "x".repeat(32));
  await w.fire("push",{data:{json:()=>({kind:"cooker_signal",scope,date:"2026-11-24",slot:"private"})}});
  expect(w.show.mock.calls[0][0]).toBe("밥뭇나");
  expect(w.show.mock.calls[0][1].data.url).toBe(w.scope+"alerts/");
  await w.fire("push",{data:{json:()=>({kind:"cooker_signal",scope,expiresAt:1})}});
  expect(w.show).toHaveBeenCalledTimes(1);
});

it("honors a later sign-out, account switch or KST quiet-hours change for an already queued packet", async()=>{
  const owner="this-device-owner", scope=await scopedNotice(owner,"a".repeat(32));
  const stamp=Date.now(), at=new Date(stamp).toISOString();
  const timeAt=(ms:number)=>new Date(ms+9*3600_000).toISOString().slice(11,16);
  const quiet={start:timeAt(stamp-60_000),end:timeAt(stamp+120_000)};
  const packet={data:{json:()=>({kind:"cooker_signal",at,scope,ticket})}};
  for (const policy of [{enabled:false},{enabled:true,owner:"next-owner",quiet:null},{enabled:true,owner,quiet}]) {
    const w=worker(true,true,policy);
    await w.fire("push",packet);
    expect(w.show).not.toHaveBeenCalled();
  }
  const current=worker(true,true,{enabled:true,owner,quiet:null});
  await current.fire("push",packet); expect(current.show).toHaveBeenCalledOnce();
});
