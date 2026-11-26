import {describe,expect,it} from "vitest";
import {defaultPreferences,firebaseView} from "@/lib/data/firebase";
import {mealDaySummary,reportSummary} from "@/lib/data/view";
import {mealSignalRows} from "@/lib/report/metrics";
import type {MealWindow} from "@/lib/judge/types";
import type {SmartThingsConnection} from "@/lib/firebase/smartthings";
import {summarizeCaptureDays,type CaptureBucket} from "./capture-days";

const now=Date.parse("2026-11-26T21:00:00+09:00");
const windows:MealWindow[]=[{slot:"breakfast",start:"06:00",end:"10:00"},{slot:"lunch",start:"11:00",end:"14:00"}];
const prefs={settings:{...defaultPreferences(),windows,preparationAcknowledged:true},household:null};
const day=Math.floor((now+9*3600000)/86400000);
const bucket=(n:number,samples:Record<string,boolean>):CaptureBucket=>({day:n,windows,samples});
const hr=3600;
describe("confirmed meter captures",()=>{
  it("keeps inferred lower-power runs distinct from meals, care alerts and same-day automatic records",()=>{
    const item = {day,windows,count:28,cook:0,confirmed:[],estimated:3,estimatedSlots:["lunch" as const],estimatedBySlot:{lunch:2}};
    const history = summarizeCaptureDays([item],now);
    const date=history[0].date, view=firebaseView(prefs,null,now,history);
    expect(view.stats[date]).toMatchObject({cook:0,estimated:3,estimatedBySlot:{lunch:2}});
    expect(mealSignalRows(view,date,new Date(now))).toMatchObject([{slot:"lunch",position:2,observation:null,estimated:true,estimateCount:2}]);
    expect(view.slots).toEqual([]); expect(view.alerts).toEqual([]);
    expect(mealDaySummary(view,date,new Date(now)).ok).toBe(0);
    expect(() => summarizeCaptureDays([{...item,estimatedBySlot:{lunch:4}}],now)).toThrow();
    expect(() => summarizeCaptureDays([{...item,estimated:29}],now)).toThrow();
    const live:SmartThingsConnection={stage:"connected",device:{id:"selected",label:"밥솥",isVirtual:false},powerNotice:{enabled:true,lastObservedAt:now},mealRecords:{days:[{date,cook:1,windows,confirmed:["breakfast"]}]}};
    expect(firebaseView(prefs,live,now,history).stats[date]).toEqual({cook:1,lid:null});
    expect(firebaseView({...prefs,settings:{...prefs.settings,preparationAcknowledged:false}},null,now,history).stats).toEqual({});
  });
  it("merges 10-minute chains across midnight, even when imported backwards, and counts starts outside configured windows",()=>{
    const days=summarizeCaptureDays([bucket(day,{[2*60]:true,[12*60]:true,[22*60+1]:true,[7*hr]:true,[7*hr+601]:true,[8*hr]:false,[12*hr]:true}),bucket(day-1,{[86400-8*60]:true})],now);
    expect(days.map(d=>[d.cook,d.confirmed,d.samples])).toEqual([[1,[],1],[4,["breakfast","lunch"],7]]);
  });
  it("distinguishes below-threshold evidence, absent days and confirmed slots while disconnected",()=>{
    const captured=summarizeCaptureDays([bucket(day-2,{0:false}),bucket(day,{[7*hr]:true,[7*hr+700]:true})],now);
    const view=firebaseView(prefs,{stage:"setup_required"},now,captured);
    expect(view.stats).toEqual({"2026-11-24":{cook:0,lid:null},"2026-11-26":{cook:2,lid:null}});
    expect(view.plug.status).toBe("setup_required");
    expect(mealDaySummary(view,"2026-11-26",new Date(now))).toEqual({tone:"pending",ok:1,total:2});
    expect(view.alerts).toEqual([]);expect(reportSummary(view,new Date(now))).toBeNull();
  });
  it("uses one source per date when automatic records arrive and hides both sources after withdrawal",()=>{
    const captures=summarizeCaptureDays([bucket(day-1,{0:true}),bucket(day,{[7*hr]:true})],now);
    const live:SmartThingsConnection={stage:"connected",device:{id:"selected",label:"밥솥",isVirtual:false},powerNotice:{enabled:true,lastObservedAt:now},mealRecords:{days:[{date:"2026-11-26",cook:2,windows,confirmed:["lunch"]}]}};
    const view=firebaseView(prefs,live,now,captures);
    expect(view.stats["2026-11-26"].cook).toBe(2);expect(view.slots.filter(s=>s.date==="2026-11-26").map(s=>s.slot)).toEqual(["lunch"]);
    expect(view.partialCookerHistory).toBe(true);
    expect(view.stats["2026-11-25"].cook).toBe(1);
    expect(firebaseView({...prefs,settings:{...prefs.settings,preparationAcknowledged:false}},live,now,captures).stats).toEqual({});
  });
  it("uses each saved schedule and excludes expired or future observations",()=>{
    const changed:MealWindow[]=[{slot:"dinner",start:"07:00",end:"08:00"}];
    const days=summarizeCaptureDays([bucket(day-35,{0:true}),{day:day-1,windows:changed,samples:{[7*hr]:true}},bucket(day,{[22*hr]:true})],now);
    expect(days).toEqual([{date:"2026-11-25",cook:1,confirmed:["dinner"],samples:1,windows:changed}]);
  });
});
