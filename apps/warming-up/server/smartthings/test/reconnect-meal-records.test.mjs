import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createService } from '../service.mjs';
import { ACCOUNT_CONSENT, ApiError, CONSENT, hash, readConfig } from '../security.mjs';
import { MEAL_RECORD_CONSENT, POWER_NOTICE_CONSENT, POWER_CHECK_MS } from '../power-notice.mjs';
import { firestoreStore } from '../store.mjs';

const emulator = {skip:!process.env.FIRESTORE_EMULATOR_HOST};
const min = 60_000;
const day = 24*60*min;
function pause() {
  let enter, resume;
  const reached = new Promise(resolve => { enter = resolve; });
  const release = new Promise(resolve => { resume = resolve; });
  return {reached, resume, hold:async () => { enter(); await release; }};
}

async function fixture(t) {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST,/^(127\.0\.0\.1|localhost):\d+$/);
  const uid = 'house-' + randomUUID(), installId = 'install-' + randomUUID(), deviceId = 'cooker-' + randomUUID();
  const app = initializeApp({projectId:'demo-warming-up-meal-reauth'}, uid);
  t.after(() => deleteApp(app));
  const db = getFirestore(app);
  const first = Date.parse('2026-11-25T23:50:00+09:00');
  const grantAt = first - 34*day;
  const clock = {time:grantAt}, store = firestoreStore(db, () => clock.time);
  const windows = [{slot:'breakfast',start:'00:00',end:'06:00'},{slot:'dinner',start:'18:00',end:'23:59'}];
  const owner = db.doc('bapmunnaAccounts/'+uid);
  const seed = db.batch();
  seed.set(owner,{ownerUid:uid,consentVersion:ACCOUNT_CONSENT});
  seed.set(owner.collection('preferences').doc('settings'),{ownerUid:uid,preparationAcknowledged:true,updatedAt:new Date(grantAt-min),windows});
  seed.set(db.collection('bapmunnaSmartThingsInstallations').doc(hash(installId)),{uid,installId});
  seed.set(db.collection('bapmunnaSmartThingsConnections').doc(hash(uid)),{
    uid,installId,deviceId,deviceLabel:'Test cooker',deviceIsVirtual:false,stage:'connected',consentVersion:CONSENT,
    powerNotice:{version:POWER_NOTICE_CONSENT,enabledAt:grantAt-min,component:'main',lastObservedAt:null},
    powerChecks:{enabledAt:first-min,nextAt:first},
  });
  await seed.commit();
  const grant = enabled => store.setMealRecordConsent(uid,{installId,deviceId,enabled},clock.time);
  const event = (time,id=randomUUID()) => store.receive(uid,installId,{kind:'power',high:true,component:'main',deviceId,time,id});
  await grant(true);
  await event(grantAt);
  clock.time += day;
  await event(clock.time);
  clock.time = first;
  await event(first);
  await store.getCookerNoticeTarget(uid,first);
  clock.time += 20*min;
  const oldClaim = await store.claimPowerCheck(uid,deviceId,installId);
  await store.patch(uid,{stage:'reconnect_required',refreshDueAt:null},{installId});
  const config = readConfig({SMARTTHINGS_CONNECTION_ENABLED:'true',SMARTTHINGS_APP_ID:'synthetic',
    SMARTTHINGS_CLIENT_ID:'synthetic',SMARTTHINGS_CLIENT_SECRET:randomUUID(),SMARTTHINGS_ENCRYPTION_KEY:randomBytes(32).toString('base64')});
  const samsung = {type:'MATTER',component:'main',installId};
  const handle = createService({
    config,store,now:()=>clock.time,verifyUser:async token=>({uid:token,email_verified:true,auth_time:1}),
    verifyConsent:store.verifyConsent,verifyAccount:async id=>assert.equal(id,uid),
    smartthings:{
      exchange:async () => {
        if (samsung.onExchange) await samsung.onExchange();
        return {access_token:randomUUID(),refresh_token:randomUUID(),expires_in:3600,installed_app_id:samsung.installId};
      },
      installation:async (_token,id) => ({installedAppId:id,appId:config.appId}),
      device:async () => ({deviceId,type:samsung.type,components:[{id:samsung.component,capabilities:[{id:'powerMeter'}]}]}),
      status:async () => ({components:{main:{powerMeter:{power:{value:0,unit:'W',timestamp:new Date(clock.time).toISOString()}}}}}),
      subscribe:async () => { if (samsung.onSubscribe) await samsung.onSubscribe(); },
    },
  });
  function request(path, body, extra={}) {
    return handle(new Request(config.origin+'/api/smartthings'+path,{
      method:body ? 'POST':'GET',
      headers:{authorization:'Bearer '+uid,origin:config.origin,'content-type':'application/json',...extra},
      body:body ? JSON.stringify(body) : undefined,
    }));
  }
  async function reauthorize() {
    const start = await request('/start',{consentVersion:CONSENT});
    assert.equal(start.status,200);
    const state = new URL((await start.json()).url).searchParams.get('state');
    const result = await request('/callback?state='+state+'&code=synthetic',null,{cookie:start.headers.get('set-cookie').split(';')[0]});
    assert.equal(result.status,303);
    return new URL(result.headers.get('location')).searchParams.get('smartthings');
  }
  return {uid,installId,deviceId,first,grantAt,windows,clock,store,db,oldClaim,samsung,request,reauthorize,event};
}

