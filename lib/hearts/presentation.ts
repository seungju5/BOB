import type {HeartLeague} from '@/packages/walking-hearts/core.mjs';
export type HeartsLeagueView=HeartLeague&{myPublicId?:string;practice?:boolean};
/** Normalize the actual server/native contract, without exposing extra fields. */
export function validateHeartsLeague(value:unknown):HeartsLeagueView{
  if(!value||typeof value!=='object')throw Error('invalid_league');
  const raw=value as Record<string,unknown>;
  if(raw.enabled!==true||typeof raw.week!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(raw.week)||typeof raw.weekEnd!=='string'||typeof raw.region!=='string'||raw.region.length>60||!Number.isSafeInteger(raw.total)||!Array.isArray(raw.entries)||raw.entries.length>15||raw.total!==raw.entries.length)throw Error('invalid_league');
  const ids=new Set<string>();let previousScore=Infinity,previousRank=0;
  const entries=raw.entries.map((entry,index)=>{
    if(!entry||typeof entry.publicId!=='string'||ids.has(entry.publicId)||typeof entry.nickname!=='string'||entry.nickname.length>40||!Number.isFinite(entry.score)||entry.score<0||entry.score>2100||!Number.isInteger(entry.rank)||entry.rank<1||!Number.isInteger(entry.tier)||entry.tier<0||entry.tier>4||typeof entry.isMe!=='boolean')throw Error('invalid_league');
    const expected=entry.score===previousScore?previousRank:index+1;
    if(entry.score>previousScore||entry.rank!==expected)throw Error('invalid_league');
    previousScore=entry.score;previousRank=entry.rank;ids.add(entry.publicId);
    return {publicId:entry.publicId,nickname:entry.nickname,region:raw.region as string,points:entry.score,streak:0,tier:entry.tier,rank:entry.rank};
  });
  const own=raw.entries.filter(entry=>entry.isMe);if(own.length>1)throw Error('invalid_league');
  return {weekStart:raw.week,weekEnd:raw.weekEnd,total:entries.length,entries,myPublicId:own[0]?.publicId,practice:raw.practice===true};
}
/** Equal visual spacing for the unequal 0/25/50/100/200% milestones. */
export function heartPathFill(percent:number|null):number{
  if(percent===null||!Number.isFinite(percent)||percent<=0)return 0;
  const thresholds=[0,25,50,100,200];
  for(let index=1;index<thresholds.length;index++)if(percent<thresholds[index])return (index-1)*25+(percent-thresholds[index-1])/(thresholds[index]-thresholds[index-1])*25;
  return 100;
}
