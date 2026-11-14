import { APP_BASE_PATH } from '@/lib/app-path';
import type { MealWindow } from '@/lib/judge/types';
export const usesImpactFirebase = APP_BASE_PATH === '/bapmunna/app';
export const ACCOUNT_CONSENT_VERSION = '2026-10-16';
export type FirebaseUser = { uid: string; email: string; displayName: string; verified: boolean };
export type AccountProfile = { ownerUid: string; displayName: string; consentVersion: string };
export type Household = { relation: 'mother'|'father'|'parents'|'other'; alias: string; residentCount: number; hasPet: boolean };
export type Preferences = {
  schemaVersion: 1; onboardingStep: number; phone: string; relationLabel:string; windows: MealWindow[];
  eatOutPerWeek: number; usesKeepWarm: boolean; cooksPerWeek: number;
  missedMealsThreshold: number; fastingHours: number; emergencyHours: number;
  preparationAcknowledged: boolean;
};
export type PreferenceRevision = {settings:string|null;household:string|null};
export type SavedPreferences = { settings: Preferences|null; household: Household|null; revision?:PreferenceRevision };
export type FirebaseProvider = {
  name: 'Firebase'; onUser(cb: (user: FirebaseUser|null)=>void): ()=>void;
  signIn(email:string,password:string,remember:boolean):Promise<FirebaseUser>;
  signUp(email:string,password:string,name:string,remember:boolean):Promise<FirebaseUser>;
  google(remember:boolean):Promise<FirebaseUser>; signOut():Promise<void>;
  resetPassword(email:string):Promise<void>; resendVerification():Promise<void>;
  refreshUser():Promise<FirebaseUser|null>;
  getAppProfile(uid:string):Promise<AccountProfile|null>;
  saveProfile(name:string,uid:string):Promise<void>;
  getAppPreferences(uid:string):Promise<SavedPreferences>;
  saveAppPreferences(input:Preferences,household:Household|null,uid:string,revision:PreferenceRevision):Promise<SavedPreferences>;
};
let providerPromise: Promise<FirebaseProvider>|null = null;
export function connectFirebase(): Promise<FirebaseProvider> {
  if (!usesImpactFirebase || typeof window === 'undefined') return Promise.reject(new Error('이 경로에서는 Firebase 계정을 사용하지 않아요.'));
  if (!providerPromise) {
    // One same-origin, fixed module: reuses the shipped SDK and its named app.
    const url = new URL('/bapmunna/cloud-api.mjs', window.location.origin).href;
    providerPromise = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url)
      .then(module => module.connectCloud()).then((provider: FirebaseProvider) => {
        if (provider.name !== 'Firebase' || typeof provider.getAppPreferences !== 'function') throw new Error('새 버전을 불러오지 못했어요. 새로고침해 주세요.');
        return provider;
      }).catch(error => { providerPromise=null; throw error; });
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
  if (/popup-closed|cancelled-popup/.test(code)) return '로그인이 취소됐어요. 원하실 때 다시 시작해 주세요.';
  if (/popup-blocked/.test(code)) return '로그인 창이 차단됐어요. Safari나 Chrome에서 팝업을 허용한 뒤 다시 눌러 주세요.';
  if (/invalid-credential|wrong-password|user-not-found/.test(code)) return '이메일과 비밀번호를 다시 확인해 주세요.';
  if (/email-already-in-use/.test(code)) return '이미 가입한 이메일이에요. 로그인 또는 비밀번호 찾기를 이용해 주세요.';
  if (/weak-password/.test(code)) return '비밀번호를 8자 이상으로 입력하고 비밀번호 기준을 확인해 주세요.';
  if (/too-many/.test(code)) return '요청이 잠시 많아요. 잠시 후 다시 시도해 주세요.';
  if (/preferences\/conflict/.test(code)) return '다른 화면에서 설정이 바뀌었어요. 최신 내용을 확인했으니 입력한 내용을 다시 살펴보고 저장해 주세요.';
  if (/permission-denied/.test(code)) return '저장 권한을 확인하지 못했어요. 다시 로그인해 주세요.';
  if (/user-changed/.test(code)) return '계정이 바뀌었어요. 새 계정에서 다시 확인해 주세요.';
  if (/network|unavailable|timeout/.test(code)) return '연결이 늦어지고 있어요. 입력한 내용을 유지했으니 잠시 후 다시 확인해 주세요.';
  return error instanceof Error && !code ? error.message : '진행하지 못했어요. 입력 정보와 연결 상태를 확인해 주세요.';
}
