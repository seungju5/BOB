// Explicit office maintenance only. Credentials are read by the existing Firebase CLI,
// kept in memory, and never written to a web asset or a report.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
export const root=fileURLToPath(new URL('../../../',import.meta.url));
export const project='impact-series',number='634921658163',site='impact-series';
const sdkRoot=path.join(root,'integrations/bapmunna-firebase');
const require=createRequire(path.join(sdkRoot,'package.json'));
const auth=require('firebase-tools/lib/auth');
const options={project,projectRoot:sdkRoot,nonInteractive:true};
const account=auth.getProjectDefaultAccount(sdkRoot);
if(!account)throw Error('Firebase CLI sign-in required.');
auth.setActiveAccount(options,account);await require('firebase-tools/lib/requireAuth').requireAuth(options);
export const Client=require('firebase-tools/lib/apiv2').Client;
export const quiet=()=>({skipLog:{body:true,resBody:true}});
export const api=(origin,version)=>new Client({urlPrefix:origin,apiVersion:version,auth:true});
export const evidence=path.join(root,'tmp/super-members');
export async function save(name,data){await mkdir(evidence,{recursive:true});await writeFile(path.join(evidence,name),JSON.stringify(data,null,2)+'\n');}
export async function assertFree(){const billing=(await api('https://cloudbilling.googleapis.com','v1').get(`/projects/${project}/billingInfo`,quiet())).body;if(billing.billingEnabled||billing.billingAccountName)throw Error('Stop: this task requires an unlinked Spark/free project.');return {project,billingEnabled:false};}
export async function poll(client,operation){let value=operation;for(let i=0;i<40&&!value.done;i++){await new Promise(r=>setTimeout(r,1500));value=(await client.get('/'+value.name,quiet())).body;}if(!value.done||value.error)throw Error('Cloud operation incomplete: '+JSON.stringify(value.error||{name:value.name}));return value.response;}
export async function setup(){
 await assertFree();
 const usage=api('https://serviceusage.googleapis.com','v1');
 const serviceIds=['firebasevertexai.googleapis.com','generativelanguage.googleapis.com','firebaseappcheck.googleapis.com','recaptchaenterprise.googleapis.com'];
 const operation=(await usage.post(`/projects/${number}/services:batchEnable`,{serviceIds},quiet())).body;
 await poll(usage,operation);
 console.log('Free-tier AI Logic and App Check services enabled.');
 const management=api('https://firebase.googleapis.com','v1beta1');
 const apps=(await management.get(`/projects/${project}/webApps`,quiet())).body.apps||[];
 let app=apps.find(a=>a.displayName==='Warming Up Super Members');
 if(!app){const op=(await management.post(`/projects/${project}/webApps`,{displayName:'Warming Up Super Members'},quiet())).body;app=await poll(management,op);}
 const sdk=(await management.get(`/projects/${project}/webApps/${app.appId}/config`,quiet())).body;
 const captcha=api('https://recaptchaenterprise.googleapis.com','v1');
 const keys=(await captcha.get(`/projects/${project}/keys`,quiet())).body.keys||[];
 let key=keys.find(k=>k.displayName==='Super Members web');
 if(!key)key=(await captcha.post(`/projects/${project}/keys`,{displayName:'Super Members web',webSettings:{allowedDomains:['impact-series.web.app','impact-series.firebaseapp.com'],integrationType:'SCORE'}},quiet())).body;
 const siteKey=key.name.split('/').at(-1);
 const check=api('https://firebaseappcheck.googleapis.com','v1');
 const provider=(await check.patch(`/projects/${number}/apps/${app.appId}/recaptchaEnterpriseConfig`,{siteKey,riskAnalysis:{minValidScore:0.5},tokenTtl:'3600s'},{queryParams:{updateMask:'siteKey,riskAnalysis.minValidScore,tokenTtl'},...quiet()})).body;
 const service=(await check.patch(`/projects/${number}/services/firebaseml.googleapis.com`,{enforcementMode:'ENFORCED'},{queryParams:{updateMask:'enforcementMode'},...quiet()})).body;
 const config={firebase:Object.fromEntries(['apiKey','authDomain','projectId','appId','messagingSenderId'].filter(k=>sdk[k]).map(k=>[k,sdk[k]])),recaptchaSiteKey:siteKey,model:'gemini-3.5-flash-lite',allowedHosts:['impact-series.web.app','impact-series.firebaseapp.com']};
 await writeFile(path.join(root,'workspaces/super-members/firebase-config.mjs'),'// Public browser identifiers only. No Gemini API key or administrator secret.\nexport const officeConfig = '+JSON.stringify(config,null,2)+';\n');
 const receipt={at:new Date().toISOString(),...await assertFree(),appId:app.appId,model:config.model,services:serviceIds,appCheck:service.enforcementMode,allowedDomains:key.webSettings.allowedDomains,providerRegistered:provider.siteKey===siteKey};
 await save('setup.json',receipt);console.log(JSON.stringify(receipt,null,2));
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(process.argv[2]!=='setup')throw Error('Use setup explicitly. No billing changes are supported.');
 await setup();
}
