import test from 'node:test';
import assert from 'node:assert/strict';
import {firestoreStore} from '../store.mjs';
import {hash} from '../security.mjs';

// Models transaction atomicity and read-before-write ordering. The real SDK
// integration is covered separately by the optional local Firestore emulator.
function memoryDatabase(){
  const documents=new Map();let tail=Promise.resolve();
  const snapshot=ref=>({ref,exists:documents.has(ref.path),data:()=>structuredClone(documents.get(ref.path))});
  return {
    documents,
    collection(name){return {doc(id){const ref={path:name+'/'+id};return {...ref,async get(){return snapshot(ref);}};}};},
    runTransaction(operation){
      const next=tail.then(async()=>{
        const changes=[];
        const result=await operation({
          async get(ref){assert.equal(changes.length,0,'all transaction reads must precede writes');return snapshot(ref);},
          set(ref,value){changes.push(()=>documents.set(ref.path,structuredClone(value)));},
          update(ref,value){changes.push(()=>documents.set(ref.path,{...documents.get(ref.path),...structuredClone(value)}));},
          delete(ref){changes.push(()=>documents.delete(ref.path));},
        });
        changes.forEach(commit=>commit());return result;
      });
      tail=next.catch(()=>{});return next;
    },
  };
}

function fixture(){
  const db=memoryDatabase();let time=1000000;
  db.documents.set('bapmunnaAccounts/alice/preferences/settings',{ownerUid:'alice',preparationAcknowledged:true});
  return {db,store:firestoreStore(db,()=>time),advance:amount=>{time+=amount;},pending:{uid:'alice',nonceHash:'browser-hash',until:time+600000,consentedAt:time}};
}
const connection={installId:'installation-a',stage:'choose_device',tokens:{encrypted:true}};
const statePath=state=>'bapmunnaSmartThingsStates/'+hash(state);

test('cancellation before start creates a tombstone and duplicate start cannot overwrite it',async()=>{
  const {store,db,pending}=fixture();
  assert.equal(await store.cancelState('attempt','alice'),true);
  await assert.rejects(()=>store.saveState('attempt',pending),{code:'invalid_state'});
  assert.equal(db.documents.get(statePath('attempt')).cancelled,true);
  await assert.rejects(()=>store.consumeState('attempt','browser-hash'),{code:'invalid_state'});
  await store.saveState('other-attempt',pending);
  await assert.rejects(()=>store.saveState('other-attempt',{...pending,nonceHash:'replacement'}),{code:'invalid_state'});
});

test('only the owner can cancel; consuming once marks used but preserves the cancellable state',async()=>{
  const {store,db,pending}=fixture();
  await store.saveState('attempt',pending);
  assert.equal(await store.cancelState('attempt','bob'),false);
  const consumed=await store.consumeState('attempt','browser-hash');assert.equal(consumed.uid,'alice');
  assert.equal(db.documents.get(statePath('attempt')).used,true);
  await assert.rejects(()=>store.consumeState('attempt','browser-hash'),{code:'invalid_state'});
  assert.equal(await store.cancelState('attempt','alice'),true);
  assert.equal(db.documents.get(statePath('attempt')).cancelled,true);
});

test('cancelled token exchange cannot replace the existing connection or installation',async()=>{
  const {store,db,pending}=fixture();
  const previous={...connection,installId:'previous-installation',stage:'reconnect_required'};
  await store.saveConnection('alice',previous);
  await store.saveState('attempt',pending);await store.consumeState('attempt','browser-hash');
  await store.cancelState('attempt','alice');
  await assert.rejects(()=>store.saveConnection('alice',connection,{state:'attempt',nonceHash:'browser-hash'}),{code:'invalid_state'});
  assert.deepEqual(await store.get('alice'),previous);
  assert.equal((await store.installation(previous.installId)).uid,'alice');assert.equal(await store.installation(connection.installId),null);
  assert.equal(db.documents.get(statePath('attempt')).cancelled,true);
});

test('successful connection atomically checks owner, nonce and consumed state and removes that state',async()=>{
  const {store,db,pending}=fixture();
  await store.saveState('attempt',pending);
  await assert.rejects(()=>store.saveConnection('alice',connection,{state:'attempt',nonceHash:'browser-hash'}),{code:'invalid_state'});
  await store.consumeState('attempt','browser-hash');
  await assert.rejects(()=>store.saveConnection('bob',connection,{state:'attempt',nonceHash:'browser-hash'}),{code:'invalid_state'});
  await assert.rejects(()=>store.saveConnection('alice',connection,{state:'attempt',nonceHash:'wrong'}),{code:'invalid_state'});
  await store.saveConnection('alice',connection,{state:'attempt',nonceHash:'browser-hash'});
  assert.deepEqual(await store.get('alice'),connection);assert.equal((await store.installation(connection.installId)).uid,'alice');
  assert.equal(db.documents.has(statePath('attempt')),false);
  await assert.rejects(()=>store.saveConnection('alice',connection,{state:'attempt',nonceHash:'browser-hash'}),{code:'invalid_state'});
});

test('state expiry at the exact boundary blocks consumption or the final connection commit',async()=>{
  const first=fixture();await first.store.saveState('attempt',first.pending);first.advance(600000);
  await assert.rejects(()=>first.store.consumeState('attempt','browser-hash'),{code:'invalid_state'});
  const second=fixture();await second.store.saveState('attempt',second.pending);await second.store.consumeState('attempt','browser-hash');second.advance(600000);
  await assert.rejects(()=>second.store.saveConnection('alice',connection,{state:'attempt',nonceHash:'browser-hash'}),{code:'invalid_state'});
  assert.equal(await second.store.get('alice'),null);
});

test('cancel and final save are serialized; cancellation that commits first wins',async()=>{
  const {store,pending}=fixture();await store.saveState('attempt',pending);await store.consumeState('attempt','browser-hash');
  const outcomes=await Promise.allSettled([store.cancelState('attempt','alice'),store.saveConnection('alice',connection,{state:'attempt',nonceHash:'browser-hash'})]);
  assert.equal(outcomes[0].status,'fulfilled');assert.equal(outcomes[1].status,'rejected');assert.equal(outcomes[1].reason.code,'invalid_state');
  assert.equal(await store.get('alice'),null);
});
