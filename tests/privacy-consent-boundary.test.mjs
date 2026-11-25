import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const consentAt='2026-11-12T00:00:00Z';
const must=response=>{if(response.error)throw response.error;return response.data;};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const flush=()=>new Promise(resolve=>setImmediate(resolve));

// Execute the actual Edge Function source in memory, replacing only its IO.
// No Deno process, database, token, push service or real device is contacted.
function loadEdge(relative,dependencies){
  const filename=new URL(`../supabase/functions/${relative}`,import.meta.url);
  const source=readFileSync(filename,'utf8');
  const {outputText}=ts.transpileModule(source,{fileName:filename.pathname,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  let handler;
  const exports={};
  const context={exports,Request,Response,Date,URL,crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000000'},console:{error(){}},Deno:{serve:callback=>{handler=callback;},env:{get:()=> 'synthetic-vapid-config'}},
    require(name){if(name==='jsr:@supabase/functions-js/edge-runtime.d.ts')return {};if(Object.hasOwn(dependencies,name))return dependencies[name];throw Error(`Unexpected import: ${name}`);}};
  vm.runInNewContext(outputText,context,{filename:filename.pathname});
  return {exports,request:request=>handler(request)};
}

const seniorTime=loadEdge('../../lib/judge/time.ts',{}).exports;
const mealTypes=loadEdge('../../lib/judge/types.ts',{}).exports;
const mealJudge=loadEdge('../../lib/judge/resolveMealSlots.ts',{'./time.ts':seniorTime,'./types.ts':mealTypes}).exports;

const meterSample = { watts: 45, measuredAt: "2026-11-13T00:00:00.000Z" };
function registrationFixture({consents=[consentAt],signedIn=true,linked=true,onReadPower=null}={}){
  const calls={power:[],rpc:[],writes:[],consent:0};
  const db={auth:{getUser:async()=>({data:{user:signedIn?{id:'synthetic-owner'}:null},error:null})},
    from(table){
      let operation='select',payload,filters=[];
      const execute=()=>{
        if(operation!=='select'){calls.writes.push({table,operation,payload,filters});return {data:null,error:null};}
        if(table==='household_guardians')return {data:linked?[{household_id:'synthetic-house'}]:[],error:null};
        if(table==='households'){
          const value=consents[Math.min(calls.consent++,consents.length-1)];
          return value instanceof Error?{data:null,error:value}:{data:value===undefined?null:{senior_consent_at:value},error:null};
        }
        throw Error(`Unexpected table: ${table}`);
      };
      const query={select(){return query;},eq(key,value){filters.push([key,value]);return query;},order(){return query;},limit(){return query;},update(value){operation='update';payload=value;return query;},maybeSingle:async()=>execute(),then:(resolve,reject)=>Promise.resolve().then(execute).then(resolve,reject)};
      return query;
    },
    rpc:async(name,args)=>{calls.rpc.push({name,args});return {data:'synthetic-plug',error:null};},
  };
  const readPower=async(...args)=>{calls.power.push(args);if(onReadPower)return onReadPower();return meterSample;};
  const edge=loadEdge('register-plug/index.ts',{'@/_shared/core.ts':{db,must,json,cors:{},readPower,readMeterKind:async()=>"recognized",
    recordObservation:async(h,device,kind,reading,registration)=>{calls.rpc.push({name:'record_plug_observation',args:{h,device,kind,reading,registration}});return true;}}});
  return {calls,request:(body={deviceId:'synthetic-device',token:'synthetic-not-a-real-token'})=>edge.request(new Request('https://fixture.invalid/register-plug',{method:'POST',headers:{authorization:'Bearer synthetic-app-session','content-type':'application/json'},body:JSON.stringify(body)}))};
}

test('registration refuses an absent session before reading any device or storing a token',async()=>{
  const f=registrationFixture({signedIn:false}),response=await f.request();
  assert.equal(response.status,401);assert.equal(f.calls.power.length,0);assert.equal(f.calls.rpc.length,0);assert.equal(f.calls.consent,0);
});

test('registration requires the authenticated user household, without trusting a submitted household ID',async()=>{
  const f=registrationFixture({linked:false}),response=await f.request({deviceId:'synthetic-device',token:'synthetic-token',householdId:'other-house'});
  assert.equal(response.status,400);assert.equal(f.calls.power.length,0);assert.equal(f.calls.rpc.length,0);
});

for(const consent of [null,undefined,'invalid-date'])test(`registration fails closed for missing or invalid consent: ${String(consent)}`,async()=>{
  const f=registrationFixture({consents:[consent]}),response=await f.request();
  assert.equal(response.status,403);assert.equal((await response.json()).code,'senior_consent_required');
  assert.equal(f.calls.power.length,0);assert.equal(f.calls.rpc.length,0);assert.equal(f.calls.writes.length,0);
});

test('a consent read failure stops registration without reading the device',async()=>{
  const f=registrationFixture({consents:[Error('synthetic database outage')]}),response=await f.request();
  assert.equal(response.status,500);assert.equal(f.calls.power.length,0);assert.equal(f.calls.rpc.length,0);
});

test('consent withdrawn while waiting for the device prevents token storage',async()=>{
  let resolvePower;
  const pending=new Promise(resolve=>{resolvePower=resolve;});
  const f=registrationFixture({consents:[consentAt,null],onReadPower:()=>pending});
  const operation=f.request();await flush();assert.equal(f.calls.power.length,1);
  resolvePower(45);const response=await operation;
  assert.equal(response.status,403);assert.equal(f.calls.rpc.length,0);assert.equal(f.calls.writes.length,0);
});

test('successful registration returns only connection confirmation and check time, never watts',async()=>{
  const f=registrationFixture(),response=await f.request();const body=await response.json();
  assert.equal(response.status,200);assert.deepEqual(Object.keys(body).sort(),['checkedAt','connected']);
  assert.equal(body.connected,true);assert.ok(Number.isFinite(Date.parse(body.checkedAt)));
  assert.equal(f.calls.consent,2);assert.equal(f.calls.rpc.length,1);assert.equal(f.calls.rpc[0].args.h,'synthetic-house');
  assert.equal(f.calls.writes.length,0);assert.deepEqual(f.calls.rpc[0].args.reading,meterSample);assert.equal(Object.hasOwn(body,'watts'),false);
});

test('upstream error details cannot leak a token or raw measurement into the response',async()=>{
  const f=registrationFixture({onReadPower:()=>{throw Error('synthetic-secret-token watts=45');}}),response=await f.request();
  assert.equal(response.status,400);assert.doesNotMatch(await response.text(),/synthetic-secret|watts|45/);
  assert.equal(f.calls.rpc.length,0);
});

test('invalid registration field types are rejected before touching SmartThings',async()=>{
  const f=registrationFixture(),response=await f.request({deviceId:123,token:{}});
  assert.equal(response.status,400);assert.equal(f.calls.power.length,0);assert.equal(f.calls.rpc.length,0);
});

function queryDatabase(resolveQuery,rpc){
  return {rpc,from(table){
    const operation={table,kind:'select',fields:'',filters:[],single:false,payload:null};
    const execute=()=>Promise.resolve().then(()=>resolveQuery(operation));
    const query={
      select(fields){operation.fields=fields;return query;},
      eq(key,value){operation.filters.push(['eq',key,value]);return query;},
      gt(key,value){operation.filters.push(['gt',key,value]);return query;},
      gte(key,value){operation.filters.push(['gte',key,value]);return query;},
      lte(key,value){operation.filters.push(['lte',key,value]);return query;},
      lt(key,value){operation.filters.push(['lt',key,value]);return query;},
      is(key,value){operation.filters.push(['is',key,value]);return query;},
      not(key,operator,value){operation.filters.push(['not',key,value,operator]);return query;},
      in(key,value){operation.filters.push(['in',key,value]);return query;},
      order(){return query;},limit(){return query;},
      insert(payload){operation.kind='insert';operation.payload=payload;return query;},
      upsert(payload){operation.kind='upsert';operation.payload=payload;return query;},
      update(payload){operation.kind='update';operation.payload=payload;return query;},
      delete(){operation.kind='delete';return query;},
      single(){operation.single=true;return execute();},maybeSingle(){operation.single=true;return execute();},
      then:(success,failure)=>execute().then(success,failure),
    };
    return query;
  }};
}

function jobFixture({consents=[consentAt],onPower=null,activeConsent=consentAt}={}){
  const calls={reads:[],writes:[],rpc:[],power:0,push:0,recompute:[],evaluate:0,consent:0};
  const db=queryDatabase(operation=>{
    if(operation.kind!=='select'){
      calls.writes.push(operation);
      return {data:operation.table==='alerts'?[{id:'synthetic-alert',type:'fasting',payload:null}]:null,error:null};
    }
    calls.reads.push(operation);
    let data;
    if(operation.table==='households'){
      const eq=operation.filters.find(([kind,key])=>kind==='eq'&&key==='id');
      if(eq&&operation.fields.includes('senior_consent_at')){
        const consent=consents[Math.min(calls.consent++,consents.length-1)];
        if(consent instanceof Error)return {data:null,error:consent};
        data={id:'synthetic-house',senior_consent_at:consent};
      }else if(eq){data={last_activity_at:'2026-11-01T00:00:00Z'};}
      else{
        data=[{id:'synthetic-house',senior_consent_at:activeConsent,onboarding_step:8}];
        if(operation.filters.some(([kind,key,value])=>kind==='not'&&key==='senior_consent_at'&&value===null))data=data.filter(row=>row.senior_consent_at!==null);
      }
    }else if(operation.table==='smart_plugs'){
      const plug={id:'synthetic-plug',household_id:'synthetic-house',st_device_id:'synthetic-device',last_reading_at:'2026-11-13T00:00:00Z',meter_kind:'recognized',observing_since:'2026-11-01T00:00:00Z',status:'online'};
      data=operation.single?plug:[plug];
    }else if(operation.table==='meal_profiles')data={meal_windows:[{slot:'lunch',start:'11:00',end:'14:00'}]};
    else if(operation.table==='alert_settings')data={missed_meals_threshold:2,fasting_hours:48,emergency_hours:72};
    else if(operation.table==='meal_slots')data=[{status:'confirmed',date:'2026-11-12',slot:'lunch'}];
    else if(operation.table==='alerts'||operation.table==='power_readings_raw')data=[];
    else throw Error(`Unexpected table: ${operation.table}`);
    return {data,error:null};
  },async(name,args)=>{calls.rpc.push({name,args});return {data:name==='job_secret'?'synthetic-job-secret':'synthetic-device-token',error:null};});
  const shared={db,must,json,dayRange:()=>({from:'2026-11-13T00:00:00Z'}),getAbsences:async()=>[],
    readPower:async()=>{calls.power++;return onPower?onPower():meterSample;},readMeterKind:async()=>'recognized',
    recordObservation:async(h,device,kind,reading)=>{calls.writes.push({table:'record_plug_observation',kind:'rpc',reading});return true;},
    recomputeDay:async(h)=>{calls.recompute.push(h);},refreshActivity:async()=>{}};
  const edge=loadEdge('jobs/index.ts',{
    '@/lib/judge/resolveMealSlots.ts':mealJudge, '@/lib/judge/types.ts':mealTypes,
    '@/_shared/core.ts':shared,
    '@/_shared/push.ts':{pushAlerts:async()=>{calls.push++;}},
    '@/config/detection.ts':{ALERT_DEFAULTS:{DEVICE_OFFLINE_HOURS:2},DETECTION:{READING_INTERVAL_MIN:1,COOK_MERGE_GAP_MIN:10,LID_OPEN_DEBOUNCE_MIN:10},RAW_RETENTION_HOURS:24},
    '@/lib/judge/detectEvents.ts':{detectEvents:()=>[]},
    '@/lib/judge/evaluateAlerts.ts':{evaluateAlerts:()=>{calls.evaluate++;return {create:['fasting'],resolve:[]};}},
    '@/lib/judge/time.ts':{addDays:()=> '2026-11-12',HOUR_MS:3600000,kstDate:()=> '2026-11-13',kstDateTime:(d,t)=>new Date(d+'T'+t+':00+09:00'),MINUTE_MS:60000},
  });
  return {calls,request:job=>edge.request(new Request(`https://fixture.invalid/jobs?job=${job}`,{headers:{'x-job-secret':'synthetic-job-secret'}}))};
}

test('ingest skips a non-consenting household before reading its token or device',async()=>{
  const f=jobFixture({consents:[null]}),response=await f.request('ingest');
  assert.equal(response.status,200);assert.equal((await response.json()).ok,0);
  assert.equal(f.calls.power,0);assert.equal(f.calls.writes.length,0);assert.deepEqual(f.calls.rpc.map(call=>call.name),['job_secret']);
});

test('ingest fails closed when consent cannot be read',async()=>{
  const f=jobFixture({consents:[Error('synthetic outage')]}),response=await f.request('ingest');
  assert.equal(response.status,500);assert.equal(f.calls.power,0);assert.equal(f.calls.writes.length,0);
});

test('ingest discards a sample if consent was withdrawn while SmartThings responded',async()=>{
  let finish;const pending=new Promise(resolve=>{finish=resolve;});
  const f=jobFixture({consents:[consentAt,null],onPower:()=>pending});
  const operation=f.request('ingest');await flush();assert.equal(f.calls.power,1);
  finish(45);const response=await operation;
  assert.equal(response.status,200);assert.equal((await response.json()).ok,0);assert.equal(f.calls.writes.length,0);
});

test('consented ingest still stores its private sample and marks the device online',async()=>{
  const f=jobFixture(),response=await f.request('ingest');
  assert.equal(response.status,200);assert.equal((await response.json()).ok,1);
  assert.deepEqual(f.calls.writes.map(write=>[write.table,write.kind]),[['record_plug_observation','rpc']]);
});

test('judge does not read or derive raw samples without consent',async()=>{
  const f=jobFixture({consents:[null],activeConsent:null}),response=await f.request('judge');
  assert.equal(response.status,200);assert.ok(!f.calls.reads.some(read=>read.table==='power_readings_raw'));
  assert.equal(f.calls.writes.filter(write=>write.table!=='smart_plugs').length,0);assert.deepEqual(f.calls.recompute,[]);
});

for(const job of ['alerts','weekly'])test(`${job} does not create records or push after consent withdrawal`,async()=>{
  const f=jobFixture({consents:[null]}),response=await f.request(job);
  assert.equal(response.status,200);assert.equal(f.calls.writes.length,0);assert.equal(f.calls.push,0);
});

test('active alert households exclude an absent consent stamp',async()=>{
  const f=jobFixture({activeConsent:null}),response=await f.request('alerts');
  assert.equal(response.status,200);assert.equal((await response.json()).households,0);assert.equal(f.calls.evaluate,0);
});

test('consented alerts retain their existing creation and push behavior',async()=>{
  const f=jobFixture(),response=await f.request('alerts');
  assert.equal(response.status,200);assert.equal((await response.json()).created,1);
  assert.equal(f.calls.writes.filter(write=>write.table==='alerts').length,1);assert.equal(f.calls.push,1);
});

test('daily skips non-consenting summaries while retaining existing expiry cleanup',async()=>{
  const f=jobFixture({activeConsent:null}),response=await f.request('daily');
  assert.equal(response.status,200);assert.deepEqual(f.calls.recompute,[]);
  assert.deepEqual(f.calls.writes.map(write=>[write.table,write.kind]),[['cooker_events','delete'],['power_readings_raw','delete']]);
});

function pushFixture({consents=[consentAt],signedOut=false,leftHouse=false,endpoint}={}){
  const calls={sent:[],reads:[],consent:0};
  const db=queryDatabase(operation=>{
    calls.reads.push(operation.table);let data;
    if(operation.table==='households'){
      const consent=consents[Math.min(calls.consent++,consents.length-1)];
      if(consent instanceof Error)return {data:null,error:consent};
      data={senior_relation:'테스트 가족',senior_consent_at:consent};
    }else if(operation.table==='household_guardians')data=leftHouse && operation.filters.some(f=>f[1]==='user_id')?[]:[{user_id:'synthetic-owner'}];
    else if(operation.table==='alert_settings')data={missed_meals_threshold:2,fasting_hours:48,emergency_hours:72};
    else if(operation.table==='smart_plugs')data={id:'synthetic-plug'};
    else if(operation.table==='push_subscriptions')data=signedOut && operation.fields==='id'?[]:[1,2].map(id=>({id:String(id),user_id:'synthetic-owner',endpoint:endpoint??`https://web.push.apple.com/synthetic/${id}`,keys:{p256dh:'synthetic',auth:'synthetic'}}));
    else throw Error(`Unexpected table: ${operation.table}`);
    return {data,error:null};
  });
  const webpush={setVapidDetails(){},sendNotification:async(subscription,message)=>{calls.sent.push({subscription,message});}};
  const edge=loadEdge('_shared/push.ts',{'./core.ts':{db,must},'npm:web-push@3.6.7':{default:webpush},'@/lib/alerts/copy.ts':{alertCopy:()=>({title:'테스트 알림',body:'테스트 본문'}),alertUrl:()=> '/alerts'}});
  return {calls,run:(type='fasting',payload=null)=>edge.exports.pushAlerts('synthetic-house',[{id:'synthetic-alert',type,payload,triggered_at:'2026-11-24T01:32:00Z'}])};
}

test('push without consent stops before reading guardian subscriptions',async()=>{
  const f=pushFixture({consents:[null]});await f.run();assert.equal(f.calls.sent.length,0);
  assert.deepEqual(f.calls.reads,['households']);
});

test('push rechecks consent after loading recipients and stops if withdrawn',async()=>{
  const f=pushFixture({consents:[consentAt,null]});await f.run();assert.equal(f.calls.sent.length,0);assert.equal(f.calls.consent,2);
});

test('push fails closed when the final consent check cannot complete',async()=>{
  const f=pushFixture({consents:[consentAt,Error('synthetic outage')]});await f.run();assert.equal(f.calls.sent.length,0);
});

test('withdrawal between two recipient sends prevents the remaining delivery',async()=>{
  const f=pushFixture({consents:[consentAt,consentAt,null]});await f.run();
  assert.equal(f.calls.sent.length,1);assert.equal(f.calls.sent[0].subscription.endpoint,'https://web.push.apple.com/synthetic/1');
});

test('consented push still delivers to the existing recipients',async()=>{
  const f=pushFixture();await f.run();assert.equal(f.calls.sent.length,2);
  assert.equal(f.calls.consent,3);assert.ok(f.calls.sent.every(sent=>JSON.parse(sent.message).tag==='synthetic-alert'));
});

test('push omits personal payload and keeps the user-selected meal date',async()=>{
  const f=pushFixture();await f.run('eat_out',{meal:{date:'2026-11-23',label:'private meal'},startDate:'private data'});
  assert.deepEqual(JSON.parse(f.calls.sent[0].message),{kind:'eat_out',tag:'synthetic-alert',url:'/alerts',at:'2026-11-24T01:32:00.000Z',date:'2026-11-23'});
});

test('revoked subscriptions, removed guardians and arbitrary URLs are skipped',async()=>{
  for(const setup of [{signedOut:true},{leftHouse:true},{endpoint:'https://fixture.invalid/anywhere'}]){
    const f=pushFixture(setup);await f.run();assert.equal(f.calls.sent.length,0);
  }
});


const seniorSchedule=loadEdge('../../lib/data/senior-schedule.ts',{'../judge/time.ts':seniorTime}).exports;
function seniorFixture(options={}){
  let consent=Object.hasOwn(options,'consent')?options.consent:consentAt;
  const calls={queries:[],writes:[],rpc:[],consent:0,status:0,absence:0,hash:0,push:0,refresh:0,recompute:0};
  const db=queryDatabase(async operation=>{
    calls.queries.push(operation);
    if(operation.kind!=='select'){
      calls.writes.push(operation);
      if(options.onWrite){const override=await options.onWrite(operation);if(override!==undefined)return override;}
      const data=operation.table==='alerts'?[{id:'synthetic-alert',type:operation.payload.type,payload:null}]
        :operation.table==='senior_devices'&&operation.fields==='id'?(options.consumed?[]:[{id:'synthetic-device'}]):null;
      return {data,error:null};
    }
    if(operation.table==='households'&&operation.fields==='senior_consent_at'){
      calls.consent++;
      if(consent instanceof Error)return {data:null,error:consent};
      return {data:consent===undefined?null:{senior_consent_at:consent},error:null};
    }
    if(operation.table==='senior_devices')return {data:options.noDevice?[]:[{id:'synthetic-device',household_id:'synthetic-house',pairing_expires_at:options.expiry??'2099-01-01T00:00:00Z'}],error:null};
    if(operation.table==='households'){
      calls.status++;if(options.onStatus)return options.onStatus();
      return {data:{senior_name:'가상 어르신',senior_relation:'테스트 가족',last_cooker_at:'2026-11-12T00:00:00Z'},error:null};
    }
    if(operation.table==='absences'){
      calls.absence++;if(options.onAbsence)return options.onAbsence();
      return {data:[],error:null};
    }
    if(operation.table==='meal_profiles')return {data:options.profile??{meal_windows:[{slot:'lunch',start:'11:00',end:'14:00'}]},error:null};
    if(operation.table==='smart_plugs')return {data:null,error:null};
    throw Error(`Unexpected senior query: ${operation.table}`);
  });
  db.rpc=async(name,args)=>{calls.rpc.push({name,args:structuredClone(args)});return {data:options.duplicate?null:'synthetic-notice',error:null};};
  const edge=loadEdge('senior/index.ts',{
    '@/lib/judge/resolveMealSlots.ts':mealJudge,
    '@/lib/data/senior-schedule.ts':seniorSchedule,
    '@/lib/judge/time.ts':options.realCalendar?seniorTime:{kstDate:()=> '2026-11-13',addDays:(date,days)=>new Date(Date.parse(`${date}T00:00:00Z`)+days*86400000).toISOString().slice(0,10)},
    '@/_shared/core.ts':{db,must,json,cors:{},
      sha256:async()=>{calls.hash++;if(options.onHash)return options.onHash();return 'synthetic-token-hash';},
      refreshActivity:async()=>{calls.refresh++;if(options.onRefresh)await options.onRefresh();},
      recomputeDay:async()=>{calls.recompute++;},
    },
    '@/_shared/push.ts':{pushAlerts:async()=>{calls.push++;}},
  });
  return {calls,setConsent:value=>{consent=value;},request:(op='status',extra={})=>edge.request(new Request('https://fixture.invalid/senior',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op,code:'123456',token:'synthetic-device-token-not-a-real-session',...extra})}))};
}

