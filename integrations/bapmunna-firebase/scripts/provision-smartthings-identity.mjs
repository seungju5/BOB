// Explicit infrastructure operation; the default only prints the reviewable plan.
// No user CLI credential is exported to the runtime. No billing API is mutated.
import {readFile,writeFile,mkdir,chmod,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const project='ku-gpa',accountId='bapmunna-smartthings';
const email=`${accountId}@${project}.iam.gserviceaccount.com`,roleName=`projects/${project}/roles/bapmunnaSmartThingsRuntime`;
const permissions=['datastore.databases.get','datastore.databases.getMetadata','datastore.entities.create','datastore.entities.delete','datastore.entities.get','datastore.entities.list','datastore.entities.update','firebaseauth.users.get'];
const directory=path.join(root,'tmp/smartthings-live-20261114'),keyFile=path.join(directory,'service-account.json');
const plan={project,serviceAccount:email,role:roleName,permissions,billingChanges:false,accountManagement:false,deviceControl:false,privateKeyDestination:keyFile,publicKeyOrSecretOutput:false};
if(process.argv[2]!=='apply'){
  console.log(JSON.stringify({mode:'plan',...plan},null,2));
}else{
  const {api,quiet}=await import('../../../workspaces/super-members/scripts/cloud-admin.mjs');
  const iam=api('https://iam.googleapis.com','v1'),manager=api('https://cloudresourcemanager.googleapis.com','v1');
  const read=async(resource)=>{try{return (await iam.get(resource,quiet())).body;}catch(error){if(error.status===404)return null;throw error;}};
  try{
    for(const id of [project,'impact-series']){
      const billing=(await api('https://cloudbilling.googleapis.com','v1').get(`/projects/${id}/billingInfo`,quiet())).body;
      if(billing.billingEnabled||billing.billingAccountName)throw Error('Free-plan guard failed.');
    }
    await mkdir(directory,{recursive:true,mode:0o700});await chmod(directory,0o700);
    const accountPath=`/projects/${project}/serviceAccounts/${email}`;
    let account=await read(accountPath);
    if(!account)account=(await iam.post(`/projects/${project}/serviceAccounts`,{accountId,serviceAccount:{displayName:'Bapmunna SmartThings runtime'}},quiet())).body;
    if(account.disabled)throw Error('Dedicated runtime account is disabled.');
    let role=await read('/'+roleName);
    if(!role)role=(await iam.post(`/projects/${project}/roles`,{roleId:'bapmunnaSmartThingsRuntime',role:{title:'Bapmunna SmartThings runtime',description:'Read verified Firebase account status and transact SmartThings connection records.',includedPermissions:permissions,stage:'GA'}},quiet())).body;
    if(JSON.stringify([...role.includedPermissions].sort())!==JSON.stringify([...permissions].sort())||role.deleted)throw Error('Existing role differs; review required.');
    const policy=(await manager.post(`/projects/${project}:getIamPolicy`,{options:{requestedPolicyVersion:3}},quiet())).body;
    const snapshot=path.join(directory,`iam-before-${Date.now()}.json`);
    await writeFile(snapshot,JSON.stringify(policy,null,2)+'\n',{mode:0o600,flag:'wx'});
    policy.bindings??=[];
    const member='serviceAccount:'+email;
    if(policy.bindings.some(x=>x.members?.includes(member)&&(x.role!==roleName||x.condition)))throw Error('Existing service account has additional or conditional project roles; review required.');
    let binding=policy.bindings.find(x=>x.role===roleName&&!x.condition);
    if(!binding){binding={role:roleName,members:[]};policy.bindings.push(binding);}
    if(!binding.members.includes(member)){
      binding.members.push(member);
      await manager.post(`/projects/${project}:setIamPolicy`,{policy},quiet());
    }
    let exists=true;try{await access(keyFile);}catch{exists=false;}
    if(!exists){
      const keys=(await iam.get(`${accountPath}/keys`,{queryParams:{keyTypes:'USER_MANAGED'},...quiet()})).body.keys||[];
      if(keys.some(x=>!x.disabled))throw Error('A runtime key already exists; do not generate a duplicate.');
      const key=(await iam.post(`${accountPath}/keys`,{privateKeyType:'TYPE_GOOGLE_CREDENTIALS_FILE',keyAlgorithm:'KEY_ALG_RSA_2048'},quiet())).body;
      // Recovery metadata has no private material. If the following write fails,
      // revoke this exact newly-created key before attempting another creation.
      await writeFile(path.join(directory,`generated-key-${Date.now()}.json`),JSON.stringify({name:key.name,createdAt:new Date().toISOString()},null,2)+'\n',{mode:0o600,flag:'wx'});
      const bytes=Buffer.from(key.privateKeyData,'base64'),value=JSON.parse(bytes.toString('utf8'));
      if(value.project_id!==project||value.client_email!==email)throw Error('Unexpected generated credential.');
      await writeFile(keyFile,bytes,{mode:0o600,flag:'wx'});
    }
    await chmod(keyFile,0o600);
    const value=JSON.parse(await readFile(keyFile,'utf8'));
    if(value.project_id!==project||value.client_email!==email)throw Error('Unexpected saved runtime credential.');
    const savedKeys=(await iam.get(`${accountPath}/keys`,{queryParams:{keyTypes:'USER_MANAGED'},...quiet()})).body.keys||[];
    if(!savedKeys.some(x=>x.name.endsWith('/keys/'+value.private_key_id)&&!x.disabled&&Date.parse(x.validAfterTime)<=Date.now()&&Date.parse(x.validBeforeTime)>Date.now()))throw Error('Saved credential is not an active remote key.');
    console.log(JSON.stringify({ready:true,project,serviceAccount:email,role:roleName,keySavedPrivately:true,billingEnabled:false}));
  }catch{
    console.error('Dedicated runtime identity setup is incomplete. Inspect account/role metadata without printing the private credential. No billing change was attempted.');process.exitCode=1;
  }
}
