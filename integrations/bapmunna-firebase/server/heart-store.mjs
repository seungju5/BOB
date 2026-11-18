import {createHeartState,advanceHearts,setHeartGoal,buyHeartItem,equipHeartItem,heartSummary,heartWeek,heartProgress,HEART_ITEMS} from '../../../packages/walking-hearts/core.mjs';
import {ACCOUNT_CONSENT,WalkingError,walkingMemberJoined,hash,randomId,koreanDay,iso} from './walking-security.mjs';
import {HEART_CONSENT,HEART_MESSAGE_DAYS,HEART_MAX_MESSAGES,heartFailure} from './heart-security.mjs';

export const HEART_COLLECTIONS=Object.freeze({Hearts:'bapmunnaSystem/walking/Hearts',Messages:'bapmunnaSystem/walking/HeartMessages',Groups:'bapmunnaSystem/walking/HeartGroups'});
const DAY=86400000,GROUP_SIZE=15,MAX_GROUPS=200;
const accepted=value=>value?.consentVersion===HEART_CONSENT;
// Firestore forbids arrays directly nested inside arrays. Each cohort therefore
// has an object boundary; only internal transaction code uses the plain lists.
function groupLists(directory){
  const groups=directory?.groups||[];
  if(!Array.isArray(groups)||groups.length>MAX_GROUPS||groups.some(group=>!Array.isArray(group?.members)||group.members.length>GROUP_SIZE))throw new WalkingError(503,'temporarily_unavailable');
  return groups.map(group=>[...group.members]);
}
const storedGroups=groups=>groups.map(members=>({members}));
const trimState=(state,time)=>advanceHearts(state,{date:koreanDay(time),count:null,now:time});
function messageView(value,context){
  const percent=heartSummary(context.saved.state,koreanDay(context.time)).percent??0;
  const locked=!value.unlockedAt&&(value.unlockPercent||0)>percent,hide=locked&&!!context.identity.token;
  return {id:value.id,text:hide?null:value.text,photo:hide?null:(value.photo||null),createdAt:iso(value.createdAt),readAt:iso(value.readAt),unlockedAt:iso(value.unlockedAt),type:value.type,unlockPercent:value.unlockPercent||0,locked,...(value.itemId?{itemId:value.itemId}:{})};
}
function currentState(saved,member,time){
  let state=trimState(saved.state,time);
  if(saved.enabled){
    const current=member.date===koreanDay(time)&&Number.isSafeInteger(member.count)&&member.count>=0&&Number.isFinite(member.queriedAt);
    state=advanceHearts(state,{date:koreanDay(time),count:current?member.count:null,now:current?member.queriedAt:time});
  }
  return state;
}
function weeklyScore(state,week){
  return Object.values(state.days).filter(day=>heartWeek(day.date).start===week&&day.count!==null).reduce((sum,day)=>sum+heartProgress({count:day.count,goal:day.goal}).weeklyPoints,0);
}
const withGroup=(saved,change)=>({...saved,group:change.group,leagueTier:change.tier,lastSettledWeek:change.settledWeek,lastPromotionWeek:change.promotionWeek});
const itemName=id=>{const list=Array.isArray(HEART_ITEMS)?HEART_ITEMS:Object.values(HEART_ITEMS);return list.find(item=>item.id===id)?.name||list.find(item=>item.id===id)?.label||'토끼 소품';};

