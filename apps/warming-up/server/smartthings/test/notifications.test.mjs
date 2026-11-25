import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomBytes, createHash } from 'node:crypto';
import { generateVAPIDKeys, generateRequestDetails } from 'web-push';
import { createNotifier, vapidKeys } from '../notifications.mjs';
import { ApiError, CONSENT, TEAM_ORIGIN } from '../security.mjs';
import { POWER_NOTICE_CONSENT } from '../power-notice.mjs';
import { createService } from '../service.mjs';

function memoryDb() {
  const rows = new Map();
  const doc = id => ({ id, get: async () => ({data: () => rows.get(id)}) });
  const devices = {
    doc,
    where: (key, cmp, value) => ({limit: n => ({get: async () => {
      assert.equal(cmp, '==');
      const docs = [...rows.entries()].filter(([, row]) => row[key] === value).slice(0, n)
        .map(([id]) => ({ref: doc(id)}));
      return { docs, size: docs.length };
    }})}),
  };
  let tail = Promise.resolve();
  return {rows, collection: () => devices, runTransaction(fn) {
    const result = tail.then(() => fn({
      get: ref => ref.get(), set: (ref, value) => rows.set(ref.id, value),
      update: (ref, value) => rows.set(ref.id, {...rows.get(ref.id), ...value}),
      delete: ref => rows.delete(ref.id),
    }));
    tail = result.catch(() => {});
    return result;
  }};
}

function fakeSubscription(endpoint = 'https://web.push.apple.com/fixture-device') {
  const key = createECDH('prime256v1'); key.generateKeys();
  return { endpoint, keys: {p256dh: key.getPublicKey('base64url'), auth: randomBytes(16).toString('base64url')} };
}

function fixture(send) {
  const db = memoryDb(), delivered = [], device = fakeSubscription();
  let clock = Date.parse('2026-11-24T14:59:00Z');
  const now = () => clock;
  const authTime = Math.floor(clock / 1000);
  const access = { user: true, consent: true };
  const connection = {uid: 'fixture', stage: 'connected', authTime, deviceIsVirtual: false,
    consentVersion: CONSENT, powerNotice: {version: POWER_NOTICE_CONSENT, lastObservedAt: clock - 100}};
  const store = { get: async () => connection, verifyConsent: async () => {
    if (!access.consent) throw new ApiError(403,'consent_required');
  }};
  const verifyAccount = async (uid, since) => {
    if (uid !== 'fixture' || !access.user || since !== authTime) throw new ApiError(401,'login_required');
  };
  const keys = generateVAPIDKeys();
  const config = {origin: TEAM_ORIGIN, key: randomBytes(32).toString('base64')};
  const notifier = createNotifier({db,store,keys,config,now,verifyAccount,send: async (sub, payload, opts) => {
    // Exercise the real encryption/VAPID implementation, without a network request.
    const request = generateRequestDetails(sub, payload, opts);
    assert.equal(request.endpoint, sub.endpoint);
    assert.equal(request.headers['Content-Encoding'], 'aes128gcm');
    assert.equal(request.body.includes(Buffer.from('cooker_signal')), false);
    if (send) await send();
    delivered.push({sub,payload:JSON.parse(payload),ttl:opts.TTL});
  }});
  const run = (op, uid = 'fixture', sub = device) =>
    notifier.handle(uid,authTime,{op,endpoint:sub.endpoint,subscription:sub});
  return {db, device, access, delivered, config, keys, connection, store, verifyAccount, notifier, run,
    tick(ms) { clock += ms; }, observed() { connection.powerNotice.lastObservedAt = now(); }, now };
}

test('trusted device enrollment encrypts the full endpoint and keys; another owner cannot inspect, replace, test or remove it',async()=>{
  const f = fixture();
  assert.deepEqual(vapidKeys({WEB_PUSH_PRIVATE_KEY:f.keys.privateKey}), f.keys);
  assert.equal(vapidKeys({}), null);
  await f.run('register');
  const stored = JSON.stringify([...f.db.rows.values()]);
  for (const str of [f.device.endpoint, f.device.keys.auth, f.device.keys.p256dh, f.keys.privateKey]) assert.ok(!stored.includes(str));
  assert.deepEqual(await f.run('check','second'), {registered:false});
  await assert.rejects(() => f.run('register','second'), {code:'different_device_owner'});
  await assert.rejects(() => f.run('test','second'), {code:'subscription_required'});
  await f.run('remove','second');
  assert.deepEqual(await f.run('check'), {registered:true});
  await f.run('remove');
  assert.deepEqual(await f.run('check'), {registered:false});
  assert.equal(f.delivered.length,0);
});

