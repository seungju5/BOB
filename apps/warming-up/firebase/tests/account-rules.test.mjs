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
  if (!verify) return {uid: localId, email: credentials.email, password:credentials.password, token: idToken};
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
    let stored = await provider.saveAppPreferences(prefs,home,uid,empty.revision);
    assert.ok(Number.isFinite(Date.parse(stored.savedAt.household))); assert.ok(Number.isFinite(Date.parse(stored.savedAt.settings)));
    const loaded = await provider.getAppPreferences(uid);
    assert.deepEqual(loaded.savedAt,stored.savedAt);
    assert.equal(loaded.household.alias,home.alias); assert.deepEqual(loaded.settings,prefs);

    const ids = ['breakfast','lunch','dinner','fourth','fifth'];
    const five = ids.map((slot, i) => ({slot, start:(10+i)+':00', end:(11+i)+':00'}));
    const pathSettings = account(uid) + '/preferences/settings';
    for (const windows of [[five[0],five[2]],five.slice(0,4),five]) {
      stored = await provider.saveAppPreferences({...prefs,windows},home,uid,stored.revision);
      assert.deepEqual((await provider.getAppPreferences(uid)).settings.windows,windows);
    }
    const serverRecord = await (await request(store+'/'+pathSettings, undefined, fixture.token)).json();
    const {updatedAt, ...fields} = serverRecord.fields;
    assert.ok(updatedAt.timestampValue);
    const encode = windows => ({arrayValue:{values:windows.map(w => ({mapValue:{fields:{
      slot:string(w.slot),start:string(w.start),end:string(w.end),
    }}}))}});
    for (const windows of [[], [...five,five[4]], [...five.slice(0,4),{...five[4],slot:'lunch'}],
      [...five.slice(0,4),{...five[4],slot:'sixth'}], [...five.slice(0,4),{...five[4],start:'13:59'}],
      [...five.slice(0,4),{...five[4],end:'24:00'}]]) {
      await assert.rejects(provider.saveAppPreferences({...prefs,windows},home,uid,stored.revision),{code:'preferences/invalid-input'});
      assert.equal(await write(fixture,pathSettings,{...fields,windows:encode(windows)},['updatedAt']),403);
    }
    assert.equal(await write(other,pathSettings,fields,['updatedAt']),403);
    assert.equal((await request(store+'/'+pathSettings,undefined,other.token)).status,403);
    assert.deepEqual((await provider.getAppPreferences(uid)).settings.windows,five);
    stored = await provider.saveAppPreferences(prefs,home,uid,stored.revision);

    const day = Math.floor((Date.now() + 32400000) / 86400000) - 1;
    const capturePath = account(uid)+'/meterCaptures/'+(day % 35);
    const evidencePath = account(uid)+'/meterCaptureEvidence/'+(day % 35);
    const slotWindow = {mapValue:{fields:{slot:string('lunch'),start:string('11:00'),end:string('14:00')}}};
    const summaryFields = {day:{integerValue:String(day)},windows:{arrayValue:{values:[slotWindow]}},cook:{integerValue:'0'},confirmed:{arrayValue:{}},count:{integerValue:'1'}};
    assert.equal(await write(fixture,capturePath,summaryFields,[]),403);
    assert.equal(await write(other,capturePath,summaryFields,[]),403);
    assert.equal(await write({token:'owner'},capturePath,summaryFields,[]),200);
    assert.equal(await write({token:'owner'},evidencePath,{day:{integerValue:String(day)}},[]),200);
    assert.deepEqual(await provider.getCaptureDays(uid),[{day,windows:prefs.windows,cook:0,confirmed:[],count:1}]);
    assert.equal((await request(store+'/'+capturePath,undefined,other.token)).status,403);
    assert.equal((await request(store+'/'+evidencePath,undefined,fixture.token)).status,403);
    assert.equal(await write(fixture,evidencePath,summaryFields,[]),403);
    const withdrawn = {...prefs,preparationAcknowledged:false};
    const revoked = await provider.saveAppPreferences(withdrawn,null,uid,stored.revision);
    assert.equal((await request(store+'/'+capturePath,undefined,fixture.token)).status,403);
    assert.equal((await request(store+'/'+capturePath,undefined,'owner')).status,404);
    assert.equal((await request(store+'/'+evidencePath,undefined,'owner')).status,404);
    await assert.rejects(provider.getCaptureDays(uid),{code:'permission-denied'});
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

