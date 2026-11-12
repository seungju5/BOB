// Ephemeral synthetic simulator only. Detector is shared verbatim with Supabase.
import { DETECTION } from './shared/config/detection.mjs';
import { detectEvents } from './shared/lib/judge/detectEvents.mjs';
export const POWER_RULES=Object.freeze({cookWatts:DETECTION.COOK_MIN_WATTS,holdMinutes:DETECTION.COOK_MIN_MINUTES,warmMin:DETECTION.KEEP_WARM_MIN_WATTS,warmMax:DETECTION.KEEP_WARM_MAX_WATTS,maxGapMinutes:DETECTION.MAX_READING_GAP_MIN});
export function emptyPower(){return {at:null,mode:'waiting',possibleOpeningAt:null,samples:[],emitted:{}};}
export function samplePower(previous,watts,at){
  if(!Number.isFinite(watts)||watts<0||watts>3500||!Number.isInteger(at))throw Error('전력과 가상 측정 시각을 확인해 주세요.');
  if(previous.at!==null&&at<=previous.at)return {meter:previous,event:null,ignored:true};
  const samples=[...previous.samples.filter(r=>at-r.at<90),{at,watts}];
  const detected=detectEvents(samples.map(r=>({measuredAt:new Date(r.at*60000),watts:r.watts})));
  // Stable event identity across the rolling window prevents long cooking from
  // being counted again when its first sample leaves the buffer.
  let found=null;const emitted={...previous.emitted};
  for(const e of detected){
    const start=e.startedAt.getTime()/60000,end=e.endedAt.getTime()/60000;
    const gap=e.type==='cook'?DETECTION.COOK_MERGE_GAP_MIN:DETECTION.LID_OPEN_DEBOUNCE_MIN;
    if(!previous.emitted[e.type]||start>previous.emitted[e.type].end+gap)found??=e;
    if(!emitted[e.type]||end>emitted[e.type].end)emitted[e.type]={start,end};
  }
  const warm=samples.slice(-DETECTION.KEEP_WARM_MIN_MINUTES);
  const ready=warm.length===DETECTION.KEEP_WARM_MIN_MINUTES&&warm.every((r,i)=>r.watts>=DETECTION.KEEP_WARM_MIN_WATTS&&r.watts<=DETECTION.KEEP_WARM_MAX_WATTS&&(!i||r.at-warm[i-1].at<=DETECTION.MAX_READING_GAP_MIN));
  const mode=watts>=DETECTION.COOK_MIN_WATTS?(detected.some(e=>e.type==='cook')?'cooking':'checking'):ready?'keep-warm':watts<DETECTION.KEEP_WARM_MIN_WATTS?'idle':'checking';
  return {meter:{at,mode,possibleOpeningAt:found?.type==='lid_open'?at:previous.possibleOpeningAt,samples,emitted},event:found?(found.type==='lid_open'?'lid':'cook'):null,startedAt:found?found.startedAt.getTime()/60000:null,ignored:false};
}