test('a fresh verified cooker event emits one private KST-day notification after registration even on concurrent redelivery',async()=>{
  const f = fixture();
  await f.run('register'); await f.notifier.deliverCooker('fixture');
  assert.equal(f.delivered.length,0);
  f.tick(125000); f.observed();
  await Promise.all([f.notifier.deliverCooker('fixture'), f.notifier.deliverCooker('fixture')]);
  await f.notifier.deliverCooker('fixture');
  assert.equal(f.delivered.length,1);
  const at = new Date(f.now()).toISOString();
  const {scope, ticket, expiresAt, ...content} = f.delivered[0].payload;
  assert.deepEqual(content,{kind:'cooker_signal',at,tag:'cooker-'+at,date:'2026-11-25'});
  assert.equal(expiresAt, f.now() + 3_600_000);
  assert.match(ticket,/^n1\.[\w-]{70,120}$/);
  const [nonce, checksum] = scope.split('.');
  assert.equal(checksum, createHash('sha256').update('bapmunna-notice-v1/'+nonce+'/fixture').digest('hex'));
  f.tick(3600001); await f.run('register'); await f.notifier.deliverCooker('fixture');
  assert.equal(f.delivered.length,1);
});

test('revoked permission, stale events, virtual devices and disconnected installations never send',async()=>{
  const f = fixture(); await f.run('register'); f.tick(2000); f.observed();
  f.access.consent=false;
  await assert.rejects(()=>f.notifier.deliverCooker('fixture'),{code:'consent_required'});
  await assert.rejects(()=>f.run('test'),{code:'consent_required'});
  f.access.consent=true; f.access.user=false;
  await assert.rejects(()=>f.notifier.deliverCooker('fixture'),{code:'login_required'});
  f.access.user=true; f.connection.stage='disconnected'; await f.notifier.deliverCooker('fixture');
  f.connection.stage='connected'; f.connection.deviceIsVirtual=true; await f.notifier.deliverCooker('fixture');
  f.connection.deviceIsVirtual=false; f.tick(3600001); await f.notifier.deliverCooker('fixture');
  assert.equal(f.delivered.length,0);
});

test('a button can deliver a rate-limited remote self-test only to this one enrolled browser',async()=>{
  const f = fixture();
  await assert.rejects(()=>f.run('test'),{code:'subscription_required'});
  await f.run('register');
  const second = fakeSubscription('https://fcm.googleapis.com/fcm/send/fixture-other');
  await f.run('register','fixture',second);
  assert.deepEqual(await f.run('test'), {accepted:true});
  await assert.rejects(()=>f.run('test'),{code:'test_too_soon'});
  assert.equal(f.delivered.length,1);
  assert.equal(f.delivered[0].sub.endpoint, f.device.endpoint);
  assert.equal(f.delivered[0].payload.kind, 'delivery_test');
});

test('temporary failure is retryable; a retired endpoint is deleted without disturbing the account',async()=>{
  let error = 503;
  const f = fixture(async()=>{if(error) throw Object.assign(Error(),{statusCode:error});});
  await f.run('register'); f.tick(1000); f.observed(); await f.notifier.deliverCooker('fixture');
  assert.equal(f.delivered.length,0);
  error=0; await f.notifier.deliverCooker('fixture'); assert.equal(f.delivered.length,1);
  error=410; await assert.rejects(()=>f.run('test'),{code:'subscription_expired'});
  assert.deepEqual(await f.run('check'),{registered:false});
});

test('foreign URLs, corrupt keys and excess endpoints are rejected before enrollment',async()=>{
  const f = fixture();
  for (const url of ['https://example.invalid/fake','https://web.push.apple.com.evil.invalid/x','https://web.push.apple.com:444/x','http://web.push.apple.com/x']) {
    await assert.rejects(()=>f.run('register','fixture',fakeSubscription(url)),{code:'invalid_subscription'});
  }
  await assert.rejects(()=>f.run('register','fixture',{...f.device,keys:{auth:'bad',p256dh:'bad'}}),{code:'invalid_subscription'});
  for (let i=0;i<5;i++) await f.run('register','fixture',fakeSubscription('https://web.push.apple.com/device-'+i));
  await assert.rejects(()=>f.run('register'),{code:'device_limit'});
});

