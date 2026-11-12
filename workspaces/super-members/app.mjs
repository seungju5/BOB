import {members,memberById} from './roles.mjs';
import {initOffice} from './room.mjs';
import {connectAI,askMember} from './firebase-client.mjs';
import {readConversations,saveConversations,validateMessage,friendlyError,handoffText,MAX_TURNS} from './chat-core.mjs';
const $=id=>document.getElementById(id);
const ids=members.map(m=>m.id);
let storage;try{storage=localStorage;}catch{storage={getItem:()=>null,setItem:()=>{throw Error('Storage unavailable');}};}
const conversations=readConversations(storage,ids);
const consentKey='warming-up:office:consent:v1';
let consent=false;try{consent=storage.getItem(consentKey)==='yes';}catch{}
let selected=memberById(location.hash.slice(1)),pending=null,lastSent=0;
const drafts={},errors={},failedRequests={};
const office=initOffice({members,onSelect:select});
const messages=$('messages'),input=$('chat-input');
const announce=$('chat-status');
function setStatus(message){announce.textContent=message;}
function bubble(kind,text,label){
 const node=document.createElement('article');node.className=`message message--${kind}`;
 const heading=document.createElement('div');heading.className='message-label';heading.textContent=label;
 const body=document.createElement('div');body.className='message-text';body.textContent=text;
 node.append(heading,body);return node;
}
function render(){
 const member=selected,turns=conversations[member.id];
 $('member-name').textContent=member.name;
 $('member-role').textContent=member.role;
 $('member-avatar').style.backgroundImage=`url('${member.sprite}')`;
 $('member-avatar').setAttribute('aria-label',member.name+' 토끼');
 messages.replaceChildren(bubble('welcome',`${member.greeting}\n${member.description}`,member.name+'의 인사'));
 for(const turn of turns){messages.append(bubble('user',turn.user,'나'),bubble('assistant',turn.answer,member.name));}
 if(pending?.id===member.id){messages.append(bubble('user',pending.message,'나'));const reply=bubble(pending.text?'assistant':'thinking',pending.text||'생각을 모으고 있어요…',member.name);reply.id='pending-reply';messages.append(reply);}
 if(errors[member.id]){if(failedRequests[member.id])messages.append(bubble('user',failedRequests[member.id],'답변을 받지 못한 요청'));messages.append(bubble('error',errors[member.id],'연결 안내'));}
 $('prompt-chips').replaceChildren(...member.prompts.map(prompt=>{const b=document.createElement('button');b.type='button';b.className='prompt-chip';b.textContent=prompt;b.onclick=()=>{input.value=prompt;drafts[member.id]=prompt;input.focus();resizeInput();};return b;}));
 input.value=drafts[member.id]||'';input.placeholder=`${member.name}에게 하고 싶은 말을 적어 주세요`;
 $('clear-chat').disabled=!!pending||turns.length===0;
 $('export-chat').disabled=turns.length===0;
 $('handoff-copy').disabled=turns.length===0;
 $('consent-panel').hidden=consent;
 input.disabled=!consent;
 $('send-button').disabled=!consent||!!pending&&pending.id!==member.id;
 $('send-button').textContent=pending?.id===member.id?'답변 멈추기':'보내기';
 $('send-button').setAttribute('aria-label',pending?.id===member.id?'답변 멈추기':'메시지 보내기');
 messages.setAttribute('aria-busy',String(!!pending&&pending.id===member.id));
 if(pending)setStatus(`${memberById(pending.id).name} · 답변을 만들고 있어요`);
 else setStatus(turns.length?'대화 목록은 이 브라우저에 저장돼요':'한 가지 궁금한 것부터 물어보세요');
 resizeInput();scrollMessages();
}
function resizeInput(){input.style.height='auto';input.style.height=Math.min(input.scrollHeight,140)+'px';}
function scrollMessages(){messages.scrollTop=messages.scrollHeight;}
function select(id){
 if(input&&selected)drafts[selected.id]=input.value;
 selected=memberById(id);office.select(selected.id);history.replaceState(null,'','#'+selected.id);render();
}
async function verifyConnection(){
 $('connection-status').textContent='AI 연결 확인 중';
 try{await connectAI();$('connection-status').textContent='AI 대화 준비';}
 catch(error){$('connection-status').textContent='연결 확인 필요';errors[selected.id]=friendlyError(error);render();}
}
$('consent-checkbox').addEventListener('change',()=>{$('consent-start').disabled=!$('consent-checkbox').checked;});
$('consent-start').addEventListener('click',()=>{
 if(!$('consent-checkbox').checked)return;
 consent=true;try{storage.setItem(consentKey,'yes');}catch{}
 render();verifyConnection();input.focus();
});
input.addEventListener('input',()=>{drafts[selected.id]=input.value;resizeInput();});
input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&!event.altKey&&!event.ctrlKey){event.preventDefault();$('chat-form').requestSubmit();}});
$('chat-form').addEventListener('submit',async event=>{
 event.preventDefault();
 if(pending){if(pending.id===selected.id)pending.controller.abort();return;}
 if(!consent)return;
 let message;try{message=validateMessage(input.value);}catch(error){setStatus(error.message);return;}
 if(Date.now()-lastSent<6000){setStatus('조금만 기다렸다 다시 보내 주세요.');return;}
 const member=selected,controller=new AbortController();lastSent=Date.now();
 pending={id:member.id,message,text:'',controller};errors[member.id]='';failedRequests[member.id]='';drafts[member.id]='';office.setTalking(member.id,true);render();
 try{
  const answer=await askMember({member,turns:conversations[member.id],message,signal:controller.signal,onChunk:text=>{
   if(controller.signal.aborted)return;pending.text=text;
   if(selected.id===member.id){const node=$('pending-reply');if(node){node.className='message message--assistant';node.querySelector('.message-text').textContent=text;scrollMessages();}}
  }});
  if(controller.signal.aborted)throw new DOMException('Cancelled','AbortError');
  conversations[member.id]=[...conversations[member.id],{user:message,answer,at:new Date().toISOString()}].slice(-MAX_TURNS);
  if(!saveConversations(storage,conversations))errors[member.id]='브라우저 저장 공간을 쓸 수 없어 새로고침하면 대화가 사라질 수 있어요. 대화 저장으로 내려받아 주세요.';
  $('connection-status').textContent='AI 연결 확인됨';
 }catch(error){errors[member.id]=friendlyError(error);failedRequests[member.id]=message;if(!drafts[member.id])drafts[member.id]=message;$('connection-status').textContent='답변 연결 확인 필요';}
 finally{office.setTalking(member.id,false);pending=null;render();}
});
$('clear-chat').addEventListener('click',()=>{
 if(pending||!conversations[selected.id].length)return;
 if(!window.confirm(`${selected.name}와 이 브라우저에 저장한 대화를 지울까요?`))return;
 if(!saveConversations(storage,{...conversations,[selected.id]:[]})){errors[selected.id]='저장소에 접근할 수 없어 대화를 지우지 못했어요. 브라우저의 사이트 데이터 설정을 확인해 주세요.';render();setStatus('대화를 지우지 못했어요.');return;}
 conversations[selected.id]=[];errors[selected.id]='';failedRequests[selected.id]='';render();setStatus('이 멤버와의 대화를 지웠어요.');
});
function download(name,text){const blob=new Blob([text],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export-chat').addEventListener('click',()=>{download(`워밍업-${selected.name}-대화.txt`,conversations[selected.id].map(t=>`[${t.at}]\n나: ${t.user}\n\n${selected.name}: ${t.answer}`).join('\n\n────────\n\n'));setStatus('대화를 파일로 저장했어요.');});
$('handoff-copy').addEventListener('click',async()=>{
 const text=handoffText(selected,conversations[selected.id]);
 try{await navigator.clipboard.writeText(text);setStatus('작업안을 복사했어요. 개발 채팅에 붙여 넣어 실행을 요청하세요.');}
 catch{download(`워밍업-${selected.name}-작업안.txt`,text);setStatus('복사가 허용되지 않아 작업안을 파일로 저장했어요.');}
});
window.addEventListener('hashchange',()=>{const id=location.hash.slice(1);if(ids.includes(id))select(id);});
window.addEventListener('offline',()=>{$('connection-status').textContent='인터넷 연결 끊김';});
window.addEventListener('online',()=>{if(consent)verifyConnection();});
office.select(selected.id);render();
if(consent)verifyConnection();else $('connection-status').textContent='대화 시작 전';
window.addEventListener('pagehide',event=>{pending?.controller.abort();if(!event.persisted)office.destroy();});
