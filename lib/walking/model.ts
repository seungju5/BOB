export const WALKING_CONSENT_VERSION = '2026-11-17';
export const WALKING_TIME_ZONE = 'Asia/Seoul';
export type WalkingEntry = {publicId:string;nickname:string;count:number;rank:number};
export type WalkingMe = {publicId:string;nickname:string;count:number|null;rank:number|null;lastSyncedAt:string|null};
export type WalkingBoard = {date:string;timeZone:string;updatedAt:string;entries:WalkingEntry[];me:WalkingMe;total:number;limit:number};
export type WalkingProfile = {joined:boolean;nickname?:string;publicId?:string;sharingScope?:'private'|'public';deviceConnected?:boolean;deviceExpiresAt?:string|null;lastSyncedAt?:string|null;date?:string|null;count?:number|null};
export type WalkingPairing = {code:string;expiresAt:string};

export function walkingDate(now=new Date()) {
  const parts=new Intl.DateTimeFormat('en',{timeZone:WALKING_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  return ['year','month','day'].map(type=>parts.find(part=>part.type===type)?.value).join('-');
}
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const whole=(value:unknown,min=0,max=1_000_000):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;
const timestamp=(value:unknown):value is string=>typeof value==='string'&&value.length<=40&&Number.isFinite(Date.parse(value));
const label=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>=1&&value.length<=40&&!/[\u0000-\u001f\u007f]/.test(value);
const id=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(value);
const date=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00+09:00'))&&walkingDate(new Date(value+'T00:00:00+09:00'))===value;
function invalid():never {throw new Error('랭킹 정보를 확인하지 못했어요. 잠시 후 다시 확인해 주세요.');}

export function validateWalkingProfile(value:unknown):WalkingProfile {
  if(!record(value)||typeof value.joined!=='boolean')return invalid();
  if(!value.joined)return {joined:false};
  if(!label(value.nickname)||!id(value.publicId)||typeof value.deviceConnected!=='boolean')return invalid();
  if(value.deviceExpiresAt!=null&&!timestamp(value.deviceExpiresAt))return invalid();
  if(value.lastSyncedAt!=null&&!timestamp(value.lastSyncedAt))return invalid();
  if(value.date!=null&&!date(value.date))return invalid();
  if(value.count!=null&&!whole(value.count))return invalid();
  if(value.sharingScope!=null&&value.sharingScope!=='private'&&value.sharingScope!=='public')return invalid();
  return {joined:true,nickname:value.nickname,publicId:value.publicId,deviceConnected:value.deviceConnected,
    ...(value.sharingScope?{sharingScope:value.sharingScope as 'private'|'public'}:{}),
    deviceExpiresAt:value.deviceExpiresAt as string|null|undefined,lastSyncedAt:value.lastSyncedAt as string|null|undefined,
    date:value.date as string|null|undefined,count:value.count as number|null|undefined};
}

export function validateWalkingBoard(value:unknown):WalkingBoard {
  if(!record(value)||!date(value.date)||value.timeZone!==WALKING_TIME_ZONE||!timestamp(value.updatedAt)||!whole(value.total)||!whole(value.limit,1,100)||!Array.isArray(value.entries)||value.entries.length>value.limit||value.entries.length>value.total||!record(value.me))return invalid();
  const entries:WalkingEntry[]=[],ids=new Set<string>();
  for(const raw of value.entries){
    if(!record(raw)||!id(raw.publicId)||!label(raw.nickname)||!whole(raw.count)||!whole(raw.rank,1)||ids.has(raw.publicId))return invalid();
    const previous=entries.at(-1);
    const expectedRank=previous&&previous.count===raw.count?previous.rank:entries.length+1;
    if(raw.rank!==expectedRank||(previous&&previous.count<raw.count))return invalid();
    ids.add(raw.publicId);entries.push({publicId:raw.publicId,nickname:raw.nickname,count:raw.count,rank:raw.rank});
  }
  const me=value.me;
  if(!id(me.publicId)||!label(me.nickname)||(me.count!==null&&!whole(me.count))||(me.rank!==null&&!whole(me.rank,1,value.total))||(me.lastSyncedAt!==null&&!timestamp(me.lastSyncedAt))||((me.rank===null)!==(me.count===null)))return invalid();
  const visible=entries.find(entry=>entry.publicId===me.publicId);
  if(visible&&(visible.count!==me.count||visible.rank!==me.rank||visible.nickname!==me.nickname))return invalid();
  return {date:value.date,timeZone:WALKING_TIME_ZONE,updatedAt:value.updatedAt,entries,me:{publicId:me.publicId,nickname:me.nickname,count:me.count as number|null,rank:me.rank as number|null,lastSyncedAt:me.lastSyncedAt as string|null},total:value.total,limit:value.limit};
}

export function validateWalkingPairing(value:unknown):WalkingPairing {
  if(!record(value)||typeof value.code!=='string'||!/^\d{8}$/.test(value.code)||!timestamp(value.expiresAt))return invalid();
  return {code:value.code,expiresAt:value.expiresAt};
}

/** Explicit demo only. This function has no storage, auth, health or network access. */
export function walkingDemo(count:number,now=new Date()):WalkingBoard {
  const rows=[{publicId:'demo-morning',nickname:'아침햇살',count:6200},{publicId:'demo-forest',nickname:'숲길친구',count:4800},{publicId:'demo-flower',nickname:'꽃길산책',count:3100},{publicId:'demo-myself',nickname:'나의 예시',count:Math.min(20000,Math.max(0,Math.floor(Number.isFinite(count)?count:0)))}].sort((a,b)=>b.count-a.count||a.publicId.localeCompare(b.publicId));
  const entries:WalkingEntry[]=rows.map(row=>({...row,rank:rows.findIndex(other=>other.count===row.count)+1}));
  const me=entries.find(entry=>entry.publicId==='demo-myself')!;
  return {date:walkingDate(now),timeZone:WALKING_TIME_ZONE,updatedAt:now.toISOString(),entries,me:{...me,lastSyncedAt:now.toISOString()},total:rows.length,limit:50};
}
