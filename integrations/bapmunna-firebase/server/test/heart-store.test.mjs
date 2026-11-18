import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {walkingFirestoreStore,WALKING_COLLECTIONS} from '../walking-store.mjs';
import {HEART_COLLECTIONS} from '../heart-store.mjs';
import {hash,randomToken,koreanDay,PRIVATE_WALKING_CONSENT,WALKING_CONSENT} from '../walking-security.mjs';
import {heartSettings,heartMessage,heartPhoto} from '../heart-security.mjs';

// A serial transaction double rejects reads after writes, just as Firestore does.
// Production Firestore checks are separate; these tests exercise domain + store paths.
function memoryFirestore(){
  const records=new Map();let tail=Promise.resolve();
  class Ref{constructor(path){this.path=path;this.id=path.split('/').at(-1);}get(){return Promise.resolve(snapshot(this));}set(value){records.set(this.path,structuredClone(value));return Promise.resolve();}delete(){records.delete(this.path);return Promise.resolve();}}
  const snapshot=ref=>({id:ref.id,ref,exists:records.has(ref.path),data:()=>structuredClone(records.get(ref.path))});
  class Query{constructor(path,filters=[],order=null,limit=Infinity){Object.assign(this,{path,filters,order,sizeLimit:limit});}doc(id){return new Ref(this.path+'/'+id);}where(field,op,value){return new Query(this.path,[...this.filters,{field,op,value}],this.order,this.sizeLimit);}orderBy(field,direction='asc'){return new Query(this.path,this.filters,{field,direction},this.sizeLimit);}limit(size){return new Query(this.path,this.filters,this.order,size);}count(){return {query:this,aggregate:true};}get(){return Promise.resolve(queryResult(this));}}
  function queryResult(query){
    let rows=[...records].filter(([path])=>path.startsWith(query.path+'/')&&!path.slice(query.path.length+1).includes('/')).map(([path,value])=>({path,value}));
    for(const {field,op,value}of query.filters)rows=rows.filter(row=>op==='=='?row.value[field]===value:op==='<='?row.value[field]<=value:op==='>='?row.value[field]>=value:op==='>'?row.value[field]>value:op==='<'?row.value[field]<value:false);
    if(query.order){const {field,direction}=query.order;rows.sort((a,b)=>(a.value[field]<b.value[field]?-1:a.value[field]>b.value[field]?1:0)*(direction==='desc'?-1:1));}
    rows=rows.slice(0,query.sizeLimit);return {size:rows.length,docs:rows.map(row=>snapshot(new Ref(row.path)))};
  }
  const db={records,collection:path=>new Query(path),doc:path=>new Ref(path),runTransaction(operation){
    const running=tail.then(async()=>{const writes=[];const tx={get:async target=>{if(writes.length)throw Error('Firestore read after write');return target.aggregate?{data:()=>({count:queryResult(target.query).size})}:target instanceof Ref?snapshot(target):queryResult(target);},set:(ref,value)=>writes.push(['set',ref,structuredClone(value)]),delete:ref=>writes.push(['delete',ref])};const result=await operation(tx);for(const [type,ref,value]of writes)type==='set'?records.set(ref.path,value):records.delete(ref.path);return result;});tail=running.catch(()=>{});return running;
  }};return db;
}
async function fixture(){
  let time=Date.parse('2041-11-17T03:00:00Z');const db=memoryFirestore(),store=walkingFirestoreStore(db,()=>time);let users=0,codes=10000000;
  async function member(sharingScope='public'){const uid='test-user-'+(++users);await db.doc('bapmunnaAccounts/'+uid).set({ownerUid:uid,consentVersion:'2026-10-16'});await store.join(uid,'산책친구'+users,{sharingScope});return uid;}
  async function link(uid){const code=String(codes++),token=randomToken();await store.issuePairing(uid,Math.floor(time/1000),code);const preview=await store.pair(code,token,async()=>{});await store.confirm(token,preview.sharingScope==='private'?{consentVersion:PRIVATE_WALKING_CONSENT,shareTodaySteps:true,shareRanking:false}:{consentVersion:WALKING_CONSENT,shareTodaySteps:true});return token;}
  const join=uid=>store.hearts.join({uid},{goal:5000,leagueEnabled:false,region:'',enabled:true});
  async function sync(token,count){time+=1000;return store.sync(token,{date:koreanDay(time),count,queriedAt:time,source:'android-health-connect'});}
  return {db,store,member,link,join,sync,time:()=>time,advance:ms=>{time+=ms;}};
}

