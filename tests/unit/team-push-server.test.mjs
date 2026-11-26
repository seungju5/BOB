import { randomBytes } from 'node:crypto';
import { expect, test, vi } from 'vitest';
import { IdentityPoolClient } from 'google-auth-library';
import { generateVAPIDKeys } from 'web-push';
import { createNotificationHandler } from '../../lib/firebase/team-push-server.mjs';
import { ACCOUNT_CONSENT, hash, TEAM_ORIGIN, TEAM_PROJECT_ID } from '../../apps/warming-up/server/smartthings/security.mjs';

const site = 'https://bob-tmdwn1.vercel.app';
const config = '/api/smartthings/config';
const subscription = '/api/smartthings/notification-subscription';
const provider = 'projects/446376297496/locations/global/workloadIdentityPools/test-pool/providers/test-provider';
const account = 'test-runtime@warming-up-bapmunna.iam.gserviceaccount.com';
const keys = generateVAPIDKeys();
const env = { VERCEL_ENV: 'production', FIREBASE_PUSH_WIF_PROVIDER: provider,
  FIREBASE_PUSH_SERVICE_ACCOUNT: account, FIREBASE_PUSH_VAPID_PRIVATE_KEY: keys.privateKey,
  FIREBASE_PUSH_ENCRYPTION_KEY: randomBytes(32).toString('base64') };
const check = { op: 'check', endpoint: 'https://web.push.apple.com/test-device' };

function request(path, { host = site, origin = TEAM_ORIGIN, method = 'GET', token, oidc = true, body = check } = {}) {
  const headers = { Origin: origin, ...(oidc && { 'x-vercel-oidc-token': 'fixture-workload' }) };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (method === 'POST') headers['Content-Type'] = 'application/json';
  return new Request(host + path, { method, headers, ...(method === 'POST' && { body: JSON.stringify(body) }) });
}

function firebaseFixture() {
  const records = new Map();
  for (const uid of ['owner', 'other']) {
    records.set('bapmunnaAccounts/' + uid, { ownerUid: uid, consentVersion: ACCOUNT_CONSENT });
    records.set(`bapmunnaAccounts/${uid}/preferences/settings`, { ownerUid: uid, preparationAcknowledged: true });
  }
  records.set('bapmunnaNotificationDevices/' + hash(check.endpoint), { uid: 'owner' });
  const verifyIdToken = vi.fn(async (token, revoked) => {
    if (!revoked || !['owner', 'other', 'unverified'].includes(token)) throw Error('Invalid fixture session');
    return { uid: token, email_verified: token !== 'unverified', auth_time: 1 };
  });
  const db = {
    projectId: TEAM_PROJECT_ID,
    collection(path) {
      return {
        doc(id) {
          const key = path + '/' + id;
          return { id, path: key, get: async () => ({ data: () => records.get(key) }) };
        },
        where(field, op, value) {
          expect(op).toBe('==');
          const matching = [...records].filter(([key, row]) => key.startsWith(path + '/') && row[field] === value);
          return { limit: n => ({ get: async () => ({ size: Math.min(n, matching.length) }) }) };
        },
      };
    },
    async runTransaction(work) {
      return work({
        get: ref => ref.get(), set: (ref, value) => records.set(ref.path, value), delete: ref => records.delete(ref.path),
      });
    },
  };
  return { db, records, authorize: vi.fn(async () => {}), auth: { app: { options: { projectId: TEAM_PROJECT_ID } }, verifyIdToken } };
}

