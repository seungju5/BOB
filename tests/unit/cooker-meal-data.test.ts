import {describe,expect,it} from 'vitest';
import {defaultPreferences,firebaseView} from '@/lib/data/firebase';
import {mealDaySummary,mealWindowsForCount,reportSummary,slotsForDate} from '@/lib/data/view';
import {cookerUsage,datedMealSlots,slotRates} from '@/lib/report/metrics';
import {readCookerMealRecords,type SmartThingsConnection} from '@/lib/firebase/smartthings';

const today='2026-11-26', yesterday='2026-11-25';
const now=new Date(today+'T18:05:00+09:00');
const settings={...defaultPreferences(),windows:mealWindowsForCount(2),preparationAcknowledged:true};
const saved={settings,household:null};
const connected:SmartThingsConnection={stage:'connected',device:{id:'selected',label:'전력 플러그',isVirtual:false},
  lastEventAt:+now-1000,lastReceivedAt:+now,powerNotice:{enabled:true,lastObservedAt:+now-1000},
  mealRecords:{days:[
    {date:yesterday,cook:3,windows:mealWindowsForCount(5),confirmed:['fifth']},
    {date:today,cook:1,windows:mealWindowsForCount(2),confirmed:['dinner']},
  ]}};

describe('measured Firebase meal days',()=>{
  it('resolves selected historical and current dates using that household’s actual schedules',()=>{
    const view=firebaseView(saved,connected,+now);
    expect(datedMealSlots(view,yesterday,now)).toEqual([{date:yesterday,slot:'fifth',label:'다섯 끼',position:5,status:'confirmed',source:'cooker'}]);
    expect(datedMealSlots(view,today,now)[0]).toMatchObject({slot:'dinner',label:'두 끼',position:2});
    expect(mealDaySummary(view,yesterday,now)).toEqual({tone:'pending',ok:1,total:5});
    expect(cookerUsage(view,now)).toMatchObject({recordedDays:1,cook:3,lid:null});
    expect(slotRates(view,now).at(-1)).toMatchObject({ok:1,rate:null});
    expect(reportSummary(view,now)).toBeNull();
    expect(slotsForDate(view,'2026-11-24',now)).toEqual([]);
    expect(view.lastActivityAt).toBeNull();
    expect(view.alerts).toEqual([]);
  });
  it('clears observed history for missing household permission, virtual devices, inactive grants and interrupted sessions',()=>{
    for (const current of [null,{...connected,powerNotice:undefined}, {...connected,stage:'reconnect_required' as const},
      {...connected,device:{...connected.device!,isVirtual:true}}]) {
      expect(firebaseView(saved,current,+now)).toMatchObject({slots:[],stats:{},lastCookerAt:null});
    }
    expect(firebaseView({settings:{...settings,preparationAcknowledged:false},household:null},connected,+now).stats).toEqual({});
  });
  it('filters out expired rows and rejects future, duplicate, malformed, or unconfigured slot claims',()=>{
    const day=connected.mealRecords!.days[0];
    expect(readCookerMealRecords({days:[{...day,date:'2026-08-01'}]},+now)).toEqual({days:[]});
    for(const days of [[{...day,date:'2026-11-27'}],[day,day],[{...day,date:'2026-02-31'}],
      [{...day,confirmed:['fifth','fifth']}],[{...day,cook:0}],[{...day,windows:mealWindowsForCount(2)}]]) {
      expect(readCookerMealRecords({days},+now)).toBeNull();
    }
  });
});
