'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { resetSeniorStepsConsent } from '@/lib/steps/consent';
import { ALERT_DEFAULTS } from '@/config/detection';
import { kstDate } from '@/lib/judge/time';
import { accountError, ACCOUNT_CONSENT_VERSION, connectFirebase, within, type AccountProfile, type FirebaseUser, type Household, type Preferences, type SavedPreferences } from '@/lib/firebase/bridge';
import { DEFAULT_WINDOWS, type AppActions, type AppView, type OnboardingPatch } from './view';
import { assertOnboardingConsent } from './consent';
import { cancelPendingSmartThings, readCookerMealRecords, readSmartThingsConnection, type SmartThingsConnection } from '@/lib/firebase/smartthings';

type State = { user: FirebaseUser|null|undefined; profile: AccountProfile|null; saved: SavedPreferences|null; connection:SmartThingsConnection|null; view: AppView|null; error:string|null; loading:boolean; operator:boolean; revision:number };
const EMPTY: State = {user:undefined,profile:null,saved:null,connection:null,view:null,error:null,loading:true,operator:false,revision:0};
let state=EMPTY, epoch=0;
let statusRequest: AbortController | null = null;
let signalObservers = 0, signalTimer: number | null = null, pollableUid: string | null = null;
let pendingWithdrawals = 0;
let consentProbe: symbol | null = null;
let mustConfirmConsent = false;
const CONSENT_CHANGED = 'warming-up:consent-changed';
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
function checkedTimestamp(value: unknown, at: number): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 &&
    value <= at && value <= 8_640_000_000_000_000 ? value : null;
}
function connectionPlug(connection: SmartThingsConnection | null, consent: boolean, at: number): AppView["plug"] {
  const empty = {deviceId: "", online: false, lastReadingAt: null};
  if (!consent) return {...empty, status: "consent_required"};
  if (!connection) return {...empty, status: "checking"};
  if (connection.stage !== "connected") return {...empty, status: connection.stage};
  if (typeof connection.device?.id !== 'string' || !connection.device.id.trim()) return {...empty, status: "read_error"};
  const received = checkedTimestamp(connection.lastReceivedAt, at);
  const event = checkedTimestamp(connection.lastEventAt, at);
  const checked = checkedTimestamp(connection.lastCheckedAt, at);
  const noticeAt = checkedTimestamp(connection.powerNotice?.lastObservedAt, at);
  const polled = checkedTimestamp(connection.powerChecks?.checkedAt, at);
  const measured = checkedTimestamp(connection.powerChecks?.measuredAt, at);
  const pollEvidence = connection.device.isVirtual === false && connection.powerNotice?.enabled &&
    measured !== null && polled !== null && measured <= polled ? measured : null;
  const witnessedAt = Math.max(event && received && event <= received ? event : 0, pollEvidence ?? 0);
  const recentSince = at - ALERT_DEFAULTS.DEVICE_OFFLINE_HOURS * 60 * 60 * 1000;
  return {
    deviceId: connection.device.id,
    status: "connected",
    online: connection.device.isVirtual !== true && witnessedAt > recentSince && witnessedAt > 0,
    lastReadingAt: received === null ? null : new Date(received).toISOString(),
    ...(event !== null && received !== null && event <= received && {lastEventAt: new Date(event).toISOString()}),
    ...(checked !== null && {lastCheckedAt: new Date(checked).toISOString()}),
    ...(pollEvidence !== null && {lastPolledMeasurementAt: new Date(pollEvidence).toISOString()}),
    ...(typeof connection.device.isVirtual === "boolean" && {isVirtual: connection.device.isVirtual}),
    ...(connection.device.isVirtual === false && connection.powerNotice?.enabled && noticeAt !== null &&
      noticeAt <= witnessedAt && at - noticeAt < 86400000 &&
      {powerNoticeAt: new Date(noticeAt).toISOString()}),
  };
}
export function firebaseView(saved:SavedPreferences,connection:SmartThingsConnection|null=null,at=Date.now()):AppView {
  const p=saved.settings??defaultPreferences(),h=saved.household;
  const records = p.preparationAcknowledged && connection?.stage === 'connected' && connection.device?.isVirtual === false &&
    typeof connection.device.id === 'string' && connection.device.id.trim() &&
    connection.powerNotice?.enabled ? readCookerMealRecords(connection.mealRecords, at) : null;
  const plug = connectionPlug(connection,p.preparationAcknowledged,at);
  const observedDate = plug.powerNoticeAt && kstDate(new Date(plug.powerNoticeAt));
  return {mode:'live',dataSource:'firebase',careAvailable:false,onboardingStep:h?p.onboardingStep:Math.min(p.onboardingStep,3),
    senior:{name:h?.alias??'',relation:h?.relation==='other'&&p.relationLabel?p.relationLabel:relationLabels[h?.relation??'mother'],phone:p.phone},household:{residentCount:h?.residentCount??1,hasPet:h?.hasPet??false},
    mealProfile:{windows:p.windows,eatOutPerWeek:p.eatOutPerWeek,usesKeepWarm:p.usesKeepWarm,cooksPerWeek:p.cooksPerWeek},
    alertSettings:{missedMealsThreshold:p.missedMealsThreshold,fastingHours:p.fastingHours,emergencyHours:p.emergencyHours},seniorConsent:p.preparationAcknowledged,
    plug,pairingCode:null,seniorPaired:false,slots:records?.days.flatMap(day => day.confirmed.map(slot => ({
      date:day.date,slot,status:'confirmed' as const,source:'cooker' as const,
    }))) ?? [],
    stats:Object.fromEntries(records?.days.map(day => [day.date,{cook:day.cook,lid:null}]) ?? []),
    ...(records && {cookerMealDays:Object.fromEntries(records.days.map(day => [day.date,day.windows]))}),
    lastCookerAt:observedDate && records?.days.some(day => day.date === observedDate) ? plug.powerNoticeAt! : null,
    lastActivityAt:null,absences:[],alerts:[]};
}
function cancelStatusRequest() {
  statusRequest?.abort();
  statusRequest = null;
}
export function isFirebaseSessionCurrent(uid: string, revision: number): boolean {
  return state.user?.uid === uid && state.user.verified && state.profile?.ownerUid === uid &&
    state.profile.consentVersion === ACCOUNT_CONSENT_VERSION && state.saved !== null && state.revision === revision;
}
export function canReadConnection(uid: string, revision: number): boolean {
  return isFirebaseSessionCurrent(uid, revision) && state.saved?.settings?.preparationAcknowledged === true &&
    pendingWithdrawals === 0 && !mustConfirmConsent;
}
// A status result can also arrive from the connection panel. Keep just summary
// fields here; a manual wattage reading stays in the panel that requested it.
export function updateFirebaseConnection(uid: string, result: SmartThingsConnection, revision: number) {
  if (!canReadConnection(uid, revision) || !state.saved) return;
  cancelStatusRequest();
  let connection: SmartThingsConnection = { stage: result.stage };
  if (result.stage === 'connected' || result.stage === 'subscribing') pollableUid = uid;
  else if (result.stage !== 'read_error') pollableUid = null;
  if (result.stage === 'subscribing' && result.device) connection.device = result.device;
  if (result.stage === 'connected') {
    if (typeof result.device?.id === 'string' && result.device.id.trim()) {
      const now = Date.now();
      const mealRecords = result.device.isVirtual === false && result.powerNotice?.enabled ? readCookerMealRecords(result.mealRecords, now) : null;
      connection = {
        stage: 'connected',
        device: { id: result.device.id, label: result.device.label, ...(typeof result.device.isVirtual === 'boolean' && {isVirtual: result.device.isVirtual}) },
        lastEventAt: checkedTimestamp(result.lastEventAt, now),
        lastReceivedAt: checkedTimestamp(result.lastReceivedAt, now),
        lastCheckedAt: checkedTimestamp(result.lastCheckedAt, now),
        lastSignalAt: checkedTimestamp(result.lastSignalAt, now),
        ...(result.device.isVirtual !== true && result.powerNotice?.enabled && {
          powerNotice: {enabled: true, lastObservedAt: checkedTimestamp(result.powerNotice.lastObservedAt, now)},
        }),
        ...(mealRecords && {mealRecords}),
        ...(result.device.isVirtual === false && result.powerNotice?.enabled && result.powerChecks && {
          powerChecks: {nextAt: result.powerChecks.nextAt, checkedAt: checkedTimestamp(result.powerChecks.checkedAt, now),
            measuredAt: checkedTimestamp(result.powerChecks.measuredAt, now)},
        }),
      };
    } else {
      connection = { stage: 'read_error' };
    }
  }
  emit({connection, view: firebaseView(state.saved, connection)});
}
async function refreshFirebaseConnection(uid: string, revision: number, dueDeviceId?: string) {
  if (!canReadConnection(uid, revision)) return;
  cancelStatusRequest();
  const request = new AbortController();
  statusRequest = request;
  try {
    const connection = await within(readSmartThingsConnection(uid, request.signal, dueDeviceId));
    if (statusRequest === request) updateFirebaseConnection(uid, connection, revision);
  } catch {
    if (statusRequest === request) updateFirebaseConnection(uid, {stage:'read_error'}, revision);
  } finally {
    if (statusRequest === request) cancelStatusRequest();
  }
}
async function observeUser(user:FirebaseUser|null) {
  if(state.user!==undefined&&state.user?.uid!==user?.uid){
    if (state.user?.uid) {
      void cancelPendingSmartThings(state.user.uid).catch(()=>{});
      void retireDeviceNotices(state.user.uid);
    }
    resetSeniorStepsConsent();
  }
  cancelStatusRequest();
  pollableUid = null;
  pendingWithdrawals = 0;
  consentProbe = null;
  mustConfirmConsent = false;
  const at=++epoch;emit({...EMPTY,user,loading:!!user?.verified,revision:state.revision+1});
  if (user) void connectFirebase().then(p=>p.studio.recordSignIn(user.uid)).catch(()=>{});
  if(!user?.verified)return;
  try {
    const provider=await within(connectFirebase());
    const [profile,saved,operator]=await within(Promise.all([provider.getAppProfile(user.uid),provider.getAppPreferences(user.uid),provider.studio.allowed(user.uid).catch(()=>false)]));
    if(epoch!==at)return;
    const ready=profile?.ownerUid===user.uid&&profile.consentVersion===ACCOUNT_CONSENT_VERSION;
    emit({operator,profile:ready?profile:null,saved,view:ready?firebaseView(saved):null,loading:false,error:null});
    if(ready)void refreshFirebaseConnection(user.uid,state.revision);
  } catch(error) { if(epoch===at)emit({error:accountError(error),loading:false}); }
}
async function ensureFirebaseObserver(){
  if(observing)return;
  if(!observerReady)observerReady=within(connectFirebase()).then(provider=>{
    provider.onUser(user=>{void observeUser(user);});
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', event => {
        if (event.key === CONSENT_CHANGED && event.newValue) void recheckSavedConsent(true);
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void recheckSavedConsent(false);
      });
    }
    observing=true;
  }).catch(error=>{emit({loading:false,error:accountError(error)});throw error;}).finally(()=>{observerReady=null;});
  return observerReady;
}
export async function renameFirebaseProfile(name: string, uid: string, revision: number, expectedProfile: string) {
  const check = () => {
    if (!isFirebaseSessionCurrent(uid, revision)) throw Object.assign(new Error('로그인한 계정이 바뀌었어요.'), {code:'auth/user-changed'});
  };
  check();
  const provider = await within(connectFirebase());
  check();
  await within(provider.saveProfile(name, uid, expectedProfile));
  check();
  const profile = await within(provider.getAppProfile(uid));
  check();
  if (!profile || profile.ownerUid !== uid || profile.consentVersion !== ACCOUNT_CONSENT_VERSION) {
    throw new Error('서버에서 저장 결과를 확인하지 못했어요. 다시 조회해 주세요.');
  }
  emit({profile});
  if (profile.displayName !== name.trim()) throw Object.assign(new Error('다른 화면에서 이름이 변경됐어요.'), {code:'profile/conflict'});
}

