import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';
import test from 'node:test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { MEAL_RECORD_CONSENT, POWER_NOTICE_CONSENT } from '../power-notice.mjs';
import { ACCOUNT_CONSENT, CONSENT, hash, readConfig, vault, webhookVerifier } from '../security.mjs';
import { createService } from '../service.mjs';
import { firestoreStore } from '../store.mjs';

const meal = (slot, start, end) => ({ slot, start, end });
const schedules = [
  [meal('breakfast','07:00','09:00'), meal('dinner','17:00','19:00')],
  [meal('breakfast','06:00','08:00'), meal('lunch','10:00','12:00'),
    meal('dinner','13:00','15:00'), meal('fourth','18:00','20:00')],
  [meal('breakfast','06:00','08:00'), meal('lunch','09:00','10:00'), meal('dinner','11:00','13:00'),
    meal('fourth','14:00','16:00'), meal('fifth','17:30','19:30')],
];

test('pilot: signed cooker events remain assigned to each of three households', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async t => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(localhost|127\.0\.0\.1):\d+$/);
  const run = randomUUID();
  const app = initializeApp({ projectId: 'demo-bapmunna-three-houses' }, 'pilot-' + run);
  t.after(() => deleteApp(app));
  const db = getFirestore(app);
  const households = schedules.map((windows, i) => ({
    uid: 'pilot-' + i + '-' + run, deviceId: 'plug-' + i + '-' + run,
    installId: 'install-' + i + '-' + run, windows,
  }));
  const [a, b, c] = households;
  const firstCook = Date.parse('2026-11-26T18:00:00+09:00');
  const minute = 60_000;
  let now = firstCook - minute;
  const authTime = Math.floor((now - minute) / 1000);
  const store = firestoreStore(db, () => now);
  const config = readConfig({
    SMARTTHINGS_CONNECTION_ENABLED: 'true', SMARTTHINGS_APP_ID: 'synthetic',
    SMARTTHINGS_CLIENT_ID: 'synthetic', SMARTTHINGS_CLIENT_SECRET: randomUUID(),
    SMARTTHINGS_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  });
  const encryption = vault(config.key);
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const verifyWebhook = webhookVerifier({
    now: () => now,
    fetcher: async () => new Response(publicKey.export({ type:'spki', format:'pem' })),
  });
  // Synthetic principals and Samsung signing key. The production service handles
  // these Requests in memory and all persistent reads/writes go to the emulator.
  const handle = createService({ config, store, verifyWebhook, now: () => now,
    verifyUser: async uid => {
      assert.ok(households.some(h => h.uid === uid));
      return { uid, email_verified: true, auth_time: authTime };
    },
    verifyAccount: async (uid, at) => {
      assert.ok(households.some(h => h.uid === uid));
      assert.equal(at, authTime);
    },
    verifyConsent: store.verifyConsent,
  });
  const api = config.origin + '/api/smartthings';
  function request(owner, path, body) {
    return handle(new Request(api + path, {
      method: body ? 'POST' : 'GET',
      headers: { authorization: 'Bearer ' + owner.uid, origin: config.origin, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }));
  }
  function consent(owner, enabled, deviceId = owner.deviceId) {
    return request(owner, '/meal-records', { deviceId, enabled, consentVersion: MEAL_RECORD_CONSENT });
  }
  async function status(owner) {
    const response = await request(owner, '/status');
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.device.id, owner.deviceId);
    return body;
  }
  async function send(installation, deviceId, id, watts, observedAt = now) {
    const raw = JSON.stringify({messageType:'EVENT', eventData:{
      installedApp: {installedAppId:installation.installId}, events:[{
        eventType:'DEVICE_EVENT', eventTime:new Date(observedAt).toISOString(),
        deviceEvent:{eventId:id, deviceId, componentId:'main', capability:'powerMeter', attribute:'power', value:watts, unit:'W'},
      }],
    }});
    const digest = 'SHA-256=' + createHash('sha256').update(raw).digest('base64');
    const date = new Date(now).toUTCString();
    const signed = '(request-target): post /api/smartthings/events\ndigest: ' + digest + '\ndate: ' + date;
    const signature = sign('RSA-SHA256', Buffer.from(signed), privateKey).toString('base64');
    const authorization = 'Signature keyId="/synthetic/pilot",algorithm="rsa-sha256",headers="(request-target) digest date",signature="' + signature + '"';
    const response = await handle(new Request(api + '/events', {method:'POST', headers:{authorization, digest, date}, body:raw}));
    assert.equal(response.status, 200);
  }
  function expected(owner, slot, cook) {
    return {days:[{date:'2026-11-26', windows:owner.windows, confirmed:[slot], cook}]};
  }

  const seed = db.batch();
  for (const h of households) {
    const account = db.collection('bapmunnaAccounts').doc(h.uid);
    seed.set(account, {ownerUid:h.uid, consentVersion:ACCOUNT_CONSENT});
    seed.set(account.collection('preferences').doc('settings'), {
      ownerUid:h.uid, preparationAcknowledged:true, updatedAt:new Date(now-minute), windows:h.windows,
    });
    seed.set(db.collection('bapmunnaSmartThingsInstallations').doc(hash(h.installId)), {uid:h.uid, installId:h.installId});
    seed.set(db.collection('bapmunnaSmartThingsConnections').doc(hash(h.uid)), {
      uid:h.uid, authTime, installId:h.installId, deviceId:h.deviceId, deviceIsVirtual:false, stage:'connected', consentVersion:CONSENT,
      tokens:encryption.seal({access:randomUUID(), refresh:randomUUID(), expiresAt:now+86_400_000}, h.uid + ':' + h.installId),
      powerNotice:{enabledAt:now-minute, version:POWER_NOTICE_CONSENT, component:'main', lastObservedAt:null},
    });
  }
  await seed.commit();

  await t.test('enrolling the first, second and third household grants each one separately', async () => {
    for (const [index, h] of households.entries()) {
      assert.equal((await consent(h, true)).status, 200);
      const views = await Promise.all(households.map(status));
      assert.deepEqual(views.map(v => v.mealRecords), households.map((_, i) => i <= index ? {days:[]} : undefined));
    }
  });
  await t.test('a different selected plug, its power event and its consent cannot be assigned to this home', async () => {
    const change = await request(a, '/device', {deviceId:b.deviceId});
    assert.equal(change.status, 409);
    assert.equal((await change.json()).error, 'disconnect_first');
    const wrongConsent = await consent(b, false, c.deviceId);
    assert.equal(wrongConsent.status, 409);
    assert.equal((await wrongConsent.json()).error, 'choose_device');
    now = firstCook;
    await Promise.all([send(a,b.deviceId,'shared-event',900), send(b,c.deviceId,'shared-event',900), send(c,a.deviceId,'shared-event',900)]);
    for (const view of await Promise.all(households.map(status))) {
      assert.deepEqual(view.mealRecords, {days:[]});
      assert.equal(view.powerNotice.lastObservedAt, null);
    }
  });
  await t.test('concurrent 700 W starts with the same event ID are counted once in slots two, four and five', async () => {
    now = firstCook;
    await Promise.all(households.flatMap(h => [send(h,h.deviceId,'shared-event',700),send(h,h.deviceId,'shared-event',700)]));
    const views = await Promise.all(households.map(status));
    assert.deepEqual(views.map(v => v.mealRecords), [expected(a,'dinner',1),expected(b,'fourth',1),expected(c,'fifth',1)]);
    assert.deepEqual(views.map(v => v.powerNotice.lastObservedAt), [firstCook,firstCook,firstCook]);
  });
  await t.test('one withdrawal racing a fresh reading clears only that home and a later replay cannot restore it', async () => {
    now = firstCook + 20 * minute;
    const [off] = await Promise.all([consent(b,false), send(b,b.deviceId,'second-event',800),
      send(a,a.deviceId,'second-event',820), send(c,c.deviceId,'second-event',699)]);
    assert.equal(off.status, 200);
    const secondAt = now;
    const afterWithdrawal = await Promise.all(households.map(status));
    assert.deepEqual(afterWithdrawal.map(v => v.mealRecords), [expected(a,'dinner',2),undefined,expected(c,'fifth',1)]);
    assert.equal(afterWithdrawal[2].powerNotice.lastObservedAt, firstCook);
    now += minute;
    await Promise.all([send(b,b.deviceId,'second-event',800,secondAt),send(a,a.deviceId,'second-event',820,secondAt),
      send(b,b.deviceId,'another-report',830), send(c,c.deviceId,'third-event',790)]);
    const views = await Promise.all(households.map(status));
    assert.deepEqual(views.map(v => v.mealRecords), [expected(a,'dinner',2),undefined,expected(c,'fifth',2)]);
    assert.equal(views[1].powerNotice.enabled, true);
    assert.equal((await store.get(b.uid)).powerNotice.mealRecords, undefined);
  });
});
