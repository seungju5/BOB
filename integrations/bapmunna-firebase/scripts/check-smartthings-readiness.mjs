// Read-only preflight. No billing, deployment, OAuth grant, or device commands.
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {readConfig} from '../server/security.mjs';
import {configured} from '../server/service.mjs';

const root=new URL('../',import.meta.url);
const json=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
const offline=process.argv.includes('--offline');
const [plan,manifest,evidence,rewrite]=await Promise.all([
  json('server/deployment-config.json'),json('server/app-registration.json'),
  json('server/registration-status.json'),json('server/hosting-rewrite.example.json'),
]);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const match=plan.appId===evidence.appId&&manifest.appName===evidence.appName
  &&same(plan.scope,manifest.oauth.scope)&&same(plan.scope,evidence.scope)
  &&same([plan.redirectUri],manifest.oauth.redirectUris)&&same([plan.redirectUri],evidence.redirectUris)
  &&plan.webhookUrl===manifest.apiOnly.targetUrl&&plan.webhookUrl===evidence.targetUrl
  &&new URL(plan.appUrl).origin===plan.publicOrigin
  &&plan.redirectUri===plan.publicOrigin+'/api/smartthings/callback'
  &&plan.webhookUrl===plan.publicOrigin+'/api/smartthings/events'
  &&rewrite.rewrites[0].source==='/api/smartthings/**'
  &&rewrite.rewrites[0].run.serviceId===plan.serviceId
  &&rewrite.rewrites[0].run.region===plan.region;
if(!match||plan.billing.automaticUpgrade!==false||plan.billing.explicitApprovalRequired!==true){
  console.error('Registration/deployment settings differ. Review before proceeding.');process.exit(1);
}

let localSecretsReady=false,privateFilePermissions=false;
try{
  const folder='tmp/smartthings-private/';
  const [saved,key,secret,files]=await Promise.all([
    json(folder+'registration-result.json'),readFile(new URL(folder+'encryption-key',root),'utf8'),
    readFile(new URL(folder+'client-secret',root),'utf8'),
    Promise.all(['registration-result.json','encryption-key','client-secret'].map(name=>stat(new URL(folder+name,root)))),
  ]);
  privateFilePermissions=files.every(file=>(file.mode&0o077)===0);
  const config=readConfig({FIREBASE_PROJECT_ID:plan.projectId,APP_URL:plan.appUrl,PUBLIC_ORIGIN:plan.publicOrigin,
    SMARTTHINGS_APP_ID:plan.appId,SMARTTHINGS_CLIENT_ID:saved.oauthClientId,
    SMARTTHINGS_CLIENT_SECRET:secret.trim(),SMARTTHINGS_ENCRYPTION_KEY:key.trim(),SMARTTHINGS_OAUTH_PREFIX:plan.oauthPrefix});
  localSecretsReady=configured(config)&&saved.app?.appId===plan.appId
    &&secret.trim()===saved.oauthClientSecret&&privateFilePermissions;
}catch{/* Missing private files require the app owner; never print their contents. */}

const endpoints=[];
if(!offline){
  // Only unauthenticated GETs. Registration and billing are not mutated.
  for(const route of ['config','callback']){
    const url=plan.publicOrigin+'/api/smartthings/'+route;
    try{
      const result=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(10000)});
      let enabled=null;
      if(route==='config'&&result.headers.get('content-type')?.includes('application/json')){
        const body=await result.json();enabled=body?.enabled===true;
      }
      endpoints.push({path:new URL(url).pathname,method:'GET',status:result.status,...(route==='config'?{enabled}:{})});
    }catch{endpoints.push({path:new URL(url).pathname,method:'GET',status:null,error:'endpoint_unavailable'});}
  }
}
console.log(JSON.stringify({
  checkedAt:new Date().toISOString(),mode:offline?'offline':'public_endpoint_check',
  registration:{source:'saved_official_cli_readback',checkedAt:evidence.checkedAt,matchesManifest:match,
    redirectUri:plan.redirectUri,webhookUrl:plan.webhookUrl,scope:plan.scope,targetStatus:evidence.targetStatus},
  localSecretsReady,privateFilePermissions,preparedSettingsFile:fileURLToPath(new URL('server/deployment-config.json',root)),
  endpoints,billingSnapshot:{source:'saved_google_api_readback',checkedAt:evidence.checkedAt,...evidence.firebase},
  deploymentPerformed:false,billingChanged:false,
  nextStep:'Owner approval is required before billing activation. Then deploy, confirm webhook, and verify real OAuth/events.',
},null,2));
