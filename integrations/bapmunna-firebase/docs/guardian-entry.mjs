// Keep old shared/QR URLs useful while the complete guardian flow lives in /app.
// This changes navigation only; the same Firebase session is used by that app.
export function guardianAppTarget({basePath,edition,view,search='',cloud=false,demo=false}){
  if(!cloud||demo||basePath!=='/bapmunna/'||edition!=='carer')return null;
  const query=new URLSearchParams(search);
  if(['code','state','flow','error','oobCode','mode'].some(key=>query.has(key)))return null;
  const routes={welcome:'',guardian:'start/',account:'login/',report:'records/',settings:'settings/',more:'more/',alerts:'alerts/',setup:'onboarding/',journey:'tutorial/',tutorial:'tutorial/',devices:'settings/#device'};
  return Object.hasOwn(routes,view)?`/bapmunna/app/${routes[view]}`:null;
}
