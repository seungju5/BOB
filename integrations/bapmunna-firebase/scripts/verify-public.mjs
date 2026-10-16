import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {supabaseConfig} from '../docs/supabase-config.mjs';
const results=[];
for(const [url,type,contains] of [
 ['https://ku-gpa.web.app/bapmunna/','text/html','<base href="/bapmunna/">'],
 ['https://ku-gpa.web.app/bapmunna/manage/','text/html','<base href="/bapmunna/manage/">'],
 ['https://ku-gpa.web.app/bapmunna/supabase/','text/html','<base href="/bapmunna/supabase/">'],
 ['https://ku-gpa.web.app/bapmunna/supabase/manage/','text/html','<base href="/bapmunna/supabase/manage/">'],
 ['https://ku-gpa.web.app/bapmunna/senior/','text/html','name="bapmunna-edition" content="senior"'],
 ['https://ku-gpa.web.app/bapmunna/carer/','text/html','name="bapmunna-edition" content="carer"'],
 ['https://ku-gpa.web.app/bapmunna/supabase/senior/','text/html','name="bapmunna-edition" content="senior"'],
 ['https://ku-gpa.web.app/bapmunna/supabase/carer/','text/html','name="bapmunna-edition" content="carer"'],
 ['https://ku-gpa.web.app/bapmunna/app.mjs','javascript','mountAccount'],
 ['https://ku-gpa.web.app/bapmunna/supabase/cloud-config.mjs','javascript',"provider: 'supabase'"],
 ['https://ku-gpa.web.app/bapmunna/interface.css','text/css','.auth-shell'],
 ['https://ku-gpa.web.app/bapmunna/assets/bunny.png','image/png',null],
 ['https://ku-gpa.web.app/bapmunna/assets/PretendardVariable.woff2','font/woff2',null],
]){
 const response=await fetch(url,{signal:AbortSignal.timeout(20000)});assert.equal(response.status,200,url);assert.ok(response.headers.get('content-type')?.includes(type),`${url} MIME`);if(contains){const body=await response.text();assert.ok(body.includes(contains),`${url} content`);if(type==='text/html'){const relative=new URL(url).pathname.slice('/bapmunna/'.length)+'index.html';const expected=await readFile(new URL('../tmp/firebase-hosting/'+relative,import.meta.url),'utf8');assert.ok(body===expected,`${url} current HTML`);}}else await response.body?.cancel();results.push({url,status:response.status});
}
const headers={apikey:supabaseConfig.publishableKey};
for(const filename of ['app.mjs','editions.mjs','editions.css','interface.css','refinement.css','account-view.mjs','cloud/supabase-provider.mjs','cloud/firebase-provider.mjs','manage/crm.mjs','manage/dashboard.mjs','manage/metrics.mjs','manage/manage.css']){
 for(const base of ['https://ku-gpa.web.app/bapmunna/','https://ku-gpa.web.app/bapmunna/supabase/']){
  const prefix=base.includes('/supabase/')?'supabase/':'';
  const expected=await readFile(new URL('../tmp/firebase-hosting/'+prefix+filename,import.meta.url),'utf8');
  const response=await fetch(base+filename,{signal:AbortSignal.timeout(20000)});assert.equal(response.status,200);assert.ok(await response.text()===expected,`latest deployed ${base+filename}`);
 }
}
const settingsResponse=await fetch(`${supabaseConfig.url}/auth/v1/settings`,{headers});assert.equal(settingsResponse.status,200);const settings=await settingsResponse.json();assert.equal(settings.external.email,true);assert.equal(settings.mailer_autoconfirm,false);
for(const table of ['bapmunna_accounts','bapmunna_meals','bapmunna_crm_contacts','bapmunna_crm_notes','bapmunna_staff','bapmunna_households','bapmunna_memberships','bapmunna_invitations','bapmunna_preferences','bapmunna_devices','bapmunna_device_daily','bapmunna_alerts','bapmunna_away_periods','bapmunna_consent_events','bapmunna_usage_report']){
 const response=await fetch(`${supabaseConfig.url}/rest/v1/${table}?select=*&limit=1`,{headers,signal:AbortSignal.timeout(20000)});assert.ok([401,403].includes(response.status),`${table} anonymous denied`);await response.body?.cancel();results.push({table,anonymousStatus:response.status});
}
for(const scope of ['bapmunnaCRMContacts?mask.fieldPaths=displayName&pageSize=1','bapmunnaHouseholds?pageSize=1','bapmunnaSystem/schema']){
 const response=await fetch('https://firestore.googleapis.com/v1/projects/ku-gpa/databases/(default)/documents/'+scope,{signal:AbortSignal.timeout(20000)});assert.equal(response.status,403);await response.body?.cancel();results.push({firestoreScope:scope,anonymousStatus:403});
}
const baseline=JSON.parse(await readFile(new URL('../tmp/firebase/hosting-baseline.json',import.meta.url),'utf8'));
results.push({preservedNonAppHashes:Object.keys(baseline.hashes).filter(name=>!name.startsWith('/bapmunna/')).length});
const output={checkedAt:new Date().toISOString(),supabaseEmailEnabled:true,supabaseEmailConfirmationRequired:true,results};
await mkdir(new URL('../tmp/proof/',import.meta.url),{recursive:true});await writeFile(new URL('../tmp/proof/public-checks.json',import.meta.url),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));
