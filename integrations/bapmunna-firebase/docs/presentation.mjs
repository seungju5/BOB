import {MEALS,dayOf,status,deviceOnline} from './engine.mjs';

export const STATUS_COPY={
  confirmed:'확인됨',eat_out:'외식',signal:'기기 신호',waiting:'대기 중',missing:'미확인',
  offline:'연결 확인 필요',away:'외출 · 알림 제외',upcoming:'아직 식사 시간 전',
  unobserved:'관찰 전 · 기록 없음',private:'공유 쉬는 중',
  unplanned:'설정하지 않은 끼니',
};

// The amount of illustrated rice expresses evidence type, never food intake.
export function riceState(state,meal) {
  if(!MEALS.includes(meal))throw Error('밥그릇에 표시할 끼니를 선택해 주세요.');
  const current=status(state,dayOf(state.now),meal);
  if(current==='confirmed')return {level:'full',status:current,title:'반가운 끼니 소식이 있어요.',detail:'취사·열림 또는 직접 확인을 반영했어요. 실제 섭취를 증명하지는 않아요.'};
  if(current==='eat_out')return {level:'full',status:current,title:'밖에서 드신 소식이에요.',detail:'어르신이 외식을 직접 확인했어요.'};
  if(current==='private')return {level:'empty',status:current,title:'공유를 쉬고 있어요.',detail:'새 식사·기기 요약을 기록하지 않아요.'};
  if(current==='unplanned')return {level:'empty',status:current,title:'이 끼니는 확인 알림을 쉬어요.',detail:'평소 식사하는 끼니로 설정하지 않았어요.'};
  if(current==='away')return {level:'empty',status:current,title:'지금은 외출 중이에요.',detail:'외출과 겹친 끼니는 확인 알림에서 제외해요.'};
  if(!deviceOnline(state,'cooker'))return {level:'empty',status:'offline',title:'밥솥 연결을 확인해 주세요.',detail:'신호 공백으로 식사 여부를 판단하지 않아요.'};
  if(current==='signal')return {level:'half',status:current,title:'밥솥의 움직임이 전해졌어요.',detail:'기기 신호만 있어요. 식사 직접 확인은 아직이에요.'};
  return {level:'empty',status:current,title:'직접 남긴 소식을 기다려요.',detail:current==='upcoming'?'아직 이 끼니의 식사 시간 전이에요.':'빈 그릇은 기록이 없다는 표현이에요. 결식을 뜻하지 않아요.'};
}
