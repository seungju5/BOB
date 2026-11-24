import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { expect, it, vi } from "vitest";
import { noticeDay } from "@/public/notification-content";

type WorkerEvent = {data?: {json(): unknown}; notification?: object; waitUntil(task: Promise<unknown>): void};
const source = readFileSync("public/sw.js", "utf8");
const content = readFileSync("public/notification-content.js", "utf8");

function worker(previews = false, withWindow = true) {
  const events: Record<string, (event: WorkerEvent) => void> = {};
  const show = vi.fn(), focus = vi.fn(), openWindow = vi.fn();
  const navigate = vi.fn(async () => ({focus}));
  const scope = "https://example.invalid/app/";
  const context = createContext({URL, self: {
    registration:{scope, showNotification:show},
    caches: {match:async () => previews ? new Response("this-device-owner") : undefined},
    clients:{openWindow, matchAll:async () => withWindow ? [{url:scope, navigate}] : []},
    addEventListener:(key:string, fn:(event: WorkerEvent) => void) => { events[key]=fn; },
  }});
  context.importScripts = (url: string) => { expect(url).toBe("./notification-content.js"); runInContext(content, context); };
  runInContext(source, context);
  async function fire(type: string, event: Partial<WorkerEvent>) {
    let done: Promise<unknown> | undefined;
    events[type]({...event, waitUntil:task=>{done = task;}});
    await done;
  }
  return {show, scope, focus, navigate, openWindow, fire};
}

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
  expect(w.show.mock.calls[0][1].data.url).toBe(w.scope + "records/?day=2026-11-25");
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
  await w.fire("push", {data:{json:() => ({kind,at:"2026-11-24T15:02:03Z",tag:"abc",
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
    w.scope+"records/?day=2026-11-23&from=notice"]);
  expect(noticeDay("2026-02-30")).toBeNull();
});
