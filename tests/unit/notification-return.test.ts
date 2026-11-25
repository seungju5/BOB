import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {clearNoticeReturn, readNoticeReturn, rememberNoticeReturn, resolveNoticeReturn} from "@/lib/alerts/notification-return";
import {scopedNotice} from "@/public/notification-content";
import {isQuietHours, untilQuiet} from "@/server/smartthings/notification-policy.mjs";
const lookup = vi.hoisted(()=>vi.fn());
vi.mock("@/lib/notification-transport",()=>({resolveCookerTicket:lookup}));

const origin = "https://example.invalid";
const target = (path: string) => new URL(path, origin);
beforeEach(() => {
  const values = new Map<string,string>();
  vi.stubGlobal("sessionStorage", {getItem: (k:string)=>values.get(k) ?? null, setItem:(k:string,v:string)=>values.set(k,v), removeItem:(k:string)=>values.delete(k)});
  vi.stubGlobal("location", target("/"));
});
afterEach(() => {vi.unstubAllGlobals(); vi.useRealTimers(); lookup.mockReset();});

it("resumes an interrupted notification login only in its real recipient's account and drops unrelated parameters", async()=>{
  const token = await scopedNotice("first-household", "a".repeat(32));
  vi.stubGlobal("location", target("/records/?from=notice&day=2026-11-25&slot=fifth&private=ignored&noticeFor=" + token));
  rememberNoticeReturn();
  const saved = readNoticeReturn()!;
  expect(saved.href).not.toContain("private");
  expect(await resolveNoticeReturn(saved,"first-household")).toBe("/records/?day=2026-11-25&slot=fifth");
  expect(await resolveNoticeReturn(saved,"second-household")).toBe("/alerts/");
  expect(await resolveNoticeReturn(saved,null)).toBe("/alerts/");
  clearNoticeReturn(); expect(readNoticeReturn()).toBeNull();
});

it("rejects stale returns, unbound historical dates, unrelated origins and unsupported meal identifiers", async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date("2026-11-25T01:00:00Z"));
  const scope=await scopedNotice("first","b".repeat(32));
  vi.stubGlobal("location", target("/records/?from=notice&day=2026-11-25&slot=other&noticeFor="+scope));
  rememberNoticeReturn();
  expect(await resolveNoticeReturn(readNoticeReturn()!,"first")).toBe("/records/?day=2026-11-25");
  vi.advanceTimersByTime(15*60_000+1);expect(readNoticeReturn()).toBeNull();
  expect(await resolveNoticeReturn(target("/records/?day=2026-11-25"),"first")).toBe("/alerts/");
  expect(await resolveNoticeReturn(new URL("https://outside.invalid/report/"),"first")).toBe("/alerts/");
});

it("shares exact KST quiet-hour boundaries between a foreground tab and the server", () => {
  const at = (time:string) => Date.parse("2026-11-25T" + time + "+09:00");
  const overnight = {start:"21:30",end:"07:30"};
  expect(isQuietHours(overnight)).toBe(true);
  expect(isQuietHours({start:"24:00",end:"03:00"})).toBe(false);
  expect(untilQuiet(at("21:29:59"),overnight)).toBe(1000);
  for (const time of ["21:30:00","00:00:00","07:29:59"]) expect(untilQuiet(at(time),overnight)).toBe(0);
  expect(untilQuiet(at("07:30:00"),overnight)).toBe(14*3600_000);
  expect(untilQuiet(at("00:00:00"),null)).toBe(Infinity);
  expect(untilQuiet(at("10:05:00"),{start:"10:00",end:"10:15"})).toBe(0);
});

it("uses only the authenticated server's corrected target across sign-in and leaves temporary failures available to retry", async()=>{
  const ticket="n1."+"t".repeat(84);
  const scope=await scopedNotice("recipient","z".repeat(32));
  vi.stubGlobal("location",target("/records/?from=notice&day=2026-11-26&slot=breakfast&cookTicket="+ticket+"&noticeFor="+scope));
  rememberNoticeReturn();
  const intent=readNoticeReturn()!;
  expect(intent.pathname).toBe("/alerts/");
  expect(intent.searchParams.get("day")).toBeNull();
  expect(await resolveNoticeReturn(intent,"other")).toBe("/alerts/");expect(lookup).not.toHaveBeenCalled();
  lookup.mockRejectedValueOnce(Error("offline")).mockResolvedValueOnce("/records/?day=2026-11-25&slot=dinner");
  await expect(resolveNoticeReturn(intent,"recipient")).rejects.toThrow("offline");
  expect(await resolveNoticeReturn(readNoticeReturn()!,"recipient")).toBe("/records/?day=2026-11-25&slot=dinner");
  expect(lookup).toHaveBeenLastCalledWith("recipient",ticket);
});
