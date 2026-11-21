'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { resetSeniorStepsConsent } from '@/lib/steps/consent';
import { ALERT_DEFAULTS } from '@/config/detection';
import { accountError, ACCOUNT_CONSENT_VERSION, connectFirebase, within, type AccountProfile, type FirebaseUser, type Household, type Preferences, type SavedPreferences } from '@/lib/firebase/bridge';
import { DEFAULT_WINDOWS, type AppActions, type AppView, type OnboardingPatch } from './view';
import { assertOnboardingConsent } from './consent';
import { readSmartThingsConnection, type SmartThingsConnection } from '@/lib/firebase/smartthings';

type State = { user: FirebaseUser|null|undefined; profile: AccountProfile|null; saved: SavedPreferences|null; connection:SmartThingsConnection|null; view: AppView|null; error:string|null; loading:boolean; revision:number };
const EMPTY: State = {user:undefined,profile:null,saved:null,connection:null,view:null,error:null,loading:true,revision:0};
let state=EMPTY, epoch=0, connectionRevision=0;
let observing=false, observerReady:Promise<void>|null=null;
const listeners=new Set<()=>void>();
const emit=(patch:Partial<State>)=>{state={...state,...patch};listeners.forEach(cb=>cb());};
const subscribe=(cb:()=>void)=>{listeners.add(cb);return()=>listeners.delete(cb);};
const writeQueues=new Map<string,Promise<unknown>>();
const relationLabels={mother:'어머니',father:'아버지',parents:'부모님',other:'기타'} as const;
export function defaultPreferences():Preferences {
  return {schemaVersion:1,onboardingStep:1,phone:'',relationLabel:'',windows:DEFAULT_WINDOWS.map(w=>({...w})),eatOutPerWeek:0,usesKeepWarm:true,cooksPerWeek:7,
    missedMealsThreshold:ALERT_DEFAULTS.MISSED_MEALS_THRESHOLD,fastingHours:ALERT_DEFAULTS.FASTING_HOURS,emergencyHours:ALERT_DEFAULTS.EMERGENCY_HOURS,preparationAcknowledged:false};
}
function connectionPlug(connection: SmartThingsConnection | null, consent: boolean, at: number): AppView["plug"] {
  const empty = {deviceId: "", online: false, lastReadingAt: null};
  if (!consent) return empty;
  if (!connection) return {...empty, status: "checking"};
  if (connection.stage === "read_error") return {...empty, status: "read_error"};
  if (connection.stage !== "connected" || !connection.device?.id.trim()) return empty;
  const received = connection.lastReceivedAt;
  if (typeof received !== "number" || !Number.isFinite(received) || received <= 0 || received > at) {
    return {...empty, deviceId: connection.device.id};
  }
  return {
    deviceId: connection.device.id,
    online: at - received < ALERT_DEFAULTS.DEVICE_OFFLINE_HOURS * 60 * 60 * 1000,
    lastReadingAt: new Date(received).toISOString(),
  };
}
export function firebaseView(saved:SavedPreferences,connection:SmartThingsConnection|null=null,at=Date.now()):AppView {
  const p=saved.settings??defaultPreferences(),h=saved.household;
  return {mode:'live',dataSource:'firebase',careAvailable:false,onboardingStep:h?p.onboardingStep:Math.min(p.onboardingStep,3),
    senior:{name:h?.alias??'',relation:h?.relation==='other'&&p.relationLabel?p.relationLabel:relationLabels[h?.relation??'mother'],phone:p.phone},household:{residentCount:h?.residentCount??1,hasPet:h?.hasPet??false},
    mealProfile:{windows:p.windows,eatOutPerWeek:p.eatOutPerWeek,usesKeepWarm:p.usesKeepWarm,cooksPerWeek:p.cooksPerWeek},
    alertSettings:{missedMealsThreshold:p.missedMealsThreshold,fastingHours:p.fastingHours,emergencyHours:p.emergencyHours},seniorConsent:p.preparationAcknowledged,
    plug:connectionPlug(connection,p.preparationAcknowledged,at),pairingCode:null,seniorPaired:false,slots:[],stats:{},lastCookerAt:null,lastActivityAt:null,absences:[],alerts:[]};
}
export function updateFirebaseConnection(uid:string,connection:SmartThingsConnection) {
  if(state.user?.uid!==uid||!state.user.verified||!state.saved||!state.profile)return;
  ++connectionRevision;
  emit({connection,view:firebaseView(state.saved,connection)});
}
async function refreshFirebaseConnection(uid:string,at:number) {
  const revision=connectionRevision;
  try {
    if(epoch!==at||state.user?.uid!==uid)return;
    const connection=await within(readSmartThingsConnection(uid));
    if(epoch===at&&connectionRevision===revision)updateFirebaseConnection(uid,connection);
  } catch {
    if (epoch === at && connectionRevision === revision) updateFirebaseConnection(uid, {stage:'read_error'});
  }
}
async function observeUser(user:FirebaseUser|null) {
  if(state.user!==undefined&&state.user?.uid!==user?.uid)resetSeniorStepsConsent();
  const at=++epoch;emit({...EMPTY,user,loading:!!user?.verified,revision:at});
  if(!user?.verified)return;
  try {
    const provider=await within(connectFirebase());
    const [profile,saved]=await within(Promise.all([provider.getAppProfile(user.uid),provider.getAppPreferences(user.uid)]));
    if(epoch!==at)return;
    const ready=profile?.ownerUid===user.uid&&profile.consentVersion===ACCOUNT_CONSENT_VERSION;
    emit({profile:ready?profile:null,saved,view:ready?firebaseView(saved):null,loading:false,error:null});
    if(ready)void refreshFirebaseConnection(user.uid,at);
  } catch(error) { if(epoch===at)emit({error:accountError(error),loading:false}); }
}
async function ensureFirebaseObserver(){
  if(observing)return;
  if(!observerReady)observerReady=within(connectFirebase()).then(provider=>{
    provider.onUser(user=>{void observeUser(user);});observing=true;
  }).catch(error=>{emit({loading:false,error:accountError(error)});throw error;}).finally(()=>{observerReady=null;});
  return observerReady;
}
export async function refreshFirebaseAccount() {
  await ensureFirebaseObserver();
  const p=await within(connectFirebase());
  const at=epoch,user=await within(p.refreshUser());
  if(epoch===at)await observeUser(user);
}
export function useFirebaseAccount(enabled=true) {
  const snapshot=useSyncExternalStore(subscribe,()=>state,()=>EMPTY);
  useEffect(()=>{
    if(enabled)void ensureFirebaseObserver().catch(()=>{});
  },[enabled]);
  return snapshot;
}
export async function signOutFirebase() {
  const p=await within(connectFirebase());
  // Clear household and forms before awaiting the network or observer callback.
  resetSeniorStepsConsent();++epoch;emit({...EMPTY,user:null,loading:false,revision:epoch});
  await within(p.signOut());
}
export function preferencesPatch(saved:SavedPreferences,step:number,patch:OnboardingPatch):{settings:Preferences;household:Household|null} {
  assertOnboardingConsent({onboardingStep:saved.settings?.onboardingStep??1,seniorConsent:saved.settings?.preparationAcknowledged??false},step,patch);
  const settings={...(saved.settings??defaultPreferences()),onboardingStep:saved.settings?.onboardingStep===8?8:step};
  if(patch.senior){settings.phone=patch.senior.phone;settings.relationLabel=Object.values(relationLabels).includes(patch.senior.relation as typeof relationLabels[keyof typeof relationLabels])?'':patch.senior.relation.trim();}
  if(patch.mealProfile)Object.assign(settings,{windows:patch.mealProfile.windows,eatOutPerWeek:patch.mealProfile.eatOutPerWeek,usesKeepWarm:patch.mealProfile.usesKeepWarm,cooksPerWeek:patch.mealProfile.cooksPerWeek});
  if(patch.alertSettings)Object.assign(settings,patch.alertSettings);
  if(patch.seniorConsent!==undefined)settings.preparationAcknowledged=patch.seniorConsent;
  let household:Household|null=null;
  if(patch.senior||patch.household){
    const old=saved.household??{relation:'mother',alias:'',residentCount:1,hasPet:false};
    const relation=patch.senior?Object.entries(relationLabels).find(([,label])=>label===patch.senior!.relation)?.[0] as Household['relation']|undefined:undefined;
    household={relation:patch.senior?relation??'other':old.relation,alias:patch.senior?.name??old.alias,residentCount:patch.household?.residentCount??old.residentCount,hasPet:patch.household?.hasPet??old.hasPet};
  }
  return {settings,household};
}
function save(step:number,patch:OnboardingPatch={}) {
  const at=epoch,uid=state.user?.uid;let expired=false;
  const current=()=>{if(expired)throw Object.assign(new Error('요청 시간이 지났어요. 다시 저장해 주세요.'),{code:'app/timeout'});if(!uid||at!==epoch||state.user?.uid!==uid||!state.user.verified||!state.profile||!state.saved)throw Object.assign(new Error('계정이 바뀌었어요.'),{code:'auth/user-changed'});};
  const previous=uid?writeQueues.get(uid)??Promise.resolve():Promise.resolve();
  const work=previous.then(async()=>{
    current();const provider=await connectFirebase();current();
    const input=preferencesPatch(state.saved!,step,patch);
    try {
      const saved=await provider.saveAppPreferences(input.settings,input.household,uid!,state.saved!.revision??{settings:null,household:null});current();
      emit({saved,view:firebaseView(saved,state.connection),error:null});
    }catch(error){
      if(typeof error==='object'&&error&&'code' in error&&error.code==='preferences/conflict'){
        const saved=await provider.getAppPreferences(uid!);current();emit({saved,view:firebaseView(saved,state.connection)});
      }
      throw error;
    }
  });
  // A timeout does not cancel a submitted Firestore write. Keep later writes
  // behind its actual settlement, and never apply a result to another session.
  const queue=work.catch(()=>{});
  if(uid){writeQueues.set(uid,queue);void queue.finally(()=>{if(writeQueues.get(uid)===queue)writeQueues.delete(uid);});}
  return within(work).catch(error=>{expired=true;throw new Error(accountError(error));});
}
const unavailable=async()=>{throw new Error('실제 가족과 기기를 연결한 뒤 사용할 수 있어요. 지금은 연결 안내를 확인해 주세요.');};
export const firebaseActions:AppActions={
  saveOnboarding:save,
  registerPlug:unavailable,skipPlug:async()=>{},issuePairingCode:unavailable,ackAlert:unavailable,ackAll:unavailable,
  saveAlertSettings:settings=>save(state.view?.onboardingStep??1,{alertSettings:settings}),
  saveWindows:windows=>save(state.view?.onboardingStep??1,{mealProfile:{...state.view!.mealProfile,windows}}),
  saveSenior:senior=>save(state.view?.onboardingStep??1,{senior:{...state.view!.senior,...senior}}),
  addAbsence:unavailable,removeAbsence:unavailable,
};