test('reauthorization retains the original consent and days until the same real meter and subscription are verified',emulator,async t => {
  const f = await fixture(t);
  const {uid,installId,deviceId,first,clock,store,samsung} = f;
  const row = {date:'2026-11-25',windows:f.windows,confirmed:['dinner'],cook:1};
  const oldestRetained = {...row,date:'2026-10-23'};
  const select = () => f.request('/device',{deviceId});
  assert.equal(await f.reauthorize(),'connected');
  const pending = await (await f.request('/status')).json();
  assert.equal(pending.stage,'subscribing');
  assert.equal(pending.powerNotice,undefined);
  assert.equal(pending.mealRecords,undefined);
  assert.equal((await store.get(uid)).powerNotice.mealRecords.enabledAt,f.grantAt);
  assert.equal((await store.get(uid)).powerChecks.nextAt,undefined);
  assert.equal(await store.claimPowerCheck(uid,deviceId,installId),null);
  assert.equal(await store.getCookerNoticeTarget(uid,first),null);
  assert.equal(await f.event(clock.time-min),false);
  assert.equal((await f.request('/device',{deviceId:'another-plug'})).status,409);
  for (const [type,component,reason] of [['VIRTUAL','main','test_device'],['UNKNOWN','main','unclassified_device'],['MATTER','outlet-2','ambiguous_meter']]) {
    Object.assign(samsung,{type,component});
    const rejected = await select();
    assert.equal(rejected.status,422);
    assert.equal((await rejected.json()).error,reason);
  }
  Object.assign(samsung,{type:'MATTER',component:'main',onSubscribe:async () => { throw new ApiError(502,'permission_required'); }});
  assert.equal((await select()).status,502);
  assert.equal(await f.event(clock.time),false);
  assert.equal((await (await f.request('/status')).json()).mealRecords,undefined);
  samsung.onSubscribe = undefined;
  const connected = await select();
  assert.equal(connected.status,200);
  const result = await connected.json();
  assert.equal(result.stage,'connected');
  assert.deepEqual(result.mealRecords.days,[oldestRetained,row]);
  assert.deepEqual(result.powerNotice,{enabled:true,lastObservedAt:null});
  const live = await store.get(uid);
  assert.equal(live.powerNotice.mealRecords.enabledAt,f.grantAt);
  assert.equal(live.powerNotice.mealRecords.days['2026-10-22'],undefined);
  assert.equal(live.powerChecks.enabledAt,first-min);
  assert.equal(live.powerChecks.nextAt,clock.time+POWER_CHECK_MS);
  assert.equal(await store.getCookerNoticeTarget(uid,first),null);
  assert.deepEqual(await store.resolveCookerNoticeTarget(uid,first,{recorded:true}),{date:'2026-11-25',slot:'dinner'});
  assert.equal(f.oldClaim.nextAt,live.powerChecks.nextAt);
  assert.equal(await store.finishPowerCheck(uid,f.oldClaim,{kind:'power',component:'main',high:true,time:clock.time},clock.time),false);
  assert.equal(await f.event(clock.time-min),false);
  clock.time += 11*min;
  assert.equal(await f.event(clock.time),true);
  assert.deepEqual((await (await f.request('/status')).json()).mealRecords.days,[oldestRetained,row,
    {date:'2026-11-26',windows:f.windows,confirmed:['breakfast'],cook:1}]);
  samsung.installId = 'different-installation';
  await store.patch(uid,{stage:'reconnect_required'},{installId});
  assert.equal(await f.reauthorize(),'disconnect_first');
  assert.equal((await store.get(uid)).installId,installId);
  assert.equal(await store.installation(samsung.installId),null);
});

