import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

const source = readFileSync("public/sw.js", "utf8");
type EventHandler = (event: {data?: {json(): unknown}; notification?: object; waitUntil(task: Promise<unknown>): void}) => void;
function worker() {
  const events: Record<string, EventHandler> = {};
  const show = vi.fn();
  const focus = vi.fn();
  const destination = {focus};
  const navigate = vi.fn(async () => destination);
  const openWindow = vi.fn();
  const home = "https://example.invalid/";
  runInNewContext(source, {URL, self: {
    registration:{scope:home, showNotification:show},
    clients:{openWindow, matchAll:async () => [{url:home, navigate, focus:vi.fn()}]},
    addEventListener:(key:string, fn:EventHandler) => { events[key]=fn; },
  }});
  return {events, show, home, focus, navigate, openWindow};
}

it("keeps family details off the lock screen for new and older push payloads", async () => {
  const {events, show, home} = worker();
  let settled: Promise<unknown> | undefined;
  const waitUntil = (p:Promise<unknown>) => { settled=p; };
  for (const json of [() => ({title:"개인 호칭", body:"가족 기록", tag:"abc", url:"/report"}), () => null, () => { throw Error("plain old message"); }]) {
    events.push({data:{json}, waitUntil});
    await settled;
  }
  expect(show.mock.calls).toHaveLength(3);
  for (const [title, options] of show.mock.calls) {
    expect(title).toBe("밥뭇나");
    expect(options.body).toBe("워밍이가 새 소식을 가져왔어요. 앱에서 확인해 주세요.");
  }
  expect(show.mock.calls[0][1].data.url).toBe(home+"report");
  expect(show.mock.calls[1][1].data.url).toBe(home+"alerts/");
});

it("opens the matching in-app destination before focusing the existing window", async () => {
  const {events, home, focus, navigate, openWindow} = worker();
  let settled: Promise<unknown> | undefined;
  events.notificationclick({notification:{data:{url:"/report"}, close:vi.fn()}, waitUntil:p => { settled=p; }});
  await settled;
  expect(navigate).toHaveBeenCalledWith(home+"report");
  expect(focus).toHaveBeenCalledOnce();
  expect(openWindow).not.toHaveBeenCalled();
});