for(const op of ['pair','status','eat_out','help','away','back'])test(`senior ${op} refuses absent consent before private reads, writes or push`,async()=>{
  const f=seniorFixture({consent:null}),response=await f.request(op);
  assert.equal(response.status,403);assert.equal((await response.json()).code,'senior_consent_required');
  assert.equal(f.calls.writes.length,0);assert.equal(f.calls.status,0);assert.equal(f.calls.absence,0);assert.equal(f.calls.push,0);assert.equal(f.calls.refresh,0);assert.equal(f.calls.recompute,0);
});

for(const op of ['pair','status'])test(`senior ${op} fails closed when consent cannot be read`,async()=>{
  const f=seniorFixture({consent:Error('synthetic private database detail')}),response=await f.request(op);
  assert.equal(response.status,500);assert.doesNotMatch(await response.text(),/synthetic private|token|seniorName/);assert.equal(f.calls.writes.length,0);assert.equal(f.calls.status,0);
});

for(const consent of [undefined,'invalid-date'])test(`senior pairing rejects missing or malformed consent: ${String(consent)}`,async()=>{
  const f=seniorFixture({consent}),response=await f.request('pair');assert.equal(response.status,403);assert.equal(f.calls.writes.length,0);
});

test('invalid or expired pairing codes and missing device sessions do not read private household details',async()=>{
  const invalid=seniorFixture();assert.equal((await invalid.request('pair',{code:'12'})).status,400);assert.equal(invalid.calls.queries.length,0);
  const expired=seniorFixture({expiry:'2000-01-01T00:00:00Z'});assert.equal((await expired.request('pair')).status,400);assert.equal(expired.calls.consent,0);
  const missing=seniorFixture({noDevice:true});assert.equal((await missing.request('status')).status,401);assert.equal(missing.calls.consent,0);assert.equal(missing.calls.writes.length,0);
});

