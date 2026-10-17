// Presentation read models only. All decisions still come from the shared engine.
import {MEALS,LABELS,createState,evaluate,record,status,dayOf,hhmm,inAway,deviceOnline,ingestDevice,confirmMeal,setAway,setDeviceOnline,advance,requestHelp} from './engine.mjs';

export function reportDayAfterKey(days,current,key){
  if(!days.length||!['ArrowLeft','ArrowRight','Home','End'].includes(key))return null;
  const index=days.includes(current)?days.indexOf(current):days.length-1;
  return days[key==='Home'?0:key==='End'?days.length-1:Math.max(0,Math.min(days.length-1,index+(key==='ArrowRight'?1:-1)))];
}

export function mealEvidence(state,day,meal){
  if(!Number.isInteger(day)||!MEALS.includes(meal))throw Error('확인할 날짜와 끼니를 선택해 주세요.');
  const kind=status(state,day,meal),r=record(state,day,meal),window=state.config.windows.find(w=>w.id===meal);
  const sources=[];
  if(state.consent){
    if(r.sensor)sources.push({label:'밥솥 사용 신호',detail:'취사 또는 뚜껑 열림 신호가 이 시간대에 들어왔어요.'});
    if(r.manual)sources.push({label:r.eatOut?'직접 남긴 외식 소식':'직접 확인한 소식',detail:r.eatOut?'밖에서 식사했다는 소식을 가장 가까운 끼니에 반영했어요.':'체험에서 직접 확인한 기록이에요.'});
  }
  const empty={private:'공유를 쉬는 동안에는 기록을 보여주지 않아요.',away:'외출 일정과 겹쳐 확인 알림을 쉬고 있어요.',offline:'기기 연결이 끊겨 소식을 확인할 수 없어요. 결식으로 판단하지 않아요.',upcoming:'아직 이 끼니의 시간이 아니에요.',waiting:'식사 시간 동안 새 소식을 기다리고 있어요.',unobserved:'관찰을 시작하기 전의 끼니예요.',unplanned:'평소 챙기는 끼니로 설정되지 않았어요.',missing:'이 시간대의 확인 기록이 없어요. 실제 식사 여부는 직접 안부를 물어봐 주세요.'};
  return {meal,label:LABELS[meal],day,kind,window:`${hhmm(window.start)}–${hhmm(window.end)}`,sources,detail:empty[kind]||'기록을 기준으로 끼니 확인에 반영했어요. 실제 섭취량이나 건강 상태는 알 수 없어요.'};
}

export function careHeadline(state){
  const pending=Object.values(state.careAlerts).filter(a=>!a.handled);
  const confirmed=MEALS.filter(id=>['confirmed','eat_out'].includes(status(state,dayOf(state.now),id))).length;
  if(state.help?.status==='pending')return {tone:'attention',title:'가족의 연락을 기다려요',detail:'도움 요청이 있어요. 직접 연락해 안부를 확인해 주세요.',confirmed};
  if(!state.consent)return {tone:'quiet',title:'잠시, 공유를 쉬어요',detail:'안부를 나누는 속도도 내가 정해요.',confirmed};
  if(inAway(state))return {tone:'away',title:'오늘은 바깥에서 보내요',detail:'외출 일정 동안 확인 알림을 쉬어요.',confirmed};
  if(!deviceOnline(state,'cooker'))return {tone:'quiet',title:'연결을 먼저 살펴봐요',detail:'소식이 없는 이유가 기기 연결일 수 있어요.',confirmed};
  if(pending.length)return {tone:'attention',title:'한 번, 안부를 물어볼까요?',detail:'확인할 소식이 있어요. 통화로 하루를 나눠 보세요.',confirmed};
  const deviceEvidence=MEALS.some(id=>record(state,dayOf(state.now),id).sensor);
  return confirmed?{tone:'warm',title:'작은 안부가 도착했어요',detail:deviceEvidence?'평소의 움직임이 반가운 소식이 돼요.':'직접 남긴 소식으로 오늘의 안부를 나눠요.',confirmed}:{tone:'quiet',title:'오늘의 소식을 기다려요',detail:'기록이 없다고 식사를 거른 것은 아니에요.',confirmed};
}

export const JOURNEY_SCENARIOS=Object.freeze([
  {id:'ordinary',label:'평소처럼',title:'평소의 하루가 안부로',description:'뚜껑 열림 신호가 점심의 끼니 확인에 반영돼요. 식사량을 뜻하지는 않아요.'},
  {id:'eatout',label:'외식',title:'밖에서 먹어도, 안심하고',description:'어르신이 외식 소식을 남기면 가까운 끼니에 별도로 표시해요.'},
  {id:'away',label:'외출',title:'외출한 날에는 기다려요',description:'외출 일정과 겹친 끼니는 확인 알림에서 제외해요.'},
  {id:'offline',label:'연결 끊김',title:'연결 문제를 구분해요',description:'연결 중단을 결식으로 바꾸지 않아요. 2시간 이상 끊기면 기기 확인을 안내해요.'},
  {id:'help',label:'도움 요청',title:'필요한 순간은 더 또렷하게',description:'요청을 먼저 보여주고 직접 연락하도록 안내해요. 이 체험은 실제 연락·신고를 하지 않아요.'},
]);

// Each scene is rebuilt in its own memory; never mutate the caller's demo or account.
export function journeyScene(step=0,scenario='ordinary'){
  if(!Number.isInteger(step)||step<0||step>3)throw Error('올바른 체험 단계를 선택해 주세요.');
  if(!JOURNEY_SCENARIOS.some(item=>item.id===scenario))throw Error('지원하지 않는 체험 장면이에요.');
  const scene=createState(false);
  scene.now=702;scene.sharedFrom=0;scene.setup={complete:true,plug:true,wifi:true};
  scene.records['0:breakfast']={manual:false,sensor:true,exempt:false,eatOut:false};
  scene.lastActivityAt=510;scene.devices.cooker.lastActivity=510;
  if(step>0){
    if(step<3||scenario==='ordinary')ingestDevice(scene,'cooker','lid');
    else if(scenario==='eatout')confirmMeal(scene,'lunch',true);
    else if(scenario==='away')setAway(scene,scene.now,1080);
    else if(scenario==='offline'){setDeviceOnline(scene,'cooker',false);advance(scene,180);}
    else requestHelp(scene);
  }
  return evaluate(scene);
}
