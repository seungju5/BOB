import {describe,it,expect} from 'vitest';
import {defaultPreferences,firebaseView,preferencesPatch} from '@/lib/data/firebase';
import {guardianStartPath,slotsForDate,reportSummary} from '@/lib/data/view';
import {kstDate} from '@/lib/judge/time';
const household={relation:'mother' as const,alias:'가상 어머니',residentCount:1,hasPet:false};
describe('Firebase account preparation is separate from real care',()=>{
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