test('consented pairing consumes only an unpaired unexpired code and returns the token once',async()=>{
  const f=seniorFixture(),response=await f.request('pair');const body=await response.json();assert.equal(response.status,200);assert.deepEqual(Object.keys(body),['token']);assert.ok(body.token.length>=32);
  assert.equal(f.calls.writes.length,1);const operation=f.calls.writes[0];
  assert.ok(operation.filters.some(([kind,key,value])=>kind==='eq'&&key==='pairing_code'&&value==='123456'));
  assert.ok(operation.filters.some(([kind,key,value])=>kind==='is'&&key==='paired_at'&&value===null));
  assert.ok(operation.filters.some(([kind,key])=>kind==='gt'&&key==='pairing_expires_at'));assert.equal(f.calls.consent,3);
  const consumed=seniorFixture({consumed:true}),again=await consumed.request('pair');assert.equal(again.status,400);assert.equal(Object.hasOwn(await again.json(),'token'),false);
});

test('consented status derives household from the device token and ignores a submitted household ID',async()=>{
  const f=seniorFixture(),response=await f.request('status',{householdId:'other-house'}),body=await response.json();
  assert.equal(response.status,200);assert.deepEqual(Object.keys(body).sort(),['absence','lastCookerAt','relation','seniorName']);assert.equal(body.seniorName,'가상 어르신');
  for(const query of f.calls.queries.filter(item=>item.table==='households'))assert.ok(query.filters.some(([kind,key,value])=>kind==='eq'&&key==='id'&&value==='synthetic-house'));
  assert.equal(f.calls.push,0);assert.equal(f.calls.recompute,0);
});

