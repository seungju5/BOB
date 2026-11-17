import {ACCOUNT_CONSENT,WALKING_CONSENT,WalkingError,PAIR_LIFETIME,DEVICE_LIFETIME,BOARD_LIMIT,hash,randomId,koreanDay,nextKoreanMidnight,rankKey,dayRange,iso} from './walking-security.mjs';

export const WALKING_COLLECTIONS=Object.freeze(Object.fromEntries(['Members','Devices','Pairings','Limits'].map(kind=>[kind,'bapmunnaSystem/walking/'+kind])));
const live=(value,time)=>value&&Number.isFinite(value.until)&&value.until>time;
const joined=value=>value?.consentVersion===WALKING_CONSENT&&value?.shareTodaySteps===true;
const isToday=(member,time)=>joined(member)&&member.date===koreanDay(time)&&Number.isSafeInteger(member.count)&&member.count>=0;

// Only the server's dedicated Firebase credential reads this namespace.
// One member per Firebase UID; no email, raw sensor records or plaintext token.
export function walkingFirestoreStore(db,now=()=>Date.now()){
  const direct=(kind,key)=>db.collection(WALKING_COLLECTIONS[kind]).doc(key);
  const ref=(kind,value)=>direct(kind,hash(value));
  const profileRef=uid=>db.collection('bapmunnaAccounts').doc(uid);
  async function consent(tx,uid){
    const value=(await tx.get(profileRef(uid))).data();
    if(value?.ownerUid!==uid||value?.consentVersion!==ACCOUNT_CONSENT)throw new WalkingError(403,'account_consent_required');
  }
  function requireMember(member){if(!joined(member))throw new WalkingError(403,'participation_required');return member;}
  function profile(member,time=now()){
    if(!joined(member))return {joined:false};
    return {joined:true,nickname:member.nickname,publicId:member.publicId,deviceConnected:!!member.deviceKey&&member.deviceUntil>time,deviceExpiresAt:member.deviceKey&&member.deviceUntil>time?iso(member.deviceUntil):null,lastSyncedAt:isToday(member,time)?iso(member.syncedAt):null,date:koreanDay(time),count:isToday(member,time)?member.count:null};
  }
  async function memberForDevice(tx,key,{pending=false}={}){
    const device=(await tx.get(direct('Devices',key))).data(),time=now();
    if(!live(device,time))throw new WalkingError(401,'device_expired');
    const member=(await tx.get(ref('Members',device.uid))).data();
    requireMember(member);await consent(tx,device.uid);
    if(device.generation!==member.generation||(device.confirmed?member.deviceKey:member.pendingDeviceKey)!==key)throw new WalkingError(401,'device_revoked');
    if(!device.confirmed&&!pending)throw new WalkingError(403,'device_confirmation_required');
    return {device,member};
  }
  const removeLinks=(tx,member)=>{for(const [field,kind]of[['deviceKey','Devices'],['pendingDeviceKey','Devices'],['pairingKey','Pairings']])if(member?.[field])tx.delete(direct(kind,member[field]));};

  return {
    async rateLimit(buckets){
      return db.runTransaction(async tx=>{
        const time=now(),refs=buckets.map(bucket=>ref('Limits',bucket.key)),saved=await Promise.all(refs.map(target=>tx.get(target)));
        const next=buckets.map((bucket,index)=>{
          const current=saved[index].data(),count=live(current,time)?current.count:0;
          if(!Number.isSafeInteger(count)||count>=bucket.limit)throw new WalkingError(429,'rate_limited');
          const until=live(current,time)?current.until:time+bucket.windowMs;
          return {count:count+1,until,expiresAt:new Date(until)};
        });
        next.forEach((value,index)=>tx.set(refs[index],value));
      });
    },
    async profile(uid){return db.runTransaction(async tx=>{await consent(tx,uid);return profile((await tx.get(ref('Members',uid))).data());},{readOnly:true});},
    async join(uid,name){
      return db.runTransaction(async tx=>{
        await consent(tx,uid);const target=ref('Members',uid),member=(await tx.get(target)).data();
        if(joined(member)){
          // Pair preview and confirm must refer to the same visible destination.
          if(member.nickname!==name)throw new WalkingError(409,'nickname_locked');
          return profile(member);
        }
        const next={uid,nickname:name,publicId:randomId(),generation:randomId(),consentVersion:WALKING_CONSENT,shareTodaySteps:true,joinedAt:now()};
        tx.set(target,next);return profile(next);
      });
    },
    async leave(uid){return db.runTransaction(async tx=>{
      // Withdrawal remains possible if the optional profile was removed.
      const target=ref('Members',uid),member=(await tx.get(target)).data();
      removeLinks(tx,member);tx.delete(target);return {ok:true};
    });},
    async issuePairing(uid,authTime,code){
      return db.runTransaction(async tx=>{
        await consent(tx,uid);const target=ref('Members',uid),pairRef=ref('Pairings',code);
        const [saved,collision]=await Promise.all([tx.get(target),tx.get(pairRef)]),member=requireMember(saved.data());
        if(collision.exists)throw new WalkingError(409,'pairing_collision');
        const until=now()+PAIR_LIFETIME;
        if(member.pairingKey)tx.delete(direct('Pairings',member.pairingKey));
        if(member.pendingDeviceKey)tx.delete(direct('Devices',member.pendingDeviceKey));
        const next={...member,pairingKey:pairRef.id};delete next.pendingDeviceKey;
        tx.set(target,next);tx.set(pairRef,{uid,authTime,generation:member.generation,until,expiresAt:new Date(until)});
        return {code,expiresAt:iso(until)};
      });
    },
    async pair(code,token,verifyAccount){
      return db.runTransaction(async tx=>{
        const pairRef=ref('Pairings',code),deviceRef=ref('Devices',token),pending=(await tx.get(pairRef)).data();
        if(!live(pending,now()))throw new WalkingError(400,'invalid_pairing_code');
        const target=ref('Members',pending.uid),[saved,collision]=await Promise.all([tx.get(target),tx.get(deviceRef)]),member=requireMember(saved.data());
        await consent(tx,pending.uid);await verifyAccount(pending.uid,pending.authTime);
        if(member.generation!==pending.generation||member.pairingKey!==pairRef.id||collision.exists)throw new WalkingError(400,'invalid_pairing_code');
        const until=now()+PAIR_LIFETIME;
        const device={uid:pending.uid,generation:member.generation,authTime:pending.authTime,confirmed:false,nickname:member.nickname,until,expiresAt:new Date(until)};
        const next={...member,pendingDeviceKey:deviceRef.id};delete next.pairingKey;
        if(member.pendingDeviceKey)tx.delete(direct('Devices',member.pendingDeviceKey));
        tx.delete(pairRef);tx.set(deviceRef,device);tx.set(target,next);
        return {token,expiresAt:iso(until),nickname:member.nickname,publicId:member.publicId,confirmed:false};
      });
    },
    async deviceIdentity(token,{pending=false}={}){
      return db.runTransaction(async tx=>{
        const {device}=await memberForDevice(tx,hash(token),{pending});
        return {uid:device.uid,authTime:device.authTime};
      },{readOnly:true});
    },
    async confirm(token){
      return db.runTransaction(async tx=>{
        const key=hash(token),{device,member}=await memberForDevice(tx,key,{pending:true});
        if(device.nickname!==member.nickname)throw new WalkingError(409,'destination_changed');
        const until=device.confirmed?device.until:now()+DEVICE_LIFETIME;
        if(!device.confirmed){
          if(member.deviceKey&&member.deviceKey!==key)tx.delete(direct('Devices',member.deviceKey));
          const next={...member,deviceKey:key,deviceUntil:until};delete next.pendingDeviceKey;
          tx.set(ref('Members',device.uid),next);tx.set(direct('Devices',key),{...device,confirmed:true,until,expiresAt:new Date(until)});
        }
        return {ok:true,confirmed:true,nickname:member.nickname,publicId:member.publicId,expiresAt:iso(until)};
      });
    },
    async unpair(token){
      return db.runTransaction(async tx=>{
        const key=hash(token),target=direct('Devices',key),device=(await tx.get(target)).data();
        if(!device)return {ok:true};
        const memberRef=ref('Members',device.uid),member=(await tx.get(memberRef)).data();
        if(member){
          const next={...member};
          if(next.deviceKey===key){delete next.deviceKey;delete next.deviceUntil;}
          if(next.pendingDeviceKey===key)delete next.pendingDeviceKey;
          tx.set(memberRef,next);
        }
        tx.delete(target);return {ok:true};
      });
    },
    async sync(token,input){
      return db.runTransaction(async tx=>{
        const {device,member}=await memberForDevice(tx,hash(token)),time=now();
        if(input.date!==koreanDay(time))throw new WalkingError(409,'stale_snapshot');
        if(member.date===input.date&&Number.isFinite(member.queriedAt)){
          if(input.queriedAt<member.queriedAt||input.queriedAt===member.queriedAt&&input.count!==member.count)throw new WalkingError(409,'stale_snapshot');
          if(input.queriedAt===member.queriedAt)return {ok:true,date:member.date,count:member.count,syncedAt:iso(member.syncedAt)};
        }
        const next={...member,...input,syncedAt:time,rankKey:rankKey(input.date,input.count),stepsExpireAt:new Date(nextKoreanMidnight(time))};
        tx.set(ref('Members',device.uid),next);
        return {ok:true,date:input.date,count:input.count,syncedAt:iso(time)};
      });
    },
    async board({uid,token}){
      return db.runTransaction(async tx=>{
        let member;
        if(token)member=(await memberForDevice(tx,hash(token))).member;
        else{await consent(tx,uid);member=requireMember((await tx.get(ref('Members',uid))).data());}
        const time=now(),date=koreanDay(time),{start,end}=dayRange(date);
        const query=db.collection(WALKING_COLLECTIONS.Members).where('rankKey','>=',start).where('rankKey','<',end).orderBy('rankKey','desc');
        const current=isToday(member,time);
        const ahead=current?db.collection(WALKING_COLLECTIONS.Members).where('rankKey','>',rankKey(date,member.count)).where('rankKey','<',end).count():null;
        // Aggregate and top rows share the transaction snapshot. No capped full
        // scan or composite index is used to claim an exact personal rank.
        const [top,total,above]=await Promise.all([tx.get(query.limit(BOARD_LIMIT)),tx.get(query.count()),ahead?tx.get(ahead):null]);
        let lastCount=null,lastRank=0;
        const entries=top.docs.map((doc,index)=>{
          const value=doc.data();if(!isToday(value,time)||value.rankKey!==rankKey(date,value.count))throw new WalkingError(503,'temporarily_unavailable');
          if(lastCount!==value.count){lastCount=value.count;lastRank=index+1;}
          return {publicId:value.publicId,nickname:value.nickname,count:value.count,rank:lastRank};
        });
        return {date,timeZone:'Asia/Seoul',updatedAt:iso(time),entries,me:{publicId:member.publicId,nickname:member.nickname,count:current?member.count:null,rank:current?above.data().count+1:null,lastSyncedAt:current?iso(member.syncedAt):null},total:total.data().count,limit:BOARD_LIMIT};
      },{readOnly:true});
    },
    async cleanup({limit=1000}={}){
      if(!Number.isSafeInteger(limit)||limit<1||limit>5000)throw new RangeError('Cleanup limit must be between 1 and 5000.');
      const time=now(),result={scanned:0,deleted:0,stepsCleared:0,limitReached:false};
      for(const kind of ['Members','Pairings','Devices','Limits']){
        const remaining=limit-result.scanned;if(!remaining)break;
        const field=kind==='Members'?'stepsExpireAt':'expiresAt';
        const found=await db.collection(WALKING_COLLECTIONS[kind]).where(field,'<=',new Date(time)).orderBy(field).limit(remaining).get();
        result.scanned+=found.size;
        for(const candidate of found.docs){
          const change=await db.runTransaction(async tx=>{
            const doc=await tx.get(candidate.ref),value=doc.data();if(!value)return null;
            const expires=value[field],millis=expires instanceof Date?expires.getTime():expires?.toMillis?.();
            if(!Number.isFinite(millis)||millis>time)return null;
            if(kind==='Members'){
              if(value.date>=koreanDay(time))return null;
              const next={...value};for(const key of ['date','count','source','queriedAt','syncedAt','rankKey','stepsExpireAt'])delete next[key];
              tx.set(doc.ref,next);return 'stepsCleared';
            }
            if(kind==='Devices'||kind==='Pairings'){
              const memberRef=ref('Members',value.uid),member=(await tx.get(memberRef)).data();
              if(member){
                const next={...member};
                if(kind==='Devices'&&next.deviceKey===doc.id){delete next.deviceKey;delete next.deviceUntil;}
                if(kind==='Devices'&&next.pendingDeviceKey===doc.id)delete next.pendingDeviceKey;
                if(kind==='Pairings'&&next.pairingKey===doc.id)delete next.pairingKey;
                tx.set(memberRef,next);
              }
            }
            tx.delete(doc.ref);return 'deleted';
          });
          if(change)result[change]++;
        }
      }
      result.limitReached=result.scanned===limit;return result;
    },
  };
}
