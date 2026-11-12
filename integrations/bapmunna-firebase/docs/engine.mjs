// Deterministic, in-memory demonstration. No hardware, network or health inference.
import {emptyPower,samplePower} from './power.mjs';
import {canonicalDefaults,canonicalSlots,canonicalStreak,canonicalAlertResult,canonicalAway,canonicalEatOutMeal} from './parity.mjs';
export const MEALS = ['breakfast', 'lunch', 'dinner'];
export const LABELS = {breakfast:'아침', lunch:'점심', dinner:'저녁'};
export const DAY = 1440;
export const dayOf = time => Math.floor(time / DAY);
export const hhmm = time => { const n=((time%DAY)+DAY)%DAY; return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`; };
export const dateLabel = day => new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'short',timeZone:'UTC'}).format(new Date(Date.UTC(2026,9,7+day)));
export const key = (day,meal) => `${day}:${meal}`;
export function createState(seed=true) {
  const defaults=canonicalDefaults();
  const state={now:750,consent:true,online:true,config:{grace:0,windows:defaults.windows},away:null,records:{},alerts:{},processed:0,discarded:0};
  state.sharedFrom=seed?-35*DAY:state.now;
  state.profile={household:'alone',residents:1,pets:0,keepWarm:true,cookWeekly:7,ageBand:'70s',riceRoutine:'daily',primaryDevice:'cooker',meals:[...MEALS],eatOutWeekly:2,cookEveryDays:1};
  state.rules={baselineDays:28,consecutiveMissed:defaults.missed,fastingHours:defaults.fasting,inactiveHours:defaults.fasting,followupHours:defaults.emergency};
  state.lastActivityAt=seed?510:null;state.lastReadingAt=state.now;state.offlineMinutes=0;state.offlineSince=null;
  state.devices=Object.fromEntries(Object.keys(DEVICES).map(id=>[id,{online:true,watts:0,lastActivity:seed?510:null,onlineSince:state.sharedFrom}]));
  state.deviceDays={};state.observedDays={};state.careAlerts={};state.help=null;state.social=null;state.lastMealAt=seed?510:null;state.seeded=seed;
  state.setup={complete:false,plug:false,wifi:false};state.power=emptyPower();state.lastLidAt=seed?510:null;
  state.family={sequence:seed?1:0,invite:null,members:seed?[{id:'member-1',name:'민지',role:'caregiver',joinedAt:510}]:[]};
  state.warmth=null;
  if(seed) {
    for(let day=-35;day<0;day++) {
      state.observedDays[day]=true;
      for(let i=0;i<3;i++) state.records[key(day,MEALS[i])]={manual:(day+i)%4!==0,sensor:(day+i)%4===0,exempt:false,eatOut:i===1&&day%3===0};
      state.deviceDays[day]={cooker:{cook:day%3===0?1:2,lid:3+Math.abs(day%3),uses:3},fridge:{cook:0,lid:4,uses:4},microwave:{cook:0,lid:0,uses:1},kettle:{cook:0,lid:0,uses:2}};
    }
    state.records[key(0,'breakfast')]={manual:true,sensor:false,exempt:false};
    state.deviceDays[0]={cooker:{cook:1,lid:1,uses:2}};
  }
  return state;
}
export function record(state,day,meal) {return state.records[key(day,meal)] || {manual:false,sensor:false,exempt:false};}
export function inAway(state,time=state.now) {return canonicalAway({...state,now:time});}
export function activeMeal(state) {const minute=state.now%DAY; return state.config.windows.find(w=>minute>=w.start && minute<w.end+state.config.grace)?.id || null;}
export function status(state,day,meal) {
  if(!state.consent) return 'private';
  const r=record(state,day,meal);
  if(!state.profile.meals.includes(meal))return r.manual?'confirmed':'unplanned';
  const w=state.config.windows.find(w=>w.id===meal), start=day*DAY+w.start;
  if(!r.sensor && !r.manual && start<state.sharedFrom) return 'unobserved';
  const slot=canonicalSlots(state,day).find(s=>s.slot===meal);
  if(slot?.status==='confirmed')return 'confirmed';
  if(slot?.status==='eat_out')return 'eat_out';
  if(slot?.status==='away')return 'away';
  if(slot?.status==='pending')return state.now<start?'upcoming':'waiting';
  if(day===dayOf(state.now) && !state.online) return 'offline';
  return 'missing';
}
export function evaluate(state) {
  if(!state.consent) {state.alerts={}; return state;}
  const day=dayOf(state.now);
  for(const w of state.config.windows) {
    const id=key(day,w.id), s=status(state,day,w.id), due=state.now>=day*DAY+w.end+state.config.grace;
    if(state.profile.meals.includes(w.id)&&due && ['missing','offline'].includes(s)) {
      const old=state.alerts[id];
      state.alerts[id]={meal:w.id,day,type:s,handled:old?.type===s ? old.handled : false};
    } else delete state.alerts[id];
  }
  for(const id of Object.keys(state.records)) if(Number(id.split(':')[0])<day-35) delete state.records[id];
  for(const d of Object.keys(state.deviceDays)) if(Number(d)<day-35) delete state.deviceDays[d];
  for(const d of Object.keys(state.observedDays)) if(Number(d)<day-35) delete state.observedDays[d];
  if(state.online)state.lastReadingAt=state.now;
  for(const id of Object.keys(state.alerts)) if(Number(id.split(':')[0])!==day) delete state.alerts[id];
  evaluateCare(state);return state;
}
export function advance(state,minutes) {
  if(!Number.isInteger(minutes)||minutes<=0||minutes>DAY) throw Error('시간은 1-1440분 사이로 이동해 주세요.');
  const end=state.now+minutes,primary=state.profile.primaryDevice;
  for(let day=dayOf(state.now);day<dayOf(end);day++)if(state.consent&&deviceOnline(state,primary)&&day*DAY>=Math.max(state.sharedFrom,state.devices[primary].onlineSince)){
    state.observedDays[day]=true;state.deviceDays[day]??={};
  }
  state.now=end; return evaluate(state);
}
export function confirmMeal(state,meal,eatOut=false) {
  if(!MEALS.includes(meal)) throw Error('식사 시간대를 선택해 주세요.');
  if(!state.consent) throw Error('공유가 중지되어 기록하지 않았습니다.');
  if(eatOut)meal=canonicalEatOutMeal(state);
  if(!meal)throw Error('식사 시간대를 먼저 설정해 주세요.');
  const day=dayOf(state.now), w=state.config.windows.find(w=>w.id===meal);
  if(!eatOut&&state.now<day*DAY+w.start) throw Error('아직 시작하지 않은 식사는 확인할 수 없습니다.');
  state.records[key(day,meal)]={...record(state,day,meal),manual:true,eatOut:!!eatOut};
  // This is the time of self-report, not proof of the actual eating time.
  state.lastMealAt=state.now;
  activity(state);
  return evaluate(state);
}
export function ingestSensor(state,track=true) {
  if(!state.online) return {accepted:false,reason:'센서가 오프라인입니다. 신호를 받지 못했습니다.'};
  // Raw opening event exists only in this call. Only a slot-level Boolean survives.
  state.processed++; state.discarded++;
  if(!state.consent) return {accepted:false,reason:'공유 중지 상태: 원시 신호를 폐기하고 요약을 만들지 않았습니다.'};
  if(track) trackDevice(state,'cooker','lid');
  const meal=activeMeal(state);
  if(!meal) return {accepted:false,reason:'설정한 식사 시간대 밖입니다. 신호를 폐기했습니다.'};
  const id=key(dayOf(state.now),meal), prior=record(state,dayOf(state.now),meal);
  state.records[id]={...prior,sensor:true}; evaluate(state);
  return {accepted:true,reason:prior.sensor?'같은 끼니의 반복 신호를 하나로 묶었습니다.':'Supabase 기준으로 끼니 확인에 반영했어요. 실제 섭취를 증명하는 것은 아니에요.'};
}
export function setAway(state,start,end) {
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<state.now||start>state.now+30*DAY||end<=start||end-start>7*DAY) throw Error('현재부터 30일 이내 출발, 최대 7일의 외출 일정을 선택해 주세요.');
  for(const [id,r] of Object.entries(state.records)){const [d,meal]=id.split(':');const w=state.config.windows.find(w=>w.id===meal);if(Number(d)*DAY+w.start>=state.now)r.exempt=false;}
  state.away={start,end};
  activity(state);
  state.power=emptyPower();
  // Already overlapping slots remain exempt even after the interval ends.
  if(state.consent) for(let day=dayOf(start);day<=dayOf(end);day++) for(const w of state.config.windows) {
    if(start<day*DAY+w.end+state.config.grace && end>day*DAY+w.start) state.records[key(day,w.id)]={...record(state,day,w.id),exempt:true};
  }
  return evaluate(state);
}
export function cancelAway(state) {
  const now=state.now,hadStarted=state.away&&state.away.start<=now; state.away=null;
  activity(state);
  if(hadStarted)for(const d of Object.values(state.devices)) d.onlineSince=now;
  state.power=emptyPower();
  for(const [id,r] of Object.entries(state.records)) { const [d,meal]=id.split(':'); const w=state.config.windows.find(w=>w.id===meal); if(Number(d)*DAY+w.start>=now) r.exempt=false; }
  return evaluate(state);
}
export function setConsent(state,value) {
  if(typeof value!=='boolean') throw Error('공유 여부가 올바르지 않습니다.');
  if(value && !state.consent) {state.sharedFrom=state.now;for(const d of Object.values(state.devices))d.onlineSince=state.now;}
  state.consent=value;
  if(!value)state.warmth=null;
  if(!value){state.lastActivityAt=null;state.offlineMinutes=0;}
  if(!value) {state.records={};state.alerts={};state.deviceDays={};state.observedDays={};state.careAlerts={};state.help=null;state.social=null;state.lastMealAt=null;state.lastLidAt=null;state.power=emptyPower();state.away=null;state.family.invite=null;state.family.members=[];state.processed=0;state.discarded=0;for(const d of Object.values(state.devices)){d.lastActivity=null;d.watts=0;}}
  return evaluate(state);
}
export function configure(state,windows,grace) {
  if(!Array.isArray(windows)||windows.length!==3||grace!==0) throw Error('Supabase와 동일하게 식사 시간 종료 시 판정해요. 별도 유예 시간은 사용하지 않아요.');
  for(let i=0;i<3;i++){const w=windows[i];if(w.id!==MEALS[i]||!Number.isInteger(w.start)||!Number.isInteger(w.end)||w.start<0||w.end<=w.start||w.end+grace>DAY||(i>0&&w.start<windows[i-1].end+grace)) throw Error('식사 시간과 유예 시간이 서로 겹치지 않도록 설정해 주세요.');}
  // No retroactive reassignment of already summarized signals.
  state.config={windows:windows.map(w=>({...w})),grace}; return evaluate(state);
}
export function report(state,span=7) {
  if(![1,7,30].includes(span)) throw Error('일·주·월 중 하나를 선택해 주세요.');
  const today=dayOf(state.now), days=Array.from({length:span},(_,i)=>today-span+1+i);
  return days.map(day=>({day,confirmed:state.consent?MEALS.filter(m=>['confirmed','eat_out'].includes(status(state,day,m))).length:0,signals:state.consent?MEALS.filter(m=>record(state,day,m).sensor).length:0,excluded:state.consent?MEALS.filter(m=>status(state,day,m)==='away').length:0,eatOut:state.consent?MEALS.filter(m=>status(state,day,m)==='eat_out').length:0,cook:state.consent?state.deviceDays[day]?.cooker?.cook||0:0,lid:state.consent?state.deviceDays[day]?.cooker?.lid||0:0}));
}

export const DEVICES={cooker:'밥솥',fridge:'냉장고',microwave:'전자레인지',kettle:'전기포트'};
function trackDevice(state,id,kind,at=state.now) {
  if(!state.consent)return;
  const day=dayOf(at), days=state.deviceDays[day]||(state.deviceDays[day]={});
  const d=days[id]||(days[id]={cook:0,lid:0,uses:0});
  if(kind==='cook')d.cook++;
  if(kind==='lid'){d.lid++;if(id==='cooker')state.lastLidAt=at;}
  d.uses++;state.devices[id].lastActivity=at;
  if(id==='cooker')activity(state,at);
}
function activity(state,at=state.now){if(state.lastActivityAt!==null&&at<state.lastActivityAt)return;state.lastActivityAt=at;state.offlineMinutes=0;if(state.offlineSince!==null)state.offlineSince=state.now;}
export function deviceOnline(state,id){return id==='cooker'?state.online:state.devices[id].online;}
export function ingestDevice(state,id,kind,watts=0) {
  if(!Object.hasOwn(DEVICES,id)||!['cook','lid','power'].includes(kind))throw Error('지원하는 기기와 신호를 선택해 주세요.');
  if(kind==='cook'&&id!=='cooker')throw Error('취사 신호는 밥솥에서만 체험할 수 있어요.');
  if(!Number.isFinite(watts)||watts<0||watts>3500)throw Error('전력은 0-3,500W로 입력해 주세요.');
  if(!deviceOnline(state,id))return {accepted:false,reason:'기기가 오프라인입니다. 연결을 먼저 확인해 주세요.'};
  if(!state.consent)return {accepted:false,reason:'공유가 중지되어 신호를 기록하지 않았어요.'};
  const d=state.devices[id];let event=kind,reason='',eventAt=state.now;
  if(kind==='power'){
    if(id==='cooker'){
      const result=samplePower(state.power,watts,state.now);state.power=result.meter;event=result.event;
      eventAt=result.startedAt??state.now;
      if(!result.ignored)d.watts=watts;
      reason=result.ignored?'같은 시각의 중복 측정은 집계하지 않아요.':event==='cook'?'Supabase 기준으로 취사 1회를 확인했어요.':event==='lid'?'Supabase 전력 규칙으로 열림 신호를 확인했어요. 실제 센서 검증은 필요해요.':state.power.mode==='keep-warm'?'보온 전력이에요. 취사·열림으로 세지 않아요.':'측정값을 받았어요. 연속 측정을 더 기다려요.';
    }else {d.watts=watts;event=null;}
  }else if(kind==='cook')d.watts=900;
  if(['lid','cook'].includes(event))trackDevice(state,id,event,eventAt);
  state.processed++;state.discarded++;
  if(id==='cooker'&&['lid','cook'].includes(event)) {
    const meal=activeMeal({...state,now:eventAt});
    if(meal)state.records[key(dayOf(eventAt),meal)]={...record(state,dayOf(eventAt),meal),sensor:true};
  }
  evaluate(state);
  return {accepted:true,reason:kind==='power'?reason||'가상 전력만 표시해요. 다른 가전의 분석은 확장 범위예요.':`${DEVICES[id]} ${kind==='cook'?'취사 후보':'열림'} 신호를 기록했어요. 식사를 했다는 뜻은 아니에요.`};
}
export function setDeviceOnline(state,id,value){
  if(!Object.hasOwn(DEVICES,id)||typeof value!=='boolean')throw Error('기기 연결 설정이 올바르지 않습니다.');
  const old=deviceOnline(state,id);state.devices[id].online=value;if(id==='cooker'){
    if(old&&!value){state.offlineSince=state.now;state.lastReadingAt=state.now;}
    if(!old&&value){state.offlineMinutes+=Math.max(0,state.now-(state.offlineSince??state.now));state.offlineSince=null;state.lastReadingAt=state.now;}
    state.online=value;
  }
  if(!old&&value)state.devices[id].onlineSince=state.now;
  if(!value)state.devices[id].watts=0;
  if(id==='cooker')state.power=emptyPower();
  return evaluate(state);
}
export function updateProfile(state,profile,rules) {
  const p={...state.profile,...profile},r={...state.rules,...rules};
  if(Object.hasOwn(profile,'household')&&!Object.hasOwn(profile,'residents'))p.residents=p.household==='alone'?1:Math.max(2,p.residents);
  if(!Number.isInteger(p.residents)||p.residents<1||p.residents>10||!Number.isInteger(p.pets)||p.pets<0||p.pets>10||!Number.isInteger(p.cookWeekly)||p.cookWeekly<0||p.cookWeekly>21||typeof p.keepWarm!=='boolean')throw Error('거주 인원·반려동물·밥솥 사용 습관을 확인해 주세요.');
  p.household=p.residents===1?'alone':'together';
  if(!['alone','together'].includes(p.household)||!['60s','70s','80plus'].includes(p.ageBand)||!['daily','sometimes','rare'].includes(p.riceRoutine)||!Object.hasOwn(DEVICES,p.primaryDevice))throw Error('생활 유형과 안부 기준 기기를 선택해 주세요.');
  if(!Array.isArray(p.meals)||!p.meals.length||new Set(p.meals).size!==p.meals.length||p.meals.some(m=>!MEALS.includes(m)))throw Error('평소 식사하는 시간대를 한 개 이상 선택해 주세요.');
  if(!Number.isInteger(p.eatOutWeekly)||p.eatOutWeekly<0||p.eatOutWeekly>21||!Number.isInteger(p.cookEveryDays)||p.cookEveryDays<1||p.cookEveryDays>7)throw Error('외식은 주 0-21회, 취사는 1-7일 간격으로 설정해 주세요.');
  if(![7,14,21,28].includes(r.baselineDays)||!Number.isInteger(r.consecutiveMissed)||r.consecutiveMissed<1||r.consecutiveMissed>6||!Number.isFinite(r.inactiveHours)||r.inactiveHours<1||!Number.isFinite(r.followupHours)||r.followupHours<=r.inactiveHours||r.followupHours>72||!Number.isFinite(r.fastingHours)||r.fastingHours<4||r.fastingHours>48)throw Error('알림 기준을 확인해 주세요. 재확인 시간은 주의 시간보다 커야 합니다(최대 72시간).');
  state.profile={...p,meals:[...p.meals]};state.rules=r;return evaluate(state);
}
export function baseline(state){
  const today=dayOf(state.now),days=[];
  for(let day=today-state.rules.baselineDays;day<today;day++)if(day*DAY>=state.sharedFrom&&state.observedDays[day]&&state.consent&&!MEALS.some(m=>record(state,day,m).exempt))days.push(day);
  const confirmed=days.reduce((n,d)=>n+MEALS.filter(m=>record(state,d,m).manual).length,0);
  const cooking=days.reduce((n,d)=>n+(state.deviceDays[d]?.cooker?.cook||0),0);
  return {days:days.length,target:state.rules.baselineDays,ready:days.length>=state.rules.baselineDays,meals:days.length?confirmed/days.length:null,cooking:days.length?cooking/days.length:null};
}
export function mealStreak(state){
  return state.consent?canonicalStreak(state):0;
}
export function evaluateCare(state){
  if(!state.devices)return;
  const next={};
  const add=(id,title,detail,level='attention')=>{const prior=state.careAlerts[id];next[id]={id,title,detail,level,handled:prior?.title===title&&prior?.level===level?prior.handled:false};};
  if(!state.consent){state.careAlerts={};return;}
  if(state.help?.status==='pending')add('help','도움 요청이 도착했어요',`어르신 화면에서 ${hhmm(state.help.at)}에 요청했습니다. 이 탭 안의 데모이며 실제 연락·119 신고는 되지 않았어요.`,'help');
  const active=canonicalAlertResult(state).create;
  if(active.includes('device_offline'))add('offline','밥솥 연결 확인 필요','마지막 수신 후 2시간이 지났어요. 기기 문제 동안에는 식사 관련 알림을 보내지 않아요.','connection');
  if(active.includes('fasting'))add('inactive',`${state.rules.inactiveHours}시간 동안 새 소식이 없어요`,'가구의 마지막 취사·열림·어르신 활동 기준이에요. 특정인의 건강 상태를 뜻하지 않아요. 가족이 직접 안부를 확인해 주세요.');
  if(active.includes('emergency'))add('emergency',`${state.rules.followupHours}시간째, 가족의 확인이 필요해요`,'신고 기관은 미연결이며 자동 신고하지 않습니다. 가족이 직접 연락하고 상황을 확인해 주세요.','followup');
  if(active.includes('missed_meals'))add('meals',`${mealStreak(state)}끼 동안 새 소식이 없어요`,'평소 식사 시간에 취사·열림·외식 소식이 없어요. 안부 전화 한 통 어떠세요? 결식으로 확정하지 않습니다.');
  state.careAlerts=next;
}
export function requestHelp(state,source='button'){
  if(!state.consent)throw Error('공유를 켜야 같은 탭의 가족 화면에 요청을 남길 수 있어요. 실제 긴급 상황은 이 데모를 기다리지 말고 직접 연락해 주세요.');
  if(!['button','voice-demo'].includes(source))throw Error('도움 요청 방식이 올바르지 않습니다.');
  if(state.help?.status==='pending')return evaluate(state);
  state.help={at:state.now,source,status:'pending'};activity(state);return evaluate(state);
}
export function resolveHelp(state,statusValue){
  if(!['acknowledged','cancelled'].includes(statusValue)||!state.help)throw Error('처리할 도움 요청이 없습니다.');
  state.help={...state.help,status:statusValue};return evaluate(state);
}
export function setSocial(state,kind){
  if(!state.consent)throw Error('공유를 중지한 상태입니다.');
  if(!['call','walk','company'].includes(kind))throw Error('안부 요청을 선택해 주세요.');
  state.social={kind,at:state.now,handled:false};return state;
}
