import test from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,collection,getDoc,getDocs,setDoc,updateDoc,deleteDoc} from 'firebase/firestore';

test('Firestore rules deny direct wallet, photo, group and device access even to owner or CRM staff',{skip:!process.env.FIRESTORE_EMULATOR_HOST},async()=>{
  if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Only local demo emulators are allowed.');
  // Load the maintained rule fragments for the integration's heart collections.
  const fragments=['bapmunna.rules','care-domain.rules'].map(name=>readFileSync(new URL('../../firebase/'+name,import.meta.url),'utf8')).join('\n');
  const environment=await initializeTestEnvironment({projectId:'demo-bapmunna-hearts',firestore:{rules:`rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { ${fragments} } }`}});
  const paths=['bapmunnaSystem/walking/Hearts/owner','bapmunnaSystem/walking/HeartMessages/photo','bapmunnaSystem/walking/HeartGroups/week','bapmunnaSystem/walking/Devices/device'];
  try{
    await environment.withSecurityRulesDisabled(async context=>{
      const db=context.firestore();await setDoc(doc(db,'bapmunnaStaff/operator'),{role:'owner'});
      for(const path of paths)await setDoc(doc(db,path),{ownerUid:'owner',balance:5,photo:'not-public'});
    });
    const contexts=[environment.unauthenticatedContext(),environment.authenticatedContext('owner',{email_verified:true}),environment.authenticatedContext('other',{email_verified:true}),environment.authenticatedContext('operator',{email_verified:true})];
    for(const context of contexts){
      const db=context.firestore();
      for(const path of paths){
        const ref=doc(db,path);await assertFails(getDoc(ref));await assertFails(updateDoc(ref,{balance:999}));await assertFails(deleteDoc(ref));
      }
      await assertFails(getDocs(collection(db,'bapmunnaSystem/walking/HeartMessages')));
      await assertFails(setDoc(doc(db,'bapmunnaSystem/walking/Hearts/new-wallet'),{balance:999}));
    }
  }finally{
    await environment.withSecurityRulesDisabled(async context=>{const db=context.firestore();for(const path of [...paths,'bapmunnaStaff/operator'])await deleteDoc(doc(db,path));});
    await environment.cleanup();
  }
});
