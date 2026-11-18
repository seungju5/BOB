import {createHash,createHmac,randomBytes,randomInt} from 'node:crypto';
import {isIP} from 'node:net';

export const WALKING_PREFIX='/api/walking';
export const WALKING_CONSENT='2026-11-17';
export const PRIVATE_WALKING_CONSENT='2026-11-17-private';
export const walkingSharingScope=member=>member?.sharingScope==='private'?'private':'public';
export function walkingMemberJoined(member){
  if(member?.shareTodaySteps!==true)return false;
  return walkingSharingScope(member)==='private'?member.consentVersion===PRIVATE_WALKING_CONSENT&&member.shareRanking===false:member.consentVersion===WALKING_CONSENT;
}
export const ACCOUNT_CONSENT='2026-10-16';
export const WALKING_ZONE='Asia/Seoul';
export const PAIR_LIFETIME=10*60*1000;
export const DEVICE_LIFETIME=30*86400000;
export const MAX_STEPS=1000000;
export const BOARD_LIMIT=50;
export const NATIVE_ORIGINS=Object.freeze(['https://localhost','capacitor://localhost']);
export class WalkingError extends Error{constructor(status,code){super(code);this.status=status;this.code=code;}}
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const randomToken=()=> 'walk_'+randomBytes(32).toString('base64url');
export const randomId=()=>randomBytes(16).toString('base64url');
export const randomCode=()=>String(randomInt(100000000)).padStart(8,'0');
export const validDeviceToken=value=>typeof value==='string'&&/^walk_[A-Za-z0-9_-]{43}$/.test(value)&&Buffer.from(value.slice(5),'base64url').toString('base64url')===value.slice(5);
export const koreanDay=time=>new Date(time+9*3600000).toISOString().slice(0,10);
export const nextKoreanMidnight=time=>Date.parse(koreanDay(time)+'T00:00:00+09:00')+86400000;
export const rankKey=(day,count)=>day+':'+String(count).padStart(7,'0');
export const dayRange=day=>({start:day+':',end:day+';'});
export const iso=time=>Number.isFinite(time)?new Date(time).toISOString():null;

function origin(value){const url=new URL(value);if(url.protocol!=='https:'||url.origin!==value||url.username||url.password)throw Error();return url.origin;}
export function readWalkingConfig(env={}){
  try{
    const apiOrigin=origin(env.WALKING_API_ORIGIN||'https://bapmunna-smartthings.vercel.app');
    const webOrigin=origin(env.BAPMUNNA_WEB_ORIGIN||'https://impact-series.web.app');
    const projectId=env.FIREBASE_PROJECT_ID||'';
    if(projectId&&!/^[a-z][a-z0-9-]{1,62}$/.test(projectId))throw Error();
    return {origin:apiOrigin,webOrigin,projectId};
  }catch{throw Error('Invalid walking server configuration.');}
}
export function nickname(value){
  if(typeof value!=='string')throw new WalkingError(400,'invalid_nickname');
  const result=value.normalize('NFC').trim().replace(/ +/g,' ');
  if(!/^[\p{L}\p{N} ]{2,16}$/u.test(result)||/\d{5}/.test(result))throw new WalkingError(400,'invalid_nickname');
  return result;
}
export function exactFields(value,fields){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==fields.length||fields.some(key=>!Object.hasOwn(value,key)))throw new WalkingError(400,'invalid_request');
  return value;
}
export function requireShare(value){
  if(value.shareTodaySteps!==true)throw new WalkingError(400,'consent_required');
  if(value.consentVersion===PRIVATE_WALKING_CONSENT&&value.shareRanking===false)return 'private';
  if(value.consentVersion===WALKING_CONSENT&&!Object.hasOwn(value,'shareRanking'))return 'public';
  throw new WalkingError(400,'consent_required');
}
export function syncInput(value,time){
  exactFields(value,['date','count','source','queriedAt','timeZone']);
  if(value.timeZone!==WALKING_ZONE||value.date!==koreanDay(time)||!Number.isSafeInteger(value.count)||value.count<0||value.count>MAX_STEPS||!['ios-healthkit','android-health-connect'].includes(value.source))throw new WalkingError(400,'invalid_steps');
  if(typeof value.queriedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value.queriedAt))throw new WalkingError(400,'invalid_steps');
  const queriedAt=Date.parse(value.queriedAt);
  if(!Number.isFinite(queriedAt)||queriedAt>time+60000||queriedAt<time-10*60000||koreanDay(queriedAt)!==value.date)throw new WalkingError(409,'stale_snapshot');
  return {date:value.date,count:value.count,source:value.source,queriedAt};
}
export function networkKey(request,secret,time){
  const raw=request.headers.get('x-vercel-forwarded-for')||'';
  const address=isIP(raw)?raw:'unknown';
  return createHmac('sha256',secret).update('walking:'+koreanDay(time)+':'+address).digest('hex');
}
export async function requestJson(request,maxBytes=2048){
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))throw new WalkingError(400,'invalid_request');
  const reader=request.body?.getReader();if(!reader)throw new WalkingError(400,'invalid_request');
  const chunks=[];let size=0;
  try{
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw Error();}chunks.push(value);}
    return JSON.parse(Buffer.concat(chunks,size).toString('utf8'));
  }catch{throw new WalkingError(400,'invalid_request');}finally{reader.releaseLock();}
}
