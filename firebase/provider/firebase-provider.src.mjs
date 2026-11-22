import {initializeApp,getApp,getApps} from 'firebase/app';
import {getAuth,onAuthStateChanged,beforeAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendEmailVerification,sendPasswordResetEmail,updateProfile,signOut,reload,setPersistence,browserLocalPersistence,browserSessionPersistence,GoogleAuthProvider,signInWithPopup,signInWithCustomToken,verifyBeforeUpdateEmail} from 'firebase/auth';
import {getFirestore,doc,getDocFromServer,runTransaction,serverTimestamp,Timestamp} from 'firebase/firestore';
import {createStudio} from './studio.mjs';
import {preferenceFields} from './app-preferences.mjs';
import {CONSENT_VERSION,checkDisplayName} from './auth-utils.mjs';
import {createKakaoClient,requestAccountEmail,completeKakaoSession} from './kakao-client.mjs';

export function createProvider(config, {googleEnabled = false, kakaoEnabled = false, configureClients} = {}){
  const appName='warming-up-'+config.projectId;
  const app=getApps().find(app=>app.name===appName)?getApp(appName):initializeApp(config,appName);
  if (app.options.projectId !== config.projectId || app.options.appId !== config.appId) throw Error('워크스페이스의 Firebase 앱을 확인해 주세요.');
  const auth=getAuth(app),db=getFirestore(app);
  configureClients?.(auth, db);
  auth.languageCode='ko';
  let kakaoClient,kakaoCompletion;
  const kakao=()=>kakaoClient??=createKakaoClient({config:{enabled:kakaoEnabled,apiOrigin:window.location.origin},storage:{getItem:key=>window.sessionStorage.getItem(key),setItem:(key,value)=>window.sessionStorage.setItem(key,value),removeItem:key=>window.sessionStorage.removeItem(key)},location:window.location,history:window.history,crypto:window.crypto,fetch:window.fetch.bind(window)});
  const mapUser=user=>user?{uid:user.uid,email:user.email||'',displayName:user.displayName||'',verified:user.emailVerified}:null;
  const requireUser=()=>{const user=auth.currentUser;if(!user?.emailVerified)throw Error('이메일을 확인한 계정으로 로그인해 주세요.');return user;};
  const profileRef=uid=>doc(db,'bapmunnaAccounts',uid);
  const householdRef=uid=>doc(db,'bapmunnaAccounts',uid,'preferences','household');
  const settingsRef=uid=>doc(db,'bapmunnaAccounts',uid,'preferences','settings');
  function storedPreferences(snapshot,uid){
    if(!snapshot.exists())return null;
    const {ownerUid,updatedAt,...fields}=snapshot.data();
    if(ownerUid!==uid||!(updatedAt instanceof Timestamp)||snapshot.metadata.hasPendingWrites)throw Error('서버 저장 결과를 다시 확인해 주세요.');
    return preferenceFields(fields);
  }
  const remember=value=>setPersistence(auth,value?browserLocalPersistence:browserSessionPersistence);
  const actionSettings={url:new URL('/login/',window.location.origin).href,handleCodeInApp:false};
  function householdFields(input){
    const fields=['relation','alias','residentCount','hasPet'];
    if(!input||typeof input!=='object'||Object.keys(input).length!==fields.length||!fields.every(key=>Object.hasOwn(input,key))
      ||!['mother','father','parents','other'].includes(input.relation)||typeof input.alias!=='string'
      ||!input.alias.trim()||input.alias.trim().length>30||!Number.isInteger(input.residentCount)
      ||input.residentCount<1||input.residentCount>6||typeof input.hasPet!=='boolean'){
      throw Object.assign(Error('관계, 1~30자의 호칭, 함께 사는 인원과 반려동물 여부를 확인해 주세요.'),{code:'household/invalid-input'});
    }
    return {relation:input.relation,alias:input.alias.trim(),residentCount:input.residentCount,hasPet:input.hasPet};
  }
  function storedHousehold(snapshot,uid){
    if(!snapshot.exists())return null;
    const data=snapshot.data();
    const fields=householdFields({relation:data.relation,alias:data.alias,residentCount:data.residentCount,hasPet:data.hasPet});
    if(data.ownerUid!==uid||data.alias!==fields.alias||!(data.updatedAt instanceof Timestamp)||snapshot.metadata.hasPendingWrites)throw Error('저장된 가구 정보를 다시 확인해 주세요.');
    return {ownerUid:uid,...fields,updatedAt:data.updatedAt};
  }
  function confirmedTime(snapshot) {
    if (!snapshot.exists()) return null;
    const stamp = snapshot.get('updatedAt');
    return stamp instanceof Timestamp && !snapshot.metadata.hasPendingWrites ? stamp : null;
  }
  function revisionOf(snapshot) {
    const stamp = confirmedTime(snapshot);
    return stamp ? stamp.seconds + ':' + stamp.nanoseconds : null;
  }
  const savedAt = snapshot => confirmedTime(snapshot)?.toDate().toISOString() ?? null;
  const preferencesResult = (settings, household, uid) => ({
    settings: storedPreferences(settings,uid), household: storedHousehold(household,uid),
    revision: {settings:revisionOf(settings), household:revisionOf(household)},
    savedAt: {settings:savedAt(settings), household:savedAt(household)},
  });
  async function withHouseholdUser(expectedUid,run){
    const user=requireUser();let changed=false,unsubscribe;
    const assertCurrent=()=>{
      if(typeof expectedUid!=='string'||!expectedUid||user.uid!==expectedUid||changed||auth.currentUser!==user||!auth.currentUser?.emailVerified)throw Object.assign(Error('계정이 바뀌었어요. 다시 확인해 주세요.'),{code:'auth/user-changed'});
    };
    try{
      // The UI's last observed identity may lag behind currentUser. Bind the
      // request to that explicit identity before any observer or database I/O.
      assertCurrent();
      // Keep this operation bound to its starting session, including A → B → A.
      unsubscribe=onAuthStateChanged(auth,current=>{if(current!==user||!current?.emailVerified)changed=true;});
      assertCurrent();return await run(user,assertCurrent);
    }finally{unsubscribe?.();}
  }
  return {
    name:'Firebase',
    studio:createStudio(db,auth),
    kakaoStatus:()=>kakao().available(),
    async kakao(keep){
      await auth.authStateReady();
      if(auth.currentUser)throw Object.assign(Error(),{code:'auth/user-changed'});
      return kakao().begin(keep);
    },
    completeKakaoLogin(fragment,signal){return kakaoCompletion??=completeKakaoSession({auth,client:kakao(),fragment,signal,remember,beforeChange:beforeAuthStateChanged,observe:onAuthStateChanged,signIn:signInWithCustomToken}).then(mapUser);},
    requestEmail(email,expectedUid){return requestAccountEmail({email,expectedUid,currentUser:()=>auth.currentUser,sendVerification:(user,address)=>verifyBeforeUpdateEmail(user,address,actionSettings)});},
    getIdToken(expectedUid,forceRefresh=false){return withHouseholdUser(expectedUid,async(user,assertCurrent)=>{
      const token=await user.getIdToken(forceRefresh);
      assertCurrent();
      return token;
    });},
    onUser(callback){return onAuthStateChanged(auth,user=>callback(mapUser(user)));},
    async signIn(email,password,keep){await remember(keep);const result=await signInWithEmailAndPassword(auth,email.trim(),password);return mapUser(result.user);},
    async signUp(email,password,name,keep){
      const displayName=checkDisplayName(name);if(password.length<8)throw Object.assign(Error(),{code:'auth/weak-password'});
      // The Auth signup request enforces the project password policy.
      await remember(keep);const result=await createUserWithEmailAndPassword(auth,email.trim(),password);
      await updateProfile(result.user,{displayName});await sendEmailVerification(result.user,actionSettings);return mapUser(result.user);
    },
    async google(keep){if(!googleEnabled)throw Object.assign(Error(),{code:'auth/operation-not-allowed'});await remember(keep);const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});const result=await signInWithPopup(auth,provider);return mapUser(result.user);},
    async resetPassword(email){try{await sendPasswordResetEmail(auth,email.trim(),actionSettings);}catch(error){if(!['auth/user-not-found','auth/invalid-email'].includes(error.code))throw error;}},
    async resendVerification(){if(auth.currentUser&&!auth.currentUser.emailVerified)await sendEmailVerification(auth.currentUser,actionSettings);},
    async refreshUser(){if(auth.currentUser){await reload(auth.currentUser);await auth.currentUser.getIdToken(true);}return mapUser(auth.currentUser);},
    signOut:()=>{kakao().cancel();return signOut(auth);},
    getAppProfile(expectedUid){return withHouseholdUser(expectedUid,async(user,assertCurrent)=>{
      const snapshot = await getDocFromServer(profileRef(user.uid));
      assertCurrent();
      if (!snapshot.exists()) return null;
      const profile = snapshot.data();
      if (profile.ownerUid !== user.uid || snapshot.metadata.hasPendingWrites) throw Error('서버에서 내 프로필을 다시 확인해 주세요.');
      return {...profile, savedAt:savedAt(snapshot), revision:revisionOf(snapshot)};
    });},
    getAppPreferences(expectedUid){return withHouseholdUser(expectedUid,async(user,assertCurrent)=>{
      const [settings,household]=await Promise.all([getDocFromServer(settingsRef(user.uid)),getDocFromServer(householdRef(user.uid))]);assertCurrent();
      return preferencesResult(settings,household,user.uid);
    });},
    saveAppPreferences(input,householdInput,expectedUid,expectedRevision){return withHouseholdUser(expectedUid,async(user,assertCurrent)=>{
      const fields=preferenceFields(input),household=householdInput?householdFields(householdInput):null;
      await runTransaction(db,async transaction=>{
        const existingSettings=await transaction.get(settingsRef(user.uid));
        const existingHousehold=household?await transaction.get(householdRef(user.uid)):null;assertCurrent();
        if(expectedRevision&&(revisionOf(existingSettings)!==expectedRevision.settings||(existingHousehold&&revisionOf(existingHousehold)!==expectedRevision.household)))throw Object.assign(Error('다른 화면에서 설정이 바뀌었어요.'),{code:'preferences/conflict'});
        transaction.set(settingsRef(user.uid),{ownerUid:user.uid,...fields,onboardingStep:existingSettings.exists()&&existingSettings.data().onboardingStep===8?8:fields.onboardingStep,updatedAt:serverTimestamp()});
        if(household)transaction.set(householdRef(user.uid),{ownerUid:user.uid,...household,updatedAt:serverTimestamp()});
        transaction.set(doc(db,'bapmunnaStorageStatus',user.uid),{settingsAt:serverTimestamp(),...(household && {householdAt:serverTimestamp()})},{merge:true});
      });assertCurrent();
      const [settings,storedHome]=await Promise.all([getDocFromServer(settingsRef(user.uid)),getDocFromServer(householdRef(user.uid))]);assertCurrent();
      const stored=storedPreferences(settings,user.uid);if(!stored)throw Error('저장 결과를 확인하지 못했어요.');
      return preferencesResult(settings,storedHome,user.uid);
    });},
    saveProfile(name,expectedUid,expectedRevision){
      return withHouseholdUser(expectedUid,async(user,assertCurrent)=>{
        const displayName=checkDisplayName(name);
        const ref=profileRef(user.uid);
        await runTransaction(db,async transaction=>{
          const existing=await transaction.get(ref);
          assertCurrent();
          if (expectedRevision !== undefined && (!existing.exists() || existing.data().consentVersion !== CONSENT_VERSION || revisionOf(existing) !== expectedRevision)) {
            throw Object.assign(Error('서버에서 최근 이름을 다시 확인해 주세요.'), {code:'profile/conflict'});
          }
          const fields={ownerUid:user.uid,email:user.email,displayName,consentVersion:CONSENT_VERSION,updatedAt:serverTimestamp()};
          if(existing.exists())transaction.update(ref,fields);
          else transaction.set(ref,{...fields,createdAt:serverTimestamp()});
        });
        assertCurrent();
      });
    },
  };
}
