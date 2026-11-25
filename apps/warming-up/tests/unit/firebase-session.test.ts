import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountProfile, FirebaseProvider, FirebaseUser, Household, Preferences, SavedPreferences } from '@/lib/firebase/bridge';

const bridgeMock=vi.hoisted(()=>({connect:vi.fn(),smartThings:vi.fn(),cancelPending:vi.fn(),resetSteps:vi.fn()}));
vi.mock('@/lib/steps/consent',()=>({resetSeniorStepsConsent:bridgeMock.resetSteps}));
vi.mock('@/lib/firebase/smartthings',async original=>({
  ...await original<typeof import('@/lib/firebase/smartthings')>(),
  readSmartThingsConnection:bridgeMock.smartThings,cancelPendingSmartThings:bridgeMock.cancelPending,
}));
vi.mock('@/lib/firebase/bridge',async original=>({
  ...await original<typeof import('@/lib/firebase/bridge')>(),
  connectFirebase:bridgeMock.connect,
}));
// Exercise the production singleton store without a DOM or new production
// exports. Effects mount its real observer; snapshots use its real read path.
vi.mock('react',()=>({
  useEffect:(effect:()=>void)=>effect(),
  useSyncExternalStore:(_subscribe:unknown,read:()=>unknown)=>read(),
}));

