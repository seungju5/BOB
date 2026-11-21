import {connectFirebase,within} from '@/lib/firebase/bridge';
import {API_ORIGIN} from '@/lib/deployment';
import {validateHeartState,type HeartState} from '@/packages/walking-hearts/core.mjs';

export const HEARTS_CONSENT='2026-11-17-hearts';
export type HeartAction='hearts'|'heartjoin'|'heartsettings'|'heartbuy'|'heartequip'|'heartmessage'|'heartgift'|'heartread'|'heartleave'|'heartleague';
export type HeartMessage={id:string;text:string|null;photo:string|null;createdAt:string;readAt:string|null;unlockedAt?:string|null;unlockPercent:number;locked:boolean;type:string;itemId?:string};
export type HeartsSnapshot={enabled:boolean;joined:boolean;state:HeartState|null;messages:HeartMessage[];leagueEnabled:boolean;region:string};
export type HeartTransport={request:(action:HeartAction,body?:Record<string,unknown>,signal?:AbortSignal)=>Promise<unknown>};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const invalid=()=>{throw Error('invalid_hearts_response');};
export function validateHeartsSnapshot(value:unknown):HeartsSnapshot{
  if(!object(value)||typeof value.enabled!=='boolean')return invalid();
  if(!value.state)return {enabled:false,joined:false,state:null,messages:[],leagueEnabled:false,region:''};
  const state=validateHeartState(value.state);
  if(!Array.isArray(value.messages)||value.messages.length>20||typeof value.leagueEnabled!=='boolean'||typeof value.region!=='string'||value.region.length>50)return invalid();
  const ids=new Set<string>();
  const messages=value.messages.map((raw:unknown):HeartMessage=>{
    if(!object(raw)||typeof raw.id!=='string'||raw.id.length>128||ids.has(raw.id)||typeof raw.createdAt!=='string'||!Number.isFinite(Date.parse(raw.createdAt))||typeof raw.locked!=='boolean'||!([0,25,50,100,200] as unknown[]).includes(raw.unlockPercent))return invalid();
    ids.add(raw.id);
    if(raw.text!=null&&(typeof raw.text!=='string'||raw.text.length>280))return invalid();
    if(raw.photo!=null&&(typeof raw.photo!=='string'||raw.photo.length>214000||!/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+=*$/.test(raw.photo)))return invalid();
    if(raw.readAt!=null&&(typeof raw.readAt!=='string'||!Number.isFinite(Date.parse(raw.readAt))))return invalid();
    if(raw.unlockedAt!=null&&(typeof raw.unlockedAt!=='string'||!Number.isFinite(Date.parse(raw.unlockedAt))))return invalid();
    return {id:raw.id,text:raw.text as string|null??null,photo:raw.photo as string|null??null,createdAt:raw.createdAt,readAt:raw.readAt as string|null??null,unlockedAt:raw.unlockedAt as string|null??null,locked:raw.locked,unlockPercent:Number(raw.unlockPercent),type:typeof raw.type==='string'?raw.type:'message',...(typeof raw.itemId==='string'?{itemId:raw.itemId}:{})};
  });
  return {enabled:value.enabled,joined:value.joined!==false,state,messages,leagueEnabled:value.leagueEnabled,region:value.region};
}
export function createHeartsClient(uid:string):HeartTransport{
  return {async request(action,body,signal){
    const provider=await within(connectFirebase());
    const token=await within(provider.getIdToken(uid));
    if(signal?.aborted)throw new DOMException('Aborted','AbortError');
    const abort=new AbortController(),cancel=()=>abort.abort();signal?.addEventListener('abort',cancel,{once:true});
    const timer=setTimeout(cancel,15000);
    try{
      const response=await fetch(`${API_ORIGIN}/api/walking/${action}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,credentials:'omit',cache:'no-store',redirect:'error',signal:abort.signal});
      const raw=await response.text();
      if(raw.length>5*1024*1024)throw Error('response_too_large');
      let data:unknown;try{data=JSON.parse(raw);}catch{throw Object.assign(Error('server_unavailable'),{code:response.status===404?'setup_required':'temporarily_unavailable'});}
      if(!response.ok)throw Object.assign(Error('hearts_request_failed'),{code:object(data)?data.error:'temporarily_unavailable'});
      if(signal?.aborted)throw new DOMException('Aborted','AbortError');
      return data;
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
  }};
}
export function heartsError(error:unknown):string{
  const code=object(error)&&typeof error.code==='string'?error.code:error instanceof Error?error.message:'';
  if(/UNIMPLEMENTED|not implemented/i.test(code))return '이 설치본에는 새 산책 하트가 아직 없어요. 설치 안내에서 최신 Android 앱으로 업데이트해 주세요.';
  if(/request_busy|busy/.test(code))return '휴대폰 연결을 확인하고 있어요. 잠시 후 다시 확인을 눌러 주세요.';
  if(/setup_required|temporarily_unavailable|server_unavailable/.test(code))return '가족과 하트를 나누는 연결을 준비하고 있어요. 예시 화면은 지금 살펴볼 수 있어요.';
  if(/insufficient|balance/.test(code))return '하트가 조금 더 모이면 입힐 수 있어요. 오늘도 내 속도로 걸어요.';
  if(/message_locked/.test(code))return '아직 닫힌 선물상자예요. 표시된 산책 단계가 되면 열려요.';
  if(/participation_required|not_joined/.test(code))return '먼저 휴대폰 연결 안내에서 계정과 걸음수 공유를 연결해 주세요.';
  if(/consent|paused|disabled/.test(code))return '하트 이용 안내와 켜짐 상태를 확인해 주세요.';
  if(/device_expired|device_revoked|unauthorized|login_required|auth\/user-changed/.test(code))return '계정이나 휴대폰 연결이 바뀌었어요. 다시 연결한 뒤 확인해 주세요.';
  if(/message_limit|rate_limited/.test(code))return '지금은 조금 기다려 주세요. 이미 보낸 응원은 그대로 남아 있어요.';
  if(/photo|message|invalid_/.test(code))return '입력한 내용과 사진 크기를 다시 확인해 주세요.';
  return '연결을 마치지 못했어요. 기록을 대신 채우지 않았으니 잠시 후 다시 확인해 주세요.';
}
