import { TEAM_PROJECT_ID, TEAM_GOOGLE_SIGN_IN_ENABLED, TEAM_KAKAO_SIGN_IN_ENABLED } from '@/config/team';
import { teamFirebaseConfig } from '@/firebase/provider/team-config.mjs';
import type { MealWindow } from '@/lib/judge/types';
export const ACCOUNT_CONSENT_VERSION = '2026-10-16';
export type FirebaseUser = { uid: string; email: string; displayName: string; verified: boolean };
export type AccountProfile = { ownerUid: string; displayName: string; consentVersion: string; savedAt?: string | null; revision?: string | null };
export type Household = { relation: 'mother'|'father'|'parents'|'other'; alias: string; residentCount: number; hasPet: boolean };
export type Preferences = {
  schemaVersion: 1; onboardingStep: number; phone: string; relationLabel:string; windows: MealWindow[];
  eatOutPerWeek: number; usesKeepWarm: boolean; cooksPerWeek: number;
  missedMealsThreshold: number; fastingHours: number; emergencyHours: number;
  preparationAcknowledged: boolean;
};
export type PreferenceRevision = {settings:string|null;household:string|null};
export type SavedPreferences = { settings: Preferences|null; household: Household|null; revision?:PreferenceRevision; savedAt?: {settings:string|null; household:string|null} };
export type FirebaseProvider = {
  name: 'Firebase'; onUser(cb: (user: FirebaseUser|null)=>void): ()=>void;
  studio: import('./studio').Studio;
  signIn(email:string,password:string,remember:boolean):Promise<FirebaseUser>;
  signUp(email:string,password:string,name:string,remember:boolean):Promise<FirebaseUser>;
  google(remember:boolean):Promise<FirebaseUser>; signOut():Promise<void>;
  kakaoStatus?():Promise<boolean>; kakao?(remember:boolean):Promise<void>;
  completeKakaoLogin?(fragment?:string,signal?:AbortSignal):Promise<FirebaseUser>; requestEmail?(email:string,expectedUid:string):Promise<void>;
  resetPassword(email:string):Promise<void>; resendVerification():Promise<void>;
  refreshUser():Promise<FirebaseUser|null>;
  getIdToken(expectedUid:string,forceRefresh?:boolean):Promise<string>;
  getAppProfile(uid:string):Promise<AccountProfile|null>;
  saveProfile(name:string,uid:string,expectedRevision?:string):Promise<void>;
  getAppPreferences(uid:string):Promise<SavedPreferences>;
  getCaptureDays(uid:string):Promise<import('../smartthings/capture-days').CaptureBucket[]>;
  saveCapture(uid:string,measuredAt:number,cooking:boolean,windows:MealWindow[]):Promise<'saved'|'duplicate'>;
  clearCaptureDays(uid:string):Promise<void>;
  saveAppPreferences(input:Preferences,household:Household|null,uid:string,revision:PreferenceRevision):Promise<SavedPreferences>;
};
let providerPromise: Promise<FirebaseProvider>|null = null;
async function createTeamProvider(): Promise<FirebaseProvider> {
  if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === '1') {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) throw Error('로컬 계정 검사는 이 컴퓨터에서 실행해 주세요.');
    const { createLocalAccountProvider } = await import('@/firebase/provider/local-accounts.mjs');
    return createLocalAccountProvider() as FirebaseProvider;
  }
  const response = await fetch('/__/firebase/init.json', {
    cache: 'no-store', credentials: 'omit', redirect: 'error',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('워밍업 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
  const config = teamFirebaseConfig(await response.json(), TEAM_PROJECT_ID);
  const { createProvider } = await import('@/firebase/provider/firebase-provider.src.mjs');
  const provider = createProvider(config, {
    googleEnabled: TEAM_GOOGLE_SIGN_IN_ENABLED,
    kakaoEnabled: TEAM_KAKAO_SIGN_IN_ENABLED,
  });
  return provider as FirebaseProvider;
}
export function connectFirebase(): Promise<FirebaseProvider> {
  if (typeof window === 'undefined') return Promise.reject(new Error('브라우저에서 로그인해 주세요.'));
  if (!providerPromise) {
    providerPromise = createTeamProvider().catch(error => {
      providerPromise = null;
      throw error;
    });
  }
  return providerPromise;
}
export function within<T>(promise:Promise<T>,ms=12000):Promise<T> {
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Object.assign(new Error('연결이 늦어지고 있어요. 잠시 후 다시 확인해 주세요.'),{code:'app/timeout'})),ms);
    promise.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
  });
}
export function accountError(error:unknown):string {
  const code=typeof error==='object'&&error&&'code' in error?String(error.code):'';
  if (code === 'profile/conflict') return '다른 화면에서 이름이 변경됐어요. 서버에서 다시 확인한 후 수정해 주세요.';
  if (/kakao-cancelled/.test(code)) return '카카오 로그인을 취소했어요. 원하실 때 다시 시작해 주세요.';
  if (/kakao-not-ready/.test(code)) return '카카오 로그인 연결을 준비하고 있어요. 지금은 이메일로 시작해 주세요.';
  if (/kakao-expired|kakao-failed/.test(code)) return '로그인 확인 시간이 지났어요. 카카오로 시작하기를 다시 눌러 주세요.';
  if (/kakao-storage/.test(code)) return '이 브라우저에서 로그인 정보를 잠시 보관하지 못했어요. Safari나 Chrome에서 다시 열어 주세요.';
  if (/kakao-rate-limited|quota-exceeded/.test(code)) return '로그인 요청이 잠시 많아요. 잠시 후 다시 시도하거나 다른 로그인 방법을 이용해 주세요.';
  if (/account-exists-with-different-credential|email-already-in-use/.test(code)) return '이미 가입한 이메일이에요. 기존 Google 또는 이메일 계정으로 로그인해 주세요. 기록은 자동으로 합치지 않아요.';
  if (/requires-recent-login/.test(code)) return '확인 시간이 지났어요. 다시 로그인한 뒤 이메일 확인을 진행해 주세요.';
  if (/operation-not-allowed|unauthorized-domain/.test(code)) return '이 로그인 방법을 준비하고 있어요. 다른 로그인 방법을 이용해 주세요.';
  if (/invalid-email/.test(code)) return '받을 수 있는 이메일 주소를 확인해 주세요.';
  if (/popup-closed|cancelled-popup/.test(code)) return '로그인이 취소됐어요. 원하실 때 다시 시작해 주세요.';
  if (/popup-blocked/.test(code)) return '로그인 창이 차단됐어요. Safari나 Chrome에서 팝업을 허용한 뒤 다시 눌러 주세요.';
  if (/invalid-credential|wrong-password|user-not-found/.test(code)) return '이메일과 비밀번호를 다시 확인해 주세요.';
  if (/email-already-in-use/.test(code)) return '이미 가입한 이메일이에요. 로그인 또는 비밀번호 찾기를 이용해 주세요.';
  if (/weak-password|password-does-not-meet-requirements/.test(code)) return '비밀번호를 8자 이상으로 입력하고 비밀번호 기준을 확인해 주세요.';
  if (/too-many/.test(code)) return '요청이 잠시 많아요. 잠시 후 다시 시도해 주세요.';
  if (/preferences\/conflict/.test(code)) return '다른 화면에서 설정이 바뀌었어요. 최신 내용을 확인했으니 입력한 내용을 다시 살펴보고 저장해 주세요.';
  if (/permission-denied/.test(code)) return '저장 권한을 확인하지 못했어요. 다시 로그인해 주세요.';
  if (/user-changed|login-blocked/.test(code)) return '계정이 바뀌었어요. 새 계정에서 다시 확인해 주세요.';
  if (/network|unavailable|timeout/.test(code)) return '연결이 늦어지고 있어요. 입력한 내용을 유지했으니 잠시 후 다시 확인해 주세요.';
  return error instanceof Error && !code ? error.message : '진행하지 못했어요. 입력 정보와 연결 상태를 확인해 주세요.';
}
