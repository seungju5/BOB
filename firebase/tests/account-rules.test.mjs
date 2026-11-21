import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Real email-link verification is exercised only against the local Auth emulator.
const project = 'demo-warming-up';
const local = address => /^127\.0\.0\.1:\d+$/.test(address || '');
const { FIREBASE_AUTH_EMULATOR_HOST: authHost, FIRESTORE_EMULATOR_HOST: dbHost } = process.env;
if (!local(authHost) || !local(dbHost)) throw new Error('Start the loopback Auth and Firestore emulators for demo-warming-up first.');
const auth = 'http://' + authHost;
const store = 'http://' + dbHost + '/v1/projects/' + project + '/databases/(default)/documents';
const projectDocs = 'projects/' + project + '/databases/(default)/documents';

async function request(url, body, token) {
  return fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(body !== undefined && {'Content-Type': 'application/json'}), ...(token && {Authorization: 'Bearer ' + token}) },
    ...(body !== undefined && {body: JSON.stringify(body)}),
  });
}
async function accountAction(action, body) {
  const r = await request(auth + '/identitytoolkit.googleapis.com/v1/accounts:' + action + '?key=local-only', body);
  assert.equal(r.status, 200, 'Auth emulator ' + action);
  return r.json();
}
async function register(verify) {
  const credentials = {email: randomUUID() + '@example.test', password: randomUUID(), returnSecureToken: true};
  const {localId, idToken} = await accountAction('signUp', credentials);
  if (!verify) return {uid: localId, email: credentials.email, token: idToken};
  await accountAction('sendOobCode', {requestType: 'VERIFY_EMAIL', idToken});
  const codes = await (await request(auth + '/emulator/v1/projects/' + project + '/oobCodes')).json();
  const code = codes.oobCodes?.find(c => c.email === credentials.email && c.requestType === 'VERIFY_EMAIL');
  assert.ok(code, 'emulator verification code');
  await accountAction('update', {oobCode: code.oobCode});
  const signedIn = await accountAction('signInWithPassword', credentials);
  return {uid: localId, email: credentials.email, token: signedIn.idToken};
}
function string(stringValue) { return {stringValue}; }
function profile(user) {
  return {ownerUid: string(user.uid), email: string(user.email), displayName: string('테스트 가족'), consentVersion: string('2026-10-16')};
}
async function write(user, path, fields, timestamps) {
  const r = await request(store + ':commit', {writes: [{
    update: {name: projectDocs + '/' + path, fields},
    updateTransforms: timestamps.map(fieldPath => ({fieldPath, setToServerValue: 'REQUEST_TIME'})),
  }]}, user.token);
  return r.status;
}
const homeFields = uid => ({
  ownerUid: string(uid), relation: string('mother'), alias: string('어머니'), residentCount: {integerValue: '1'}, hasPet: {booleanValue: false},
});
const account = uid => 'bapmunnaAccounts/' + uid;
let owner, other, unverified;
before(async () => { [owner, other, unverified] = await Promise.all([register(true), register(true), register(false)]); });
test('verified email owner can save and reload their own profile and household', async () => {
  assert.equal(await write(owner, account(owner.uid), profile(owner), ['createdAt','updatedAt']), 200);
  const path = account(owner.uid) + '/preferences/household';
  assert.equal(await write(owner, path, homeFields(owner.uid), ['updatedAt']), 200);
  const data = await (await request(store + '/' + path, undefined, owner.token)).json();
  assert.equal(data.fields.alias.stringValue, '어머니');
});
test('unverified account, another verified household and signed-out requests have no private access', async () => {
  assert.equal(await write(unverified, account(unverified.uid), profile(unverified), ['createdAt','updatedAt']), 403);
  const path = account(owner.uid) + '/preferences/household';
  for (const token of [other.token, undefined]) {
    assert.equal((await request(store + '/' + path, undefined, token)).status, 403);
  }
  assert.equal(await write(other, path, homeFields(owner.uid), ['updatedAt']), 403);
});
test('unexpected fields, spoofed owners and unrelated collections are denied', async () => {
  const path = account(owner.uid) + '/preferences/household';
  assert.equal(await write(owner, path, {...homeFields(owner.uid), extra: string('unexpected')}, ['updatedAt']), 403);
  assert.equal(await write(owner, path, homeFields(other.uid), ['updatedAt']), 403);
  assert.equal(await write(owner, 'unrelated/resource', {value: string('private')}, []), 403);
});