for (const point of ['onExchange','onSubscribe']) {
  test('a withdrawal during '+point+' wins over stale OAuth reads',emulator,async t => {
    const f = await fixture(t);
    const waiting = pause();
    f.samsung[point] = waiting.hold;
    if (point === 'onSubscribe') assert.equal(await f.reauthorize(),'connected');
    const ongoing = point === 'onExchange' ? f.reauthorize() : f.request('/device',{deviceId:f.deviceId});
    await waiting.reached;
    try {
      const withdrawn = await f.request('/meal-records',{deviceId:f.deviceId,enabled:false});
      assert.equal(withdrawn.status,200);
    } finally { waiting.resume(); }
    const finished = await ongoing;
    if (point === 'onExchange') {
      assert.equal(finished,'connected');
      assert.equal((await f.request('/device',{deviceId:f.deviceId})).status,200);
    } else assert.equal(finished.status,200);
    const current = await f.store.get(f.uid);
    assert.equal(current.stage,'connected');
    assert.equal(current.powerNotice.mealRecords,undefined);
    assert.equal(current.powerNotice.version,POWER_NOTICE_CONSENT);
    assert.ok(current.powerChecks);
    f.clock.time += 20*min;
    await f.event(f.clock.time);
    assert.equal((await (await f.request('/status')).json()).mealRecords,undefined);
    assert.equal((await f.request('/meal-records',{deviceId:f.deviceId,enabled:true,consentVersion:MEAL_RECORD_CONSENT})).status,200);
    assert.deepEqual((await (await f.request('/status')).json()).mealRecords,{days:[]});
  });
}

test('whole-notice opt-out, even after token exchange, also keeps polling and all meal data off',emulator,async t => {
  const f = await fixture(t);
  assert.equal(await f.reauthorize(),'connected');
  assert.equal((await f.request('/power-notice',{deviceId:f.deviceId,enabled:false})).status,200);
  assert.equal((await f.request('/device',{deviceId:f.deviceId})).status,200);
  f.clock.time += 15*min;
  await f.event(f.clock.time);
  const status = await (await f.request('/status')).json();
  assert.equal(status.stage,'connected');
  for (const field of ['powerNotice','powerChecks','mealRecords']) assert.equal(status[field],undefined);
  assert.equal(await f.store.resolveCookerNoticeTarget(f.uid,f.first,{recorded:true}),null);
});

test('separate Firebase owners cannot inherit an installation, and stale permissions cannot restore its past meals',emulator,async t => {
  const f = await fixture(t);
  const other = 'another-'+randomUUID(), state = randomUUID(), nonceHash = hash(randomUUID());
  const account = f.db.collection('bapmunnaAccounts').doc(other);
  await account.set({ownerUid:other,consentVersion:ACCOUNT_CONSENT});
  await account.collection('preferences').doc('settings').set({ownerUid:other,preparationAcknowledged:true});
  await f.store.saveState(state,{uid:other,consentVersion:CONSENT,nonceHash,until:f.clock.time+min});
  await f.store.consumeState(state,nonceHash);
  await assert.rejects(f.store.saveConnection(other,{uid:other,installId:f.installId,deviceId:f.deviceId,
    stage:'subscribing',consentVersion:CONSENT,deviceIsVirtual:false},{state,nonceHash}),{code:'installation_in_use'});
  assert.equal(await f.store.get(other),null);
  assert.ok((await f.store.get(f.uid)).powerNotice.mealRecords.days['2026-11-25']);
  await f.store.patch(f.uid,{consentVersion:'obsolete'},{installId:f.installId});
  assert.equal(await f.reauthorize(),'connected');
  assert.equal((await f.request('/device',{deviceId:f.deviceId})).status,200);
  const status = await (await f.request('/status')).json();
  assert.equal(status.mealRecords,undefined);
  assert.equal(status.powerNotice,undefined);
  assert.equal(status.powerChecks,undefined);
});