function deferred<T>() {
  let resolve!:(value:T)=>void;
  let reject!:(reason:unknown)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
const observe=<T>(promise:Promise<T>)=>promise.then(value=>({ok:true as const,value}),error=>({ok:false as const,error:error as Error}));
const flush=async()=>{for(let count=0;count<20;count++)await Promise.resolve();};

async function fixture() {
  const store=await import('@/lib/data/firebase');
  const user=(uid:string):FirebaseUser=>({uid,email:`${uid.toLowerCase()}@example.test`,displayName:`가상 ${uid}`,verified:true});
  const profile=(uid:string):AccountProfile=>({ownerUid:uid,displayName:`가상 ${uid}`,consentVersion:'2026-10-16'});
  const saved=(uid:string,name=`${uid}의 가상 가족`,step=3):SavedPreferences=>({
    settings:{...store.defaultPreferences(),preparationAcknowledged:true,onboardingStep:step},
    household:{relation:'mother',alias:name,residentCount:1,hasPet:false},
    revision:{settings:'1:0',household:'1:0'},
  });
  const server=new Map<string,SavedPreferences>([['A',saved('A')],['B',saved('B')]]);
  const callbacks=new Set<(user:FirebaseUser|null)=>void>();
  let sdkUser:FirebaseUser|null=null,revision=1;
  const persist=(input:Preferences,household:Household|null,uid:string):SavedPreferences=>{
    const current=server.get(uid)??saved(uid);
    const next={settings:input,household:household??current.household,revision:{settings:`${++revision}:0`,household:household?`${revision}:0`:current.revision?.household??null}};
    server.set(uid,next);return next;
  };
  const provider={
    name:'Firebase' as const,
    studio:{allowed:vi.fn(async()=>false),recordSignIn:vi.fn(async()=>{}),watch:vi.fn(),overview:vi.fn(),page:vi.fn(),detail:vi.fn(),save:vi.fn()},
    onUser:vi.fn((callback:(user:FirebaseUser|null)=>void)=>{callbacks.add(callback);return()=>{callbacks.delete(callback);};}),
    getAppProfile:vi.fn(async(uid:string)=>profile(uid)),
    getAppPreferences:vi.fn(async(uid:string)=>server.get(uid)??saved(uid)),
    saveAppPreferences:vi.fn<FirebaseProvider['saveAppPreferences']>(async(input,household,uid)=>persist(input,household,uid)),
    refreshUser:vi.fn(async()=>sdkUser),
    getIdToken:vi.fn(async(uid:string)=>{if(sdkUser?.uid!==uid)throw new Error('계정이 변경됐어요.');return 'synthetic-test-token';}),
    signOut:vi.fn(async()=>{}),
    signIn:vi.fn(async()=>user('A')),signUp:vi.fn(async()=>user('A')),google:vi.fn(async()=>user('A')),
    resetPassword:vi.fn(async()=>{}),resendVerification:vi.fn(async()=>{}),saveProfile:vi.fn(async()=>{}),
  } satisfies FirebaseProvider;
  bridgeMock.connect.mockResolvedValue(provider);
  return {
    store,provider,server,user,saved,persist,
    snapshot:()=>store.useFirebaseAccount(false),
    mount:async()=>{store.useFirebaseAccount();await flush();},
    emit:async(next:FirebaseUser|null)=>{sdkUser=next;for(const callback of callbacks)callback(next);await flush();},
  };
}

beforeEach(()=>{
  vi.resetModules();bridgeMock.connect.mockReset();bridgeMock.smartThings.mockReset().mockRejectedValue(new Error('No network in unit tests'));vi.useFakeTimers();
  bridgeMock.cancelPending.mockReset().mockResolvedValue(undefined);
});
afterEach(()=>{
  vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();
});

// Synthetic promises and Auth callbacks, with the production 12s timeout.
// These tests do not claim browser, emulator, network or live account evidence.
describe('Firebase account store asynchronous session isolation',()=>{
  it('refreshes dated cooking on visible focus and rejects the previous owner’s in-flight history after an account change',async()=>{
    const browser=Object.assign(new EventTarget(),{setInterval,clearInterval});
    vi.stubGlobal('window',browser);
    vi.stubGlobal('document',Object.assign(new EventTarget(),{visibilityState:'visible'}));
    vi.setSystemTime(new Date('2026-11-26T20:00:00+09:00'));
    const f=await fixture();
    const spring={stage:'connected',device:{id:'owner-plug',label:'시험',isVirtual:false},powerNotice:{enabled:true,lastObservedAt:null}};
    bridgeMock.smartThings.mockResolvedValue(spring);
    await f.mount(); await f.emit(f.user('A'));
    const report={...spring,mealRecords:{days:[{date:'2026-11-25',cook:1,confirmed:['dinner'],
      windows:[{slot:'dinner',start:'18:00',end:'21:00'}]}]}};
    bridgeMock.smartThings.mockResolvedValueOnce(report);
    browser.dispatchEvent(new Event('focus')); await flush();
    expect(f.snapshot().view?.slots).toEqual([{date:'2026-11-25',slot:'dinner',status:'confirmed',source:'cooker'}]);
    const old=deferred<typeof report>(); bridgeMock.smartThings.mockReturnValueOnce(old.promise);
    browser.dispatchEvent(new Event('focus')); await flush();
    await f.emit(f.user('B')); old.resolve(report); await flush();
    expect(f.snapshot().view?.slots).toEqual([]);
    expect(f.snapshot().view?.stats).toEqual({});
  });
  it('uses a due physical plug only once across visible views and shows the Samsung time without inventing a webhook or a meal',async()=>{
    const doc=Object.assign(new EventTarget(),{visibilityState:'visible'});
    vi.stubGlobal('document',doc);
    vi.stubGlobal('window',Object.assign(new EventTarget(),{setInterval,clearInterval}));
    const at=Date.now(), interval=600000;
    let nextAt=at+interval, observed:number|null=null;
    bridgeMock.smartThings.mockImplementation(async (_uid, _signal, deviceId) => {
      if (deviceId) { observed=Date.now()-180000; nextAt=Date.now()+interval; }
      return {stage:'connected',device:{id:'p',label:'테스트 플러그',isVirtual:false},
        powerNotice:{enabled:true,lastObservedAt:observed},powerChecks:{nextAt,checkedAt:observed && Date.now(),measuredAt:observed}};
    });
    const f=await fixture(); await f.mount(); await f.mount(); await f.emit(f.user('A'));
    const meterCalls=()=>bridgeMock.smartThings.mock.calls.filter(call=>call[2] === 'p').length;
    await vi.advanceTimersByTimeAsync(interval-1); expect(meterCalls()).toBe(0);
    await vi.advanceTimersByTimeAsync(1); expect(meterCalls()).toBe(1);
    const view=f.snapshot().view!;
    expect(view.plug).toMatchObject({online:true,lastReadingAt:null,powerNoticeAt:new Date(at+420000).toISOString()});
    expect(view.slots).toEqual([]); expect(view.lastActivityAt).toBeNull();
    doc.visibilityState='hidden'; await vi.advanceTimersByTimeAsync(2*interval); expect(meterCalls()).toBe(1);
    await f.emit(null); doc.visibilityState='visible'; await vi.advanceTimersByTimeAsync(interval); expect(meterCalls()).toBe(1);
  });
  it('clears operator navigation immediately on account changes',async()=>{
    const f=await fixture();await f.mount();f.provider.studio.allowed.mockResolvedValueOnce(true);
    await f.emit(f.user('A'));expect(f.snapshot().operator).toBe(true);
    await f.emit(f.user('B'));expect(f.snapshot().operator).toBe(false);
  });
  it('reads back the canonical name after a scoped write and discards a result from a previous session',async()=>{
    const f=await fixture();await f.mount();await f.emit(f.user('A'));
    const rev=f.snapshot().revision;
    f.provider.getAppProfile.mockResolvedValueOnce({...f.snapshot().profile!, displayName:'새 이름'});
    await f.store.renameFirebaseProfile('새 이름','A',rev,'old-version');
    expect(f.provider.saveProfile).toHaveBeenCalledWith('새 이름','A','old-version');
    expect(f.snapshot().profile?.displayName).toBe('새 이름');

    const delayed=deferred<void>();
    f.provider.saveProfile.mockReturnValueOnce(delayed.promise);
    const result=observe(f.store.renameFirebaseProfile('이전 계정','A',rev,'next-version'));await flush();
    await f.emit(f.user('B'));delayed.resolve();await flush();
    expect(await result).toMatchObject({ok:false});
    expect(f.snapshot().profile?.ownerUid).toBe('B');
    expect(f.snapshot().profile?.displayName).not.toBe('이전 계정');
  });
  it('shares one refresh across open views and does not read while hidden or signed out',async()=>{
    const doc=Object.assign(new EventTarget(),{visibilityState:'visible'});
    const browser=Object.assign(new EventTarget(),{setInterval:vi.fn(windowlessTimer),clearInterval});
    function windowlessTimer(fn:()=>void,ms:number){return setInterval(fn,ms);}
    vi.stubGlobal('window',browser);vi.stubGlobal('document',doc);
    const now=Date.now();
    const connected={stage:'connected',device:{id:'p',label:'우리 기기',isVirtual:false}};
    bridgeMock.smartThings.mockResolvedValue(connected);
    const f=await fixture();await f.mount();await f.mount();await f.emit(f.user('A'));
    expect(browser.setInterval).toHaveBeenCalledTimes(1);
    expect(bridgeMock.smartThings).toHaveBeenCalledTimes(1);
    doc.visibilityState='hidden';await vi.advanceTimersByTimeAsync(60000);
    expect(bridgeMock.smartThings).toHaveBeenCalledTimes(1);
    doc.visibilityState='visible';
    bridgeMock.smartThings.mockResolvedValue({...connected,lastReceivedAt:now,lastEventAt:now,powerNotice:{enabled:true,lastObservedAt:now}});
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.snapshot().view?.plug.powerNoticeAt).toBe(new Date(now).toISOString());
    expect(f.snapshot().view?.slots).toEqual([]);
    await f.emit(null);await vi.advanceTimersByTimeAsync(60000);
    expect(bridgeMock.smartThings).toHaveBeenCalledTimes(2);
  });
  it('a failed status read keeps account settings and never introduces device or meal data',async()=>{
    const f=await fixture();await f.mount();await f.emit(f.user('A'));
    expect(f.snapshot().view).toMatchObject({mode:'live',dataSource:'firebase',
      plug:{status:'read_error',deviceId:'',online:false,lastReadingAt:null},slots:[],stats:{},alerts:[]});
    expect(f.snapshot().error).toBeNull();
  });
  it('an unconfigured integration preserves the profile and shows setup rather than a verified empty connection',async()=>{
    bridgeMock.smartThings.mockResolvedValue({stage:'setup_required'});
    const f=await fixture();await f.mount();await f.emit(f.user('A'));
    expect(f.snapshot()).toMatchObject({error:null,loading:false,profile:{ownerUid:'A'},
      view:{senior:{name:'A의 가상 가족'},plug:{status:'setup_required',deviceId:'',lastReadingAt:null}}});
  });
  it('a stalled status read changes from checking to failure without substituting a sample',async()=>{
    bridgeMock.smartThings.mockReturnValue(new Promise(()=>{}));
    const f=await fixture();await f.mount();await f.emit(f.user('A'));
    expect(f.snapshot().view?.plug.status).toBe('checking');
    await vi.advanceTimersByTimeAsync(12_001);
    expect(f.snapshot().view?.plug).toEqual({deviceId:'',online:false,lastReadingAt:null,status:'read_error'});
  });

  it('a delayed initial status cannot overwrite a newer explicit connection change',async()=>{
    const pending=deferred<{stage:'connected';device:{id:string;label:string}}>();
    bridgeMock.smartThings.mockReturnValue(pending.promise);
    const f=await fixture();await f.mount();await f.emit(f.user('A'));
    f.store.updateFirebaseConnection('A',{stage:'disconnected'},f.snapshot().revision);
    pending.resolve({stage:'connected',device:{id:'old-plug',label:'이전 가상 기기'}});await flush();
    expect(f.snapshot().connection?.stage).toBe('disconnected');expect(f.snapshot().view?.plug.deviceId).toBe('');
    await f.emit(f.user('B'));
    f.store.updateFirebaseConnection('A',{stage:'connected',device:{id:'wrong-owner',label:'다른 계정'}},f.snapshot().revision);
    expect(f.snapshot().view?.plug.deviceId).not.toBe('wrong-owner');
  });
  it('rejects an unconsented household save before contacting the write provider',async()=>{
    const f=await fixture();
    const old=f.server.get('A')!;
    f.server.set('A',{...old,settings:{...old.settings!,preparationAcknowledged:false}});
    await f.mount();await f.emit(f.user('A'));
    expect(bridgeMock.smartThings).not.toHaveBeenCalled();
    await expect(f.store.firebaseActions.saveOnboarding(4,{senior:{name:'가상 이름',relation:'어머니',phone:''}})).rejects.toThrow('동의를 확인');
    expect(f.provider.saveAppPreferences).not.toHaveBeenCalled();
    expect(f.snapshot().view?.senior.name).toBe('A의 가상 가족');
  });
  it('erases selected device data immediately on withdrawal and rejects responses from the older grant after re-consent',async()=>{
    const f=await fixture();await f.mount();await f.emit(f.user('A'));
    const before=f.snapshot().revision;
    const sample={stage:'connected' as const,device:{id:'unit',label:'가상',isVirtual:true},lastReceivedAt:Date.now(),reading:{watts:850,measuredAt:Date.now()}};
    f.store.updateFirebaseConnection('A',sample,before);
    expect(f.snapshot().connection).not.toHaveProperty('reading');
    expect(f.snapshot().view?.plug.isVirtual).toBe(true);
    const pending=deferred<SavedPreferences>();
    f.provider.saveAppPreferences.mockReturnValueOnce(pending.promise);
    const withdrawal=f.store.firebaseActions.saveOnboarding(3,{seniorConsent:false});await flush();
    expect(f.snapshot().connection).toBeNull();
    expect(bridgeMock.cancelPending).toHaveBeenCalledWith('A');
    expect(f.store.canReadConnection('A',f.snapshot().revision)).toBe(false);
    expect(f.store.isFirebaseSessionCurrent('A',f.snapshot().revision)).toBe(true);
    f.store.updateFirebaseConnection('A',sample,before);
    expect(f.snapshot().connection).toBeNull();
    const [settings,household,uid]=f.provider.saveAppPreferences.mock.calls[0];
    pending.resolve(f.persist(settings,household,uid));await withdrawal;
    expect(f.snapshot().view?.plug).toEqual({status:'consent_required',deviceId:'',online:false,lastReadingAt:null});

    const nextStatus=deferred<{stage:'disconnected'}>();
    bridgeMock.smartThings.mockReturnValueOnce(nextStatus.promise);
    await f.store.firebaseActions.saveOnboarding(3,{seniorConsent:true});
    f.store.updateFirebaseConnection('A',sample,before);
    expect(f.snapshot().connection).toBeNull();
    nextStatus.resolve({stage:'disconnected'});await flush();
    expect(f.snapshot().connection).toEqual({stage:'disconnected'});
    expect(bridgeMock.smartThings).toHaveBeenCalledTimes(2);
  });
  it('rejects late manual results for an earlier session even if the same account signs in again',async()=>{
    const f=await fixture();await f.mount();await f.emit(f.user('A'));const revision=f.snapshot().revision;
    await f.emit(f.user('B'));await f.emit(f.user('A'));
    f.store.updateFirebaseConnection('A',{stage:'connected',device:{id:'stale',label:'old'}},revision);
    expect(f.snapshot().view?.plug.deviceId).toBe('');
    expect(f.store.isFirebaseSessionCurrent('A',revision)).toBe(false);
    expect(bridgeMock.cancelPending.mock.calls).toEqual([['A'],['B']]);
  });
  it('withdrawal in another tab clears a selected device before reading the saved consent again',async()=>{
    const browser=new EventTarget(),doc=Object.assign(new EventTarget(),{visibilityState:'visible'});
    vi.stubGlobal('window',browser);vi.stubGlobal('document',doc);
    const f=await fixture();await f.mount();await f.emit(f.user('A'));
    const revision=f.snapshot().revision;
    f.store.updateFirebaseConnection('A',{stage:'connected',device:{id:'test-device',label:'시험 기기'},lastReceivedAt:Date.now()},revision);
    const pending=deferred<SavedPreferences>();f.provider.getAppPreferences.mockReturnValueOnce(pending.promise);
    browser.dispatchEvent(Object.assign(new Event('storage'),{key:'warming-up:consent-changed',newValue:'1'}));
    expect(f.snapshot().view?.plug.deviceId).toBe('');
    expect(f.store.canReadConnection('A',f.snapshot().revision)).toBe(false);
    const old=f.server.get('A')!;pending.resolve({...old,settings:{...old.settings!,preparationAcknowledged:false}});await flush();
    expect(f.snapshot().view?.plug.status).toBe('consent_required');
    expect(bridgeMock.cancelPending).toHaveBeenCalledWith('A');
    expect(f.snapshot().user?.uid).toBe('A');
    expect(bridgeMock.smartThings).toHaveBeenCalledTimes(1);
  });
  it('on return to the app, an unavailable consent read drops prior device data until verified again',async()=>{
    const doc=Object.assign(new EventTarget(),{visibilityState:'visible'});
    vi.stubGlobal('window',new EventTarget());vi.stubGlobal('document',doc);
    const f=await fixture();await f.mount();await f.emit(f.user('A'));
    f.store.updateFirebaseConnection('A',{stage:'connected',device:{id:'old',label:'가상'}},f.snapshot().revision);
    f.provider.getAppPreferences.mockRejectedValueOnce(new Error('offline'));
    doc.dispatchEvent(new Event('visibilitychange'));await flush();
    expect(f.snapshot().view?.plug).toMatchObject({status:'read_error',deviceId:'',lastReadingAt:null});
    expect(f.store.canReadConnection('A',f.snapshot().revision)).toBe(false);
    expect(f.snapshot().profile?.ownerUid).toBe('A');
    bridgeMock.smartThings.mockResolvedValueOnce({stage:'disconnected'});
    doc.dispatchEvent(new Event('visibilitychange'));await flush();
    expect(f.store.canReadConnection('A',f.snapshot().revision)).toBe(true);
    expect(f.snapshot().view?.plug.status).toBe('disconnected');
  });

  it('retries a failed first connection and subscribes to auth before refresh completes',async()=>{
    const f=await fixture();
    bridgeMock.connect.mockRejectedValueOnce(Object.assign(new Error('synthetic connection failure'),{code:'unavailable'}));
    await f.mount();
    expect(f.provider.onUser).not.toHaveBeenCalled();
    expect(f.snapshot()).toMatchObject({loading:false,view:null,error:expect.any(String)});
    f.provider.refreshUser.mockResolvedValue(f.user('A'));
    await f.store.refreshFirebaseAccount();await flush();
    expect(f.provider.onUser).toHaveBeenCalledTimes(1);
    expect(f.snapshot().user?.uid).toBe('A');
    expect(f.snapshot().view?.senior.name).toBe('A의 가상 가족');
    await f.emit(null);
    expect(f.snapshot()).toMatchObject({user:null,profile:null,saved:null,view:null,loading:false});
  });

  it('an unresolved timed-out A write cannot block B saving its own settings',async()=>{
    const f=await fixture();await f.mount();await f.emit(f.user('A'));
    const pendingA=deferred<SavedPreferences>();
    f.provider.saveAppPreferences.mockImplementation((input,household,uid)=>uid==='A'?pendingA.promise:Promise.resolve(f.persist(input,household,uid)));
    const aWrite=observe(f.store.firebaseActions.saveOnboarding(4));await flush();
    expect(f.provider.saveAppPreferences.mock.calls.map(call=>call[2])).toEqual(['A']);
    await vi.advanceTimersByTimeAsync(12_001);
    expect(await aWrite).toMatchObject({ok:false,error:expect.objectContaining({message:expect.stringContaining('연결이 늦어지고')})});
    await f.emit(f.user('B'));
    const bWrite=observe(f.store.firebaseActions.saveOnboarding(5));await flush();
    expect(f.provider.saveAppPreferences.mock.calls.map(call=>call[2])).toEqual(['A','B']);
    expect(await bWrite).toMatchObject({ok:true});
    expect(f.snapshot().user?.uid).toBe('B');expect(f.snapshot().view?.onboardingStep).toBe(5);
    pendingA.resolve(f.saved('A','뒤늦은 A 저장',4));await flush();
    expect(f.snapshot().user?.uid).toBe('B');expect(f.snapshot().view?.senior.name).toBe('B의 가상 가족');
    expect(f.snapshot().view?.onboardingStep).toBe(5);
  });

  it('a queued save whose deadline passed never starts after the previous request settles',async()=>{
    const f=await fixture();await f.mount();await f.emit(f.user('A'));
    const firstPending=deferred<SavedPreferences>();f.provider.saveAppPreferences.mockReturnValueOnce(firstPending.promise);
    const first=observe(f.store.firebaseActions.saveOnboarding(4));
    const queued=observe(f.store.firebaseActions.saveOnboarding(5));await flush();
    expect(f.provider.saveAppPreferences).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(12_001);
    expect(await first).toMatchObject({ok:false});expect(await queued).toMatchObject({ok:false});
    firstPending.resolve(f.saved('A','기한이 지난 첫 저장',4));await flush();
    expect(f.provider.saveAppPreferences).toHaveBeenCalledTimes(1);
    expect(f.snapshot().view?.onboardingStep).toBe(3);expect(f.snapshot().view?.senior.name).toBe('A의 가상 가족');
    // The expired queue must also release after actual settlement, so a new
    // explicit request can run instead of inheriting the cancelled draft.
    const fresh=observe(f.store.firebaseActions.saveOnboarding(6));await flush();
    expect(await fresh).toMatchObject({ok:true});
    expect(f.provider.saveAppPreferences.mock.calls.map(call=>call[0].onboardingStep)).toEqual([4,6]);
  });

  it('blocks the first A read after A→B→A even when the uid matches again',async()=>{
    const f=await fixture(),firstA=deferred<SavedPreferences>();
    f.provider.getAppPreferences.mockImplementationOnce(()=>firstA.promise);
    await f.mount();await f.emit(f.user('A'));
    expect(f.snapshot()).toMatchObject({loading:true,view:null});
    await f.emit(f.user('B'));expect(f.snapshot().view?.senior.name).toBe('B의 가상 가족');
    f.server.set('A',f.saved('A','다시 로그인한 A의 최신 가족',8));
    await f.emit(f.user('A'));
    expect(f.snapshot().view?.senior.name).toBe('다시 로그인한 A의 최신 가족');
    firstA.resolve(f.saved('A','이전 세션 A의 오래된 가족',3));await flush();
    expect(f.snapshot().user?.uid).toBe('A');
    expect(f.snapshot().view?.senior.name).toBe('다시 로그인한 A의 최신 가족');expect(f.snapshot().view?.onboardingStep).toBe(8);
  });

  it('blocks an old A write result after A→B→A without applying success to the new A session',async()=>{
    const f=await fixture();await f.mount();await f.emit(f.user('A'));
    const oldWrite=deferred<SavedPreferences>();f.provider.saveAppPreferences.mockReturnValueOnce(oldWrite.promise);
    const saving=observe(f.store.firebaseActions.saveOnboarding(4));await flush();
    await f.emit(f.user('B'));
    f.server.set('A',f.saved('A','새 A 세션에서 읽은 가족',8));await f.emit(f.user('A'));
    oldWrite.resolve(f.saved('A','이전 A 세션의 저장 응답',4));await flush();
    expect(await saving).toMatchObject({ok:false,error:expect.objectContaining({message:expect.stringContaining('계정이 바뀌었어요')})});
    expect(f.snapshot().user?.uid).toBe('A');expect(f.snapshot().view?.senior.name).toBe('새 A 세션에서 읽은 가족');
    expect(f.snapshot().view?.onboardingStep).toBe(8);
  });

  it('does not turn a timed-out write into late success in the same session',async()=>{
    const f=await fixture();await f.mount();await f.emit(f.user('A'));
    const pending=deferred<SavedPreferences>();f.provider.saveAppPreferences.mockReturnValueOnce(pending.promise);
    const saving=observe(f.store.firebaseActions.saveOnboarding(4));await flush();
    await vi.advanceTimersByTimeAsync(12_001);expect(await saving).toMatchObject({ok:false});
    const before=f.snapshot();pending.resolve(f.saved('A','시간 초과 뒤의 응답',4));await flush();
    expect(f.snapshot()).toBe(before);expect(f.snapshot().view?.onboardingStep).toBe(3);
  });

  it('does not apply a conflict-recovery read after the original A session has changed',async()=>{
    const f=await fixture();await f.mount();await f.emit(f.user('A'));
    const recovery=deferred<SavedPreferences>();
    f.provider.saveAppPreferences.mockRejectedValueOnce(Object.assign(new Error('stale settings'),{code:'preferences/conflict'}));
    f.provider.getAppPreferences.mockReturnValueOnce(recovery.promise);
    const saving=observe(f.store.firebaseActions.saveOnboarding(4));await flush();
    await f.emit(f.user('B'));f.server.set('A',f.saved('A','재로그인 후 A',8));await f.emit(f.user('A'));
    recovery.resolve(f.saved('A','예전 저장 충돌의 재조회 응답',4));await flush();
    expect(await saving).toMatchObject({ok:false});
    expect(f.snapshot().view?.senior.name).toBe('재로그인 후 A');expect(f.snapshot().view?.onboardingStep).toBe(8);
  });

  it('clears private account state before signout waits for the provider',async()=>{
    const f=await fixture();await f.mount();await f.emit(f.user('A'));
    const pending=deferred<void>();f.provider.signOut.mockReturnValueOnce(pending.promise);
    const signingOut=observe(f.store.signOutFirebase());
    expect(f.snapshot()).toMatchObject({user:null,profile:null,saved:null,view:null,loading:false});
    expect(bridgeMock.cancelPending).toHaveBeenCalledWith('A');
    pending.resolve();expect(await signingOut).toMatchObject({ok:true});
  });
  it('finishes signout when the cancellation server stalls and never signs out a newly selected account',async()=>{
    const f=await fixture();await f.mount();await f.emit(f.user('A'));
    bridgeMock.cancelPending.mockReturnValueOnce(new Promise(()=>{}));
    const first=f.store.signOutFirebase();await vi.advanceTimersByTimeAsync(1201);await first;
    expect(f.provider.signOut).toHaveBeenCalledTimes(1);
    await f.emit(f.user('A'));
    const pending=deferred<void>();bridgeMock.cancelPending.mockReturnValueOnce(pending.promise);
    const second=f.store.signOutFirebase();await f.emit(f.user('B'));pending.resolve();await second;
    expect(f.provider.signOut).toHaveBeenCalledTimes(1);expect(f.snapshot().user?.uid).toBe('B');
  });

  it('resaves custom relation and contact fields without copying server-only household metadata',async()=>{
    const f=await fixture();
    const household={relation:'other' as const,alias:'가상 할머니',residentCount:1,hasPet:false,ownerUid:'A',updatedAt:{seconds:10,nanoseconds:20}};
    f.server.set('A',{settings:{...f.store.defaultPreferences(),preparationAcknowledged:true,onboardingStep:8,relationLabel:'할머니'},household,revision:{settings:'12:0',household:'10:20'}});
    await f.mount();await f.emit(f.user('A'));
    expect(f.snapshot().view?.senior.relation).toBe('할머니');
    await f.store.firebaseActions.saveSenior({phone:'010-1234-5678'});
    const [settings,home,uid,revision]=f.provider.saveAppPreferences.mock.calls[0];
    expect(uid).toBe('A');expect(revision).toEqual({settings:'12:0',household:'10:20'});
    expect(settings).toMatchObject({onboardingStep:8,relationLabel:'할머니',phone:'010-1234-5678'});
    expect(home).toEqual({relation:'other',alias:'가상 할머니',residentCount:1,hasPet:false});
    expect(home).not.toHaveProperty('ownerUid');expect(home).not.toHaveProperty('updatedAt');
    expect(f.snapshot().view?.senior.relation).toBe('할머니');
  });
});
