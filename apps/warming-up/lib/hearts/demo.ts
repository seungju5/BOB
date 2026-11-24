import {advanceHearts,buyHeartItem,createHeartState,equipHeartItem,heartDate,heartLeague,heartSummary,setHeartGoal,validateHeartState,type HeartState} from '@/packages/walking-hearts/core.mjs';
import {type HeartsSnapshot,type HeartMessage,type HeartAction} from './client';
const KEY='bapmunna.hearts.demo.v1';
export type HeartsDemo=HeartsSnapshot&{state:HeartState;enabled:boolean;joined:true};
function addDays(date:string,days:number){return heartDate(Date.parse(date+'T12:00:00+09:00')+days*86400000);}
export function createHeartsDemo(now=new Date()):HeartsDemo{
  const today=heartDate(now);let state=createHeartState({date:addDays(today,-3)});
  for(let day=-3;day<0;day++){const date=addDays(today,day);state=advanceHearts(state,{date,count:5000,cooking:true,now:date+'T12:00:00+09:00'});}
  state=advanceHearts(state,{date:today,count:4800,cooking:true,now});
  const messages:HeartMessage[]=[{id:'demo-letter',text:'오늘도 어머니의 하루를 응원해요. 무리하지 말고, 좋아하는 길로 천천히 걸어요. 사랑해요!',photo:null,createdAt:now.toISOString(),readAt:null,unlockedAt:now.toISOString(),unlockPercent:25,locked:false,type:'message'}];
  return {enabled:true,joined:true,state,messages,leagueEnabled:true,region:'세종 조치원'};
}
export function readStoredHeartsDemo(now=new Date()):HeartsDemo|null{
  try{
    const stored=JSON.parse(localStorage.getItem(KEY)||'null');
    if(stored?.joined===true&&Array.isArray(stored.messages)&&stored.messages.length<=20){
      const state=validateHeartState(stored.state);
      const valid=stored.messages.every((m:HeartMessage)=>typeof m.id==='string'&&typeof m.createdAt==='string'&&(m.text===null||typeof m.text==='string'&&m.text.length<=280)&&(m.photo===null||typeof m.photo==='string'&&m.photo.length<214000&&/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+=*$/.test(m.photo)));
      if(valid)return unlockDemoMessages({...stored,state:advanceHearts(state,{date:heartDate(now),count:heartDate(now)===state.date?state.days[state.date]?.count??null:null,now})},now);
    }
  }catch{/* A damaged example never affects the real account. */}
  return null;
}
export function readHeartsDemo(now=new Date()):HeartsDemo{return readStoredHeartsDemo(now)??createHeartsDemo(now);}
export function saveHeartsDemo(value:HeartsDemo){try{localStorage.setItem(KEY,JSON.stringify(value));return true;}catch{return false;}}
export function actHeartsDemo(value:HeartsDemo,action:HeartAction,body:Record<string,unknown>={},now=new Date()):HeartsDemo{
  const next={...value,messages:[...value.messages]};
  if(action==='heartsettings'){
    if(body.goal!=null)next.state=setHeartGoal(next.state,Number(body.goal));
    if(typeof body.enabled==='boolean')next.enabled=body.enabled;
    if(typeof body.leagueEnabled==='boolean')next.leagueEnabled=body.leagueEnabled;
    if(typeof body.region==='string')next.region=body.region.trim().slice(0,30);
  }else if(action==='heartbuy')next.state=buyHeartItem(next.state,String(body.itemId));
  else if(action==='heartequip')next.state=equipHeartItem(next.state,String(body.itemId));
  else if(action==='heartgift'){
    const id=String(body.itemId),already=next.state.owned.includes(id as never);next.state=buyHeartItem(next.state,id);
    if(!already)next.messages.unshift({id:'gift-'+id,text:'가족이 토끼에게 새 선물을 보냈어요. 함께 모은 하트로 준비했어요!',photo:null,createdAt:now.toISOString(),readAt:null,unlockPercent:0,locked:false,type:'gift',itemId:id});
  }else if(action==='heartmessage'){
    const text=String(body.text??'').trim();if(!text||text.length>280)throw Error('invalid_message');
    if(next.messages.length>=20)throw Object.assign(Error('message_limit'),{code:'message_limit'});
    const unlockPercent=Number(body.unlockPercent??0);
    next.messages.unshift({id:crypto.randomUUID(),text,photo:typeof body.photo==='string'?body.photo:null,createdAt:now.toISOString(),readAt:null,unlockPercent,locked:(heartSummary(next.state,heartDate(now)).percent??0)<unlockPercent,type:'message'});
  }else if(action==='heartread')next.messages=next.messages.map(m=>{if(m.id!==body.id)return m;if(m.locked)throw Error('message_locked');return {...m,readAt:now.toISOString()};});
  else if(action==='heartleave')return createHeartsDemo(now);
  return unlockDemoMessages(next,now);
}
export function demoLeague(value:HeartsDemo,date:string){
  const example=(count:number)=>advanceHearts(createHeartState({date}),{date,count,cooking:true,now:date+'T12:00:00+09:00'});
  return {...heartLeague([{publicId:'demo-self',nickname:'나의 예시',region:value.region,state:value.state},{publicId:'demo-sun',nickname:'햇살친구 · 예시',region:value.region,state:example(6200)},{publicId:'demo-forest',nickname:'숲길친구 · 예시',region:value.region,state:example(3100)}],date),myPublicId:'demo-self',minimumForPromotion:10,practice:true};
}

export function unlockDemoMessages(value:HeartsDemo,now:Date):HeartsDemo{
  const percent=heartSummary(value.state,heartDate(now)).percent??0;
  return {...value,messages:value.messages.map(message=>{const unlocked=!!message.unlockedAt||!!message.readAt||percent>=message.unlockPercent;return {...message,locked:!unlocked,unlockedAt:message.unlockedAt||(unlocked?now.toISOString():null)};})};
}