export async function refreshFirebaseAccount() {
  await ensureFirebaseObserver();
  const p=await within(connectFirebase());
  const at=epoch,user=await within(p.refreshUser());
  if(epoch===at)await observeUser(user);
}
function readVisibleSignal() {
  const uid = state.user?.uid;
  if (document.visibilityState !== 'visible' || !uid || uid !== pollableUid || statusRequest ||
      !canReadConnection(uid, state.revision)) return;
  const connection = state.connection;
  const due = connection?.stage === 'connected' && connection.device?.isVirtual === false &&
    connection.powerChecks && connection.powerChecks.nextAt <= Date.now();
  void refreshFirebaseConnection(uid, state.revision, due ? connection.device?.id : undefined);
}
export function useFirebaseAccount(enabled=true) {
  const snapshot=useSyncExternalStore(subscribe,()=>state,()=>EMPTY);
  useEffect(()=>{
    if (!enabled) return;
    void ensureFirebaseObserver().catch(()=>{});
    if (typeof window === 'undefined' || typeof window.setInterval !== 'function') return;
    // The minute tick refreshes the team summary. Only an opted-in physical
    // plug that is due can also trigger the server's ten-minute Samsung check.
    if (++signalObservers === 1) {
      signalTimer = window.setInterval(readVisibleSignal, 60000);
      window.addEventListener('focus', readVisibleSignal);
      document.addEventListener('visibilitychange', readVisibleSignal);
      readVisibleSignal();
    }
    return () => {
      if (--signalObservers === 0 && signalTimer !== null) {
        window.clearInterval(signalTimer);
        signalTimer = null;
        window.removeEventListener('focus', readVisibleSignal);
        document.removeEventListener('visibilitychange', readVisibleSignal);
      }
    };
  },[enabled]);
  return snapshot;
}
async function retireDeviceNotices(owner: string) {
  if (typeof window === "undefined") return;
  try {
    const {disablePush} = await import("@/lib/push");
    await disablePush(owner);
  } catch {
    // A retired worker can no longer show old-account messages on a shared device.
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const {appPath} = await import("@/lib/app-path");
      await navigator.serviceWorker.getRegistration(appPath("/")).then(worker => worker?.unregister()).catch(() => {});
    }
  }
}