test('Studio membership, directory queries, edits and revocation are enforced by Firestore', async () => {
  const staff=await register(true), person=await register(true), pending=await register(false);
  const location=id=>projectDocs+'/'+id;
  async function provision(path,fields){assert.equal((await request(store+':commit',{writes:[{update:{name:location(path),fields}}]},'owner')).status,200);}
  await provision('bapmunnaOperators/'+staff.email,{enabled:{booleanValue:true}});
  await provision('bapmunnaOperators/'+pending.email,{enabled:{booleanValue:true}});
  const {createStudio}=await import('../provider/studio.mjs');
  const app=initializeApp({projectId:project,apiKey:'local-only',appId:'1:123:web:abc'},'studio-rules');
  const authClient=getAuth(app), db=getFirestore(app);
  connectAuthEmulator(authClient,auth,{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',Number(dbHost.split(':')[1]));
  const api=createStudio(db,authClient);
  const login=u=>signInWithEmailAndPassword(authClient,u.email,u.password);
  try {
    await login(pending);await api.recordSignIn(pending.uid);
    await assert.rejects(api.allowed(pending.uid),{code:'permission-denied'});
    await login(person);await api.recordSignIn(person.uid);
    assert.equal(await api.allowed(person.uid),false);
    await assert.rejects(api.overview(person.uid),{code:'permission-denied'});
    assert.equal((await request(store+'/bapmunnaOperators/'+staff.email,undefined,person.token)).status,403);
    assert.equal(await write(person,'bapmunnaOperators/'+person.email,{enabled:{booleanValue:true}},[]),403);
    assert.equal(await write(person,'bapmunnaStorageStatus/'+person.uid,{},['householdAt']),403);
    assert.equal(await write(person,account(person.uid),profile(person),['createdAt','updatedAt']),200);
    await login(staff);await api.recordSignIn(staff.uid);
    assert.equal(await api.allowed(staff.uid),true);
    const dashboard=await api.overview(staff.uid);
    assert.ok(dashboard.total>=3);assert.ok(dashboard.verified>=2);assert.equal(dashboard.days.length,7);
    const found=await api.page(staff.uid,'members',person.email.toUpperCase(),null);assert.equal(found.rows[0].uid,person.uid);
    const record=await api.detail(staff.uid,person.uid);assert.equal(record.profile.name,'테스트 가족');
    await api.save(staff.uid,person.uid,{type:'name',name:'운영 수정',version:record.profile.version});
    await assert.rejects(api.save(staff.uid,person.uid,{type:'name',name:'오래된 수정',version:record.profile.version}),/최신 정보/);
    await api.save(staff.uid,person.uid,{type:'case',stage:'review',note:'검토 중',version:null});
    const saved=await api.detail(staff.uid,person.uid);assert.equal(saved.note,'검토 중');assert.equal(saved.profile.name,'운영 수정');
    await assert.rejects(api.save(staff.uid,person.uid,{type:'case',stage:'done',note:'이전 내용',version:null}),/최신 정보/);
    assert.equal((await request(store+'/'+account(person.uid)+'/preferences/settings',undefined,staff.token)).status,403);
    assert.equal((await request(store+'/bapmunnaOpsCases/'+person.uid,undefined,person.token)).status,403);
    await provision('bapmunnaOperators/'+staff.email,{enabled:{booleanValue:false}});
    assert.equal(await api.allowed(staff.uid),false);await assert.rejects(api.detail(staff.uid,person.uid),{code:'permission-denied'});
  } finally {await signOut(authClient);await terminate(db);await deleteApp(app);}
});
