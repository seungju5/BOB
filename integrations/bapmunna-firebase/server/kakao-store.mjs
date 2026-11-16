import {hash,equal,KakaoError,STATE_LIFETIME,STARTS_PER_DAY,STARTS_PER_NETWORK_WINDOW} from './kakao-security.mjs';

export const KAKAO_COLLECTIONS=Object.freeze(Object.fromEntries(['States','Handoffs','Limits'].map(kind=>[kind,'bapmunnaSystem/kakao/'+kind])));

// The existing /bapmunnaSystem/{document=**} rule explicitly denies every
// browser role. Tokens, Kakao IDs, emails and raw IPs are never persisted.
export function kakaoFirestoreStore(db,now=()=>Date.now()){
  const ref=(kind,id)=>db.collection(KAKAO_COLLECTIONS[kind]).doc(hash(id));
  const validUntil=value=>Number.isFinite(value?.until)&&value.until>now();
  async function take(kind,id,verify){
    return db.runTransaction(async tx=>{
      const target=ref(kind,id),current=(await tx.get(target)).data();
      if(!current||!verify(current))throw new KakaoError(400,kind==='States'?'invalid_state':'invalid_handoff');
      // A mismatch never consumes a legitimate pending attempt. Expired,
      // correctly bound records are removed atomically along with valid ones.
      tx.delete(target);
      return {...current,expired:!validUntil(current)};
    });
  }
  async function cleanup({limit=5000}={}){
    if(!Number.isSafeInteger(limit)||limit<1||limit>5000)throw new RangeError('Cleanup limit must be between 1 and 5000.');
    const cutoff=now(),result={scanned:0,deleted:0,limitReached:false,collections:{}};
    for(const kind of ['States','Handoffs','Limits']){
      const counts={scanned:0,deleted:0};result.collections[kind]=counts;
      const remaining=limit-result.scanned;if(!remaining)continue;
      const found=await db.collection(KAKAO_COLLECTIONS[kind]).where('expiresAt','<=',new Date(cutoff)).orderBy('expiresAt').limit(remaining).get();
      counts.scanned=found.docs.length;result.scanned+=counts.scanned;
      for(let offset=0;offset<found.docs.length;offset+=100){
        counts.deleted+=await db.runTransaction(async tx=>{
          const docs=await Promise.all(found.docs.slice(offset,offset+100).map(doc=>tx.get(doc.ref)));let deleted=0;
          for(const doc of docs){
            const value=doc.data(),expires=value?.expiresAt;
            const expiry=expires instanceof Date?expires.getTime():typeof expires?.toMillis==='function'?expires.toMillis():NaN;
            if(!Number.isFinite(expiry)||expiry>cutoff||!Number.isFinite(value?.until)||value.until>cutoff)continue;
            tx.delete(doc.ref);deleted++;
          }
          return deleted;
        });
      }
      result.deleted+=counts.deleted;
    }
    result.limitReached=result.scanned===limit;return result;
  }
  return {
    async saveState(state,{challenge,flow,nonceHash,until},{networkKey}){
      await db.runTransaction(async tx=>{
        const target=ref('States',state),global=ref('Limits','global'),network=ref('Limits','network:'+networkKey);
        const [existing,all,local]=await Promise.all([tx.get(target),tx.get(global),tx.get(network)]);
        if(existing.exists)throw new KakaoError(400,'invalid_state');
        const time=now(),globalUntil=(Math.floor(time/86400000)+1)*86400000;
        const globalCount=validUntil(all.data())?all.data().count:0,networkCount=validUntil(local.data())?local.data().count:0;
        if(globalCount>=STARTS_PER_DAY||networkCount>=STARTS_PER_NETWORK_WINDOW)throw new KakaoError(429,'rate_limited');
        const networkUntil=validUntil(local.data())?local.data().until:time+STATE_LIFETIME;
        tx.set(global,{count:globalCount+1,until:globalUntil,expiresAt:new Date(globalUntil)});
        tx.set(network,{count:networkCount+1,until:networkUntil,expiresAt:new Date(networkUntil)});
        tx.set(target,{challenge,flow,nonceHash,until,expiresAt:new Date(until)});
      });
    },
    consumeState:(state,nonceHash)=>take('States',state,current=>equal(current.nonceHash,nonceHash)),
    async saveHandoff(code,{uid,challenge,flow,until}){
      await db.runTransaction(async tx=>{
        const target=ref('Handoffs',code);
        if((await tx.get(target)).exists)throw new KakaoError(503,'temporarily_unavailable');
        tx.set(target,{uid,challenge,flow,until,expiresAt:new Date(until)});
      });
    },
    async consumeHandoff(code,challenge,flow){
      const result=await take('Handoffs',code,current=>equal(current.challenge,challenge)&&equal(current.flow,flow));
      if(result.expired)throw new KakaoError(400,'invalid_handoff');
      return result.uid;
    },
    cleanup,
    cleanupExpired:cleanup,
  };
}
