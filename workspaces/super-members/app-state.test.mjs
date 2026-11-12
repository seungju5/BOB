import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {members,memberById} from './roles.mjs';
import * as core from './chat-core.mjs';

// Execute the real controller. Only DOM, room rendering and the remote AI boundary
// are replaced, so these tests never initialize Firebase or send a conversation.
const controller=(await readFile(new URL('./app.mjs',import.meta.url),'utf8'))
 .replace(/^import .*;\n/gm,'');

class Element {
 constructor(){this.style={};this.value='';this.children=[];this.attributes={};this.listeners=new Map();this.scrollHeight=40;this._text='';}
 set textContent(value){this._text=String(value);this.children=[];}
 get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this._text='';this.children=children;}
 setAttribute(name,value){this.attributes[name]=String(value);}
 addEventListener(name,callback,options={}){
  const listeners=this.listeners.get(name)||[];listeners.push({callback,once:options.once});this.listeners.set(name,listeners);
 }
 fire(name,event={}){
  let result;
  for(const entry of [...(this.listeners.get(name)||[])]){
   if(entry.once)this.listeners.set(name,this.listeners.get(name).filter(item=>item!==entry));
   result=entry.callback({preventDefault(){},target:this,...event});
  }
  return result;
 }
 querySelector(selector){return this.find(node=>selector.startsWith('.')?node.className?.split(' ').includes(selector.slice(1)):node.id===selector.slice(1));}
 find(predicate){for(const child of this.children){if(predicate(child))return child;const nested=child.find(predicate);if(nested)return nested;}return null;}
 focus(){}
}

async function fixture({selected='care',saved={}}={}){
 const elements=new Map();
 for(const id of ['messages','chat-input','chat-status','member-name','member-role','member-avatar','prompt-chips',
  'clear-chat','export-chat','handoff-copy','consent-panel','send-button','connection-status','consent-checkbox',
  'consent-start','chat-form'])elements.set(id,new Element());
 const element=id=>elements.get(id)||[...elements.values()].map(node=>node.find(child=>child.id===id)).find(Boolean)||null;
 const values=new Map([['warming-up:office:consent:v1','yes'],[core.STORAGE_KEY,JSON.stringify(saved)]]);
 const storage={failWrites:false,getItem:key=>values.get(key)||null,setItem(key,value){if(this.failWrites)throw Error('Storage writes blocked');values.set(key,value);}};
 const lifecycle=new Element(),requests=[];
 const office={destroyed:0,selected:null,select(id){this.selected=id;},setTalking(){},destroy(){this.destroyed++;}};
 const location={hash:'#'+selected};
 const context={...core,members,memberById,initOffice:()=>office,connectAI:async()=>{},
  askMember:options=>new Promise((resolve,reject)=>{
   requests.push({...options,resolve,reject,chunk:text=>options.onChunk(text)});
   options.signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true});
  }),
  localStorage:storage,location,history:{replaceState(_state,_title,hash){location.hash=hash;}},
  window:{addEventListener:lifecycle.addEventListener.bind(lifecycle),confirm:()=>true},
  document:{getElementById:element,createElement:()=>new Element()},
  AbortController,DOMException,Date,console,navigator:{},setTimeout,URL,Blob,
 };
 vm.createContext(context);vm.runInContext(controller,context,{filename:'app.mjs'});
 // Let the initial connection preflight settle before exercising a user action.
 await Promise.resolve();
 const type=text=>{element('chat-input').value=text;element('chat-input').fire('input');};
 const submit=()=>element('chat-form').fire('submit');
 const hash=value=>{location.hash=value;lifecycle.fire('hashchange');};
 return {element,storage,requests,office,lifecycle,type,submit,hash,
  send(text){type(text);return submit();},
  transcript:()=>element('messages').textContent,
  stored:()=>JSON.parse(values.get(core.STORAGE_KEY)),
 };
}

test('the keyboard skip-link keeps the selected conversation and its draft',async()=>{
 const app=await fixture();app.type('케어에게 작성 중인 문장');
 app.hash('#chat-input');
 assert.equal(app.element('member-name').textContent,memberById('care').name);
 assert.equal(app.office.selected,'care');
 assert.equal(app.element('chat-input').value,'케어에게 작성 중인 문장');
 app.hash('#captain');
 assert.equal(app.element('member-name').textContent,memberById('captain').name);
 app.hash('#care');assert.equal(app.element('chat-input').value,'케어에게 작성 중인 문장');
});