test('withdrawal while hashing a pairing token prevents the token write',async()=>{
  let release;const waiting=new Promise(resolve=>{release=resolve;});const f=seniorFixture({onHash:()=>waiting});
  const running=f.request('pair');await flush();f.setConsent(null);release('synthetic-hash');const response=await running;
  assert.equal(response.status,403);assert.equal(f.calls.writes.length,0);assert.equal(Object.hasOwn(await response.json(),'token'),false);
});

test('withdrawal during a pairing write prevents returning its token',async()=>{
  let release;const waiting=new Promise(resolve=>{release=resolve;});const f=seniorFixture({onWrite:()=>waiting});
  const running=f.request('pair');await flush();assert.equal(f.calls.writes.length,1);f.setConsent(null);release({data:[{id:'synthetic-device'}],error:null});const response=await running;
  assert.equal(response.status,403);assert.equal(Object.hasOwn(await response.json(),'token'),false);assert.equal(f.calls.writes.length,1);
});

test('withdrawal during status lookup discards private results before reading an absence',async()=>{
  let release;const waiting=new Promise(resolve=>{release=resolve;});const f=seniorFixture({onStatus:()=>waiting});
  const running=f.request('status');await flush();assert.equal(f.calls.status,1);f.setConsent(null);release({data:{senior_name:'보여주면 안 되는 이름',senior_relation:'비공개',last_cooker_at:null},error:null});
  const response=await running;assert.equal(response.status,403);assert.doesNotMatch(await response.text(),/보여주면|비공개|seniorName/);assert.equal(f.calls.absence,0);
});

