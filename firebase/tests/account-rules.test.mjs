import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, terminate } from 'firebase/firestore';
import { createProvider } from '../provider/firebase-provider.src.mjs';

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
  return {uid: localId, email: credentials.email, password: credentials.password, token: signedIn.idToken};
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
test('a verified owner can save a profile; household writes require the stored preparation choice', async () => {
  assert.equal(await write(owner, account(owner.uid), profile(owner), ['createdAt','updatedAt']), 200);
  const path = account(owner.uid) + '/preferences/household';
  assert.equal(await write(owner, path, homeFields(owner.uid), ['updatedAt']), 403);
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

test('the app SDK confirms timestamps, rejects stale names, and isolates households across sign-in and consent changes', async () => {
  const fixture = await register(true);
  const config = {projectId:project, apiKey:'local-emulator-only', appId:'1:123:web:abc', authDomain:'localhost'};
  const app = initializeApp(config, 'warming-up-' + project), authClient = getAuth(app), db = getFirestore(app);
  connectAuthEmulator(authClient, auth, {disableWarnings:true});
  connectFirestoreEmulator(db, '127.0.0.1', Number(dbHost.split(':')[1]));
  // The provider also builds a browser return URL for emails. This run never sends external email.
  const previousWindow = globalThis.window;
  globalThis.window = {location:{origin:auth}};
  const provider = createProvider(config);
  const prefs = {schemaVersion:1,onboardingStep:8,phone:'',relationLabel:'',windows:[{slot:'lunch',start:'11:00',end:'14:00'}],
    eatOutPerWeek:1,usesKeepWarm:false,cooksPerWeek:1,missedMealsThreshold:2,fastingHours:48,emergencyHours:72,preparationAcknowledged:true};
  const home = {relation:'other',alias:'가상 가구',residentCount:1,hasPet:false};
  try {
    await signInWithEmailAndPassword(authClient,fixture.email,fixture.password);
    const uid = fixture.uid;
    assert.equal(await provider.getAppProfile(uid),null);
    await provider.saveProfile('검증 보호자',uid);
    const first = await provider.getAppProfile(uid);
    assert.ok(first.revision); assert.ok(Number.isFinite(Date.parse(first.savedAt)));
    await provider.saveProfile('수정 보호자',uid,first.revision);
    await assert.rejects(provider.saveProfile('이전 화면',uid,first.revision), {code:'profile/conflict'});
    assert.equal((await provider.getAppProfile(uid)).displayName,'수정 보호자');

    const empty = await provider.getAppPreferences(uid);
    assert.deepEqual(empty.savedAt,{settings:null,household:null});
    await assert.rejects(provider.saveAppPreferences({...prefs,preparationAcknowledged:false,phone:'010-0000-0000'},home,uid,empty.revision), {code:'permission-denied'});
    assert.equal((await provider.getAppPreferences(uid)).household,null);
    const stored = await provider.saveAppPreferences(prefs,home,uid,empty.revision);
    assert.ok(Number.isFinite(Date.parse(stored.savedAt.household))); assert.ok(Number.isFinite(Date.parse(stored.savedAt.settings)));
    const loaded = await provider.getAppPreferences(uid);
    assert.deepEqual(loaded.savedAt,stored.savedAt);
    assert.equal(loaded.household.alias,home.alias); assert.deepEqual(loaded.settings,prefs);

    const withdrawn = {...prefs,preparationAcknowledged:false};
    const revoked = await provider.saveAppPreferences(withdrawn,null,uid,stored.revision);
    await assert.rejects(provider.saveAppPreferences(withdrawn,{...home,alias:'보류된 변경'},uid,revoked.revision), {code:'permission-denied'});
    await assert.rejects(provider.saveAppPreferences({...withdrawn,phone:'010-0000-0000'},null,uid,revoked.revision), {code:'permission-denied'});
    assert.equal((await provider.getAppPreferences(uid)).household.alias,home.alias);

    await signOut(authClient);
    await signInWithEmailAndPassword(authClient,other.email,other.password);
    assert.equal((await provider.getAppPreferences(other.uid)).household,null);
    await assert.rejects(provider.getAppPreferences(uid), {code:'auth/user-changed'});
    await assert.rejects(provider.saveProfile('다른 계정',uid,first.revision), {code:'auth/user-changed'});
    const path = account(uid) + '/preferences/household';
    assert.equal((await request(store + '/' + path, undefined, other.token)).status, 403);
  } finally {
    await signOut(authClient); await terminate(db); await deleteApp(app);
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  }
});
