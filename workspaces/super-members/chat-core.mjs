export const MAX_INPUT=2000,MAX_TURNS=30,MAX_HISTORY_PAIRS=8,MAX_OUTPUT=16000;
export const STORAGE_KEY='warming-up:office:conversations:v1';
export function cleanTurns(value){
 if(!Array.isArray(value))return [];
 return value.filter(t=>t&&typeof t.user==='string'&&typeof t.answer==='string'&&t.answer.trim())
  .slice(-MAX_TURNS).map(t=>({user:t.user.slice(0,MAX_INPUT),answer:t.answer.slice(0,MAX_OUTPUT),at:typeof t.at==='string'?t.at:''}));
}
export function readConversations(storage,ids){
 try{const saved=JSON.parse(storage.getItem(STORAGE_KEY)||'{}');return Object.fromEntries(ids.map(id=>[id,cleanTurns(saved?.[id])]));}
 catch{return Object.fromEntries(ids.map(id=>[id,[]]));}
}
export function saveConversations(storage,conversations){try{storage.setItem(STORAGE_KEY,JSON.stringify(conversations));return true;}catch{return false;}}
export function historyFor(turns){return cleanTurns(turns).slice(-MAX_HISTORY_PAIRS).flatMap(t=>[{role:'user',parts:[{text:t.user}]},{role:'model',parts:[{text:t.answer}]}]);}
export function validateMessage(value){const text=String(value||'').trim();if(!text)throw Error('먼저 하고 싶은 말을 적어 주세요.');if(text.length>MAX_INPUT)throw Error(`한 번에 ${MAX_INPUT}자까지 적어 주세요.`);return text;}
export function friendlyError(error){
 const code=String(error?.code||'')+' '+String(error?.message||error||'');
 if(/abort|cancel/i.test(code))return '답변을 멈췄어요. 이어서 말하고 싶을 때 다시 보내 주세요.';
 if(/429|quota|resource.exhausted|rate.limit/i.test(code))return '무료 대화 한도에 도달했어요. 잠시 후 다시 시도해 주세요. 한도 초기화까지 기다려야 할 수도 있어요. 유료로 자동 전환되지는 않아요.';
 if(/app.check|app-check|recaptcha|403|permission|unauthorized|401/i.test(code))return 'AI 연결을 확인하지 못했어요. 공개 주소에서 새로고침한 뒤 다시 시도해 주세요. 계속되면 연결 설정을 점검해야 해요.';
 if(/404|model.*not.*found|unsupported.*model/i.test(code))return '현재 AI 모델을 사용할 수 없어요. 모델 설정을 점검해야 해요.';
 if(/offline|network|fetch|timeout|timed.out/i.test(code))return '연결이 잠시 끊겼어요. 인터넷 상태를 확인하고 다시 보내 주세요.';
 if(/safety|blocked|finish.reason|empty.response/i.test(code))return '이 질문에는 답변을 만들지 못했어요. 표현을 바꾸거나 조금 더 구체적으로 물어봐 주세요.';
 if(/production.host/i.test(code))return '실제 AI 대화는 공개 작업실 주소에서 사용할 수 있어요.';
 return '답변을 받지 못했어요. 잠시 후 다시 보내 주세요. 작성한 내용은 입력칸에 남겨둘게요.';
}
export function handoffText(member,turns){return `밥뭇나 Super Members · ${member.name} (${member.agentId}) 작업 인계\n\n이 내용은 웹 작업실의 AI 제안입니다. 실제 코드·서버 변경이나 검증 완료가 아닙니다.\n무료 Spark 유지, 기존 앱/계정 분리, 원본 토끼 보존 조건에서 현재 소스를 먼저 확인하고 구현·검증해 주세요.\n\n`+cleanTurns(turns).slice(-3).map(t=>`요청: ${t.user}\n\n${member.name}의 제안:\n${t.answer}`).join('\n\n---\n\n');}