test('requires the production alias, the runtime workload, and two separate Firebase push secrets', async () => {
  const connect = vi.fn();
  const cases = [
    [{ VERCEL_ENV: 'preview' }], [{ FIREBASE_PUSH_VAPID_PRIVATE_KEY: '' }],
    [{ FIREBASE_PUSH_ENCRYPTION_KEY: Buffer.from(keys.privateKey, 'base64url').toString('base64') }],
    [{ FIREBASE_PUSH_WIF_PROVIDER: provider.replace('446376297496', '123456789012') }],
    [{ FIREBASE_PUSH_WIF_PROVIDER: provider.replace('test-pool', 'github-hosting') }],
    [{ FIREBASE_PUSH_SERVICE_ACCOUNT: 'github-hosting@warming-up-bapmunna.iam.gserviceaccount.com' }],
    [{ FIREBASE_PUSH_SERVICE_ACCOUNT: 'test-runtime@another-project.iam.gserviceaccount.com' }],
    [{ FIRESTORE_EMULATOR_HOST: 'localhost:8080' }], [{ FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099' }],
    [{}, { oidc: false }], [{}, { host: 'https://preview.example.org' }],
  ];
  for (const [overrides, options] of cases) {
    const handle = createNotificationHandler({ ...env, ...overrides }, connect);
    const data = await (await handle(request(config, options))).json();
    expect(data).toMatchObject({ projectId: TEAM_PROJECT_ID, enabled: false, connectionReady: false });
    expect(data).not.toHaveProperty('webPush');
    expect((await handle(request(subscription, { ...options, method: 'POST' }))).status).toBe(503);
  }
  expect(connect).not.toHaveBeenCalled();
});

test('unavailable workload credentials leave the public configuration closed, and can recover', async () => {
  const backend = firebaseFixture();
  backend.authorize.mockRejectedValueOnce(Error('Credential unavailable'));
  const handle = createNotificationHandler(env, () => backend);
  expect(await (await handle(request(config))).json()).not.toHaveProperty('webPush');
  const result = await handle(request(config));
  expect(result.headers.get('access-control-allow-origin')).toBe(TEAM_ORIGIN);
  expect(await result.json()).toMatchObject({ enabled: false, connectionReady: false, webPush: { publicKey: keys.publicKey } });
});

test('the production adapter constructs native team Auth and Firestore clients with the workload identity', async () => {
  const token = vi.spyOn(IdentityPoolClient.prototype, 'getAccessToken').mockImplementation(async function () {
    expect(this.getServiceAccountEmail()).toBe(account);
    expect(this.scopes).toContain('https://www.googleapis.com/auth/datastore');
    this.credentials = { expiry_date: Date.now() + 60000 };
    return { token: 'fixture-access' };
  });
  try {
    const result = await createNotificationHandler(env)(request(config));
    expect((await result.json()).webPush).toEqual({ publicKey: keys.publicKey });
    expect(token).toHaveBeenCalledOnce();
  } finally {
    token.mockRestore();
  }
});

test('exposes two routes, keeps Samsung on its original host, and restricts subscription CORS', async () => {
  const backend = firebaseFixture();
  const handle = createNotificationHandler(env, () => backend);
  for (const path of ['events', 'start', 'callback', 'devices', 'poll']) {
    expect((await handle(request('/api/smartthings/' + path))).status).toBe(404);
  }
  expect((await handle(request(subscription, { method: 'OPTIONS' }))).status).toBe(204);
  const foreign = { origin: 'https://other.example.org', token: 'owner' };
  for (const method of ['OPTIONS', 'POST']) {
    const result = await handle(request(subscription, { ...foreign, method }));
    expect(result.status).toBe(403);
    expect(result.headers.has('access-control-allow-origin')).toBe(false);
  }
  expect(backend.auth.verifyIdToken).not.toHaveBeenCalled();
});

test('shared API verifies the Firebase ID token with revocation checks, current consent and device ownership', async () => {
  const backend = firebaseFixture();
  const handle = createNotificationHandler(env, () => backend);
  const post = token => handle(request(subscription, { method: 'POST', token }));
  expect((await post()).status).toBe(401);
  expect((await post('supabase-session')).status).toBe(401);
  expect((await post('unverified')).status).toBe(403);
  expect(await (await post('owner')).json()).toEqual({ registered: true });
  expect(await (await post('other')).json()).toEqual({ registered: false });
  backend.records.delete('bapmunnaAccounts/owner');
  expect(await (await post('owner')).json()).toEqual({ error: 'consent_required' });
  expect(backend.auth.verifyIdToken).toHaveBeenCalledWith('owner', true);
});

test('registers and removes an encrypted subscription for the verified account through the POST handler', async () => {
  const backend = firebaseFixture();
  const handle = createNotificationHandler(env, () => backend);
  const endpoint = 'https://web.push.apple.com/new-device';
  const device = { endpoint, keys: { p256dh: generateVAPIDKeys().publicKey, auth: randomBytes(16).toString('base64url') } };
  const post = (token, op) => handle(request(subscription, {
    method: 'POST', token, body: { op, endpoint, subscription: device },
  }));
  expect(await (await post('owner', 'register')).json()).toEqual({ registered: true });
  const row = backend.records.get('bapmunnaNotificationDevices/' + hash(endpoint));
  expect(row.uid).toBe('owner');
  expect(row.encrypted.version).toBe(1);
  expect(JSON.stringify(row)).not.toContain(endpoint);
  expect((await post('other', 'register')).status).toBe(409);
  expect(await (await post('owner', 'remove')).json()).toEqual({ registered: false });
  expect(await (await post('owner', 'check')).json()).toEqual({ registered: false });
});