test('consent read failure after waiting for an absence returns no private status',async()=>{
  let release;const waiting=new Promise(resolve=>{release=resolve;});const f=seniorFixture({onAbsence:()=>waiting});
  const running=f.request('status');await flush();assert.equal(f.calls.absence,1);f.setConsent(Error('synthetic outage'));release({data:[],error:null});
  const response=await running;assert.equal(response.status,500);assert.doesNotMatch(await response.text(),/가상 어르신|seniorName|lastCookerAt/);
});

test('withdrawal during a senior action stops subsequent alert creation, push and derived updates',async()=>{
  let release;const waiting=new Promise(resolve=>{release=resolve;});const f=seniorFixture({onWrite:operation=>operation.table==='senior_actions'?waiting:undefined});
  const running=f.request('help');await flush();assert.ok(f.calls.writes.some(operation=>operation.table==='senior_actions'));f.setConsent(null);release({data:null,error:null});const response=await running;
  assert.equal(response.status,403);assert.equal(f.calls.writes.filter(operation=>operation.table==='alerts').length,0);assert.equal(f.calls.push,0);assert.equal(f.calls.refresh,0);assert.equal(f.calls.recompute,0);
});

for(const op of ['eat_out','help','away','back'])test(`consented senior ${op} retains its existing action behavior`,async()=>{
  const f=seniorFixture(),response=await f.request(op,{days:2});assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});
  assert.ok(f.calls.writes.some(operation=>operation.table==='senior_actions'));assert.equal(f.calls.refresh,1);assert.equal(f.calls.recompute,1);assert.equal(f.calls.push,op==='back'?0:1);
  for(const operation of f.calls.writes.filter(item=>item.kind==='insert'))assert.equal(operation.payload.household_id,'synthetic-house');
});

