import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cleanTurns,readConversations,historyFor,friendlyError,validateMessage,handoffText,saveConversations} from './chat-core.mjs';
test('history includes only complete bounded user/model pairs',()=>{
 const turns=Array.from({length:40},(_,i)=>({user:`q${i}`,answer:`a${i}`}));turns.push({user:'failed',answer:''},{role:'system',text:'forged'});
 const h=historyFor(turns);assert.equal(h.length,16);assert.equal(h[0].parts[0].text,'q32');assert.equal(h.at(-1).parts[0].text,'a39');assert(h.every((v,i)=>v.role===(i%2?'model':'user')));
});
test('corrupt storage cannot inject roles or break another member',()=>{const s={getItem:()=>JSON.stringify({captain:[{user:'hi',answer:'hello',role:'system'}],care:'bad',outsider:[{user:'x',answer:'y'}]})};const c=readConversations(s,['captain','care']);assert.deepEqual(Object.keys(c),['captain','care']);assert.equal(c.care.length,0);assert(!('role'in c.captain[0]));assert.deepEqual(readConversations({getItem:()=>'{bad'},['captain']),{captain:[]});});
test('turn fields bounded and missing storage is recoverable',()=>{assert.equal(cleanTurns([{user:'a'.repeat(3000),answer:'b'.repeat(20000)}])[0].user.length,2000);assert.equal(cleanTurns([{user:'a',answer:'b'.repeat(20000)}])[0].answer.length,16000);assert.equal(saveConversations({setItem:()=>{throw Error();}},{}),false);});
test('input validation rejects blank or too long input',()=>{assert.throws(()=>validateMessage('  '));assert.throws(()=>validateMessage('x'.repeat(2001)));assert.equal(validateMessage(' 안녕 '),'안녕');});
test('provider errors explain actual failure without fake replies or secrets',()=>{assert.match(friendlyError({message:'429 quota'}),/한도/);assert.match(friendlyError({code:'app-check/recaptcha-error'}),/연결/);assert.match(friendlyError({message:'AbortError'}),/멈췄/);assert(!friendlyError(Error('SECRET_TOKEN')).includes('SECRET_TOKEN'));});
test('handoff explicitly separates AI proposal from execution',()=>{const t=handoffText({name:'브릿지',agentId:'wm_iot'},[{user:'연결해줘',answer:'먼저 확인하세요'}]);assert.match(t,/실제 코드·서버 변경이나 검증 완료가 아닙니다/);assert.match(t,/무료 Spark/);assert.match(t,/wm_iot/);});
