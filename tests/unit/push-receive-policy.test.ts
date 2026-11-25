import {afterEach, expect, it, vi} from "vitest";
import {syncWorkerDelivery} from "@/lib/push-device";
import {acceptsCookerDelivery, scopedNotice} from "@/public/notification-content";

afterEach(()=>vi.unstubAllGlobals());

it("keeps the latest account's arrival policy when a previous account finishes saving or retiring",async()=>{
  const rows=new Map<string,Response>();
  vi.stubGlobal("window",{location:{origin:"https://example.invalid"}});
  vi.stubGlobal("navigator",{});
  vi.stubGlobal("caches",{open:async()=>({
    match:async(k:string)=>rows.get(k)?.clone(),put:async(k:string,r:Response)=>rows.set(k,r)
  })});
  const policy=()=>rows.get("https://example.invalid/.notice-delivery")!.clone().json();
  const at="2026-11-26T16:03:00Z", now=Date.parse(at);
  const scope=await scopedNotice("owner-b","n".repeat(32));
  await syncWorkerDelivery("owner-a","enable",null);
  await syncWorkerDelivery("owner-b","enable",null);
  await syncWorkerDelivery("owner-a","quiet",{start:"00:00",end:"05:00"});
  await syncWorkerDelivery("owner-a","disable",null);
  expect(await acceptsCookerDelivery(await policy(),scope,at,now)).toBe(true);
  await syncWorkerDelivery("owner-b","quiet",{start:"23:30",end:"06:30"});
  expect(await acceptsCookerDelivery(await policy(),scope,at,now)).toBe(false);
  await syncWorkerDelivery("owner-b","disable",null);
  await syncWorkerDelivery("owner-b","quiet",null);
  expect(await policy()).toEqual({enabled:false});
});