test('withdrawal during activity refresh prevents recomputation and a successful action response',async()=>{
  let release;const waiting=new Promise(resolve=>{release=resolve;});const f=seniorFixture({onRefresh:()=>waiting});
  const running=f.request('back');await flush();assert.equal(f.calls.refresh,1);f.setConsent(null);release();const response=await running;
  assert.equal(response.status,403);assert.equal(f.calls.recompute,0);assert.equal(Object.hasOwn(await response.json(),'ok'),false);
});

test('only the paired device requesting schedule support receives its household meal windows',async()=>{
  const f=seniorFixture(),response=await f.request('status',{includeSchedule:true,householdId:'other-house'});
  const result=await response.json();
  assert.equal(response.status,200);assert.equal(result.scheduledActions,true);assert.equal(result.cookerObserved,false);assert.equal(result.lastCookerAt,null);
  assert.deepEqual(result.mealWindows,[{slot:'lunch',start:'11:00',end:'14:00'}]);
  const lookup=f.calls.queries.find(query=>query.table==='meal_profiles');
  assert.ok(lookup.filters.some(([kind,key,value])=>kind==='eq'&&key==='household_id'&&value==='synthetic-house'));
});

test('a selected prior food report changes only the named slot and preserves previous cooker totals',async()=>{
  const f=seniorFixture({realCalendar:true});
  const date=seniorTime.addDays(seniorTime.kstDate(new Date()),-1);
  const response=await f.request('selected_meal',{meal:{date,slot:'lunch'},householdId:'other-house'});
  assert.equal(response.status,200);assert.deepEqual((await response.json()).applied,{meal:{date,slot:'lunch'}});assert.deepEqual(f.calls.rpc,[{name:'record_selected_senior_meal',args:{
    h:'synthetic-house',selected_date:date,selected_slot:'lunch',selected_label:'첫 끼',
    recorded_at:seniorTime.kstDateTime(date,'12:30').toISOString(),
  }}]);assert.equal(f.calls.recompute,0);assert.equal(f.calls.push,1);
});