test('heart settings refuse unapproved extra fields, calorie-derived inputs, malformed goals and precise region',()=>{
  const input={consentVersion:'2026-11-17-hearts',enabled:true,goal:5000,leagueEnabled:false,region:'세종 조치원'};
  assert.equal(heartSettings(input,{join:true}).goal,5000);
  for(const patch of [{consentVersion:'old'},{enabled:false},{goal:0},{goal:550},{goal:21000},{region:'01012345678'},{count:12000},{uid:'other'},{calories:2000}])assert.throws(()=>heartSettings({...input,...patch},{join:true}));
});
test('photos require bounded raster content, message length and valid optional unlock threshold',()=>{
  assert.equal(heartMessage({text:' 같이 걸어요 ',unlockPercent:25}).text,'같이 걸어요');
  for(const input of [{text:''},{text:'가'.repeat(281)},{text:'hello',unlockPercent:75},{text:'hello',uid:'other'},{text:'hello',photo:'data:image/svg+xml;base64,PHN2Zy8+'}])assert.throws(()=>heartMessage(input));
  assert.throws(()=>heartPhoto('data:image/jpeg;base64,'+Buffer.alloc(160001).toString('base64')));
  const requestId=randomUUID();assert.equal(heartMessage({text:'같이 걸어요',requestId:requestId.toUpperCase()}).requestId,requestId);
  for(const value of [null,1,'bad-id','00000000-0000-0000-0000-000000000000',requestId+'x'])assert.throws(()=>heartMessage({text:'같이 걸어요',requestId:value}));
});
test('no hearts are saved before optional consent; trusted native sync alone cannot create a wallet',async()=>{
  const f=await fixture(),uid=await f.member(),token=await f.link(uid);await f.sync(token,5000);
  assert.deepEqual(await f.store.hearts.get({uid}),{enabled:false,joined:false});
  assert.equal([...f.db.records.keys()].filter(key=>key.startsWith(HEART_COLLECTIONS.Hearts+'/')).length,0);
});
test('native step sync awards once at50/100/200 percent; read and corrected lower totals do not duplicate credits',async()=>{
  const f=await fixture(),uid=await f.member(),token=await f.link(uid);await f.join(uid);
  await f.sync(token,2500);let view=await f.store.hearts.get({uid});assert.equal(view.state.balance,1);assert.equal(view.summary.percent,50);
  await f.sync(token,5000);view=await f.store.hearts.get({token});assert.equal(view.state.balance,3);
  await Promise.all([f.store.hearts.get({uid}),f.store.hearts.get({token})]);assert.equal((await f.store.hearts.get({uid})).state.balance,3);
  await f.sync(token,10000);assert.equal((await f.store.hearts.get({uid})).state.balance,5);
  await f.sync(token,2000);view=await f.store.hearts.get({uid});assert.equal(view.summary.percent,40);assert.equal(view.state.balance,5);
});
test('goals freeze after observation; new KST day resets progress while wallet and equipment remain',async()=>{
  const f=await fixture(),uid=await f.member(),token=await f.link(uid);await f.join(uid);await f.sync(token,5000);
  await f.store.hearts.buy({uid},'scarf');await f.store.hearts.equip({uid},'scarf');
  let view=await f.store.hearts.settings({uid},{goal:10000});assert.equal(view.summary.goal,5000);assert.equal(view.state.goal,10000);
  f.advance(86400000);view=await f.store.hearts.get({uid});assert.equal(view.summary.count,null);assert.equal(view.summary.goal,10000);assert.equal(view.state.equipped.accessory,'scarf');assert.equal(view.state.balance,0);
});
test('pause stops credits while walking sync remains working, explicit resume is required',async()=>{
  const f=await fixture(),uid=await f.member(),token=await f.link(uid);await f.join(uid);
  await f.store.hearts.settings({uid},{enabled:false});await f.sync(token,10000);
  let view=await f.store.hearts.get({uid});assert.equal(view.enabled,false);assert.equal(view.state.balance,0);
  await assert.rejects(()=>f.store.hearts.buy({uid},'scarf'),{code:'heart_paused'});
  await f.store.hearts.settings({uid},{enabled:true});view=await f.store.hearts.get({uid});assert.equal(view.enabled,true);assert.equal(view.state.balance,5);
});
test('simultaneous purchases use one wallet, cannot overspend, and owned-item retries are free',async()=>{
  const f=await fixture(),uid=await f.member(),token=await f.link(uid);await f.join(uid);await f.sync(token,5000);
  const results=await Promise.allSettled([f.store.hearts.buy({uid},'scarf'),f.store.hearts.buy({uid},'basket')]);
  assert.equal(results.filter(row=>row.status==='fulfilled').length,1);assert.equal(results.find(row=>row.status==='rejected').reason.code,'insufficient_hearts');
  const view=await f.store.hearts.get({uid}),owned=view.state.owned[0];await f.store.hearts.buy({uid},owned);assert.equal((await f.store.hearts.get({uid})).state.balance,0);
});
test('gifts use existing balance and create exactly one notification for one acquired item',async()=>{
  const f=await fixture(),uid=await f.member(),token=await f.link(uid);await f.join(uid);await f.sync(token,5000);
  await Promise.all([f.store.hearts.gift({uid},'scarf'),f.store.hearts.gift({uid},'scarf')]);
  const view=await f.store.hearts.get({uid});assert.equal(view.state.balance,0);assert.equal(view.messages.length,1);assert.equal(view.messages[0].type,'gift');
});
test('locked gift letters hide text and photo from native until target; other families cannot read or mark them',async()=>{
  const f=await fixture(),a=await f.member(),b=await f.member(),token=await f.link(a);await f.join(a);await f.join(b);
  const sent=await f.store.hearts.message({uid:a},{text:'작은 산책을 응원해요',unlockPercent:25}),id=sent.messages[0].id;
  assert.equal(sent.messages[0].locked,true);assert.equal(sent.messages[0].text,'작은 산책을 응원해요');
  let device=await f.store.hearts.get({token});assert.equal(device.messages[0].text,null);assert.equal(device.messages[0].photo,null);
  await assert.rejects(()=>f.store.hearts.read({token},id),{code:'heart_message_locked'});
  assert.equal((await f.store.hearts.get({uid:b})).messages.length,0);await assert.rejects(()=>f.store.hearts.read({uid:b},id),{code:'heart_message_not_found'});
  await f.sync(token,1250);device=await f.store.hearts.get({token});assert.equal(device.messages[0].locked,false);assert.equal(device.messages[0].text,'작은 산책을 응원해요');
  const read=await f.store.hearts.read({token},id);assert.ok(read.messages[0].readAt);
  await f.sync(token,0);assert.equal((await f.store.hearts.get({token})).messages[0].locked,false);
  f.advance(86400000);assert.equal((await f.store.hearts.get({token})).messages[0].text,'작은 산책을 응원해요');
});
test('only internal confirmed cooking signals affect cooking milestone and no food amount is stored',async()=>{
  const f=await fixture(),uid=await f.member();await f.join(uid);
  await f.store.hearts.recordCooking(uid,{eventId:'trusted-cook',occurredAt:new Date(f.time()).toISOString()});
  await f.store.hearts.recordCooking(uid,{eventId:'trusted-cook',occurredAt:new Date(f.time()).toISOString()});
  const view=await f.store.hearts.get({uid});assert.equal(view.summary.cooking,true);assert.equal(view.state.balance,0);assert.equal(view.summary.count,null);
  assert.doesNotMatch(JSON.stringify(view),/eventId|calorie|power|watts/);
  await assert.rejects(()=>f.store.hearts.recordCooking(uid,{eventId:'old',occurredAt:new Date(f.time()-86400000).toISOString()}),{code:'invalid_cooking_signal'});
});
test('old messages expire, item wallet persists, summaries prune to35days, and full deletion preserves ordinary walking',async()=>{
  const f=await fixture(),uid=await f.member(),token=await f.link(uid);await f.join(uid);await f.sync(token,5000);await f.store.hearts.buy({uid},'scarf');await f.store.hearts.message({uid},{text:'오래된 응원',unlockPercent:0});
  f.advance(36*86400000);await f.store.cleanup({limit:1000});const view=await f.store.hearts.get({uid});
  assert.equal(view.messages.length,0);assert.equal(view.state.owned[0],'scarf');assert.ok(Object.keys(view.state.days).every(date=>date>='2041-11-19'));
  await f.store.hearts.leave({uid});assert.deepEqual(await f.store.hearts.get({uid}),{enabled:false,joined:false});assert.equal((await f.store.profile(uid)).joined,true);
});
test('membership withdrawal removes hearts and messages and prevents late device writes from reviving them',async()=>{
  const f=await fixture(),uid=await f.member(),token=await f.link(uid);await f.join(uid);await f.store.hearts.message({uid},{text:'안부',unlockPercent:0});
  await f.store.leave(uid);assert.equal(f.db.records.has(HEART_COLLECTIONS.Hearts+'/'+hash(uid)),false);
  assert.equal([...f.db.records.values()].filter(value=>value.ownerKey===hash(uid)).length,0);await assert.rejects(()=>f.sync(token,6000));
});
test('league is separate optin, has no fictional people, stable groups of15, ties and perday300cap',async()=>{
  const f=await fixture(),uids=[];
  for(let i=0;i<16;i++){const uid=await f.member();uids.push(uid);await f.store.hearts.join({uid},{goal:5000,enabled:true,leagueEnabled:true,region:'세종'});}
  const token=await f.link(uids[0]);await f.sync(token,20000);
  const first=await f.store.hearts.league({uid:uids[0]}),last=await f.store.hearts.league({uid:uids[15]});
  assert.equal(first.total,15);assert.equal(last.total,1);assert.equal(first.me.score,300);assert.equal(first.me.rank,1);assert.equal(last.group,2);
  assert.doesNotMatch(JSON.stringify(first),/test-user|ownerKey|generation|device/);
  await f.store.hearts.settings({uid:uids[0]},{leagueEnabled:false});await assert.rejects(()=>f.store.hearts.league({uid:uids[0]}),{code:'heart_league_consent_required'});
  assert.equal((await f.store.hearts.league({uid:uids[1]})).total,14);
});
test('completed leagues promote onlythree positive leaders with10members and never duplicate a promotion',async()=>{
  const f=await fixture(),uids=[];
  for(let index=0;index<10;index++){
    const uid=await f.member(),token=await f.link(uid);uids.push(uid);
    await f.store.hearts.join({uid},{goal:5000,enabled:true,leagueEnabled:true,region:'대전'});await f.sync(token,9000-index*500);
  }
  f.advance(7*86400000);
  for(let index=0;index<10;index++){
    const view=await f.store.hearts.get({uid:uids[index]});assert.equal(view.tier,index<3?1:0);assert.equal((await f.store.hearts.get({uid:uids[index]})).tier,view.tier);
  }
  const practice=await f.member(),token=await f.link(practice);await f.store.hearts.join({uid:practice},{goal:5000,enabled:true,leagueEnabled:true,region:'충주'});await f.sync(token,20000);f.advance(7*86400000);
  assert.equal((await f.store.hearts.get({uid:practice})).tier,0);
});
test('current verifiedweb owner can erase hearts after profileconsent withdrawn without reading any private result',async()=>{
  const f=await fixture(),uid=await f.member();await f.join(uid);await f.store.hearts.message({uid},{text:'인사',unlockPercent:0});
  await f.db.doc('bapmunnaAccounts/'+uid).delete();await assert.rejects(()=>f.store.hearts.get({uid}),{code:'account_consent_required'});
  assert.deepEqual(await f.store.hearts.leave({uid}),{ok:true});assert.equal(f.db.records.has(HEART_COLLECTIONS.Hearts+'/'+hash(uid)),false);
});
test('twenty-family-message cap is bounded and expiration permits new messages without retaining old photos',async()=>{
  const f=await fixture(),uid=await f.member();await f.join(uid);
  for(let index=0;index<20;index++)await f.store.hearts.message({uid},{text:'안부'+index,unlockPercent:0});
  await assert.rejects(()=>f.store.hearts.message({uid},{text:'추가',unlockPercent:0}),{code:'heart_message_limit'});
  f.advance(30*86400000+1);const view=await f.store.hearts.message({uid},{text:'새 안부',unlockPercent:0});assert.equal(view.messages.length,1);
});
test('private family steps earn hearts without entering the existing public ranking',async()=>{
  const f=await fixture(),privateUid=await f.member('private'),publicUid=await f.member();
  const privateToken=await f.link(privateUid),publicToken=await f.link(publicUid);await f.join(privateUid);await f.sync(privateToken,10000);await f.sync(publicToken,100);
  const profile=await f.store.profile(privateUid);assert.equal(profile.sharingScope,'private');assert.equal(profile.count,10000);
  assert.equal(f.db.records.get(WALKING_COLLECTIONS.Members+'/'+hash(privateUid)).rankKey,undefined);
  const privateBoard=await f.store.board({token:privateToken});assert.equal(privateBoard.sharingScope,'private');assert.deepEqual(privateBoard.entries,[]);assert.equal(privateBoard.me.count,null);assert.equal(privateBoard.me.rank,null);
  const publicBoard=await f.store.board({uid:publicUid});assert.equal(publicBoard.total,1);assert.equal(publicBoard.me.rank,1);assert.deepEqual(publicBoard.entries.map(row=>row.publicId),[publicBoard.me.publicId]);
  const hearts=await f.store.hearts.get({uid:privateUid});assert.equal(hearts.summary.count,10000);assert.equal(hearts.state.balance,5);assert.equal(hearts.leagueEnabled,false);
  await assert.rejects(()=>f.store.hearts.league({uid:privateUid}),{code:'heart_league_consent_required'});
  await f.store.hearts.settings({uid:privateUid},{leagueEnabled:true});const league=await f.store.hearts.league({uid:privateUid});assert.equal(league.total,1);assert.equal(league.practice,true);assert.equal(league.me.score,200);
  assert.equal((await f.store.board({uid:publicUid})).total,1);
});
test('private pairing requires separate matching consent and cannot silently broaden a confirmed token',async()=>{
  const f=await fixture(),uid=await f.member('private'),code='91827364',token=randomToken();
  await f.store.issuePairing(uid,Math.floor(f.time()/1000),code);const preview=await f.store.pair(code,token,async()=>{});assert.equal(preview.sharingScope,'private');
  await assert.rejects(()=>f.store.confirm(token),{code:'consent_required'});
  const confirmation=await f.store.confirm(token,{consentVersion:PRIVATE_WALKING_CONSENT,shareTodaySteps:true,shareRanking:false});assert.equal(confirmation.sharingScope,'private');
  const profile=await f.store.profile(uid);await assert.rejects(()=>f.store.join(uid,profile.nickname,{sharingScope:'public'}),{code:'sharing_scope_locked'});
  const memberRef=f.db.doc(WALKING_COLLECTIONS.Members+'/'+hash(uid)),member=(await memberRef.get()).data();
  await memberRef.set({...member,sharingScope:'public',consentVersion:WALKING_CONSENT});
  await assert.rejects(()=>f.sync(token,10000),{code:'destination_changed'});assert.equal((await memberRef.get()).data().rankKey,undefined);
});
test('heart withdrawal remains idempotent after prior base membership deletion',async()=>{
  const f=await fixture(),uid=await f.member('private');await f.join(uid);await f.store.hearts.message({uid},{text:'반가운 안부',unlockPercent:0});
  await f.db.doc(WALKING_COLLECTIONS.Members+'/'+hash(uid)).delete();
  await assert.rejects(()=>f.store.hearts.get({uid}),{code:'participation_required'});
  assert.deepEqual(await f.store.hearts.leave({uid}),{ok:true});assert.deepEqual(await f.store.hearts.leave({uid}),{ok:true});
  assert.equal(f.db.records.has(HEART_COLLECTIONS.Hearts+'/'+hash(uid)),false);assert.equal([...f.db.records.values()].filter(value=>value.ownerKey===hash(uid)).length,0);
});
test('daily cleanup removes orphaned hearts and photos when membership or account consent was removed',async()=>{
  const f=await fixture(),memberGone=await f.member('private'),consentGone=await f.member('private');
  for(const uid of [memberGone,consentGone]){await f.store.hearts.join({uid},{goal:5000,enabled:true,leagueEnabled:true,region:'세종'});await f.store.hearts.message({uid},{text:'가족 사진 편지',unlockPercent:0});}
  await f.db.doc(WALKING_COLLECTIONS.Members+'/'+hash(memberGone)).delete();await f.db.doc('bapmunnaAccounts/'+consentGone).delete();f.advance(86400001);
  const cleanup=await f.store.hearts.cleanup({limit:1000});assert.equal(cleanup.statesDeleted,2);
  for(const uid of [memberGone,consentGone]){assert.equal(f.db.records.has(HEART_COLLECTIONS.Hearts+'/'+hash(uid)),false);assert.equal([...f.db.records.values()].filter(value=>value.ownerKey===hash(uid)).length,0);}
  const directories=[...f.db.records].filter(([key])=>key.startsWith(HEART_COLLECTIONS.Groups+'/')).map(([,value])=>value);
  assert.ok(directories.every(directory=>directory.groups.every(group=>group.members.length===0)));
});
test('message request IDs prevent timeout duplicates, reject changed content and stay owner-scoped',async()=>{
  const f=await fixture(),a=await f.member('private'),b=await f.member('private');await f.join(a);await f.join(b);
  const requestId=randomUUID(),payload=heartMessage({requestId,text:'반가운 안부',unlockPercent:25});
  const responses=await Promise.all([f.store.hearts.message({uid:a},payload),f.store.hearts.message({uid:a},payload)]);
  assert.equal(responses[0].messages.length,1);assert.deepEqual(responses[0].messages,responses[1].messages);
  const original=responses[0].messages[0];f.advance(5000);
  const retried=await f.store.hearts.message({uid:a},payload);assert.equal(retried.messages[0].id,original.id);assert.equal(retried.messages[0].createdAt,original.createdAt);
  for(const patch of [{text:'다른 내용'},{unlockPercent:50},{photo:'data:image/png;base64,aGVsbG8='}])await assert.rejects(()=>f.store.hearts.message({uid:a},{...payload,...patch}),{status:409,code:'heart_message_request_conflict'});
  const other=await f.store.hearts.message({uid:b},payload);assert.notEqual(other.messages[0].id,original.id);assert.equal(other.messages.length,1);
  assert.doesNotMatch(JSON.stringify(retried),/requestId|requestFingerprint/);
  // A retry at the inbox capacity must return the prior success, not limit failure.
  for(let index=0;index<19;index++)await f.store.hearts.message({uid:a},{text:'추가 안부'+index,unlockPercent:0});
  assert.equal((await f.store.hearts.message({uid:a},payload)).messages.length,20);
  await f.store.hearts.message({uid:b},{text:'기존 형식',unlockPercent:0});await f.store.hearts.message({uid:b},{text:'기존 형식',unlockPercent:0});assert.equal((await f.store.hearts.get({uid:b})).messages.length,3);
});
