import {initializeApp,getApp,getApps} from 'firebase/app';
import {connectAuthEmulator,getAuth,onAuthStateChanged,beforeAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendEmailVerification,sendPasswordResetEmail,updateProfile,signOut,reload,setPersistence,browserLocalPersistence,browserSessionPersistence,GoogleAuthProvider,signInWithPopup,validatePassword,signInWithCustomToken,verifyBeforeUpdateEmail} from 'firebase/auth';
import {connectFirestoreEmulator,getFirestore,doc,getDoc,getDocFromServer,setDoc,updateDoc,deleteDoc,collection,getDocs,query,orderBy,limit,startAfter,documentId,where,onSnapshot,writeBatch,runTransaction,serverTimestamp,Timestamp} from 'firebase/firestore';
import {preferenceFields} from './app-preferences.mjs';
import {CONSENT_VERSION,koreanDay,checkDisplayName,checkMeal,STAGES} from './auth-utils.mjs';
import {createKakaoClient,requestAccountEmail,completeKakaoSession} from './kakao-client.mjs';
import {kakaoConfig} from './kakao-config.mjs';
import emulatorConfig from '../firebase.emulators.json' with {type:'json'};

export function createLocalProvider(){
  const host=globalThis.location?.hostname;
  if(!['localhost','127.0.0.1','[::1]'].includes(host))throw Error('이전 디자인은 로컬 Firebase 에뮬레이터에서 열어 주세요.');
  return createProvider({projectId:'demo-bapmunna',authDomain:'localhost',apiKey:'demo-api-key',appId:'demo-local'},true);
}

