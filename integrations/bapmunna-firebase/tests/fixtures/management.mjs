// Local-only synthetic UI fixture. Never copied into docs/ or Firebase Hosting.
import {mountDashboard} from '/manage/dashboard.mjs';
import {recentDays} from '/manage/metrics.mjs';
const mode=new URLSearchParams(location.search).get('case')||'normal';
const days=recentDays(30),names=['김봄','이여름','박가을','최겨울','정하늘','윤바다','서나무','한이슬'];
const rows=mode==='empty'?[]:Array.from({length:mode==='many'?73:24},(_,index)=>({id:`example-${index}`,displayName:names[index%names.length]+(index>7?` ${Math.floor(index/8)+1}`:''),email:`member${String(index+1).padStart(2,'0')}@example.test`,stage:['new','new','active','active','active','contacted','paused','active'][index%8],note:index%3===0?'가상 메모: 첫 이용 안내를 완료했습니다.':'',createdAt:new Date(`${days[Math.max(0,29-Math.floor(index*.7))]}T10:00:00+09:00`),lastLoginAt:new Date(`${days.at(-1)}T09:00:00+09:00`),noteUpdatedAt:index%3===0?new Date():null}));
if(mode==='unsafe')rows[0].displayName='<img src=x onerror=alert(1)>';
let saveAttempt=0;
const provider={name:'Firebase',async listCustomers({cursor=0}={}){if(mode==='error')throw Object.assign(Error(),{code:'unavailable'});return {customers:rows.slice(cursor,cursor+50).map(p=>({...p})),nextCursor:cursor+50,hasMore:rows.length>cursor+50};},async saveCustomerNote(id,stage,note){saveAttempt++;if(mode==='save-error'&&saveAttempt===1)throw Object.assign(Error(),{code:'unavailable'});const saved={stage,note:note.trim(),noteUpdatedAt:new Date()};Object.assign(rows.find(p=>p.id===id),saved);return saved;},async signOut(){document.querySelector('#crm-surface').innerHTML='<h2>가상 로그아웃 완료</h2>';}};
const root=document.querySelector('#crm-surface');
root.addEventListener('click',event=>{if(event.target.closest('[data-cloud-action="logout"]'))provider.signOut();});
mountDashboard(root,{provider,user:{displayName:'운영자',email:'operator@example.test'}});