export async function signOutFirebase() {
  const uid = state.user?.uid;
  // Discard private UI state before any provider or network wait. A pending
  // Samsung consent window can be cancelled without unlinking a selected device.
  cancelStatusRequest();pollableUid=null;pendingWithdrawals=0;
  consentProbe=null;mustConfirmConsent=false;
  resetSeniorStepsConsent();const at=++epoch;emit({...EMPTY,user:null,loading:false,revision:state.revision+1});
  if (uid) await Promise.all([within(cancelPendingSmartThings(uid), 1200).catch(()=>{}), retireDeviceNotices(uid)]);
  const p=await within(connectFirebase());
  if (at!==epoch) return;
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
function notifyConsentChanged() {
  // The event only prompts other tabs to read their own verified account.
  // No user, household, consent decision or device is placed in web storage.
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CONSENT_CHANGED, '1');
    window.localStorage.removeItem(CONSENT_CHANGED);
  } catch { /* Returning to the app also checks the saved preference. */ }
}
async function recheckSavedConsent(fromPeer: boolean): Promise<void> {
  const uid = state.user?.uid;
  if (!uid || !state.saved || !isFirebaseSessionCurrent(uid, state.revision)) return;
  if (!fromPeer && !mustConfirmConsent && !state.saved.settings?.preparationAcknowledged) return;
  const at = epoch;
  const probe = Symbol();
  consentProbe = probe;
  if (fromPeer && !mustConfirmConsent) {
    mustConfirmConsent = true;
    cancelStatusRequest();
    emit({connection: null, view: firebaseView(state.saved), revision: state.revision + 1});
  }
  const current = () => epoch === at && consentProbe === probe;
  try {
    const write = writeQueues.get(uid);
    if (write) await within(write);
    if (!current()) return;
    const provider = await within(connectFirebase());
    if (!current()) return;
    const before = state.saved;
    const saved = await within(provider.getAppPreferences(uid));
    if (!current()) return;
    if (state.saved !== before) return recheckSavedConsent(fromPeer);
    if (mustConfirmConsent || before?.settings?.preparationAcknowledged !== saved.settings?.preparationAcknowledged) {
      applySavedPreferences(uid, saved, 'confirmation');
    }
    consentProbe = null;
  } catch {
    if (!current() || !state.saved) return;
    mustConfirmConsent = true;
    cancelStatusRequest();
    const connection: SmartThingsConnection = {stage: 'read_error'};
    emit({connection, view: firebaseView(state.saved,connection), revision: state.revision + 1});
    consentProbe = null;
  }
}
function applySavedPreferences(uid: string, saved: SavedPreferences, source: 'write' | 'conflict' | 'confirmation') {
  const hadConsent = state.saved?.settings?.preparationAcknowledged === true;
  const hasConsent = saved.settings?.preparationAcknowledged === true;
  const changed = hadConsent !== hasConsent;
  const resume = source === 'confirmation' && mustConfirmConsent;
  if (source === 'confirmation') mustConfirmConsent = false;
  if (changed || resume) cancelStatusRequest();
  if (changed && !hasConsent) {
    void retireDeviceNotices(uid);
    if (!pendingWithdrawals) void cancelPendingSmartThings(uid).catch(()=>{});
  }
  const connection = hasConsent && !changed && !mustConfirmConsent && !pendingWithdrawals ? state.connection : null;
  const revision = changed || resume ? state.revision + 1 : state.revision;
  emit({saved, connection, revision, view: firebaseView(saved, connection), error: null});
  if (changed && source === 'write') notifyConsentChanged();
  if ((changed || resume) && hasConsent) void refreshFirebaseConnection(uid, revision);
}
function save(step:number,patch:OnboardingPatch={}) {
  const at=epoch,uid=state.user?.uid;let expired=false;
  const current=()=>{if(expired)throw Object.assign(new Error('요청 시간이 지났어요. 다시 저장해 주세요.'),{code:'app/timeout'});if(!uid||at!==epoch||state.user?.uid!==uid||!state.user.verified||!state.profile||!state.saved)throw Object.assign(new Error('계정이 바뀌었어요.'),{code:'auth/user-changed'});};
  const withdrawing = patch.seniorConsent === false && uid && state.user?.verified && state.saved?.settings?.preparationAcknowledged;
  if (withdrawing && state.saved) {
    // Immediately discard private observations while Firestore confirms the
    // preference. A late response from the panel or a previous grant cannot repopulate them.
    ++pendingWithdrawals;
    cancelStatusRequest();
    emit({connection:null, view:firebaseView(state.saved), revision:state.revision+1});
    void cancelPendingSmartThings(uid!).catch(()=>{});
  }
  const previous=uid?writeQueues.get(uid)??Promise.resolve():Promise.resolve();
  const work=previous.then(async()=>{
    current();const provider=await connectFirebase();current();
    const input=preferencesPatch(state.saved!,step,patch);
    try {
      const saved=await provider.saveAppPreferences(input.settings,input.household,uid!,state.saved!.revision??{settings:null,household:null});current();
      applySavedPreferences(uid!,saved,'write');
    }catch(error){
      if(typeof error==='object'&&error&&'code' in error&&error.code==='preferences/conflict'){
        const saved=await provider.getAppPreferences(uid!);current();applySavedPreferences(uid!,saved,'conflict');
      }
      throw error;
    }
  }).finally(()=>{
    if (!withdrawing || epoch !== at) return;
    --pendingWithdrawals;
    // A failed or timed-out withdrawal has no verified new device status.
    if (canReadConnection(uid!,state.revision)) updateFirebaseConnection(uid!,{stage:'read_error'},state.revision);
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
