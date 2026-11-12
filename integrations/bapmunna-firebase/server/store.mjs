import {random,hash,ApiError} from './security.mjs';

// None of these collections has a browser-readable rule. All access is through
// a verified Firebase ID token and an owner UID derived by the server.
export function firestoreStore(db,now=()=>Date.now()){
  const ref=(kind,id)=>db.collection(`bapmunnaSmartThings${kind}`).doc(hash(id));
  const read=async(kind,id)=>(await ref(kind,id).get()).data()||null;
  async function transact(kind,id,fn){
    return db.runTransaction(async tx=>{
      const target=ref(kind,id),current=(await tx.get(target)).data()||null;
      const result=fn(current);
      if(result.next===null)tx.delete(target);else if(result.next!==undefined)tx.set(target,result.next);
      return result.value;
    });
  }
  return {
    get:uid=>read('Connections',uid),
    async patch(uid,fields){return transact('Connections',uid,current=>{
      if(!current)throw new ApiError(409,'reconnect_required');
      const next={...current,...fields};
      if(Object.hasOwn(fields,'lastSignalAt'))next.lastSignalAt=Math.max(current.lastSignalAt||0,fields.lastSignalAt||0)||null;
      return {next,value:next};
    });},
    async saveConnection(uid,value){
      await db.runTransaction(async tx=>{
        const connection=ref('Connections',uid),installation=ref('Installations',value.installId);
        const [old,saved]=await Promise.all([tx.get(connection),tx.get(installation)]);
        if(saved.exists&&saved.data().uid!==uid)throw new ApiError(409,'installation_in_use');
        if(old.exists&&old.data().installId!==value.installId)tx.delete(ref('Installations',old.data().installId));
        tx.set(connection,value);tx.set(installation,{uid,installId:value.installId});
      });
    },
    async remove(uid,installId){
      await db.runTransaction(async tx=>{
        const connection=ref('Connections',uid),current=await tx.get(connection);
        if(current.data()?.installId!==installId)return;
        tx.delete(connection);tx.delete(ref('Installations',installId));
      });
    },
    installation:id=>read('Installations',id),
    saveState:(state,value)=>ref('States',state).set({...value,expiresAt:new Date(value.until)}),
    async consumeState(state,nonceHash){return transact('States',state,current=>{
      if(!current||current.until<now()||current.nonceHash!==nonceHash)throw new ApiError(400,'invalid_state');
      return {next:null,value:current};
    });},
    async withLease(uid,operation){
      const owner=random();
      await transact('Locks',uid,current=>{
        if(current?.until>now())throw new ApiError(409,'busy');
        return {next:{owner,until:now()+120000,expiresAt:new Date(now()+120000)}};
      });
      try{return await operation();}finally{
        await transact('Locks',uid,current=>({next:current?.owner===owner?null:undefined}));
      }
    },
    async receive(uid,installId,event){
      return db.runTransaction(async tx=>{
        const connection=ref('Connections',uid),receipt=ref('Receipts',`${installId}:${event.id}`);
        const [saved,seen]=await Promise.all([tx.get(connection),tx.get(receipt)]);
        const current=saved.data();
        if(seen.exists||!current||current.installId!==installId||current.deviceId!==event.deviceId)return false;
        // Deduplication metadata contains no power readings. Configure expiresAt TTL.
        tx.set(receipt,{expiresAt:new Date(now()+86400000)});
        if(event.time>=(current.lastSignalAt||0))tx.update(connection,{lastSignalAt:event.time,lastReceivedAt:now(),lastKind:event.kind});
        return true;
      });
    },
  };
}
