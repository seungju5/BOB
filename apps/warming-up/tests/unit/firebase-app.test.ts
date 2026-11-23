import {describe,it,expect} from 'vitest';
import {defaultPreferences,firebaseView,preferencesPatch} from '@/lib/data/firebase';
import {afterGuardianLogin,guardianStartPath,slotsForDate,reportSummary} from '@/lib/data/view';
import {kstDate} from '@/lib/judge/time';
const household={relation:'mother' as const,alias:'가상 어머니',residentCount:1,hasPet:false};
describe('Firebase account preparation is separate from real care',()=>{
  it('shows optional Samsung connection after signup and preserves explicit account and returning-user destinations',()=>{
    expect(afterGuardianLogin(1,null)).toBe('/connect/');
    expect(afterGuardianLogin(1,'account')).toBe('/account/');
    expect(afterGuardianLogin(4,'connect')).toBe('/connect/');
    expect(afterGuardianLogin(4,null)).toBe('/onboarding');
    expect(afterGuardianLogin(8,null)).toBe('/home');
  });
  it('starts a new account at the tutorial and cannot fabricate care signals',()=>{
    const view=firebaseView({settings:null,household:null});
    expect(guardianStartPath(view.onboardingStep)).toBe('/tutorial');
    expect(view.careAvailable).toBe(false);expect(view.mode).toBe('live');
    expect(slotsForDate(view,kstDate(new Date()),new Date())).toEqual([]);
    expect(reportSummary(view,new Date())).toBeNull();expect(view.alerts).toEqual([]);expect(view.stats).toEqual({});
  });
  it('restores the completed account but requires household re-entry if its document was removed',()=>{
    const settings={...defaultPreferences(),onboardingStep:8};
    expect(guardianStartPath(firebaseView({settings,household}).onboardingStep)).toBe('/home');
    expect(guardianStartPath(firebaseView({settings,household:null}).onboardingStep)).toBe('/onboarding');
  });
  it('lifestyle saves preserve alert choices and do not overwrite legacy household edits',()=>{
    const settings={...defaultPreferences(),preparationAcknowledged:true,missedMealsThreshold:5};
    const patch=preferencesPatch({settings,household},8,{mealProfile:{windows:[{slot:'lunch',start:'11:00',end:'14:00'}],eatOutPerWeek:4,cooksPerWeek:6,usesKeepWarm:false}});
    expect(patch.settings.missedMealsThreshold).toBe(5);expect(patch.household).toBeNull();expect(patch.settings.windows).toHaveLength(1);
  });
  it('keeps representative contact separate from the canonical household document',()=>{
    const patch=preferencesPatch({settings:null,household},8,{seniorConsent:true,senior:{name:'가상 아버지',relation:'아버지',phone:'010-0000-0000'},household:{residentCount:2,hasPet:true}});
    expect(patch.household).toEqual({relation:'father',alias:'가상 아버지',residentCount:2,hasPet:true});
    expect(patch.settings.phone).toBe('010-0000-0000');expect(patch.settings).not.toHaveProperty('relation');
  });
  it('preserves a custom relation and never reopens completed onboarding',()=>{
    const saved={settings:{...defaultPreferences(),onboardingStep:8,preparationAcknowledged:true},household};
    const patch=preferencesPatch(saved,3,{senior:{name:'가상 사용자',relation:'할머니',phone:''}});
    expect(patch.settings.onboardingStep).toBe(8);
    expect(firebaseView({settings:patch.settings,household:patch.household}).senior.relation).toBe('할머니');
  });

});

describe('actual SmartThings connection summary stays separate from meal care',()=>{
  const settings={...defaultPreferences(),preparationAcknowledged:true};
  it('maps only an acknowledged selected connection and never invents food or health records',()=>{
    const now=Date.now();
    const view=firebaseView({settings,household},{stage:'connected',device:{id:'synthetic-plug',label:'주방 플러그'},lastReceivedAt:now,lastEventAt:now,lastSignalAt:now});
    expect(view.plug).toMatchObject({status:'connected',deviceId:'synthetic-plug',online:true,lastReadingAt:new Date(now).toISOString(),lastEventAt:new Date(now).toISOString()});
    expect(view.careAvailable).toBe(false);expect(view.slots).toEqual([]);expect(view.lastCookerAt).toBeNull();expect(view.alerts).toEqual([]);
    expect(firebaseView({settings,household},{stage:'connected',device:{id:'synthetic-plug',label:'가상 플러그'},lastReceivedAt:now},now+3*60*60*1000).plug.online).toBe(false);
  });
  it('delayed, undated and virtual events cannot mark the household plug active',()=>{
    const now=Date.now(), old=now-24*60*60*1000;
    const device={id:'test-plug',label:'주방 플러그'};
    const base={stage:'connected' as const,device,lastReceivedAt:now,lastCheckedAt:now,lastSignalAt:now};
    for(const lastEventAt of [old,undefined,now+1]){
      const view=firebaseView({settings,household},{...base,lastEventAt},now);
      expect(view.plug).toMatchObject({online:false,lastReadingAt:new Date(now).toISOString()});
    }
    const virtual=firebaseView({settings,household},{...base,device:{...device,isVirtual:true},lastEventAt:now},now);
    expect(virtual.plug).toMatchObject({online:false,isVirtual:true});
    expect(virtual.alerts).toEqual([]);
  });
  it('requires a selected device and a valid measured timestamp before reporting reception',()=>{
    const now=Date.now();
    for (const device of [null,{id:'  ', label:'미선택'}]) {
      expect(firebaseView({settings,household},{stage:'connected',device,lastReceivedAt:now},now).plug)
        .toMatchObject({online:false,lastReadingAt:null,deviceId:''});
    }
    for (const lastReceivedAt of [null, NaN, Infinity, 0, now+1]) {
      expect(firebaseView({settings,household},{stage:'connected',device:{id:'unit',label:'테스트'},lastReceivedAt},now).plug)
        .toMatchObject({online:false,lastReadingAt:null});
    }
  });
  it('manual checks never become automatic event evidence; revoked consent clears the summary',()=>{
    const now=Date.now();
    const connection={stage:'connected' as const,device:{id:'synthetic-plug',label:'가상 플러그',isVirtual:true},lastCheckedAt:now,lastSignalAt:now};
    expect(firebaseView({settings,household},connection).plug).toMatchObject({
      online:false,lastReadingAt:null,lastCheckedAt:new Date(now).toISOString(),isVirtual:true,
    });
    expect(firebaseView({settings:{...settings,preparationAcknowledged:false},household},connection).plug).toEqual({
      status:'consent_required',deviceId:'',online:false,lastReadingAt:null,
    });
    expect(firebaseView({settings,household},{...connection,stage:'reconnect_required'}).plug.deviceId).toBe('');
    expect(firebaseView({settings,household},{...connection,lastReceivedAt:Date.now()+60_000}).plug.lastReadingAt).toBeNull();
  });
  it.each(['setup_required','read_error','choose_device','subscribing','reconnect_required','disconnected'] as const)(
    'retains the distinct %s status without leaking prior device data',stage=>{
      const stale={stage,device:{id:'old-plug',label:'old'},lastReceivedAt:Date.now(),lastCheckedAt:Date.now()};
      const view=firebaseView({settings,household},stale);
      expect(view.plug).toEqual({status:stage,deviceId:'',online:false,lastReadingAt:null});
      expect(view.stats).toEqual({});expect(view.slots).toEqual([]);expect(view.alerts).toEqual([]);
    });
});
