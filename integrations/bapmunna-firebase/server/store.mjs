import {random,hash,ApiError} from './security.mjs';

// None of these collections has a browser-readable rule. All access is through
// a verified Firebase ID token and an owner UID derived by the server.
export function firestoreStore(db,now=()=>Date.now()){
  const ref=(kind,id)=>db.collection(`bapmunnaSmartThings${kind}`).doc(hash(id));
  const consentRef=uid=>db.collection(`bapmunnaAccounts/${uid}/preferences`).doc('settings');
  const hasConsent=(value,uid)=>value?.ownerUid===uid&&value.preparationAcknowledged===true;
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
    async verifyConsent(uid){
      if(!hasConsent((await consentRef(uid).get()).data(),uid))throw new ApiError(403,'consent_required');
    },
    async dueConnections({limit=20}={}){
      if(!Number.isSafeInteger(limit)||limit<1||limit>20)throw new RangeError('Maintenance limit must be between 1 and 20.');
      // One indexed field: no scan of every user's encrypted credentials and
      // no additional paid scheduler/TTL. Only the cron receives these UIDs.
      const found=await db.collection('bapmunnaSmartThingsConnections').where('refreshDueAt','<=',new Date(now())).orderBy('refreshDueAt').limit(limit).get();
      return found.docs.flatMap(doc=>{
        const value=doc.data();
        return typeof value?.uid==='string'&&doc.id===hash(value.uid)&&typeof value.installId==='string'?[{uid:value.uid,installId:value.installId}]:[];
      });
    },
    async cleanupExpired({limit=5000}={}){
      if(!Number.isSafeInteger(limit)||limit<1||limit>5000)throw new RangeError('Cleanup limit must be between 1 and 5000.');
      const cutoff=now(),result={scanned:0,deleted:0,limitReached:false,collections:{}};
      // This explicit list cannot include connections, installations, household
      // profiles or encrypted tokens. It uses ordinary reads/deletes, not TTL.
      for(const kind of ['States','Locks','Receipts']){
        const counts={scanned:0,deleted:0};result.collections[kind]=counts;
        const remaining=limit-result.scanned;if(!remaining)continue;
        const found=await db.collection(`bapmunnaSmartThings${kind}`).where('expiresAt','<=',new Date(cutoff)).orderBy('expiresAt').limit(remaining).get();
        counts.scanned=found.docs.length;result.scanned+=counts.scanned;
        for(let offset=0;offset<found.docs.length;offset+=100){
          const candidates=found.docs.slice(offset,offset+100);
          counts.deleted+=await db.runTransaction(async tx=>{
            const current=await Promise.all(candidates.map(doc=>tx.get(doc.ref)));
            let deleted=0;
            for(const doc of current){
              const value=doc.data(),expiry=value?.expiresAt;
              const expiresAt=expiry instanceof Date?expiry.getTime():typeof expiry?.toMillis==='function'?expiry.toMillis():NaN;
              // A lease may have been renewed after the query. Recheck inside
              // the transaction so cleanup cannot delete the new owner's lock.
              if(!Number.isFinite(expiresAt)||expiresAt>cutoff||(Number.isFinite(value?.until)&&value.until>cutoff))continue;
              tx.delete(doc.ref);deleted++;
            }
            return deleted;
          });
        }
        result.deleted+=counts.deleted;
      }
      result.limitReached=result.scanned===limit;
      return result;
    },
    get:uid=>read('Connections',uid),
    async patch(uid,fields,{installId,attemptId,requireConsent=false}={}){return db.runTransaction(async tx=>{
      const target=ref('Connections',uid);
      const [saved,consent]=await Promise.all([tx.get(target),requireConsent?tx.get(consentRef(uid)):null]);
      const current=saved.data();
      if(!current)throw new ApiError(409,'reconnect_required');
      if((installId&&current.installId!==installId)||(attemptId&&current.refreshAttemptId!==attemptId))throw new ApiError(409,'reconnect_required');
      if(requireConsent&&!hasConsent(consent?.data(),uid))throw new ApiError(403,'consent_required');
      const next={...current,...fields};
      if(Object.hasOwn(fields,'lastSignalAt'))next.lastSignalAt=Math.max(current.lastSignalAt||0,fields.lastSignalAt||0)||null;
      tx.set(target,next);return next;
    });},
    async saveConnection(uid,value,{state,nonceHash}={}){
      await db.runTransaction(async tx=>{
        const connection=ref('Connections',uid),installation=ref('Installations',value.installId);
        const pending=state?ref('States',state):null;
        const [old,saved,attempt,consent]=await Promise.all([tx.get(connection),tx.get(installation),pending?tx.get(pending):null,pending?tx.get(consentRef(uid)):null]);
        if(pending){
          const current=attempt?.data();
          if(!current||current.uid!==uid||current.nonceHash!==nonceHash||current.used!==true||current.cancelled===true||!Number.isFinite(current.until)||current.until<=now())throw new ApiError(400,'invalid_state');
          if(!hasConsent(consent?.data(),uid))throw new ApiError(403,'consent_required');
        }
        if(saved.exists&&saved.data().uid!==uid)throw new ApiError(409,'installation_in_use');
        if(old.exists&&old.data().installId!==value.installId)tx.delete(ref('Installations',old.data().installId));
        tx.set(connection,value);tx.set(installation,{uid,installId:value.installId});
        if(pending)tx.delete(pending);
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
    async saveState(state,value){return transact('States',state,current=>{
      // A cancellation may arrive before /start. Its tombstone must win.
      if(current)throw new ApiError(400,'invalid_state');
      return {next:{...value,expiresAt:new Date(value.until)}};
    });},
    async consumeState(state,nonceHash){return transact('States',state,current=>{
      if(!current||!Number.isFinite(current.until)||current.until<=now()||current.nonceHash!==nonceHash||current.used===true||current.cancelled===true)throw new ApiError(400,'invalid_state');
      // Retain the attempt through token exchange, so cancellation and the
      // final saveConnection transaction can race without reviving a session.
      return {next:{...current,used:true},value:current};
    });},
    async cancelState(state,uid){return transact('States',state,current=>{
      if(current&&current.uid!==uid)return {value:false};
      const until=now()+600000;
      return {next:{uid,cancelled:true,until,expiresAt:new Date(until)},value:true};
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
        const [saved,seen,consent]=await Promise.all([tx.get(connection),tx.get(receipt),tx.get(consentRef(uid))]);
        const current=saved.data();
        if(seen.exists||!current||current.installId!==installId||current.deviceId!==event.deviceId||current.stage!=='connected'||!hasConsent(consent.data(),uid))return false;
        // Deduplication metadata contains no power readings. cleanupExpired
        // removes expired receipts without requiring billed Firestore TTL.
        tx.set(receipt,{expiresAt:new Date(now()+86400000)});
        if(event.time>=(current.lastSignalAt||0))tx.update(connection,{lastSignalAt:event.time,lastReceivedAt:now(),lastKind:event.kind});
        return true;
      });
    },
  };
}