/** resolveIdentity performs current account consent + confirmed device checks in this transaction. */
export function heartFirestoreStore(db,{now=()=>Date.now(),resolveIdentity}={}){
  const heartRef=key=>db.collection(HEART_COLLECTIONS.Hearts).doc(key);
  const messageRef=id=>db.collection(HEART_COLLECTIONS.Messages).doc(id);
  const groupRef=(week,region)=>db.collection(HEART_COLLECTIONS.Groups).doc(hash(week+'|'+region));
  const messagesFor=key=>db.collection(HEART_COLLECTIONS.Messages).where('ownerKey','==',key).limit(HEART_MAX_MESSAGES+1);
  async function load(tx,identity,{allowMissing=false,allowPaused=false}={}){
    const {uid,member}=await resolveIdentity(tx,identity),key=hash(uid),target=heartRef(key),saved=(await tx.get(target)).data(),time=now();
    if(!accepted(saved)){if(allowMissing)return {uid,key,target,member,saved:null,original:null,time,identity};throw new WalkingError(403,'heart_consent_required');}
    if(!saved.enabled&&!allowPaused)throw new WalkingError(403,'heart_paused');
    if(saved.generation!==member.generation)throw new WalkingError(403,'heart_consent_required');
    return {uid,key,target,member,saved:{...saved,state:currentState(saved,member,time)},original:saved,time,identity};
  }
  function requireEnabled(value){if(!value.saved?.enabled)throw new WalkingError(403,'heart_paused');}
  async function readMessages(tx,key,time){
    const snapshot=await tx.get(messagesFor(key));
    if(snapshot.size>HEART_MAX_MESSAGES)throw new WalkingError(503,'temporarily_unavailable');
    const live=[],expired=[];
    for(const doc of snapshot.docs){const value=doc.data();if(value.ownerKey!==key)throw new WalkingError(503,'temporarily_unavailable');(value.until>time?live:expired).push({ref:doc.ref,value});}
    return {live:live.sort((a,b)=>a.value.createdAt-b.value.createdAt),expired};
  }
  function result(context,messages){
    const {saved,time}=context;if(!saved)return {enabled:false,joined:false};
    return {enabled:saved.enabled,joined:true,state:saved.state,summary:heartSummary(saved.state,koreanDay(time)),messages:messages.live.map(row=>messageView(row.value,context)),leagueEnabled:saved.leagueEnabled,region:saved.region,tier:saved.leagueTier||0,lastPromotionWeek:saved.lastPromotionWeek||null,updatedAt:iso(time)};
  }
  function write(tx,context,messages,{readOnly=false}={}){
    for(const row of messages.expired)tx.delete(row.ref);
    // A letter opened by a verified milestone stays open after midnight or a
    // corrected step total. Browser-provided steps never reach this decision.
    const percent=context.saved?heartSummary(context.saved.state,koreanDay(context.time)).percent??0:0;
    for(const row of messages.live)if(row.value.unlockPercent>0&&!row.value.unlockedAt&&percent>=row.value.unlockPercent){row.value={...row.value,unlockedAt:context.time};tx.set(row.ref,row.value);}
    if(readOnly&&JSON.stringify(context.original)===JSON.stringify(context.saved))return;
    tx.set(context.target,{...context.saved,updatedAt:context.time,pruneAt:new Date(context.time+DAY)});
  }
  async function groupChanges(tx,context,next){
    const current=context.saved?.group,week=heartWeek(koreanDay(context.time)).start;
    const desired=next.enabled&&next.leagueEnabled?{week,region:next.region}:null;
    let tier=context.saved?.leagueTier||0,settledWeek=context.saved?.lastSettledWeek||null,promotionWeek=context.saved?.lastPromotionWeek||null;
    if(desired&&current?.week===week&&current.region===desired.region)return {group:current,tier,settledWeek,promotionWeek,apply(){}};
    const oldTarget=current?groupRef(current.week,current.region):null,newTarget=desired?groupRef(week,desired.region):null;
    const targets=[...new Map([oldTarget,newTarget].filter(Boolean).map(ref=>[ref.path,ref])).values()];
    const reads=await Promise.all(targets.map(ref=>tx.get(ref))),directories=new Map(reads.map((doc,index)=>[targets[index].path,{ref:targets[index],value:doc.data()}]));
    if(desired&&current&&current.week<week&&settledWeek!==current.week){
      const row=directories.get(oldTarget.path);
      if(row?.value){
        let settlement=row.value.settled?.[String(current.index)];
        if(!settlement){
          const participantKeys=groupLists(row.value)[current.index]||[];
          const previous=await Promise.all(participantKeys.map(key=>tx.get(heartRef(key))));
          const scored=previous.map((doc,index)=>({key:participantKeys[index],value:doc.data()})).filter(entry=>accepted(entry.value)&&entry.value.enabled&&entry.value.leagueEnabled&&entry.value.group?.week===current.week&&entry.value.group?.index===current.index).map(entry=>({key:entry.key,score:weeklyScore(entry.value.state,current.week)}));
          scored.sort((a,b)=>b.score-a.score||a.key.localeCompare(b.key));
          settlement={participants:scored.length,winners:scored.length>=10?scored.filter(entry=>entry.score>0).slice(0,3).map(entry=>entry.key):[],settledAt:context.time};
          row.value={...row.value,settled:{...(row.value.settled||{}),[String(current.index)]:settlement}};
        }
        if(settlement.winners.includes(context.key)){tier=Math.min(4,tier+1);promotionWeek=current.week;}
      }
      settledWeek=current.week;
    }
    if(current){const row=directories.get(oldTarget.path);if(row?.value){const groups=groupLists(row.value).map(group=>group.filter(key=>key!==context.key));row.value={...row.value,groups:storedGroups(groups)};}}
    let group=null;
    if(desired){
      const row=directories.get(newTarget.path),groups=groupLists(row.value);
      let index=groups.findIndex(group=>group.includes(context.key));
      if(index<0){index=groups.findIndex(group=>group.length<GROUP_SIZE);if(index<0){if(groups.length>=MAX_GROUPS)throw new WalkingError(503,'heart_league_full');groups.push([]);index=groups.length-1;}groups[index].push(context.key);}
      row.value={...(row.value||{}),week,region:desired.region,groups:storedGroups(groups),expiresAt:new Date(Date.parse(week+'T00:00:00+09:00')+42*DAY)};
      group={week,region:desired.region,index};
    }
    return {group,tier,settledWeek,promotionWeek,apply(){for(const row of directories.values())if(row.value)tx.set(row.ref,row.value);}};
  }
  async function transact(identity,operation,{allowMissing=false,allowPaused=false}={}){
    try{return await db.runTransaction(async tx=>{
      const context=await load(tx,identity,{allowMissing,allowPaused});
      const messages=await readMessages(tx,context.key,context.time);
      return operation(tx,context,messages);
    });}catch(error){throw heartFailure(error);}
  }
  async function removeForKey(tx,key,saved){
    const messages=await readMessages(tx,key,now());
    const group=await groupChanges(tx,{key,saved,time:now()},{enabled:false,leagueEnabled:false,region:''});group.apply();
    for(const row of [...messages.live,...messages.expired])tx.delete(row.ref);tx.delete(heartRef(key));
  }
  const api={
    async get(identity){return transact(identity,async(tx,context,messages)=>{
      if(!context.saved)return result(context,messages);
      const group=await groupChanges(tx,context,context.saved);context.saved=withGroup(context.saved,group);group.apply();write(tx,context,messages,{readOnly:true});return result(context,messages);
    },{allowMissing:true,allowPaused:true});},
    async join(identity,input){return transact(identity,async(tx,context,messages)=>{
      if(context.saved){write(tx,context,messages);return result(context,messages);}
      context.saved={consentVersion:HEART_CONSENT,generation:context.member.generation,enabled:true,leagueEnabled:input.leagueEnabled,region:input.region,state:createHeartState({date:koreanDay(context.time),goal:input.goal}),joinedAt:context.time,updatedAt:context.time,group:null};
      context.saved.state=currentState(context.saved,context.member,context.time);
      const group=await groupChanges(tx,{...context,saved:null},context.saved);context.saved=withGroup(context.saved,group);group.apply();write(tx,context,messages);return result(context,messages);
    },{allowMissing:true,allowPaused:true});},
    async settings(identity,input){return transact(identity,async(tx,context,messages)=>{
      const next={...context.saved,...Object.fromEntries(Object.entries(input).filter(([key])=>key!=='goal'))};
      if(input.goal!==undefined)next.state=setHeartGoal(next.state,input.goal);
      const group=await groupChanges(tx,context,next);context.saved=withGroup(next,group);group.apply();write(tx,context,messages);return result(context,messages);
    },{allowPaused:true});},
    async buy(identity,itemId){return transact(identity,(tx,context,messages)=>{
      context.saved.state=buyHeartItem(context.saved.state,itemId);write(tx,context,messages);return result(context,messages);
    });},
    async equip(identity,itemId){return transact(identity,(tx,context,messages)=>{
      context.saved.state=equipHeartItem(context.saved.state,itemId);write(tx,context,messages);return result(context,messages);
    });},
    async gift(identity,itemId){return transact(identity,async(tx,context,messages)=>{
      // An owned item can be worn again without charge or duplicate gifts.
      const owned=context.saved.state.owned.includes(itemId);
      context.saved.state=buyHeartItem(context.saved.state,itemId);
      if(!owned){
        if(messages.live.length>=HEART_MAX_MESSAGES)throw new WalkingError(409,'heart_message_limit');
        const id=randomId(),until=context.time+HEART_MESSAGE_DAYS*DAY,value={id,ownerKey:context.key,type:'gift',itemId,text:`가족이 모은 하트로 ${itemName(itemId)}을 선물했어요.`,createdAt:context.time,readAt:null,until,expiresAt:new Date(until)};
        messages.live.push({ref:messageRef(id),value});tx.set(messageRef(id),value);
      }
      write(tx,context,messages);return result(context,messages);
    });},
    async message(identity,input){return transact(identity,async(tx,context,messages)=>{
      const {requestId,...payload}=input;
      const id=requestId?Buffer.from(hash(context.key+'|'+requestId),'hex').toString('base64url'):randomId();
      const fingerprint=requestId?hash(JSON.stringify([payload.text,payload.photo||null,payload.unlockPercent||0])):null;
      if(requestId){
        // The owner-scoped document identity survives response timeouts. Its
        // fingerprint is kept only for the message's existing 30-day lifetime.
        const prior=(await tx.get(messageRef(id))).data();
        if(prior){
          if(prior.ownerKey!==context.key||prior.type!=='message'||prior.requestFingerprint!==fingerprint)throw new WalkingError(409,'heart_message_request_conflict');
          write(tx,context,messages);return result(context,messages);
        }
      }
      if(messages.live.length>=HEART_MAX_MESSAGES)throw new WalkingError(409,'heart_message_limit');
      const until=context.time+HEART_MESSAGE_DAYS*DAY,value={id,ownerKey:context.key,type:'message',...payload,...(fingerprint?{requestFingerprint:fingerprint}:{}),createdAt:context.time,readAt:null,until,expiresAt:new Date(until)};
      messages.live.push({ref:messageRef(id),value});tx.set(messageRef(id),value);write(tx,context,messages);return result(context,messages);
    });},
    async read(identity,id){return transact(identity,(tx,context,messages)=>{
      const row=messages.live.find(row=>row.value.id===id);if(!row)throw new WalkingError(404,'heart_message_not_found');
      if(context.identity.token&&messageView(row.value,context).locked)throw new WalkingError(403,'heart_message_locked');
      if(row.value.readAt===null){row.value={...row.value,readAt:context.time};tx.set(row.ref,row.value);}
      write(tx,context,messages);return result(context,messages);
    },{allowPaused:true});},
    async leave(identity){
      if(identity.uid){
        // A current verified owner may withdraw even after profile consent was
        // removed. This only deletes its own hashed namespace and returns no data.
        return db.runTransaction(async tx=>{await api.deleteInTransaction(tx,identity.uid);return {ok:true};});
      }
      return transact(identity,async(tx,context,messages)=>{
        const group=await groupChanges(tx,context,{enabled:false,leagueEnabled:false,region:''});group.apply();
        for(const row of [...messages.live,...messages.expired])tx.delete(row.ref);tx.delete(context.target);return {ok:true};
      },{allowMissing:true,allowPaused:true});
    },
    async syncInTransaction(tx,uid,member){
      const target=heartRef(hash(uid)),saved=(await tx.get(target)).data(),time=now();
      if(!accepted(saved)||!saved.enabled||saved.generation!==member.generation)return;
      const next={...saved,state:currentState(saved,member,time),updatedAt:time,pruneAt:new Date(time+DAY)};tx.set(target,next);
    },
    async deleteInTransaction(tx,uid){
      const key=hash(uid),saved=(await tx.get(heartRef(key))).data();await removeForKey(tx,key,saved);
    },
    /** Internal trusted event ingestion only. Not present in the HTTP route table. */
    async recordCooking(uid,{eventId,occurredAt,source='cooker'}={}){
      const time=Date.parse(occurredAt),current=now();
      if(typeof eventId!=='string'||eventId.length<1||eventId.length>256||!Number.isFinite(time)||time>current||koreanDay(time)!==koreanDay(current)||!['cooker','eat_out'].includes(source))throw new WalkingError(400,'invalid_cooking_signal');
      return transact({uid},(tx,context,messages)=>{
        context.saved.state=advanceHearts(context.saved.state,{date:koreanDay(time),count:context.saved.state.days[koreanDay(time)]?.count??null,cooking:true,now:time});
        write(tx,context,messages);return {ok:true,date:koreanDay(time)};
      });
    },
    async league(identity){return transact(identity,async(tx,context,messages)=>{
      requireEnabled(context);if(!context.saved.leagueEnabled)throw new WalkingError(403,'heart_league_consent_required');
      const change=await groupChanges(tx,context,context.saved),group=change.group,directoryTarget=groupRef(group.week,group.region);
      // New weekly enrollment isn't written until every read is complete.
      const directory=(await tx.get(directoryTarget)).data();
      const keys=new Set(groupLists(directory)[group.index]||[]);keys.add(context.key);
      const snapshots=await Promise.all([...keys].map(key=>tx.get(heartRef(key))));
      const candidates=[];
      for(let index=0;index<snapshots.length;index++){
        const key=[...keys][index],value=key===context.key?{...context.saved,group}:snapshots[index].data();
        if(!accepted(value)||!value.enabled||!value.leagueEnabled||value.region!==group.region||value.group?.week!==group.week||value.group?.index!==group.index)continue;
        candidates.push({key,value});
      }
      const members=await Promise.all(candidates.map(row=>tx.get(db.collection('bapmunnaSystem/walking/Members').doc(row.key))));
      const entries=[];
      for(let index=0;index<candidates.length;index++){
        const {key,value}=candidates[index],member=members[index].data();
        if(!member||member.generation!==value.generation||!walkingMemberJoined(member))continue;
        entries.push({publicId:member.publicId,nickname:member.nickname,score:weeklyScore(value.state,group.week),rank:0,tier:key===context.key?change.tier:(value.leagueTier||0),isMe:key===context.key});
      }
      entries.sort((a,b)=>b.score-a.score||a.publicId.localeCompare(b.publicId));
      entries.forEach((row,index)=>{row.rank=index&&entries[index-1].score===row.score?entries[index-1].rank:index+1;});
      context.saved=withGroup(context.saved,change);change.apply();write(tx,context,messages);
      return {enabled:true,week:group.week,weekEnd:heartWeek(group.week).end,region:group.region,group:group.index+1,total:entries.length,practice:entries.length<10,entries,me:entries.find(row=>row.isMe)||null,updatedAt:iso(context.time)};
    });},
    async cleanup({limit=1000}={}){
      if(!Number.isSafeInteger(limit)||limit<1||limit>5000)throw new RangeError('Cleanup limit must be between 1 and 5000.');
      const time=now(),result={scanned:0,messagesDeleted:0,statesPruned:0,statesDeleted:0,groupsDeleted:0,limitReached:false};
      for(const [kind,field,countKey]of[['Messages','expiresAt','messagesDeleted'],['Hearts','pruneAt','statesPruned'],['Groups','expiresAt','groupsDeleted']]){
        const remaining=limit-result.scanned;if(!remaining)break;
        const rows=await db.collection(HEART_COLLECTIONS[kind]).where(field,'<=',new Date(time)).orderBy(field).limit(remaining).get();result.scanned+=rows.size;
        for(const row of rows.docs){
          const changed=await db.runTransaction(async tx=>{
            const saved=(await tx.get(row.ref)).data();if(!saved)return false;
            const expiry=saved[field],millis=expiry instanceof Date?expiry.getTime():expiry?.toMillis?.();if(!Number.isFinite(millis)||millis>time)return false;
            if(kind==='Hearts'){
              const member=(await tx.get(db.collection('bapmunnaSystem/walking/Members').doc(row.id))).data();
              const account=typeof member?.uid==='string'?(await tx.get(db.collection('bapmunnaAccounts').doc(member.uid))).data():null;
              if(!walkingMemberJoined(member)||typeof member.uid!=='string'||saved.generation!==member.generation||hash(member.uid)!==row.id||account?.ownerUid!==member.uid||account?.consentVersion!==ACCOUNT_CONSENT){await removeForKey(tx,row.id,saved);return 'statesDeleted';}
              tx.set(row.ref,{...saved,state:trimState(saved.state,time),pruneAt:new Date(time+DAY)});
            }else tx.delete(row.ref);return countKey;
          });
          if(changed)result[changed]++;
        }
      }
      result.limitReached=result.scanned===limit;return result;
    },
  };
  return api;
}
