import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocFromServer,setDoc,updateDoc,deleteDoc,collection,getDocs,serverTimestamp,Timestamp,writeBatch,getFirestore,connectFirestoreEmulator} from 'firebase/firestore';
import {initializeApp,deleteApp,getApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut,sendEmailVerification,sendPasswordResetEmail,reload} from 'firebase/auth';
import {koreanDay} from '../cloud/auth-utils.mjs';
import {createProvider,createLocalProvider} from '../cloud/firebase-provider.src.mjs';
import {preferenceFields} from '../cloud/app-preferences.mjs';

test('archived UI rejects a hosted page and a live Firebase project before creating an SDK client', () => {
  assert.throws(() => createLocalProvider(), /로컬 Firebase/);
  assert.throws(() => createProvider({projectId:'production-example'}), /Only the local demo project/);
});

const projectId='demo-bapmunna';
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Run only inside the isolated demo Firebase emulators.');
let environment,authApp;
const accountData=(uid,email)=>({ownerUid:uid,email,displayName:'가상 사용자',consentVersion:'2026-10-16',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
const customerData=(uid,email)=>({...accountData(uid,email),source:'bapmunna',lastLoginAt:serverTimestamp()});
const context=(uid,verified=true)=>environment.authenticatedContext(uid,{email:`${uid}@example.test`,email_verified:verified,firebase:{sign_in_provider:'password'}}).firestore();
before(async()=>{
  environment=await initializeTestEnvironment({projectId,firestore:{rules:readFileSync(new URL('../tmp/firebase/merged.rules',import.meta.url),'utf8')}});
  await environment.withSecurityRulesDisabled(async context=>{const db=context.firestore();await setDoc(doc(db,'bapmunnaStaff','operator'),{role:'owner'});await setDoc(doc(db,'bapmunnaAccounts','alice'),{...accountData('alice','alice@example.test'),createdAt:Timestamp.now(),updatedAt:Timestamp.now()});await setDoc(doc(db,'bapmunnaCRMContacts','alice'),{...customerData('alice','alice@example.test'),createdAt:Timestamp.now(),updatedAt:Timestamp.now(),lastLoginAt:Timestamp.now()});});
});
after(async()=>{await environment?.cleanup();if(authApp)await deleteApp(authApp);});

test('anonymous visitor cannot read stored accounts or customers',async()=>{const db=environment.unauthenticatedContext().firestore();await assertFails(getDoc(doc(db,'bapmunnaAccounts','alice')));await assertFails(getDocs(collection(db,'bapmunnaCRMContacts')));});
test('unverified account cannot read or create protected data',async()=>{const db=context('pending',false);await assertFails(setDoc(doc(db,'bapmunnaAccounts','pending'),accountData('pending','pending@example.test')));await assertFails(getDoc(doc(db,'bapmunnaAccounts','pending')));});
test('verified owner can create their profile and own customer contact',async()=>{const db=context('bob');await assertSucceeds(setDoc(doc(db,'bapmunnaAccounts','bob'),accountData('bob','bob@example.test')));await assertSucceeds(setDoc(doc(db,'bapmunnaCRMContacts','bob'),customerData('bob','bob@example.test')));});
test('password and privilege fields cannot be stored in the customer profile',async()=>{const db=context('mallory');await assertFails(setDoc(doc(db,'bapmunnaAccounts','mallory'),{...accountData('mallory','mallory@example.test'),password:'not-a-real-password'}));await assertFails(setDoc(doc(db,'bapmunnaCRMContacts','mallory'),{...customerData('mallory','mallory@example.test'),role:'owner'}));});
test('an account cannot spoof another customer email or uid',async()=>{const db=context('bob');await assertFails(setDoc(doc(db,'bapmunnaAccounts','other'),accountData('other','bob@example.test')));await assertFails(updateDoc(doc(db,'bapmunnaCRMContacts','bob'),{email:'victim@example.test',updatedAt:serverTimestamp(),lastLoginAt:serverTimestamp()}));});
test('different users cannot read or edit one another profiles',async()=>{const db=context('bob');await assertFails(getDoc(doc(db,'bapmunnaAccounts','alice')));await assertFails(updateDoc(doc(db,'bapmunnaAccounts','alice'),{displayName:'Changed',updatedAt:serverTimestamp()}));});
test('profile updates preserve the original creation time',async()=>{const db=context('bob');await assertSucceeds(updateDoc(doc(db,'bapmunnaAccounts','bob'),{displayName:'새 표시 이름',updatedAt:serverTimestamp()}));await assertFails(updateDoc(doc(db,'bapmunnaAccounts','bob'),{createdAt:Timestamp.fromMillis(0),updatedAt:serverTimestamp()}));});
test('ordinary users cannot promote themselves into staff',async()=>{const db=context('bob');await assertFails(setDoc(doc(db,'bapmunnaStaff','bob'),{role:'owner'}));await assertFails(getDoc(doc(db,'bapmunnaStaff','operator')));});
test('only staff can list customer contacts',async()=>{await assertFails(getDocs(collection(context('bob'),'bapmunnaCRMContacts')));const snapshot=await assertSucceeds(getDocs(collection(context('operator'),'bapmunnaCRMContacts')));assert.ok(snapshot.size>=2);});
test('staff can read CRM contacts but not private meal/account data',async()=>{const db=context('operator');await assertSucceeds(getDoc(doc(db,'bapmunnaCRMContacts','alice')));await assertFails(getDoc(doc(db,'bapmunnaAccounts','alice')));await assertFails(getDocs(collection(db,'bapmunnaAccounts','alice','meals')));});
const householdData=uid=>({ownerUid:uid,relation:'mother',alias:'우리 집',residentCount:1,hasPet:false,updatedAt:serverTimestamp()});
const householdDoc=(db,uid)=>doc(db,'bapmunnaAccounts',uid,'preferences','household');
test('verified owner can create, reload, update and delete private household preferences without creating a shared household',async()=>{
  const uid='household-owner',db=context(uid),ref=householdDoc(db,uid);
  assert.equal((await assertSucceeds(getDoc(ref))).exists(),false);
  await assertSucceeds(setDoc(ref,householdData(uid)));
  assert.equal((await getDoc(ref)).data().alias,'우리 집');
  for(const relation of ['father','parents','other'])await assertSucceeds(updateDoc(ref,{relation,residentCount:6,hasPet:true,updatedAt:serverTimestamp()}));
  assert.equal((await getDoc(ref)).data().hasPet,true);
  await environment.withSecurityRulesDisabled(async admin=>{
    assert.equal((await getDoc(doc(admin.firestore(),'bapmunnaHouseholds',uid))).exists(),false);
    assert.equal((await getDoc(doc(admin.firestore(),'bapmunnaCRMContacts',uid))).exists(),false);
  });
  await assertSucceeds(deleteDoc(ref));
});
test('household preferences deny anonymous, unverified, other-account and CRM staff reads and writes',async()=>{
  const uid='private-household',ref=householdDoc(context(uid),uid);await assertSucceeds(setDoc(ref,householdData(uid)));
  for(const db of [environment.unauthenticatedContext().firestore(),context(uid,false),context('bob'),context('operator')]){
    const other=householdDoc(db,uid);await assertFails(getDoc(other));await assertFails(setDoc(other,householdData(uid)));await assertFails(deleteDoc(other));
  }
});
test('household preferences reject forged ownership, consent/sharing fields and non-server timestamps',async()=>{
  const uid='household-forgery',ref=householdDoc(context(uid),uid),data=householdData(uid);
  for(const changed of [{ownerUid:'alice'},{consent:true},{sharingEnabled:true},{seniorConsentAt:Timestamp.now()},{updatedAt:Timestamp.fromMillis(0)}])await assertFails(setDoc(ref,{...data,...changed}));
  const {hasPet,...missing}=data;await assertFails(setDoc(ref,missing));
  await assertFails(setDoc(doc(context(uid),'bapmunnaAccounts',uid,'preferences','unknown'),data));
});
test('household preferences validate names, relation, integer counts and pet booleans on create and update',async()=>{
  const uid='household-validation',ref=householdDoc(context(uid),uid),data=householdData(uid);
  const invalid=[{alias:''},{alias:' '},{alias:' 앞 공백'},{alias:'뒤 공백 '},{alias:'가'.repeat(31)},{alias:123},{relation:'grandparent'},{residentCount:0},{residentCount:7},{residentCount:1.5},{residentCount:'2'},{hasPet:'false'}];
  for(const changed of invalid)await assertFails(setDoc(ref,{...data,...changed}));
  await assertSucceeds(setDoc(ref,{...data,alias:'가'.repeat(30)}));
  for(const changed of invalid)await assertFails(updateDoc(ref,{...changed,updatedAt:serverTimestamp()}));
});

// Synthetic account-owned preparation settings, never production care or sensor data.
const appPreferenceInput=()=>({
  schemaVersion:1,relationLabel:'',onboardingStep:8,phone:'010-1234-5678',
  windows:[{slot:'breakfast',start:'06:00',end:'10:00'},{slot:'lunch',start:'11:00',end:'14:30'},{slot:'dinner',start:'17:00',end:'21:00'}],
  eatOutPerWeek:1,usesKeepWarm:true,cooksPerWeek:7,missedMealsThreshold:2,fastingHours:48,emergencyHours:72,preparationAcknowledged:true,
});
const fourMealInput=()=>({...appPreferenceInput(),windows:[...appPreferenceInput().windows,{slot:'fourth',start:'21:00',end:'23:00'}]});
const appSettingsDoc=(db,uid)=>doc(db,'bapmunnaAccounts',uid,'preferences','settings');
const appSettingsData=(uid,input=appPreferenceInput())=>({ownerUid:uid,...input,updatedAt:serverTimestamp()});
const invalidPreferenceChanges=()=>[
  ['unknown schema',{schemaVersion:2}],['step below bound',{onboardingStep:0}],['step above bound',{onboardingStep:9}],['fractional step',{onboardingStep:3.5}],
  ['phone type',{phone:123}],['phone text',{phone:'전화해 주세요'}],['phone too long',{phone:'1'.repeat(25)}],
  ['embedded plus',{phone:'010+1234'}],['multiple plus signs',{phone:'++82'}],['plus included in 24-character maximum',{phone:'+'+'1'.repeat(24)}],
  ['relation label type',{relationLabel:123}],['null relation label',{relationLabel:null}],['relation label too long',{relationLabel:'가'.repeat(31)}],
  ['relation label leading whitespace',{relationLabel:' 할머니'}],['relation label trailing whitespace',{relationLabel:'할머니 '}],['blank relation label with whitespace',{relationLabel:' '}],
  ['eat-out below bound',{eatOutPerWeek:-1}],['eat-out above bound',{eatOutPerWeek:21}],['fractional eat-out count',{eatOutPerWeek:1.5}],
  ['cook count below bound',{cooksPerWeek:0}],['cook count above bound',{cooksPerWeek:22}],['string cook count',{cooksPerWeek:'7'}],
  ['missed count below bound',{missedMealsThreshold:0}],['missed count above bound',{missedMealsThreshold:7}],
  ['fasting below bound',{fastingHours:6}],['fasting above bound',{fastingHours:114}],['fasting not six-hour step',{fastingHours:49}],
  ['emergency below bound',{emergencyHours:18}],['emergency above bound',{emergencyHours:126}],['emergency not six-hour step',{emergencyHours:73}],
  ['emergency too close to fasting',{fastingHours:48,emergencyHours:54}],['string keep-warm flag',{usesKeepWarm:'true'}],['numeric preparation flag',{preparationAcknowledged:1}],
  ['empty windows',{windows:[]}],['too many windows',{windows:[...fourMealInput().windows,{slot:'fourth',start:'23:10',end:'23:50'}]}],
  ['unknown slot',{windows:[{slot:'snack',start:'06:00',end:'10:00'}]}],
  ['duplicate non-overlapping slots',{windows:[{slot:'breakfast',start:'06:00',end:'10:00'},{slot:'breakfast',start:'11:00',end:'14:30'}]}],
  ['duplicate fourth slot',{windows:[{slot:'fourth',start:'01:00',end:'02:00'},...appPreferenceInput().windows.slice(1),{slot:'fourth',start:'21:00',end:'23:00'}]}],
  ['time missing zero',{windows:[{slot:'lunch',start:'6:00',end:'10:00'}]}],['hour out of range',{windows:[{slot:'lunch',start:'23:00',end:'24:00'}]}],
  ['minute out of range',{windows:[{slot:'lunch',start:'11:60',end:'14:30'}]}],['equal start and end',{windows:[{slot:'lunch',start:'11:00',end:'11:00'}]}],
  ['end before start',{windows:[{slot:'lunch',start:'14:00',end:'11:00'}]}],
  ['overlapping windows',{windows:[{slot:'breakfast',start:'06:00',end:'12:00'},{slot:'lunch',start:'11:00',end:'14:30'}]}],
  ['out-of-order windows',{windows:[appPreferenceInput().windows[2],appPreferenceInput().windows[0]]}],
  ['extra window field',{windows:[{slot:'lunch',start:'11:00',end:'14:30',source:'sensor'}]}],
  ['missing window field',{windows:[{slot:'lunch',start:'11:00'}]}],
];

test('verified owner can round-trip and update one-to-four meal app preferences without granting care access',async()=>{
  const uid='app-settings-owner',db=context(uid),ref=appSettingsDoc(db,uid);
  assert.equal((await assertSucceeds(getDoc(ref))).exists(),false);
  for(const windows of [[appPreferenceInput().windows[1]],[appPreferenceInput().windows[0],appPreferenceInput().windows[2]],appPreferenceInput().windows,fourMealInput().windows]){
    const input={...appPreferenceInput(),onboardingStep:1,relationLabel:'할머니',windows};
    await assertSucceeds(setDoc(ref,appSettingsData(uid,input)));
    const stored=(await assertSucceeds(getDoc(ref))).data();
    assert.equal(stored.ownerUid,uid);assert.deepEqual(stored.windows,windows);assert.ok(stored.updatedAt instanceof Timestamp);
    const {ownerUid,updatedAt,...actual}=stored;assert.deepEqual(actual,preferenceFields(input));
  }
  await assertSucceeds(updateDoc(ref,{phone:'',relationLabel:'',onboardingStep:1,eatOutPerWeek:0,cooksPerWeek:1,missedMealsThreshold:1,fastingHours:12,emergencyHours:24,usesKeepWarm:false,preparationAcknowledged:false,updatedAt:serverTimestamp()}));
  await assertSucceeds(updateDoc(ref,{phone:'+'+'1'.repeat(23),relationLabel:'가'.repeat(30),onboardingStep:8,eatOutPerWeek:20,cooksPerWeek:21,missedMealsThreshold:6,fastingHours:108,emergencyHours:120,updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(ref,{onboardingStep:3,updatedAt:serverTimestamp()}));
  assert.equal((await getDoc(ref)).data().onboardingStep,8);
  assert.equal((await getDoc(ref)).data().windows.length,4);
  assert.equal((await getDoc(ref)).data().relationLabel,'가'.repeat(30));
  await environment.withSecurityRulesDisabled(async admin=>{
    const db=admin.firestore();
    assert.equal((await getDoc(doc(db,'bapmunnaHouseholds',uid))).exists(),false);
    assert.equal((await getDoc(doc(db,'bapmunnaCRMContacts',uid))).exists(),false);
    assert.equal((await getDoc(householdDoc(db,uid))).exists(),false);
  });
  await assertSucceeds(deleteDoc(ref));
});

test('app preferences deny anonymous, unverified, other-account and CRM staff reads, writes, deletes and lists',async()=>{
  const uid='app-settings-private';await assertSucceeds(setDoc(appSettingsDoc(context(uid),uid),appSettingsData(uid)));
  for(const db of [environment.unauthenticatedContext().firestore(),context(uid,false),context('bob'),context('operator')]){
    const ref=appSettingsDoc(db,uid);
    await assertFails(getDoc(ref));await assertFails(setDoc(ref,appSettingsData(uid)));
    await assertFails(updateDoc(ref,{phone:'',updatedAt:serverTimestamp()}));await assertFails(deleteDoc(ref));
    await assertFails(getDocs(collection(db,'bapmunnaAccounts',uid,'preferences')));
  }
});

test('app preferences reject extra or missing fields, forged owner identity and client timestamps on create and update',async()=>{
  const uid='app-settings-forgery',db=context(uid),ref=appSettingsDoc(db,uid),data=appSettingsData(uid);
  const invalid=[{ownerUid:'alice'},{seniorConsent:true},{sharingEnabled:true},{role:'owner'},{household:{residentCount:2}},{updatedAt:Timestamp.fromMillis(0)},{updatedAt:'2026-11-14'}];
  for(const changed of invalid)await assertFails(setDoc(ref,{...data,...changed}));
  for(const field of ['schemaVersion','phone','relationLabel','windows','preparationAcknowledged','updatedAt']){
    const missing={...data};delete missing[field];await assertFails(setDoc(ref,missing));
  }
  await assertSucceeds(setDoc(ref,data));
  for(const changed of invalid)await assertFails(updateDoc(ref,{updatedAt:serverTimestamp(),...changed}));
  assert.equal((await getDoc(ref)).data().ownerUid,uid);
});

test('app preference validation and Firestore rules agree on bounds, time format, overlap and duplicate slots',async()=>{
  const uid='app-settings-validation',ref=appSettingsDoc(context(uid),uid);
  for(const [label,change] of invalidPreferenceChanges()){
    assert.throws(()=>preferenceFields({...appPreferenceInput(),...change}),{code:'preferences/invalid-input'},label);
    await assertFails(setDoc(ref,appSettingsData(uid,{...appPreferenceInput(),...change})));
  }
  await assertSucceeds(setDoc(ref,appSettingsData(uid,fourMealInput())));
  for(const [label,change] of invalidPreferenceChanges()){
    await assertFails(updateDoc(ref,{...change,updatedAt:serverTimestamp()}));
    assert.equal((await getDoc(ref)).data().windows.length,4,`${label} cannot replace the valid saved settings`);
  }
});
test('staff can write only validated CRM notes under their own identity',async()=>{const db=context('operator'),ref=doc(db,'bapmunnaCRMNotes','alice');const fields={ownerUid:'alice',stage:'contacted',note:'워크숍 안내 완료',updatedBy:'operator',updatedAt:serverTimestamp()};await assertSucceeds(setDoc(ref,fields));await assertFails(setDoc(ref,{...fields,updatedBy:'another-admin'}));await assertFails(setDoc(ref,{...fields,stage:'superuser'}));await assertFails(setDoc(ref,{...fields,note:'x'.repeat(1001)}));});
test('customers cannot read or alter staff notes',async()=>{const ref=doc(context('alice'),'bapmunnaCRMNotes','alice');await assertFails(getDoc(ref));await assertFails(setDoc(ref,{ownerUid:'alice',stage:'active',note:'change',updatedBy:'alice',updatedAt:serverTimestamp()}));});
test('verified owner records one current-day meal and updates its kind',async()=>{const db=context('alice'),day=koreanDay(),ref=doc(db,'bapmunnaAccounts','alice','meals',`${day}_lunch`);await assertSucceeds(setDoc(ref,{ownerUid:'alice',day,meal:'lunch',kind:'home',dayStart:Timestamp.fromDate(new Date(`${day}T00:00:00+09:00`)),createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));await assertSucceeds(updateDoc(ref,{kind:'outside',updatedAt:serverTimestamp()}));assert.equal((await getDoc(ref)).data().kind,'outside');});
test('raw device events, unknown kinds and future dates are rejected',async()=>{const db=context('alice'),day=koreanDay(),base={ownerUid:'alice',day,meal:'dinner',kind:'home',dayStart:Timestamp.fromDate(new Date(`${day}T00:00:00+09:00`)),createdAt:serverTimestamp(),updatedAt:serverTimestamp()},ref=doc(db,'bapmunnaAccounts','alice','meals',`${day}_dinner`);await assertFails(setDoc(ref,{...base,rawEvents:[700]}));await assertFails(setDoc(ref,{...base,kind:'sensor'}));await assertFails(setDoc(ref,{...base,dayStart:Timestamp.fromMillis(Date.now()+86400000)}));});
test('another account and CRM staff cannot delete someone else meals',async()=>{const id=`${koreanDay()}_lunch`;await assertFails(deleteDoc(doc(context('bob'),'bapmunnaAccounts','alice','meals',id)));await assertFails(deleteDoc(doc(context('operator'),'bapmunnaAccounts','alice','meals',id)));await assertSucceeds(deleteDoc(doc(context('alice'),'bapmunnaAccounts','alice','meals',id)));});
test('date text and midnight cannot be forged independently of server Seoul date',async()=>{const db=context('alice'),day=koreanDay(),dayStart=Timestamp.fromDate(new Date(`${day}T00:00:00+09:00`)),fields={ownerUid:'alice',day,meal:'dinner',kind:'home',dayStart,createdAt:serverTimestamp(),updatedAt:serverTimestamp()};await assertFails(setDoc(doc(db,'bapmunnaAccounts','alice','meals','2099-01-01_dinner'),{...fields,day:'2099-01-01'}));await assertFails(setDoc(doc(db,'bapmunnaAccounts','alice','meals',`${day}_dinner`),{...fields,dayStart:Timestamp.fromMillis(dayStart.toMillis()+60000)}));});
test('existing academic records remain unavailable to ordinary app users',async()=>{await assertFails(getDoc(doc(context('bob'),'users','bob','state','main')));});
test('Seoul date conversion preserves the midnight boundary',()=>{assert.equal(koreanDay(new Date('2026-10-15T14:59:00Z')),'2026-10-15');assert.equal(koreanDay(new Date('2026-10-15T15:00:00Z')),'2026-10-16');});
test('password signup, verification, signout, signin and recovery run only in Auth emulator',async()=>{
  authApp=initializeApp({apiKey:'demo-api-key',projectId,authDomain:'demo-bapmunna.firebaseapp.com'},'isolated-auth-test');
  const auth=getAuth(authApp),base=`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`;connectAuthEmulator(auth,base,{disableWarnings:true});
  const result=await createUserWithEmailAndPassword(auth,'auth-check@example.test','Sample-Test-Password-2026');assert.equal(result.user.emailVerified,false);await sendEmailVerification(result.user);
  const lookup=await fetch(`${base}/emulator/v1/projects/${projectId}/oobCodes`);const codes=await lookup.json();assert.ok(codes.oobCodes.some(item=>item.email==='auth-check@example.test'&&item.requestType==='VERIFY_EMAIL'));
  const verified=await fetch(`${base}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-api-key`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer owner'},body:JSON.stringify({localId:result.user.uid,emailVerified:true})});assert.equal(verified.ok,true);
  await reload(result.user);assert.equal(result.user.emailVerified,true);await signOut(auth);await assert.rejects(signInWithEmailAndPassword(auth,'auth-check@example.test','wrong-password'));await signInWithEmailAndPassword(auth,'auth-check@example.test','Sample-Test-Password-2026');await sendPasswordResetEmail(auth,'auth-check@example.test');
  const afterCodes=await (await fetch(`${base}/emulator/v1/projects/${projectId}/oobCodes`)).json();assert.ok(afterCodes.oobCodes.some(item=>item.requestType==='PASSWORD_RESET'));await signOut(auth);
});

const homeOwner='home-owner',viewer='family-viewer',caregiver='family-caregiver';
const hourAgo=()=>Timestamp.fromMillis(Date.now()-3600000);
const homeFields=()=>({ownerUid:homeOwner,seniorName:'가상 어르신',timeZone:'Asia/Seoul',consentEnabled:true,consentVersion:'2026-10-16',sharingEpoch:0,sharedFrom:hourAgo(),activeInviteHash:null,lastConsentEventId:'seed-event',createdAt:hourAgo(),updatedAt:hourAgo()});
const memberFields=(uid,role)=>({uid,role,alias:'가상 가족',inviteHash:'a'.repeat(64),sharingEpoch:0,joinedAt:hourAgo(),updatedAt:hourAgo()});
const prefs=()=>({mealWindows:{breakfast:{start:420,end:600},lunch:{start:660,end:840},dinner:{start:1020,end:1200}},graceMinutes:30,household:'alone',ageBand:null,riceRoutine:'daily',meals:['breakfast','lunch','dinner'],primaryDevice:'cooker',eatOutWeekly:0,cookEveryDays:1,baselineDays:14,consecutiveMissed:2,fastingHours:16,inactiveHours:4,followupHours:12,updatedAt:serverTimestamp()});
async function seedHome(id){await environment.withSecurityRulesDisabled(async admin=>{const db=admin.firestore();await setDoc(doc(db,'bapmunnaAccounts',homeOwner),{...accountData(homeOwner,`${homeOwner}@example.test`),createdAt:hourAgo(),updatedAt:hourAgo()});await setDoc(doc(db,'bapmunnaHouseholds',id),homeFields());await setDoc(doc(db,'bapmunnaHouseholds',id,'members',viewer),memberFields(viewer,'viewer'));await setDoc(doc(db,'bapmunnaHouseholds',id,'members',caregiver),memberFields(caregiver,'caregiver'));});}
function createInviteBatch(id,hash,role='viewer'){const db=context(homeOwner),batch=writeBatch(db);batch.update(doc(db,'bapmunnaHouseholds',id),{activeInviteHash:hash,updatedAt:serverTimestamp()});batch.set(doc(db,'bapmunnaInviteTokens',hash),{householdId:id,role,label:'가상 초대',sharingEpoch:0,createdBy:homeOwner,createdAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+23*3600000),acceptedBy:null,acceptedAt:null,revokedAt:null});return batch;}
function acceptBatch(id,hash,uid,role='viewer'){const db=context(uid),batch=writeBatch(db);batch.update(doc(db,'bapmunnaInviteTokens',hash),{acceptedBy:uid,acceptedAt:serverTimestamp()});batch.set(doc(db,'bapmunnaHouseholds',id,'members',uid),{...memberFields(uid,role),inviteHash:hash,joinedAt:serverTimestamp(),updatedAt:serverTimestamp()});return batch;}
async function toggleSharing(id,enabled,epoch,eventId){const db=context(homeOwner),batch=writeBatch(db);batch.update(doc(db,'bapmunnaHouseholds',id),{consentEnabled:enabled,sharingEpoch:epoch,sharedFrom:enabled?serverTimestamp():null,activeInviteHash:null,lastConsentEventId:eventId,updatedAt:serverTimestamp()});batch.set(doc(db,'bapmunnaHouseholds',id,'consentEvents',eventId),{actorUid:homeOwner,enabled,version:'2026-10-16',sharingEpoch:epoch,createdAt:serverTimestamp()});return batch.commit();}

test('household creation requires the verified owner and an atomic consent event',async()=>{await seedHome('h-bootstrap');const db=context(homeOwner),id='h-created',batch=writeBatch(db);batch.set(doc(db,'bapmunnaHouseholds',id),{...homeFields(),createdAt:serverTimestamp(),updatedAt:serverTimestamp(),sharedFrom:serverTimestamp(),lastConsentEventId:'first-consent'});batch.set(doc(db,'bapmunnaHouseholds',id,'consentEvents','first-consent'),{actorUid:homeOwner,enabled:true,version:'2026-10-16',sharingEpoch:0,createdAt:serverTimestamp()});await assertSucceeds(batch.commit());await assertFails(setDoc(doc(db,'bapmunnaHouseholds','h-no-consent'),{...homeFields(),createdAt:serverTimestamp(),updatedAt:serverTimestamp(),sharedFrom:serverTimestamp()}));await assertFails(getDoc(doc(context('outsider'),'bapmunnaHouseholds',id)));});
test('household owner cannot be transferred and CRM staff is not a family member',async()=>{await seedHome('h-owner');await assertFails(updateDoc(doc(context(homeOwner),'bapmunnaHouseholds','h-owner'),{ownerUid:'operator',updatedAt:serverTimestamp()}));await assertFails(getDoc(doc(context('operator'),'bapmunnaHouseholds','h-owner')));await assertFails(getDoc(doc(context(viewer,false),'bapmunnaHouseholds','h-owner')));});
test('only the owner can save validated preferences and overlapping windows are rejected',async()=>{await seedHome('h-preferences');const ref=doc(context(homeOwner),'bapmunnaHouseholds','h-preferences','preferences','main');await assertSucceeds(setDoc(ref,prefs()));await assertFails(updateDoc(ref,{mealWindows:{breakfast:{start:420,end:800},lunch:{start:660,end:840},dinner:{start:1020,end:1200}},updatedAt:serverTimestamp()}));await assertFails(updateDoc(ref,{followupHours:3,updatedAt:serverTimestamp()}));await assertFails(getDoc(doc(context(viewer),'bapmunnaHouseholds','h-preferences','preferences','main')));assert.equal((await getDoc(ref)).data().followupHours,12);});
test('device registration cannot forge online telemetry or retain raw events',async()=>{await seedHome('h-device');const ref=doc(context(homeOwner),'bapmunnaHouseholds','h-device','devices','cooker-1'),data={kind:'cooker',label:'우리 집 밥솥',connectionStatus:'unconfigured',lastSeenAt:null,createdAt:serverTimestamp(),updatedAt:serverTimestamp()};await assertSucceeds(setDoc(ref,data));await assertSucceeds(updateDoc(ref,{label:'주방 밥솥',updatedAt:serverTimestamp()}));await assertFails(updateDoc(ref,{connectionStatus:'online',updatedAt:serverTimestamp()}));await assertFails(updateDoc(ref,{rawEvents:[1],updatedAt:serverTimestamp()}));await assertFails(getDoc(doc(context(viewer),'bapmunnaHouseholds','h-device','devices','cooker-1')));});
test('only trusted ingestion can write device daily summaries; active members read current summaries',async()=>{await seedHome('h-daily');const id=`${koreanDay()}_cooker`,fields={day:koreanDay(),kind:'cooker',cookCount:1,lidCount:2,useCount:3,observed:true,lastActivity:hourAgo(),sharingEpoch:0,updatedAt:Timestamp.now()};await environment.withSecurityRulesDisabled(async admin=>setDoc(doc(admin.firestore(),'bapmunnaHouseholds','h-daily','deviceDaily',id),fields));await assertSucceeds(getDoc(doc(context(viewer),'bapmunnaHouseholds','h-daily','deviceDaily',id)));await assertFails(setDoc(doc(context(homeOwner),'bapmunnaHouseholds','h-daily','deviceDaily',id),fields));await assertFails(getDoc(doc(context('operator'),'bapmunnaHouseholds','h-daily','deviceDaily',id)));});
test('shared meal summaries require the matching private self-report in the same batch',async()=>{await seedHome('h-meal');const db=context(homeOwner),day=koreanDay(),id=`${day}_dinner`,summary={ownerUid:homeOwner,day,meal:'dinner',confirmed:true,kind:'home',sharingEpoch:0,updatedAt:serverTimestamp()};await assertFails(setDoc(doc(db,'bapmunnaHouseholds','h-meal','mealSummaries',id),summary));const batch=writeBatch(db);batch.set(doc(db,'bapmunnaAccounts',homeOwner,'meals',id),{ownerUid:homeOwner,day,meal:'dinner',kind:'home',dayStart:Timestamp.fromDate(new Date(`${day}T00:00:00+09:00`)),createdAt:serverTimestamp(),updatedAt:serverTimestamp()});batch.set(doc(db,'bapmunnaHouseholds','h-meal','mealSummaries',id),summary);await assertSucceeds(batch.commit());await assertSucceeds(getDoc(doc(context(viewer),'bapmunnaHouseholds','h-meal','mealSummaries',id)));await assertFails(getDoc(doc(context(viewer),'bapmunnaAccounts',homeOwner,'meals',id)));});
test('invitation acceptance is atomic and preserves the owner-selected role',async()=>{await seedHome('h-invite');const hash='b'.repeat(64),uid='new-member';await assertSucceeds(createInviteBatch('h-invite',hash).commit());await assertFails(setDoc(doc(context(uid),'bapmunnaHouseholds','h-invite','members',uid),{...memberFields(uid,'caregiver'),inviteHash:hash,joinedAt:serverTimestamp(),updatedAt:serverTimestamp()}));await assertFails(acceptBatch('h-invite',hash,uid,'caregiver').commit());await assertSucceeds(acceptBatch('h-invite',hash,uid).commit());assert.equal((await getDoc(doc(context(uid),'bapmunnaHouseholds','h-invite','members',uid))).data().role,'viewer');await assertFails(acceptBatch('h-invite',hash,'second-member').commit());await assertFails(getDocs(collection(context(uid),'bapmunnaInviteTokens')));});
test('new invitation invalidates the old one and an expired token cannot be accepted',async()=>{await seedHome('h-invite-replace');const first='c'.repeat(64),second='d'.repeat(64);await assertSucceeds(createInviteBatch('h-invite-replace',first).commit());await assertSucceeds(createInviteBatch('h-invite-replace',second).commit());await assertFails(acceptBatch('h-invite-replace',first,'replaced-member').commit());await environment.withSecurityRulesDisabled(async admin=>updateDoc(doc(admin.firestore(),'bapmunnaInviteTokens',second),{expiresAt:hourAgo()}));await assertFails(acceptBatch('h-invite-replace',second,'expired-member').commit());});
test('sharing stop and restart invalidate old members, invitations and summaries immediately',async()=>{await seedHome('h-stop');const hash='e'.repeat(64);await assertSucceeds(createInviteBatch('h-stop',hash).commit());await environment.withSecurityRulesDisabled(async admin=>setDoc(doc(admin.firestore(),'bapmunnaHouseholds','h-stop','deviceDaily','old'),{sharingEpoch:0,updatedAt:Timestamp.now()}));await assertSucceeds(toggleSharing('h-stop',false,1,'stop-consent'));await assertFails(getDoc(doc(context(viewer),'bapmunnaHouseholds','h-stop')));await assertFails(getDoc(doc(context('prospective-member'),'bapmunnaInviteTokens',hash)));await assertSucceeds(toggleSharing('h-stop',true,2,'restart-consent'));await assertFails(getDoc(doc(context(viewer),'bapmunnaHouseholds','h-stop')));await assertFails(getDoc(doc(context(homeOwner),'bapmunnaHouseholds','h-stop','deviceDaily','old')));});
test('viewer cannot see help requests or acknowledge them, caregiver acknowledgment does not confirm a meal',async()=>{await seedHome('h-alert');const db=context(homeOwner),ref=doc(db,'bapmunnaHouseholds','h-alert','alerts','help'),fields={kind:'help_request',level:'help',title:'전화 부탁드려요.',detail:'앱 안의 요청',status:'open',sharingEpoch:0,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),acknowledgedBy:null,acknowledgedAt:null,resolvedAt:null};await assertSucceeds(setDoc(ref,fields));await assertFails(getDoc(doc(context(viewer),'bapmunnaHouseholds','h-alert','alerts','help')));await assertFails(updateDoc(doc(context(viewer),'bapmunnaHouseholds','h-alert','alerts','help'),{status:'acknowledged',acknowledgedBy:viewer,acknowledgedAt:serverTimestamp(),updatedAt:serverTimestamp()}));await assertSucceeds(updateDoc(doc(context(caregiver),'bapmunnaHouseholds','h-alert','alerts','help'),{status:'acknowledged',acknowledgedBy:caregiver,acknowledgedAt:serverTimestamp(),updatedAt:serverTimestamp()}));await assertFails(updateDoc(ref,{confirmed:true,updatedAt:serverTimestamp()}));await assertFails(setDoc(doc(db,'bapmunnaHouseholds','h-alert','alerts','fake-sensor'),{...fields,kind:'inactivity',level:'attention'}));});
test('only owner can create and cancel bounded away periods; family cannot read private schedules',async()=>{await seedHome('h-away');const ref=doc(context(homeOwner),'bapmunnaHouseholds','h-away','away','trip'),fields={startsAt:Timestamp.now(),endsAt:Timestamp.fromMillis(Date.now()+3600000),cancelledAt:null,createdAt:serverTimestamp(),sharingEpoch:0};await assertSucceeds(setDoc(ref,fields));await assertFails(getDoc(doc(context(viewer),'bapmunnaHouseholds','h-away','away','trip')));await assertFails(setDoc(doc(context(homeOwner),'bapmunnaHouseholds','h-away','away','invalid'),{...fields,endsAt:Timestamp.fromMillis(Date.now()+8*86400000)}));await assertSucceeds(updateDoc(ref,{cancelledAt:serverTimestamp()}));});
test('consent history and schema manifest cannot be changed by app clients or CRM staff',async()=>{await seedHome('h-history');await assertSucceeds(toggleSharing('h-history',false,1,'event-stop'));await assertFails(updateDoc(doc(context(homeOwner),'bapmunnaHouseholds','h-history','consentEvents','event-stop'),{enabled:true}));await assertFails(getDoc(doc(context('operator'),'bapmunnaHouseholds','h-history','consentEvents','event-stop')));await assertFails(setDoc(doc(context(homeOwner),'bapmunnaSystem','schema'),{version:999}));await assertFails(getDoc(doc(context(homeOwner),'bapmunnaSystem','schema')));});


test('real Firebase adapter pages tied timestamps, batches notes and returns a server-stamped saved note',async()=>{
  const provider=createProvider({projectId,apiKey:'demo-api-key',appId:'demo-crm'}),app=getApp('bapmunna-accounts-v3'),auth=getAuth(app),db=getFirestore(app);
  connectAuthEmulator(auth,`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`,{disableWarnings:true});
  const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');connectFirestoreEmulator(db,host,Number(port));
  try{
    const result=await createUserWithEmailAndPassword(auth,'crm-adapter@example.test','Synthetic-only-936!');
    const response=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-api-key`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer owner'},body:JSON.stringify({localId:result.user.uid,emailVerified:true})});assert.equal(response.ok,true);await reload(result.user);await result.user.getIdToken(true);
    await environment.withSecurityRulesDisabled(async admin=>{const db=admin.firestore(),batch=writeBatch(db),stamp=Timestamp.now();batch.set(doc(db,'bapmunnaStaff',result.user.uid),{role:'owner'});for(let index=0;index<71;index++){const id=`page-test-${String(index).padStart(3,'0')}`;batch.set(doc(db,'bapmunnaCRMContacts',id),{...customerData(id,`${id}@example.test`),createdAt:stamp,updatedAt:stamp,lastLoginAt:stamp});}await batch.commit();});
    assert.equal(await provider.isStaff(),true);
    const first=await provider.listCustomers();assert.equal(first.customers.length,50);assert.equal(first.hasMore,true);
    const second=await provider.listCustomers({cursor:first.nextCursor});assert.equal(second.hasMore,false);
    const all=[...first.customers,...second.customers];assert.equal(new Set(all.map(row=>row.id)).size,all.length);assert.equal(all.filter(row=>row.id.startsWith('page-test-')).length,71);
    const saved=await provider.saveCustomerNote('page-test-000','contacted','  가상 안내 완료  ');assert.equal(saved.stage,'contacted');assert.equal(saved.note,'가상 안내 완료');assert.ok(saved.noteUpdatedAt.toDate() instanceof Date);
    const refreshed=await provider.listCustomers({cursor:first.nextCursor});assert.equal(refreshed.customers.find(row=>row.id==='page-test-000').note,'가상 안내 완료');
  }finally{await deleteApp(app);}
});

test('real Firebase settings adapter binds verified identity, preserves the latest household and rejects signout or wrong expected uid',async()=>{
  const provider=createProvider({projectId,apiKey:'demo-api-key',appId:'demo-preferences'}),app=getApp('bapmunna-accounts-v3'),auth=getAuth(app),db=getFirestore(app);
  const authBase=`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`;
  connectAuthEmulator(auth,authBase,{disableWarnings:true});
  const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');connectFirestoreEmulator(db,host,Number(port));
  try{
    const result=await createUserWithEmailAndPassword(auth,'preferences-adapter@example.test','Synthetic-only-Preference-936!'),uid=result.user.uid;
    const initialHousehold={relation:'mother',alias:'가상 어머니',residentCount:1,hasPet:false};
    await assert.rejects(provider.getAppPreferences(uid),/이메일을 확인한 계정/);
    await assert.rejects(provider.saveAppPreferences(appPreferenceInput(),initialHousehold,uid),/이메일을 확인한 계정/);
    const verified=await fetch(`${authBase}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-api-key`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer owner'},body:JSON.stringify({localId:uid,emailVerified:true})});
    assert.equal(verified.ok,true);await reload(result.user);await result.user.getIdToken(true);
    assert.deepEqual(await provider.getAppPreferences(uid),{settings:null,household:null,revision:{settings:null,household:null}});
    for(const expectedUid of [undefined,'','another-settings-owner']){
      await assert.rejects(provider.getAppPreferences(expectedUid),{code:'auth/user-changed'});
      await assert.rejects(provider.saveAppPreferences(appPreferenceInput(),initialHousehold,expectedUid),{code:'auth/user-changed'});
    }
    assert.equal((await getDocFromServer(appSettingsDoc(db,uid))).exists(),false);
    assert.equal((await getDocFromServer(householdDoc(db,uid))).exists(),false);

    const input=fourMealInput(),saved=await provider.saveAppPreferences(input,initialHousehold,uid);
    assert.deepEqual(saved.settings,input);assert.equal(saved.household.ownerUid,uid);assert.equal(saved.household.alias,initialHousehold.alias);
    assert.ok(saved.household.updatedAt instanceof Timestamp);assert.deepEqual(await provider.getAppPreferences(uid),saved);
    const settingsSnapshot=await getDocFromServer(appSettingsDoc(db,uid));
    assert.equal(settingsSnapshot.metadata.hasPendingWrites,false);assert.ok(settingsSnapshot.data().updatedAt instanceof Timestamp);
    assert.equal(settingsSnapshot.data().windows.length,4);
    assert.match(saved.revision.settings,/^\d+:\d+$/);assert.match(saved.revision.household,/^\d+:\d+$/);

    // A different settings screen updates the single household document after
    // this form opened. Saving meal settings alone must preserve that new value.
    const latestHousehold={relation:'parents',alias:'새로 바꾼 가상 부모님',residentCount:2,hasPet:true};
    const latest=await provider.saveHousehold(latestHousehold,uid);
    const changed={...input,phone:'010-9999-0000',eatOutPerWeek:3};
    const updated=await provider.saveAppPreferences(changed,null,uid);
    assert.deepEqual(updated.settings,changed);
    assert.deepEqual(updated.household,latest);
    assert.ok(updated.household.updatedAt.isEqual(latest.updatedAt));
    assert.deepEqual(await provider.getHousehold(uid),latest);
    assert.deepEqual(await provider.getAppPreferences(uid),updated);
    const storedSettings=(await getDocFromServer(appSettingsDoc(db,uid))).data();
    for(const field of ['household','alias','relation','residentCount','hasPet','seniorConsent'])assert.equal(Object.hasOwn(storedSettings,field),false,`${field} is not duplicated or granted by preparation settings`);

    for(const forged of [{ownerUid:'alice'},{updatedAt:Timestamp.fromMillis(0)},{sharingEnabled:true}]){
      await assert.rejects(provider.saveAppPreferences({...changed,...forged},null,uid),{code:'preferences/invalid-input'});
    }
    for(const [,invalid] of invalidPreferenceChanges())await assert.rejects(provider.saveAppPreferences({...changed,...invalid},null,uid),{code:'preferences/invalid-input'});
    await assert.rejects(provider.saveAppPreferences({...changed,eatOutPerWeek:4},{...latestHousehold,residentCount:7},uid),{code:'household/invalid-input'});
    assert.deepEqual(await provider.getAppPreferences(uid),updated);

    // Rules also reject an invalid atomic batch when a caller bypasses the
    // provider's JS validation; neither settings nor household may half-save.
    const batch=writeBatch(db);
    batch.set(appSettingsDoc(db,uid),appSettingsData(uid,{...changed,eatOutPerWeek:5}));
    batch.set(householdDoc(db,uid),{ownerUid:uid,...latestHousehold,residentCount:7,updatedAt:serverTimestamp()});
    await assertFails(batch.commit());
    assert.deepEqual(await provider.getAppPreferences(uid),updated);

    await provider.signOut();assert.equal(auth.currentUser,null);
    await assert.rejects(provider.getAppPreferences(uid),/이메일을 확인한 계정/);
    await assert.rejects(provider.saveAppPreferences({...changed,eatOutPerWeek:6},initialHousehold,uid),/이메일을 확인한 계정/);
    await environment.withSecurityRulesDisabled(async admin=>{
      const stored=(await getDoc(appSettingsDoc(admin.firestore(),uid))).data();
      assert.equal(stored.eatOutPerWeek,3);assert.equal(stored.phone,changed.phone);
      const household=(await getDoc(householdDoc(admin.firestore(),uid))).data();
      assert.equal(household.alias,latestHousehold.alias);assert.equal(household.residentCount,2);
      assert.equal((await getDoc(doc(admin.firestore(),'bapmunnaHouseholds',uid))).exists(),false);
      assert.equal((await getDoc(doc(admin.firestore(),'bapmunnaCRMContacts',uid))).exists(),false);
    });
  }finally{await deleteApp(app);}
});


test('real settings transactions reject stale tab and household revisions while preserving custom relationship labels',async t=>{
  const config={projectId,apiKey:'demo-api-key',appId:'demo-preferences-conflict'};
  const tabA=createProvider(config),app=getApp('bapmunna-accounts-v3'),auth=getAuth(app),db=getFirestore(app);
  const authBase=`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`;
  connectAuthEmulator(auth,authBase,{disableWarnings:true});
  const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');connectFirestoreEmulator(db,host,Number(port));
  try{
    const result=await createUserWithEmailAndPassword(auth,'preferences-conflict@example.test','Synthetic-only-Conflict-936!'),uid=result.user.uid;
    const verified=await fetch(`${authBase}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-api-key`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer owner'},body:JSON.stringify({localId:uid,emailVerified:true})});
    assert.equal(verified.ok,true);await reload(result.user);await result.user.getIdToken(true);
    // Two independent caller snapshots use the real adapter and Firestore
    // transaction API. This simulates stale tabs; it is not a browser UI test.
    const tabB=createProvider(config),household={relation:'other',alias:'우리 할머니',residentCount:1,hasPet:false};
    const empty=await tabA.getAppPreferences(uid);
    const initial={...fourMealInput(),onboardingStep:3,relationLabel:'할머니'};
    await tabA.saveAppPreferences(initial,household,uid,empty.revision);
    const aOpened=await tabA.getAppPreferences(uid),bOpened=await tabB.getAppPreferences(uid);
    assert.deepEqual(aOpened.revision,bOpened.revision);
    assert.equal(aOpened.settings.relationLabel,'할머니');assert.equal(aOpened.household.relation,'other');
    const changedWindows=aOpened.settings.windows.map(window=>window.slot==='breakfast'?{...window,start:'06:30'}:window);
    const aSaved=await tabA.saveAppPreferences({...aOpened.settings,windows:changedWindows,onboardingStep:8},null,uid,aOpened.revision);
    assert.notEqual(aSaved.revision.settings,aOpened.revision.settings);
    assert.equal(aSaved.revision.household,aOpened.revision.household);

    await t.test('stale alert form cannot overwrite another tab meal windows; refreshed retry preserves them',async()=>{
      const staleAlertInput={...bOpened.settings,onboardingStep:8,missedMealsThreshold:3,fastingHours:54,emergencyHours:78};
      await assert.rejects(tabB.saveAppPreferences(staleAlertInput,null,uid,bOpened.revision),{code:'preferences/conflict'});
      const afterRejected=await tabB.getAppPreferences(uid);
      assert.deepEqual(afterRejected,aSaved);
      const retry=await tabB.saveAppPreferences({...afterRejected.settings,missedMealsThreshold:3,fastingHours:54,emergencyHours:78},null,uid,afterRejected.revision);
      assert.deepEqual(retry.settings.windows,changedWindows);
      assert.equal(retry.settings.missedMealsThreshold,3);assert.equal(retry.settings.fastingHours,54);assert.equal(retry.settings.emergencyHours,78);
      assert.equal(retry.settings.onboardingStep,8);assert.equal(retry.settings.relationLabel,'할머니');
      assert.deepEqual(retry.household,aSaved.household);
      assert.deepEqual(await tabA.getAppPreferences(uid),retry);
    });

    await t.test('stale tutorial step three cannot lower completed onboarding step eight',async()=>{
      const completed=await tabA.getAppPreferences(uid);assert.equal(completed.settings.onboardingStep,8);
      await assert.rejects(tabB.saveAppPreferences({...bOpened.settings,onboardingStep:3},null,uid,bOpened.revision),{code:'preferences/conflict'});
      assert.deepEqual(await tabA.getAppPreferences(uid),completed);
      assert.equal((await getDocFromServer(appSettingsDoc(db,uid))).data().onboardingStep,8);
    });

    await t.test('legacy household edit rejects stale household write atomically but allows settings-only save',async()=>{
      const beforeLegacy=await tabB.getAppPreferences(uid);
      const latestHousehold={relation:'other',alias:'최근에 바꾼 할머니 호칭',residentCount:2,hasPet:true};
      const legacySaved=await tabA.saveHousehold(latestHousehold,uid);
      const afterLegacy=await tabA.getAppPreferences(uid);
      assert.equal(afterLegacy.revision.settings,beforeLegacy.revision.settings);
      assert.notEqual(afterLegacy.revision.household,beforeLegacy.revision.household);
      await assert.rejects(tabB.saveAppPreferences({...beforeLegacy.settings,phone:'010-1111-2222'},household,uid,beforeLegacy.revision),{code:'preferences/conflict'});
      assert.deepEqual(await tabA.getAppPreferences(uid),afterLegacy);
      assert.deepEqual(afterLegacy.household,legacySaved);
      // The stale household revision is intentionally irrelevant when this
      // operation does not write household; it must keep the latest source.
      const saved=await tabB.saveAppPreferences({...beforeLegacy.settings,phone:'010-3333-4444'},null,uid,beforeLegacy.revision);
      assert.deepEqual(saved.household,legacySaved);
      assert.equal(saved.revision.household,afterLegacy.revision.household);
      assert.equal(saved.settings.phone,'010-3333-4444');assert.equal(saved.settings.relationLabel,'할머니');
      assert.deepEqual(saved.settings.windows,changedWindows);
      const fresh=await tabB.getAppPreferences(uid);
      const retried=await tabB.saveAppPreferences({...fresh.settings,phone:'010-5555-6666'},latestHousehold,uid,fresh.revision);
      assert.equal(retried.household.alias,latestHousehold.alias);assert.equal(retried.settings.relationLabel,'할머니');
      assert.deepEqual(await tabA.getAppPreferences(uid),retried);
    });
  }finally{await deleteApp(app);}
});

test('SmartThings secrets and metadata are denied to all browser roles',async()=>{
  const collections=['Connections','Installations','States','Locks','Receipts'].map(kind=>'bapmunnaSmartThings'+kind);
  for(const name of collections){
    await environment.withSecurityRulesDisabled(async admin=>setDoc(doc(admin.firestore(),name,'alice'),{tokens:'synthetic-secret'}));
    for(const db of [environment.unauthenticatedContext().firestore(),context('alice'),context('operator')]){
      await assertFails(getDoc(doc(db,name,'alice')));
      await assertFails(setDoc(doc(db,name,'alice'),{tokens:'forged'}));
      await assertFails(getDocs(collection(db,name)));
    }
  }
});