export function createProvider(config,local=false){
  if(config?.projectId!=='demo-bapmunna')throw Error('Only the local demo project is supported.');
  const appName='bapmunna-accounts-v3';
  const app=getApps().find(app=>app.name===appName)?getApp(appName):initializeApp(config,appName);
  const auth=getAuth(app),db=getFirestore(app);
  if(local&&!auth.emulatorConfig){
    const {auth:authEmulator,firestore}=emulatorConfig.emulators;
    connectAuthEmulator(auth,`http://${authEmulator.host}:${authEmulator.port}`,{disableWarnings:true});
    connectFirestoreEmulator(db,firestore.host,firestore.port);
  }
  let kakaoClient,kakaoCompletion;
  const kakao=()=>kakaoClient??=createKakaoClient({config:kakaoConfig,storage:{getItem:key=>window.sessionStorage.getItem(key),setItem:(key,value)=>window.sessionStorage.setItem(key,value),removeItem:key=>window.sessionStorage.removeItem(key)},location:window.location,history:window.history,crypto:window.crypto,fetch:window.fetch.bind(window)});
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
  const contactRef=uid=>doc(db,'bapmunnaCRMContacts',uid);
  const remember=value=>setPersistence(auth,value?browserLocalPersistence:browserSessionPersistence);
  const actionSettings={url:new URL('#account',globalThis.location?.href||'http://localhost/').href,handleCodeInApp:false};
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
    if(data.ownerUid!==uid||data.alias!==fields.alias||!(data.updatedAt instanceof Timestamp))throw Error('저장된 가구 정보를 다시 확인해 주세요.');
    return {ownerUid:uid,...fields,updatedAt:data.updatedAt};
  }
  const revisionOf=snapshot=>snapshot.exists()?`${snapshot.data().updatedAt?.seconds}:${snapshot.data().updatedAt?.nanoseconds}`:null;
  const preferencesResult=(settings,household,uid)=>({settings:storedPreferences(settings,uid),household:storedHousehold(household,uid),revision:{settings:revisionOf(settings),household:revisionOf(household)}});
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
    name:'Firebase',supportsGoogle:true,
    kakaoStatus:()=>kakao().available(),
    async kakao(keep){
      await auth.authStateReady();
      if(auth.currentUser)throw Object.assign(Error(),{code:'auth/user-changed'});
      return kakao().begin(keep);
    },
    completeKakaoLogin(fragment,signal){return kakaoCompletion??=completeKakaoSession({auth,client:kakao(),fragment,signal,remember,beforeChange:beforeAuthStateChanged,observe:onAuthStateChanged,signIn:signInWithCustomToken}).then(mapUser);},
    requestEmail(email,expectedUid){return requestAccountEmail({email,expectedUid,currentUser:()=>auth.currentUser,sendVerification:(user,address)=>verifyBeforeUpdateEmail(user,address,actionSettings)});},
    getIdToken(expectedUid){return withHouseholdUser(expectedUid,async(user,assertCurrent)=>{const token=await user.getIdToken();assertCurrent();return token;});},
    onUser(callback){return onAuthStateChanged(auth,user=>callback(mapUser(user)));},
    async signIn(email,password,keep){await remember(keep);const result=await signInWithEmailAndPassword(auth,email.trim(),password);return mapUser(result.user);},
    async signUp(email,password,name,keep){
      const displayName=checkDisplayName(name);if(password.length<8)throw Object.assign(Error(),{code:'auth/weak-password'});
      const policy=await validatePassword(auth,password);if(!policy.isValid)throw Object.assign(Error(),{code:'auth/weak-password'});
      await remember(keep);const result=await createUserWithEmailAndPassword(auth,email.trim(),password);
      await updateProfile(result.user,{displayName});await sendEmailVerification(result.user,actionSettings);return mapUser(result.user);
    },
    async google(keep){await remember(keep);const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});const result=await signInWithPopup(auth,provider);return mapUser(result.user);},
    async resetPassword(email){try{await sendPasswordResetEmail(auth,email.trim(),actionSettings);}catch(error){if(!['auth/user-not-found','auth/invalid-email'].includes(error.code))throw error;}},
    async resendVerification(){if(auth.currentUser&&!auth.currentUser.emailVerified)await sendEmailVerification(auth.currentUser,actionSettings);},
    async refreshUser(){if(auth.currentUser){await reload(auth.currentUser);await auth.currentUser.getIdToken(true);}return mapUser(auth.currentUser);},
    signOut(){
      if(typeof window !== 'undefined') kakao().cancel();
      return signOut(auth);
    },
    async getProfile(){const user=requireUser(),snapshot=await getDoc(profileRef(user.uid));return snapshot.exists()?snapshot.data():null;},
    getAppProfile(expectedUid){return withHouseholdUser(expectedUid,async(user,assertCurrent)=>{const snapshot=await getDocFromServer(profileRef(user.uid));assertCurrent();return snapshot.exists()?snapshot.data():null;});},
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
      });assertCurrent();
      const [settings,storedHome]=await Promise.all([getDocFromServer(settingsRef(user.uid)),getDocFromServer(householdRef(user.uid))]);assertCurrent();
      const stored=storedPreferences(settings,user.uid);if(!stored)throw Error('저장 결과를 확인하지 못했어요.');
      return preferencesResult(settings,storedHome,user.uid);
    });},
    getHousehold(expectedUid){return withHouseholdUser(expectedUid,async(user,assertCurrent)=>{
      const snapshot=await getDocFromServer(householdRef(user.uid));assertCurrent();return storedHousehold(snapshot,user.uid);
    });},
    saveHousehold(input,expectedUid){return withHouseholdUser(expectedUid,async(user,assertCurrent)=>{
      const fields=householdFields(input),ref=householdRef(user.uid);assertCurrent();
      await setDoc(ref,{ownerUid:user.uid,...fields,updatedAt:serverTimestamp()});assertCurrent();
      const snapshot=await getDocFromServer(ref);assertCurrent();
      const stored=storedHousehold(snapshot,user.uid);if(!stored)throw Error('저장 결과를 확인하지 못했어요. 다시 시도해 주세요.');return stored;
    });},
    async saveProfile(name,expectedUid){
      const boundUid=expectedUid??requireUser().uid;
      return withHouseholdUser(boundUid,async(user,assertCurrent)=>{
      const displayName=checkDisplayName(name),existing=await getDoc(profileRef(user.uid)),contact=await getDoc(contactRef(user.uid));
      const fields={ownerUid:user.uid,email:user.email,displayName,consentVersion:CONSENT_VERSION,updatedAt:serverTimestamp()};
      assertCurrent();const batch=writeBatch(db);
      if(existing.exists())batch.update(profileRef(user.uid),fields);else batch.set(profileRef(user.uid),{...fields,createdAt:serverTimestamp()});
      const contactFields={...fields,source:'bapmunna',lastLoginAt:serverTimestamp()};
      if(contact.exists())batch.update(contactRef(user.uid),contactFields);else batch.set(contactRef(user.uid),{...contactFields,createdAt:serverTimestamp()});
      await batch.commit();assertCurrent();
      });
    },
    async touchLogin(){const user=requireUser();const ref=contactRef(user.uid),snapshot=await getDoc(ref);if(snapshot.exists())await updateDoc(ref,{lastLoginAt:serverTimestamp(),updatedAt:serverTimestamp()});},
    watchMeals(callback,onError){const user=requireUser();return onSnapshot(query(collection(db,'bapmunnaAccounts',user.uid,'meals'),orderBy('day','desc'),limit(90)),snapshot=>callback(snapshot.docs.map(item=>({id:item.id,...item.data()}))),onError);},
    async saveMeal(slot,kind){
      const user=requireUser();checkMeal(slot,kind);const day=koreanDay(),ref=doc(db,'bapmunnaAccounts',user.uid,'meals',`${day}_${slot}`),snapshot=await getDoc(ref);
      const fields={ownerUid:user.uid,day,meal:slot,kind,dayStart:Timestamp.fromDate(new Date(`${day}T00:00:00+09:00`)),updatedAt:serverTimestamp()};
      if(snapshot.exists())await updateDoc(ref,fields);else await setDoc(ref,{...fields,createdAt:serverTimestamp()});
    },
    async removeMeal(id){const user=requireUser();if(!/^\d{4}-\d{2}-\d{2}_(breakfast|lunch|dinner)$/.test(id))throw Error('기록을 확인해 주세요.');await deleteDoc(doc(db,'bapmunnaAccounts',user.uid,'meals',id));},
    async isStaff(){const user=requireUser(),snapshot=await getDoc(doc(db,'bapmunnaStaff',user.uid));return snapshot.exists()&&['owner','manager'].includes(snapshot.data().role);},
    async listCustomers({cursor=null}={}){
      requireUser();
      const constraints=[orderBy('createdAt','desc'),orderBy(documentId(),'desc')];
      if(cursor)constraints.push(startAfter(cursor));
      const snapshot=await getDocs(query(collection(db,'bapmunnaCRMContacts'),...constraints,limit(51)));
      const rows=snapshot.docs.slice(0,50),notes=new Map();
      for(let index=0;index<rows.length;index+=25){
        const ids=rows.slice(index,index+25).map(item=>item.id);
        const page=await getDocs(query(collection(db,'bapmunnaCRMNotes'),where(documentId(),'in',ids)));
        page.forEach(item=>notes.set(item.id,item.data()));
      }
      return {customers:rows.map(item=>{const note=notes.get(item.id);return {id:item.id,...item.data(),stage:note?.stage||'new',note:note?.note||'',noteUpdatedAt:note?.updatedAt||null};}),hasMore:snapshot.docs.length>50,nextCursor:rows.at(-1)||null};
    },
    async saveCustomerNote(uid,stage,note){
      const user=requireUser();if(!Object.hasOwn(STAGES,stage)||String(note).length>1000)throw Error('운영 단계와 1,000자 이내의 메모를 확인해 주세요.');
      const ref=doc(db,'bapmunnaCRMNotes',uid);
      await setDoc(ref,{ownerUid:uid,stage,note:String(note).trim(),updatedBy:user.uid,updatedAt:serverTimestamp()});
      const stored=(await getDoc(ref)).data();return {stage:stored.stage,note:stored.note,noteUpdatedAt:stored.updatedAt};
    },
  };
}
