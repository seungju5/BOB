import {connectFirebase,within,type FirebaseProvider} from '@/lib/firebase/bridge';
import {validateWalkingBoard,validateWalkingPairing,validateWalkingProfile,WALKING_CONSENT_VERSION} from './model';

import {TEAM_SITE_URL} from '@/config/team';
import {requireWalkingSharing} from './availability';
type Endpoint='profile'|'board'|'join'|'leave'|'pairing';
const messages:Record<string,string>={
  setup_required:'랭킹 연결을 준비하고 있어요. 잠시 후 다시 확인해 주세요.',
  unauthorized:'로그인을 다시 확인해 주세요.',unauthenticated:'로그인을 다시 확인해 주세요.',
  login_required:'로그인을 다시 확인해 주세요.',
  email_verification_required:'먼저 내 이메일 확인을 마쳐 주세요.',
  consent_required:'가입 안내와 랭킹 참여 동의를 확인해 주세요.',account_consent_required:'먼저 가입 안내 확인을 마쳐 주세요.',
  participation_required:'랭킹에 참여한 뒤 사용할 수 있어요.',not_joined:'랭킹에 참여한 뒤 사용할 수 있어요.',
  invalid_nickname:'별명을 다시 확인해 주세요. 실명·전화번호 대신 짧은 별명을 써 주세요.',
  nickname_locked:'참여 중인 별명은 유지돼요. 바꾸려면 참여를 마친 뒤 다시 시작해 주세요.',
  sharing_scope_locked:'현재 공유 범위는 그대로 유지돼요. 연결을 마친 뒤 원하는 범위로 다시 시작해 주세요.',
  rate_limited:'요청이 잠시 많아요. 조금 뒤 다시 시도해 주세요.',quota_exceeded:'요청이 잠시 많아요. 조금 뒤 다시 시도해 주세요.',
  invalid_request:'입력한 내용을 다시 확인해 주세요.',forbidden:'이 계정으로 진행할 수 없어요. 로그인과 참여 상태를 확인해 주세요.',
};
export function walkingError(error:unknown):string {
  if(error instanceof Error&&error.name==='AbortError')return '요청을 취소했어요.';
  const code=error&&typeof error==='object'&&'code' in error?String(error.code):'';
  if(messages[code])return messages[code];
  if(/auth\/user-changed/.test(code))return '계정이 바뀌었어요. 현재 계정에서 다시 확인해 주세요.';
  return '연결을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.';
}

/** Tokens stay in this call, never in URLs, UI state, logs or browser storage. */
export function createWalkingClient(options:{provider?:()=>Promise<Pick<FirebaseProvider,'getIdToken'>>;fetcher?:typeof fetch}={}){
  const provider=options.provider??connectFirebase,fetcher=options.fetcher??fetch;
  async function request(endpoint:Endpoint,uid:string,body:Record<string,unknown>|undefined,signal?:AbortSignal){
    requireWalkingSharing();
    const p=await within(provider());
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    const token=await within(p.getIdToken(uid));
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    const controller=new AbortController(),onAbort=()=>controller.abort();
    signal?.addEventListener('abort',onAbort,{once:true});
    const timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetcher(new URL(`/api/walking/${endpoint}`,TEAM_SITE_URL),{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal});
      const value:unknown=await response.json();
      if(!response.ok){const code=value&&typeof value==='object'&&'error'in value?String(value.error):'unavailable';throw Object.assign(new Error('Walking request failed'),{code});}
      if(signal?.aborted)throw new DOMException('Aborted','AbortError');
      return value;
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);}
  }
  return {
    profile:async(uid:string,signal?:AbortSignal)=>validateWalkingProfile(await request('profile',uid,undefined,signal)),
    board:async(uid:string,signal?:AbortSignal)=>validateWalkingBoard(await request('board',uid,undefined,signal)),
    join:async(uid:string,nickname:string,signal?:AbortSignal)=>validateWalkingProfile(await request('join',uid,{nickname:nickname.trim(),consentVersion:WALKING_CONSENT_VERSION,shareTodaySteps:true},signal)),
    joinPrivate:async(uid:string,nickname:string,signal?:AbortSignal)=>validateWalkingProfile(await request('join',uid,{nickname:nickname.trim(),consentVersion:'2026-11-17-private',shareTodaySteps:true,shareRanking:false},signal)),
    pairing:async(uid:string,signal?:AbortSignal)=>validateWalkingPairing(await request('pairing',uid,{},signal)),
    leave:async(uid:string,signal?:AbortSignal)=>{const value=await request('leave',uid,{},signal);if(!value||typeof value!=='object'||!('ok'in value)||value.ok!==true)throw Error('invalid_response');},
  };
}
