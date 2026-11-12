import {initializeApp,getApp,getApps} from 'firebase/app';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendEmailVerification,sendPasswordResetEmail,updateProfile,signOut,reload,setPersistence,browserLocalPersistence,browserSessionPersistence,GoogleAuthProvider,signInWithPopup,validatePassword} from 'firebase/auth';
import {getFirestore,doc,getDoc,setDoc,updateDoc,deleteDoc,collection,getDocs,query,orderBy,limit,startAfter,documentId,where,onSnapshot,writeBatch,serverTimestamp,Timestamp} from 'firebase/firestore';
import {CONSENT_VERSION,koreanDay,checkDisplayName,checkMeal,STAGES} from './auth-utils.mjs';

export function createProvider(config){
  const appName='bapmunna-accounts-v3';
  const app=getApps().find(app=>app.name===appName)?getApp(appName):initializeApp(config,appName);
  const auth=getAuth(app),db=getFirestore(app);
  const mapUser=user=>user?{uid:user.uid,email:user.email||'',displayName:user.displayName||'',verified:user.emailVerified}:null;
  const requireUser=()=>{const user=auth.currentUser;if(!user?.emailVerified)throw Error('이메일을 확인한 계정으로 로그인해 주세요.');return user;};
  const profileRef=uid=>doc(db,'bapmunnaAccounts',uid);
  const contactRef=uid=>doc(db,'bapmunnaCRMContacts',uid);
  const remember=value=>setPersistence(auth,value?browserLocalPersistence:browserSessionPersistence);
  const actionSettings={url:'https://impact-series.web.app/bapmunna/#account',handleCodeInApp:false};
  return {
    name:'Firebase',supportsGoogle:true,
    getIdToken:()=>requireUser().getIdToken(),
    onUser(callback){return onAuthStateChanged(auth,user=>callback(mapUser(user)));},
    async signIn(email,password,keep){await remember(keep);await signInWithEmailAndPassword(auth,email.trim(),password);},
    async signUp(email,password,name,keep){
      const displayName=checkDisplayName(name);if(password.length<8)throw Object.assign(Error(),{code:'auth/weak-password'});
      const policy=await validatePassword(auth,password);if(!policy.isValid)throw Object.assign(Error(),{code:'auth/weak-password'});
      await remember(keep);const result=await createUserWithEmailAndPassword(auth,email.trim(),password);
      await updateProfile(result.user,{displayName});await sendEmailVerification(result.user,actionSettings);
    },
    async google(keep){await remember(keep);const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});await signInWithPopup(auth,provider);},
    async resetPassword(email){try{await sendPasswordResetEmail(auth,email.trim(),actionSettings);}catch(error){if(!['auth/user-not-found','auth/invalid-email'].includes(error.code))throw error;}},
    async resendVerification(){if(auth.currentUser&&!auth.currentUser.emailVerified)await sendEmailVerification(auth.currentUser,actionSettings);},
    async refreshUser(){if(auth.currentUser){await reload(auth.currentUser);await auth.currentUser.getIdToken(true);}return mapUser(auth.currentUser);},
    signOut:()=>signOut(auth),
    async getProfile(){const user=requireUser(),snapshot=await getDoc(profileRef(user.uid));return snapshot.exists()?snapshot.data():null;},
    async saveProfile(name){
      const user=requireUser(),displayName=checkDisplayName(name),existing=await getDoc(profileRef(user.uid)),contact=await getDoc(contactRef(user.uid));
      const fields={ownerUid:user.uid,email:user.email,displayName,consentVersion:CONSENT_VERSION,updatedAt:serverTimestamp()};
      const batch=writeBatch(db);
      if(existing.exists())batch.update(profileRef(user.uid),fields);else batch.set(profileRef(user.uid),{...fields,createdAt:serverTimestamp()});
      const contactFields={...fields,source:'bapmunna',lastLoginAt:serverTimestamp()};
      if(contact.exists())batch.update(contactRef(user.uid),contactFields);else batch.set(contactRef(user.uid),{...contactFields,createdAt:serverTimestamp()});
      await batch.commit();
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