test('a paired senior can select yesterday’s fifth meal after today changes to two',async()=>{
  const yesterday = seniorTime.addDays(seniorTime.kstDate(new Date()), -1);
  const windows = mealTypes.MEAL_SLOT_NAMES.map((slot, index) => ({slot, start:(10+index)+':00', end:(11+index)+':00'}));
  const profile = {meal_windows:[windows[0], windows[2]], window_history:[{through:yesterday, windows}]};
  const f = seniorFixture({realCalendar:true,profile});
  const status = await (await f.request('status',{includeSchedule:true})).json();
  assert.equal(status.mealWindows.length,2);
  assert.equal(status.yesterdayMealWindows.length,5);
  const meal = {date:yesterday,slot:'fifth'};
  const response = await f.request('selected_meal',{meal});
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).applied,{meal});
  assert.equal(f.calls.rpc[0].args.selected_label,'다섯 끼');
  assert.equal(f.calls.push,1);
  assert.equal((await f.request('selected_meal',{meal:{...meal,date:seniorTime.kstDate(new Date())}})).status,400);
});

test('duplicate selected family meal acknowledgements do not send a second push',async()=>{
  const f=seniorFixture({realCalendar:true,duplicate:true});
  const date=seniorTime.addDays(seniorTime.kstDate(new Date()),-1);
  assert.equal((await f.request('selected_meal',{meal:{date,slot:'lunch'}})).status,200);
  assert.equal(f.calls.rpc.length,1);assert.equal(f.calls.push,0);
});

test('a senior cannot select a future, unknown or outdated meal or send an arbitrary absence date',async()=>{
  const f=seniorFixture({realCalendar:true}),today=seniorTime.kstDate(new Date());
  for(const meal of [{date:seniorTime.addDays(today,1),slot:'lunch'},{date:today,slot:'not-configured'},{date:seniorTime.addDays(today,-2),slot:'lunch'}]){
    assert.equal((await f.request('selected_meal',{meal})).status,400);
  }
  assert.equal((await f.request('planned_away',{startDate:seniorTime.addDays(today,2)})).status,400);
  assert.equal(f.calls.push,0);assert.equal(f.calls.rpc.length,0);
});

test('future absence uses the paired household and leaves current observations intact',async()=>{
  const f=seniorFixture({realCalendar:true}),start=seniorTime.addDays(seniorTime.kstDate(new Date()),1);
  assert.equal((await f.request('planned_away',{startDate:start,days:3,householdId:'other-house'})).status,200);
  assert.deepEqual(f.calls.rpc,[{name:'record_planned_senior_absence',args:{h:'synthetic-house',away_start:start,away_end:seniorTime.addDays(start,2)}}]);assert.equal(f.calls.recompute,0);assert.equal(f.calls.push,1);
});
