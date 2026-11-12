import {MEALS,LABELS,DAY,dayOf,hhmm,configure,updateProfile,evaluate,record,setDeviceOnline} from './engine.mjs';
import {canonicalPattern} from './parity.mjs';

export const SETUP_STEPS=['스마트플러그','Wi-Fi 확인','우리 집','식사 시간','밥솥 습관','안부 기준'];
export function setupDraft(state){
  return {step:0,plug:state.setup.plug,wifi:state.setup.wifi,residents:state.profile.residents,pets:state.profile.pets,meals:[...state.profile.meals],windows:state.config.windows.map(w=>({...w})),grace:state.config.grace,eatOutWeekly:state.profile.eatOutWeekly,keepWarm:state.profile.keepWarm,cookWeekly:state.profile.cookWeekly,consecutiveMissed:state.rules.consecutiveMissed,inactiveHours:state.rules.inactiveHours,followupHours:state.rules.followupHours};
}
const integerBetween=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;
export function validateSetup(draft,step){
  if(step===0&&!draft.plug)throw Error('가상 스마트플러그 연결을 먼저 확인해 주세요.');
  if(step===1&&!draft.wifi)throw Error('가상 Wi-Fi 확인을 눌러 주세요.');
  if(step===2&&(!integerBetween(draft.residents,1,10)||!integerBetween(draft.pets,0,10)))throw Error('사람은 1–10명, 반려동물은 0–10마리로 입력해 주세요.');
  if(step===3){
    if(!Array.isArray(draft.meals)||!draft.meals.length||new Set(draft.meals).size!==draft.meals.length||draft.meals.some(m=>!MEALS.includes(m)))throw Error('평소 식사하는 끼니를 한 개 이상 선택해 주세요.');
    if(!integerBetween(draft.eatOutWeekly,0,draft.meals.length*7))throw Error('외식 횟수는 일주일의 전체 끼니보다 많을 수 없어요.');
    if(draft.grace!==0||draft.windows.length!==3)throw Error('Supabase 기준은 별도 유예 없이 식사 시간 종료 시 판정해요.');
    draft.windows.forEach((w,i)=>{if(w.id!==MEALS[i]||!integerBetween(w.start,0,1439)||!integerBetween(w.end,w.start+1,DAY-draft.grace)||(i&&w.start<draft.windows[i-1].end+draft.grace))throw Error('식사 시간이 서로 겹치지 않게 선택해 주세요.');});
  }
  if(step===4&&(!integerBetween(draft.cookWeekly,0,21)||typeof draft.keepWarm!=='boolean'))throw Error('보온 여부와 일주일 취사 횟수(0–21회)를 확인해 주세요.');
  if(step===5&&(!integerBetween(draft.consecutiveMissed,1,6)||!integerBetween(draft.inactiveHours,1,71)||!integerBetween(draft.followupHours,draft.inactiveHours+1,72)))throw Error('연속 끼니는 1–6끼, 재확인은 주의보다 늦게(최대 72시간) 설정해 주세요.');
  return draft;
}
export function applySetup(state,draft){
  for(let i=0;i<SETUP_STEPS.length;i++)validateSetup(draft,i);
  // Validate on a clone, then commit together. Invalid setup cannot partially apply.
  const next=structuredClone(state);
  configure(next,draft.windows,draft.grace);
  updateProfile(next,{residents:draft.residents,pets:draft.pets,household:draft.residents===1?'alone':'together',primaryDevice:'cooker',meals:draft.meals,eatOutWeekly:draft.eatOutWeekly,keepWarm:draft.keepWarm,cookWeekly:draft.cookWeekly,riceRoutine:draft.cookWeekly>=7?'daily':draft.cookWeekly?'sometimes':'rare',cookEveryDays:draft.cookWeekly?Math.max(1,Math.min(7,Math.round(7/draft.cookWeekly))):7},{consecutiveMissed:draft.consecutiveMissed,inactiveHours:draft.inactiveHours,followupHours:draft.followupHours});
  next.setup={complete:true,plug:draft.plug,wifi:draft.wifi};
  if(!next.online)setDeviceOnline(next,'cooker',true);
  Object.assign(state,next);return evaluate(state);
}
export function readSetupForm(draft,fields){
  const next=structuredClone(draft),minute=value=>{const [h,m]=String(value).split(':').map(Number);return h*60+m;};
  if(next.step===2){next.residents=Number(fields.get('residents'));next.pets=Number(fields.get('pets'));}
  if(next.step===3){next.meals=fields.getAll('meals');next.eatOutWeekly=Number(fields.get('eatOutWeekly'));next.grace=Number(fields.get('grace'));next.windows=MEALS.map(id=>({id,start:minute(fields.get(`${id}-start`)),end:minute(fields.get(`${id}-end`))}));}
  if(next.step===4){next.keepWarm=fields.get('keepWarm')==='yes';next.cookWeekly=Number(fields.get('cookWeekly'));}
  if(next.step===5)for(const name of ['consecutiveMissed','inactiveHours','followupHours'])next[name]=Number(fields.get(name));
  return next;
}
export function dateInput(time){return new Date(Date.UTC(2026,9,7)+time*60000).toISOString().slice(0,16);}
export function parseDateInput(value){
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(String(value)))throw Error('출발과 귀가 날짜·시간을 선택해 주세요.');
  const minutes=(Date.parse(value+':00Z')-Date.UTC(2026,9,7))/60000;
  if(!Number.isInteger(minutes)||dateInput(minutes)!==value)throw Error('날짜가 올바르지 않아요.');
  return minutes;
}
export function patternComparison(state){
  return canonicalPattern(state);
}
const setupNumber=(name,label,value,min,max,unit)=>`<label class="field">${label}<span class="input-unit"><input name="${name}" type="number" min="${min}" max="${max}" step="1" value="${value}" required><span>${unit}</span></span></label>`;
export function setupContent(d){
  if(d.step===0)return `<div class="setup-device" aria-hidden="true"><span>⌁</span><small>SmartThings</small></div><h2>밥솥의 소식을<br>함께 들어볼까요?</h2><p>스마트플러그가 전력 변화를 전하는 과정을 연습해요.</p><button type="button" class="${d.plug?'':'primary'} full" data-action="setup-plug">${d.plug?'✓ 가상 플러그 연결됨':'가상 스마트플러그 연결'}</button><p class="caption">Samsung 계정 로그인이나 실제 기기 연결은 하지 않아요. 실제 연동은 후속 개발입니다.</p>`;
  if(d.step===1)return `<div class="setup-device" aria-hidden="true"><span>⌁</span><small>Wi-Fi</small></div><h2>작은 소식이<br>잘 도착하도록.</h2><p>기기가 통신할 수 있는 상태인지 확인하는 단계예요.</p><button type="button" class="${d.wifi?'':'primary'} full" data-action="setup-wifi">${d.wifi?'✓ 가상 Wi-Fi 확인됨':'가상 Wi-Fi 확인'}</button><p class="caption">실제 네트워크를 검색하거나 비밀번호를 수집하지 않아요.</p>`;
  if(d.step===2)return `<h2>함께 지내는<br>우리 집을 알려주세요.</h2><p>혼자 사셔도, 두 분이 함께 사셔도 좋아요.</p>${setupNumber('residents','함께 사는 사람',d.residents,1,10,'명')}${setupNumber('pets','반려동물',d.pets,0,10,'마리')}<p class="notice">신호와 알림은 <strong>가구 전체</strong> 기준이에요. 누가 식사했는지 구별하지 못해요. 반려동물을 사람의 식사 횟수로 계산하지 않아요.</p>`;
  if(d.step===3)return `<h2>익숙한 식사 시간,<br>그대로 알려주세요.</h2><fieldset class="meal-choices"><legend>평소 챙기는 끼니 · 하루 ${d.meals.length}끼</legend><div class="checkboxes">${MEALS.map(id=>`<label><input name="meals" type="checkbox" value="${id}" ${d.meals.includes(id)?'checked':''}>${LABELS[id]}</label>`).join('')}</div></fieldset><details class="editor-extra"><summary>식사 시간 바꾸기</summary>${d.windows.map(w=>`<fieldset class="meal-time-field"><legend>${LABELS[w.id]}</legend><div class="field-row"><label class="field">시작<input type="time" name="${w.id}-start" value="${hhmm(w.start)}" required></label><label class="field">종료<input type="time" name="${w.id}-end" value="${hhmm(w.end)}" required></label></div></fieldset>`).join('')}</details>${setupNumber('eatOutWeekly','일주일 외식 횟수',d.eatOutWeekly,0,21,'회')}<input type="hidden" name="grace" value="0">`;
  if(d.step===4)return `<h2>밥솥도 집집마다<br>쓰는 방법이 다르니까.</h2><label class="field">보온 기능을 사용하시나요?<select name="keepWarm"><option value="yes" ${d.keepWarm?'selected':''}>네, 보온해요</option><option value="no" ${!d.keepWarm?'selected':''}>아니요, 보온하지 않아요</option></select></label>${setupNumber('cookWeekly','일주일에 밥 짓는 횟수',d.cookWeekly,0,21,'회')}<p class="notice">보온은 취사나 식사로 세지 않아요. 밥솥을 자주 쓰지 않는 집은 신호만으로 일상을 파악하기 어려워요.</p>`;
  return `<h2>거의 다 왔어요!<br>안부를 물을 때를 정해요.</h2>${setupNumber('consecutiveMissed','연속으로 소식이 없는 끼니',d.consecutiveMissed,1,6,'끼')}<div class="setup-thresholds">${setupNumber('inactiveHours','활동 소식이 없을 때 · 주의',d.inactiveHours,1,71,'시간')}${setupNumber('followupHours','가족에게 다시 확인 요청',d.followupHours,2,72,'시간')}</div><p class="notice">기능정의서의 기본값은 <strong>2끼 · 48시간 · 72시간</strong>이에요. 검증 전의 실험 기준이며 실제 결식·위험 판단이나 자동 신고 기준이 아니에요.</p><p class="caption">이 탭에만 적용돼요. 새로고침하면 처음 예시로 돌아가요.</p>`;
}