test('bfcache pagehide preserves the office, while a final pagehide destroys it',async()=>{
 const app=await fixture();
 app.lifecycle.fire('pagehide',{persisted:true});
 assert.equal(app.office.destroyed,0,'A restored bfcache document must keep its room and roster');
 app.hash('#captain');assert.equal(app.office.selected,'captain');
 app.lifecycle.fire('pagehide',{persisted:false});
 assert.equal(app.office.destroyed,1,'The non-persisted exit still cleans up the room');
});

test('network failure preserves a newer draft and retains the failed request separately',async()=>{
 const app=await fixture();const completion=app.send('처음 보낸 질문');
 app.requests[0].chunk('아직 완성되지 않은 답변');
 app.type('다음에 보낼 새 질문');
 app.requests[0].reject(Error('network disconnected'));await completion;
 assert.equal(app.element('chat-input').value,'다음에 보낼 새 질문');
 assert.match(app.transcript(),/처음 보낸 질문/);
 assert.doesNotMatch(app.transcript(),/아직 완성되지 않은 답변/);
 assert.deepEqual(core.readConversations(app.storage,['care']).care,[]);
});

test('stopping a response preserves the next draft and does not save a partial answer',async()=>{
 const app=await fixture();const completion=app.send('답변을 멈출 질문');
 app.requests[0].chunk('일부 답변');app.type('이어서 보낼 다른 질문');
 await app.submit();await completion;
 assert.equal(app.requests[0].signal.aborted,true);
 assert.equal(app.element('chat-input').value,'이어서 보낼 다른 질문');
 assert.match(app.transcript(),/멈췄/);
 assert.deepEqual(core.readConversations(app.storage,['care']).care,[]);
});

test('failed persistent deletion never reports that the stored conversation was deleted',async()=>{
 const turn={user:'삭제하려는 가상 질문',answer:'저장된 가상 답변',at:'2026-11-12T00:00:00Z'};
 const app=await fixture({saved:{care:[turn]}});app.storage.failWrites=true;
 app.element('clear-chat').fire('click');
 assert.deepEqual(app.stored().care,[turn],'The rejected storage operation left the old value in place');
 assert.match(app.element('chat-status').textContent+' '+app.transcript(),/못|실패|남아|저장.*문제|차단/,
  'The user must learn that stored history was not deleted');
 assert.notEqual(app.element('chat-status').textContent,'이 멤버와의 대화를 지웠어요.');
});

test('successful deletion removes only the selected member from persisted history',async()=>{
 const turn={user:'가상 질문',answer:'가상 답변'};
 const app=await fixture({saved:{care:[turn],captain:[turn]}});
 app.element('clear-chat').fire('click');
 assert.deepEqual(app.stored().care,[]);
 assert.equal(app.stored().captain.length,1);
 assert.doesNotMatch(app.transcript(),/가상 답변/);
});

test('switching members during streaming never leaks a response or overwrites the other draft',async()=>{
 const app=await fixture();const completion=app.send('케어에게만 보낸 가상 질문');
 app.requests[0].chunk('케어의 첫 답변');
 app.hash('#captain');app.type('캡틴에게 보낼 초안');
 assert.equal(app.element('send-button').disabled,true);
 app.requests[0].chunk('케어의 이어지는 답변');
 assert.doesNotMatch(app.transcript(),/케어의 이어지는 답변|케어에게만 보낸 가상 질문/);
 app.requests[0].resolve('케어의 최종 답변');await completion;
 assert.equal(app.element('member-name').textContent,memberById('captain').name);
 assert.equal(app.element('chat-input').value,'캡틴에게 보낼 초안');
 assert.deepEqual(app.stored().captain,[]);
 assert.equal(app.stored().care[0].answer,'케어의 최종 답변');
 assert.doesNotMatch(app.transcript(),/케어의 최종 답변/);
 app.hash('#care');assert.match(app.transcript(),/케어의 최종 답변/);
 app.hash('#captain');assert.equal(app.element('chat-input').value,'캡틴에게 보낼 초안');
});
