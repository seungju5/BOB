// Same-tab invitation rehearsal. These codes are deliberately not authentication tokens.
import {dayOf,MEALS,status,hhmm} from './engine.mjs';

export const FAMILY_ROLES={caregiver:'돌봄 가족',viewer:'요약 보기'};

export function createInvite(state,name,role='viewer') {
  if(!state.consent)throw Error('공유를 시작한 뒤 초대를 체험해 주세요.');
  const alias=typeof name==='string'?name.trim():'';
  if(alias.length<2||alias.length>20||/[\u0000-\u001f]/.test(alias))throw Error('가상 별명을 2~20자로 입력해 주세요.');
  if(!Object.hasOwn(FAMILY_ROLES,role))throw Error('공유 역할을 선택해 주세요.');
  if(state.family.members.some(member=>member.name===alias))throw Error('이미 연결된 별명입니다. 다른 가상 별명을 사용해 주세요.');
  const serial=++state.family.sequence;
  state.family.invite={code:`DEMO-${String(serial).padStart(4,'0')}`,name:alias,role,expiresAt:state.now+1440};
  return {...state.family.invite};
}

export function acceptInvite(state,code) {
  const invitation=state.family.invite;
  if(!state.consent||!invitation||typeof code!=='string'||code.trim()!==invitation.code)throw Error('현재 탭에서 만든 초대 코드를 확인해 주세요.');
  if(state.now>=invitation.expiresAt)throw Error('초대가 만료됐어요. 새 초대를 만들어 주세요.');
  if(state.family.members.some(member=>member.name===invitation.name))throw Error('이미 연결된 별명입니다.');
  const member={id:`member-${state.family.sequence}`,name:invitation.name,role:invitation.role,joinedAt:state.now};
  state.family.members.push(member);
  state.family.invite=null;
  return {...member};
}

export function revokeMember(state,memberId) {
  if(!state.family.members.some(member=>member.id===memberId))throw Error('연결된 가족을 찾을 수 없어요.');
  state.family.members=state.family.members.filter(member=>member.id!==memberId);
}

export function familySummary(state,memberId) {
  const member=state.family.members.find(person=>person.id===memberId);
  if(!state.consent||!member)throw Error('공유가 중지되었거나 해제된 연결입니다.');
  // Whitelist a small derived summary: no profile, power readings, or raw events.
  return {
    demo:true,role:member.role,day:dayOf(state.now),
    meals:MEALS.map(id=>({id,status:status(state,dayOf(state.now),id)})),
    lastCookerSignal:state.devices.cooker.lastActivity===null?null:hhmm(state.devices.cooker.lastActivity),
    helpRequested:member.role==='caregiver'&&state.help?.status==='pending',
  };
}
