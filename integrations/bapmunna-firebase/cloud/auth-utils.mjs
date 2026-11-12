export const CONSENT_VERSION='2026-10-16';
export const MEAL_NAMES={breakfast:'아침',lunch:'점심',dinner:'저녁'};
export const STAGES={new:'신규',contacted:'안내 중',active:'이용 중',paused:'보류'};
export function koreanDay(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const value=type=>parts.find(part=>part.type===type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function checkDisplayName(value){
  const name=String(value??'').trim();
  if(name.length<2||name.length>30||/[\u0000-\u001f]/.test(name))throw Error('표시 이름을 2~30자로 입력해 주세요.');
  return name;
}
export function checkMeal(slot,kind){
  if(!Object.hasOwn(MEAL_NAMES,slot)||!['home','outside'].includes(kind))throw Error('끼니와 식사 종류를 확인해 주세요.');
}
export function authMessage(error){
  const code=String(error?.code||'');
  if(/popup-closed-by-user|cancelled-popup-request|access_denied/.test(code))return '로그인이 취소됐어요. 원하실 때 다시 시작해 주세요.';
  if(/popup-blocked/.test(code))return '로그인 창이 차단됐어요. Safari나 Chrome에서 이 페이지를 열고 팝업을 허용한 뒤 다시 눌러 주세요.';
  if(/unauthorized-domain|operation-not-allowed|provider_disabled/.test(code))return '이 로그인 방법의 연결을 준비하고 있어요. 다른 방법으로 시작해 주세요.';
  if(/email_address_not_authorized|email_provider_disabled/.test(code))return '이 주소에는 아직 확인 메일을 보낼 수 없어요. Firebase 버전에서 회원가입하거나 운영자에게 메일 설정을 요청해 주세요.';
  if(/network|fetch|unavailable|timeout/i.test(code))return '연결을 확인한 뒤 다시 시도해 주세요.';
  if(/too-many|over_email|rate_limit/i.test(code))return '요청이 잠시 많아요. 잠시 후 다시 시도해 주세요.';
  if(/weak.password|password_too_short|password-does-not-meet/i.test(code))return '비밀번호를 8자 이상으로 입력하고 안내된 비밀번호 기준을 확인해 주세요.';
  if(/permission-denied|42501|PGRST301/.test(code))return '이 작업의 권한이 없어요. 이메일 확인과 로그인 상태를 확인해 주세요.';
  return '진행하지 못했어요. 입력 정보와 이메일 확인 여부를 확인해 주세요.';
}
