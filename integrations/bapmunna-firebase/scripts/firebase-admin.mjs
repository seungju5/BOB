// Explicit maintenance commands for the user's existing KU GPA project.
// CLI credentials remain in memory. No tokens, passwords or account exports are written.
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir,readdir,cp} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import path from 'node:path';
const require=createRequire(import.meta.url);
const firebaseCliAuth=require('firebase-tools/lib/auth');
const {requireAuth}=require('firebase-tools/lib/requireAuth');
const {Client}=require('firebase-tools/lib/apiv2');
const root=path.resolve(import.meta.dirname,'..');
const project='ku-gpa',site='ku-gpa',mode=process.argv[2]||'inspect';
const options={project,projectRoot:root,nonInteractive:true};
const account=firebaseCliAuth.getProjectDefaultAccount(root);
if(!account)throw Error('Sign into the Firebase CLI first.');
firebaseCliAuth.setActiveAccount(options,account);await requireAuth(options);
// Firebase CLI mutates each options object; never reuse one across requests.
const quiet=()=>({skipLog:{body:true,resBody:true}});
const hosting=new Client({urlPrefix:'https://firebasehosting.googleapis.com',apiVersion:'v1beta1',auth:true});
const management=new Client({urlPrefix:'https://firebase.googleapis.com',apiVersion:'v1beta1',auth:true});
const rulesApi=new Client({urlPrefix:'https://firebaserules.googleapis.com',apiVersion:'v1',auth:true});
const identity=new Client({urlPrefix:'https://identitytoolkit.googleapis.com',auth:true});
const firestoreApi=new Client({urlPrefix:'https://firestore.googleapis.com',apiVersion:'v1',auth:true});
const evidence=path.join(root,'tmp/firebase');await mkdir(evidence,{recursive:true});
const writeJSON=(name,data)=>writeFile(path.join(evidence,name),JSON.stringify(data,null,2)+'\n');
const readJSON=async name=>JSON.parse(await readFile(path.join(evidence,name),'utf8'));
const currentHosting=async()=> (await hosting.get(`/sites/${site}/releases`,{queryParams:{pageSize:1},...quiet()})).body.releases[0];
const currentRules=async()=> (await rulesApi.get(`/projects/${project}/releases/cloud.firestore`,quiet())).body;
async function hostingFiles(version){
  let token;const files={};
  do{const response=(await hosting.get('/'+version+'/files',{queryParams:{pageSize:1000,...(token?{pageToken:token}:{})},...quiet()})).body;for(const file of response.files||[])files[file.path]=file.hash;token=response.nextPageToken;}while(token);
  return files;
}
if(mode==='inspect'){
  const release=await currentHosting(),hashes=await hostingFiles(release.version.name),rulesRelease=await currentRules();
  const ruleset=(await rulesApi.get('/'+rulesRelease.rulesetName,quiet())).body;
  const authConfig=(await identity.get(`/admin/v2/projects/${project}/config`,quiet())).body;
  const apps=(await management.get(`/projects/${project}/webApps`,quiet())).body.apps||[];
  if(!apps.length)throw Error('No registered Firebase web app found.');
  const selected=apps.find(app=>app.state==='ACTIVE')||apps[0];
  const sdk=(await management.get(`/${selected.name}/config`,quiet())).body;
  if(sdk.projectId!==project)throw Error('Unexpected Firebase SDK project.');
  const publicConfig=Object.fromEntries(['apiKey','authDomain','projectId','appId'].map(key=>[key,sdk[key]]));
  await writeJSON('hosting-baseline.json',{release,hashes});
  await writeJSON('rules-baseline.json',{release:rulesRelease,ruleset});
  await writeJSON('auth-baseline.json',authConfig);
  await writeFile(path.join(root,'docs/firebase-config.mjs'),`// Public Firebase web configuration, not an administrator credential.\nexport const firebaseConfig=${JSON.stringify(publicConfig,null,2)};\n`);
  console.log(JSON.stringify({project,site,hostingVersion:release.version.name,existingFiles:Object.keys(hashes).length,ruleset:rulesRelease.rulesetName,emailAuth:authConfig.signIn?.email||null,passwordPolicy:authConfig.passwordPolicyConfig||null,domains:authConfig.authorizedDomains,webApps:apps.map(app=>({appId:app.appId,displayName:app.displayName})),sdkConfigured:true},null,2));
}else if(mode==='prepare-rules'){
  const baseline=await readJSON('rules-baseline.json');
  const files=baseline.ruleset.source.files;
  if(files.length!==1)throw Error('Inspect multiple rules sources before merging.');
  const fragment=(await Promise.all(['bapmunna.rules','care-domain.rules'].map(name=>readFile(path.join(root,'firebase',name),'utf8')))).join('\n');
  let source=files[0].content;
  source=source.replace(/\n\s*\/\/ BEGIN BAPMUNNA ACCOUNT V3[\s\S]*?\/\/ END BAPMUNNA ACCOUNT V3\n/,'\n');
  source=source.replace(/\n\s*\/\/ BEGIN BAPMUNNA CARE DOMAIN[\s\S]*?\/\/ END BAPMUNNA CARE DOMAIN\n/,'\n');
  const marker=source.lastIndexOf('    match /{document=**}');
  if(marker<0)throw Error('The expected deny-all boundary was not found; do not replace existing rules.');
  source=source.slice(0,marker)+fragment+'\n'+source.slice(marker);
  await writeJSON('merged-rules.json',{files:[{name:files[0].name,content:source}]});
  await writeFile(path.join(evidence,'merged.rules'),source);
  console.log('Merged Bapmunna account, CRM and care-domain namespaces; existing source retained.');
}else if(mode==='test-rules'){
  const source=await readJSON('merged-rules.json');
  const result=(await rulesApi.post(`/projects/${project}:test`,{source},quiet())).body;
  await writeJSON('rules-test-result.json',result);
  const failures=(result.testResults||[]).map((test,index)=>({index,state:test.state,errors:test.error?.message||null})).filter(test=>test.state!=='SUCCESS');
  console.log(JSON.stringify({issues:result.issues||[],tests:result.testResults?.length||0,passed:result.testResults?.filter(test=>test.state==='SUCCESS').length||0,failures},null,2));
  if(result.issues?.some(issue=>issue.severity==='ERROR')||failures.length)process.exitCode=1;
}else if(mode==='publish-rules'){
  const verified=await readJSON('rules-test-result.json');
  const proof=await readJSON('emulator-proof.json');
  const sourceBytes=await readFile(path.join(evidence,'merged.rules'));
  if(!proof.tests||proof.tests!==proof.passed||proof.sourceHash!==createHash('sha256').update(sourceBytes).digest('hex')||verified.issues?.some(issue=>issue.severity==='ERROR'))throw Error('The exact rules must pass their compiler and emulator checks first.');
  const baseline=await readJSON('rules-baseline.json');
  if((await currentRules()).rulesetName!==baseline.release.rulesetName)throw Error('Live rules changed. Inspect and merge again.');
  const source=await readJSON('merged-rules.json');
  const ruleset=(await rulesApi.post(`/projects/${project}/rulesets`,{source},quiet())).body;
  const release=(await rulesApi.patch(`/projects/${project}/releases/cloud.firestore`,{release:{name:`projects/${project}/releases/cloud.firestore`,rulesetName:ruleset.name}},quiet())).body;
  await writeJSON('rules-release.json',release);console.log(JSON.stringify({ruleset:ruleset.name,released:true}));
}else if(mode==='configure-auth'){
  const before=(await identity.get(`/admin/v2/projects/${project}/config`,quiet())).body;
  await writeJSON('auth-before-enable.json',before);
  const result=(await identity.patch(`/admin/v2/projects/${project}/config`,{signIn:{email:{enabled:true,passwordRequired:true}}},{queryParams:{updateMask:'signIn.email.enabled,signIn.email.passwordRequired'},...quiet()})).body;
  console.log(JSON.stringify({project,emailPasswordEnabled:result.signIn?.email?.enabled===true&&result.signIn?.email?.passwordRequired===true,existingDomainsPreserved:JSON.stringify(result.authorizedDomains)===JSON.stringify(before.authorizedDomains)}));
}else if(mode==='bootstrap-staff'){
  const ownerEmail=account.user?.email;
  if(!ownerEmail)throw Error('The Firebase CLI owner account could not be identified.');
  const lookup=(await identity.post(`/v1/projects/${project}/accounts:lookup`,{email:[ownerEmail]},quiet())).body;
  const owner=lookup.users?.find(user=>user.email===ownerEmail&&user.emailVerified);
  if(!owner){console.log(JSON.stringify({staffGranted:false,reason:'The Firebase project owner must first sign in to this app with a verified account.'}));process.exitCode=2;}
  else{
    const fields={role:{stringValue:'owner'},grantedBy:{stringValue:'firebase-project-owner'},createdAt:{timestampValue:new Date().toISOString()}};
    await firestoreApi.patch(`/projects/${project}/databases/(default)/documents/bapmunnaStaff/${owner.localId}`,{fields},quiet());
    console.log(JSON.stringify({staffGranted:true,ownerUid:owner.localId,ownerEmail}));
  }
}else if(mode==='verify-release'){
  const expectedHosting=await readJSON('hosting-release.json'),expectedRules=await readJSON('rules-release.json');
  const liveHosting=await currentHosting(),liveRules=await currentRules();
  if(liveHosting.version.name!==expectedHosting.version||liveRules.rulesetName!==expectedRules.rulesetName)throw Error('The live release changed after verification. Reconcile before reporting completion.');
  console.log(JSON.stringify({hostingVersion:liveHosting.version.name,ruleset:liveRules.rulesetName,expectedReleaseStillLive:true}));
}else if(mode==='provision-schema'){
  const manifestBytes=await readFile(path.join(root,'firebase/schema.json'));
  const manifest=JSON.parse(manifestBytes);
  if(manifest.projectId!==project)throw Error('Unexpected schema target.');
  const expected=JSON.parse(await readFile(path.join(root,'firebase/firestore.indexes.json'),'utf8')).indexes;
  const signature=index=>JSON.stringify({queryScope:index.queryScope,fields:index.fields.filter(field=>field.fieldPath!=='__name__')});
  const indexResults=[];
  for(const index of expected){
    const endpoint=`/projects/${project}/databases/(default)/collectionGroups/${index.collectionGroup}/indexes`;
    let pageToken;const existing=[];
    do{const page=(await firestoreApi.get(endpoint,{queryParams:pageToken?{pageToken}:{},...quiet()})).body;existing.push(...(page.indexes||[]));pageToken=page.nextPageToken;}while(pageToken);
    const found=existing.find(item=>signature(item)===signature(index));
    if(found)indexResults.push({collectionGroup:index.collectionGroup,state:found.state,created:false});
    else{const {collectionGroup,...definition}=index;const operation=(await firestoreApi.post(endpoint,definition,quiet())).body;indexResults.push({collectionGroup,state:operation.done?'READY':'BUILDING',created:true,operation:operation.name});}
  }
  const fields={version:{stringValue:manifest.version},manifestSha256:{stringValue:createHash('sha256').update(manifestBytes).digest('hex')},schemaJSON:{stringValue:JSON.stringify(manifest)},provisionedAt:{timestampValue:new Date().toISOString()}};
  await firestoreApi.patch(`/projects/${project}/databases/(default)/documents/bapmunnaSystem/schema`,{fields},quiet());
  const stored=(await firestoreApi.get(`/projects/${project}/databases/(default)/documents/bapmunnaSystem/schema`,quiet())).body;
  if(stored.fields?.manifestSha256?.stringValue!==fields.manifestSha256.stringValue)throw Error('Schema manifest verification failed.');
  const result={project,manifestVersion:manifest.version,contracts:manifest.collections.length,manifestVerified:true,customerRowsSeeded:0,indexes:indexResults};
  await writeJSON('schema-provision.json',result);console.log(JSON.stringify(result,null,2));
}else if(mode==='publish-hosting'){
  const baseline=await readJSON('hosting-baseline.json'),before=await currentHosting();
  const stageProof=await readJSON('stage-proof.json');
  if(before.version.name!==baseline.release.version.name)throw Error('Hosting changed. Inspect again before publishing.');
  const hashMap=Object.fromEntries(Object.entries(baseline.hashes).filter(([name])=>!name.startsWith('/bapmunna/'))),blobs=new Map();
  async function walk(directory,prefix){for(const entry of await readdir(directory,{withFileTypes:true})){const filename=path.join(directory,entry.name),url=prefix+'/'+entry.name;if(entry.isDirectory())await walk(filename,url);else{const raw=await readFile(filename);if(stageProof.files[path.relative(path.join(root,'tmp/firebase-hosting'),filename)]!==createHash('sha256').update(raw).digest('hex'))throw Error('A staged file changed after verification. Build again before publishing.');const data=gzipSync(raw,{level:9}),hash=createHash('sha256').update(data).digest('hex');hashMap[url]=hash;blobs.set(hash,data);}}}
  await walk(path.join(root,'tmp/firebase-hosting'),'/bapmunna');
  const config=structuredClone(before.version.config||{});
  const appHeaders={'Cache-Control':'no-cache, no-store, must-revalidate','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'};
  config.headers=[...(config.headers||[]).filter(header=>!['/bapmunna','/bapmunna/**'].includes(header.glob)),{glob:'/bapmunna',headers:appHeaders},{glob:'/bapmunna/**',headers:appHeaders}];
  const version=(await hosting.post(`/sites/${site}/versions`,{config},quiet())).body;
  let uploads=0;const entries=Object.entries(hashMap);
  for(let i=0;i<entries.length;i+=1000){const populated=(await hosting.post('/'+version.name+':populateFiles',{files:Object.fromEntries(entries.slice(i,i+1000))},quiet())).body;
    for(const hash of populated.uploadRequiredHashes||[]){const data=blobs.get(hash);if(!data)throw Error('An existing production blob is unavailable. No release was made.');const url=new URL(populated.uploadUrl+'/'+hash);await new Client({urlPrefix:url.origin,auth:true}).post(url.pathname,data,{headers:{'Content-Type':'application/octet-stream'},...quiet()});uploads++;}}
  await hosting.patch('/'+version.name,{status:'FINALIZED'},{queryParams:{updateMask:'status'},...quiet()});
  const staged=await hostingFiles(version.name);
  for(const [name,hash]of Object.entries(baseline.hashes))if(!name.startsWith('/bapmunna/')&&staged[name]!==hash)throw Error('An unrelated path changed. No release was made.');
  if((await currentHosting()).version.name!==before.version.name)throw Error('Another deployment appeared. No release was made.');
  const release=(await hosting.post(`/sites/${site}/releases`,{message:'Bapmunna Figma upgrade, account data and separate CRM'},{queryParams:{versionName:version.name},...quiet()})).body;
  const evidenceData={url:'https://ku-gpa.web.app/bapmunna/',crmUrl:'https://ku-gpa.web.app/bapmunna/manage/',release:release.name,version:version.name,uploads,preservedPaths:Object.keys(baseline.hashes).filter(name=>!name.startsWith('/bapmunna/')).length};
  await writeJSON('hosting-release.json',evidenceData);console.log(JSON.stringify(evidenceData,null,2));
}else throw Error('Unknown maintenance command.');