test('a notifications-only runtime accepts same-site verified owners without enabling Samsung OAuth', async()=>{
  const f=fixture();
  const config={...f.config, projectId:'warming-up-bapmunna', appUrl:TEAM_ORIGIN+'/connect/'};
  const service=createService({ config, store:f.store, notifier:f.notifier, verifyAccount:f.verifyAccount,
    verifyUser:async token=>{ if(token!=='fixture-token') throw Error();return {uid:'fixture',auth_time:Math.floor(f.now()/1000),email_verified:true}; } });
  const configData=await (await service(new Request(TEAM_ORIGIN+'/api/smartthings/config'))).json();
  assert.equal(configData.enabled,false);
  assert.equal(configData.webPush.publicKey,f.keys.publicKey);
  const post=(origin,token)=>service(new Request(TEAM_ORIGIN+'/api/smartthings/notification-subscription',{
    method:'POST',headers:{origin,Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({op:'register',uid:'second',subscription:f.device})}));
  const preflight=(origin)=>service(new Request(TEAM_ORIGIN+'/api/smartthings/notification-subscription',{
    method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Headers':'authorization,content-type'}}));
  assert.equal((await preflight(TEAM_ORIGIN)).headers.get('access-control-allow-origin'),TEAM_ORIGIN);
  assert.equal((await preflight('https://fixture.invalid')).status,403);
  assert.equal((await post(TEAM_ORIGIN,'other')).status,401);
  assert.equal((await post('https://example.invalid','fixture-token')).status,403);
  assert.equal((await post(TEAM_ORIGIN,'fixture-token')).status,200);
  assert.deepEqual(await f.run('check','second'),{registered:false});
});

test('uses an actual consented meal target only for the owner and the observed KST day', async()=>{
  const f=fixture(); await f.run('register');
  let target={date:'2026-11-25',slot:'fifth'};
  f.store.getCookerNoticeTarget=async(uid,at)=>{assert.equal(uid,'fixture');assert.equal(at,f.now());return target;};
  f.tick(125000); f.observed(); await f.notifier.deliverCooker('fixture');
  assert.equal(f.delivered[0].payload.slot,'fifth');
  for (target of [{date:'2026-11-24',slot:'lunch'},{date:'2026-11-25',slot:'unsafe'},null]) {
    f.tick(1200000); f.observed(); await f.notifier.deliverCooker('fixture');
    assert.equal(f.delivered.at(-1).payload.slot,undefined);
  }
});

test('the original encrypted receipt opens the corrected prior KST day at tap; wrong owner, forgery, revocation and expiration fail closed', async()=>{
  const f=fixture(); await f.run('register');
  f.tick(70_000); f.observed(); // A 00:00:10 high arrived before the preceding 23:59:15 high.
  const at = f.now(), authTime=f.connection.authTime;
  const first={date:'2026-11-25',slot:'breakfast'};
  let corrected={date:'2026-11-24',slot:'dinner'};
  f.store.getCookerNoticeTarget=async()=>first;
  let reads=0;
  f.store.resolveCookerNoticeTarget=async(uid,observed,{recorded})=>{
    reads++;assert.equal(uid,'fixture');assert.equal(observed,at);
    return recorded ? corrected : {date:'2026-11-24'};
  };
  const resolve=(ticket, uid='fixture')=>f.notifier.handle(uid,authTime,{op:'resolve',ticket});
  await f.notifier.deliverCooker('fixture');
  const {ticket,slot,date}=f.delivered[0].payload;
  assert.equal(date,first.date);assert.equal(slot,'breakfast');
  assert.deepEqual(await resolve(ticket,'other'),{target:null});
  const forged=ticket.slice(0,10)+(ticket[10]==='A'?'B':'A')+ticket.slice(11);
  assert.deepEqual(await resolve(forged),{target:null});assert.equal(reads,0);
  assert.deepEqual(await resolve(ticket),{target:corrected});
  corrected=null;assert.deepEqual(await resolve(ticket),{target:null});
  f.store.getCookerNoticeTarget=async()=>null;
  const local=await f.notifier.handle('fixture',authTime,{op:'ticket',at});
  assert.deepEqual(await resolve(local.ticket),{target:{date:'2026-11-24'}});
  assert.deepEqual(await f.notifier.handle('fixture',authTime,{op:'ticket',at:at-1}),{ticket:null});
  f.tick(24*3_600_000);const previous=reads;
  assert.deepEqual(await resolve(ticket),{target:null});assert.equal(reads,previous);
});

test('per-device KST quiet hours include overnight starts, exclude ends, cap service TTL and leave requested self-tests available',async()=>{
  const f=fixture(); await f.run('register');
  const change=(hours,uid='fixture')=>f.notifier.handle(uid,0,{op:'quiet',endpoint:f.device.endpoint,quietHours:hours});
  await assert.rejects(()=>change({start:'00:00',end:'00:00'}),{code:'invalid_quiet_hours'});
  await assert.rejects(()=>change({start:'21:00',end:'08:00'},'second'),{code:'subscription_required'});
  await change({start:'00:00',end:'00:10'});
  f.tick(1000);f.observed();await f.notifier.deliverCooker('fixture');
  assert.equal(f.delivered[0].ttl,59);
  f.tick(59_000);f.observed();await f.notifier.deliverCooker('fixture');assert.equal(f.delivered.length,1);
  await f.run('test');assert.equal(f.delivered.length,2);
  f.tick(600000);await f.notifier.deliverCooker('fixture');assert.equal(f.delivered.length,2);
  f.observed();await f.notifier.deliverCooker('fixture');assert.equal(f.delivered.length,3);
  await change({start:'22:00',end:'07:30'});f.tick(1000);f.observed();await f.notifier.deliverCooker('fixture');assert.equal(f.delivered.length,3);
  await change(null);await f.notifier.deliverCooker('fixture');assert.equal(f.delivered.length,3);
  f.tick(1000); f.observed(); await f.notifier.deliverCooker('fixture');assert.equal(f.delivered.length,4);
});
