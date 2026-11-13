// Pure deployment checks. This module never calls an API or enables billing.
export const serverBuildFiles=Object.freeze([
  'Dockerfile','.dockerignore','package.json','package-lock.json',
  'index.mjs','security.mjs','service.mjs','smartthings.mjs','store.mjs',
]);

export function validateDeploymentTargets(plan,{firebaseProjectId,hostingSiteName}={}){
  if(plan.schemaVersion!==2)throw Error('Explicit hosting/runtime/data project settings are required.');
  if(plan.projectId!==firebaseProjectId)throw Error('Deployment must preserve the existing Firebase account and data project.');
  if(plan.hostingProjectId!=='impact-series'||plan.runtimeProjectId!==plan.hostingProjectId||plan.secretsProjectId!==plan.runtimeProjectId)throw Error('The Cloud Run service and secrets must target the actual Hosting project.');
  if(plan.hostingSite!=='impact-series'||(hostingSiteName&&hostingSiteName!=='projects/634921658163/sites/impact-series'))throw Error('Unexpected live Hosting site owner.');
  if(plan.publicOrigin!=='https://impact-series.web.app'||plan.redirectUri!==plan.publicOrigin+'/api/smartthings/callback'||plan.webhookUrl!==plan.publicOrigin+'/api/smartthings/events'||new URL(plan.appUrl).origin!==plan.publicOrigin)throw Error('Preserve the registered public origin and callback paths.');
  if(JSON.stringify(plan.scope)!==JSON.stringify(['r:devices:*']))throw Error('Only the approved read-only Samsung scope is allowed.');
  if(plan.billing?.automaticUpgrade!==false||plan.billing?.explicitApprovalRequired!==true||plan.billing?.budgetIsHardCap!==false)throw Error('Billing must remain a separate explicit owner decision.');
  if(JSON.stringify(plan.billing.requiredProjects)!==JSON.stringify([plan.runtimeProjectId,plan.projectId]))throw Error('Runtime and Firestore TTL billing requirements must both be disclosed.');
  return {
    hostingProjectId:plan.hostingProjectId,runtimeProjectId:plan.runtimeProjectId,
    firebaseProjectId:plan.projectId,secretsProjectId:plan.secretsProjectId,
    service:plan.serviceId,region:plan.region,
    runtimeServiceAccount:`${plan.serviceId}@${plan.runtimeProjectId}.iam.gserviceaccount.com`,
    billingRequiredFor:[...plan.billing.requiredProjects],
    dataMigration:false,
  };
}
