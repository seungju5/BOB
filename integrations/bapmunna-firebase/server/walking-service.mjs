import {WalkingError,WALKING_PREFIX,WALKING_CONSENT,WALKING_ZONE,NATIVE_ORIGINS,nickname,exactFields,requireShare,syncInput,randomCode,randomToken,validDeviceToken,networkKey,requestJson,hash} from './walking-security.mjs';

const baseHeaders={'Cache-Control':'no-store','Pragma':'no-cache','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'};
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{...baseHeaders,'Content-Type':'application/json; charset=utf-8',...headers}});
const methods=Object.freeze({config:'GET',profile:'GET',join:'POST',leave:'POST',pairing:'POST',pair:'POST',confirm:'POST',unpair:'POST',sync:'POST',board:'GET'});
const nativePaths=new Set(['pair','confirm','unpair','sync','board']);
const webPaths=new Set(['profile','join','leave','pairing','board']);

export function createWalkingService({config,ready=false,store,auth,rateSecret='',now=()=>Date.now()}){
  async function verifyAccount(uid,authTime){
    if(typeof uid!=='string'||uid.length<1||uid.length>128||!Number.isInteger(authTime)||authTime<0)throw new WalkingError(401,'login_required');
    let current;
    try{current=await auth.getUser(uid);}catch(error){if(error?.code==='auth/user-not-found')throw new WalkingError(401,'login_required');throw error;}
    const validAfter=Date.parse(current.tokensValidAfterTime||'1970-01-01T00:00:00Z');
    if(current.uid!==uid||current.disabled||!current.emailVerified||!Number.isFinite(validAfter)||authTime*1000<validAfter)throw new WalkingError(401,'login_required');
  }
  const bearer=request=>{
    const value=request.headers.get('authorization')||'';
    if(value.length>16384||!/^Bearer [A-Za-z0-9._~-]+$/.test(value))throw new WalkingError(401,'login_required');
    return value.slice(7);
  };
  async function user(request){
    const token=bearer(request);if(validDeviceToken(token))throw new WalkingError(401,'login_required');
    let claims;
    try{claims=await auth.verifyIdToken(token,true);}catch(error){
      if(/^auth\/(?:id-token-expired|id-token-revoked|invalid-id-token|argument-error|invalid-argument|user-disabled|user-not-found)$/.test(error?.code||''))throw new WalkingError(401,'login_required');
      throw error;
    }
    if(claims?.email_verified!==true||claims?.firebase?.sign_in_provider==='anonymous')throw new WalkingError(401,'login_required');
    await verifyAccount(claims.uid,claims.auth_time);return claims;
  }
  async function device(request,{pending=false}={}){
    const token=bearer(request);if(!validDeviceToken(token))throw new WalkingError(401,'device_expired');
    const identity=await store.deviceIdentity(token,{pending});await verifyAccount(identity.uid,identity.authTime);
    return token;
  }
  async function limit(key,count=120,windowMs=600000){await store.rateLimit([{key,limit:count,windowMs}]);}

  async function route(request,path,origin){
    if(path==='config')return json({enabled:ready,consentVersion:WALKING_CONSENT,timeZone:WALKING_ZONE});
    if(!ready)throw new WalkingError(503,'setup_required');
    const native=NATIVE_ORIGINS.includes(origin);
    if(native&&!nativePaths.has(path)||!native&&!webPaths.has(path))throw new WalkingError(403,'invalid_origin');
    const body=request.method==='POST'?await requestJson(request):null;
    if(path==='pair'){
      exactFields(body,['code']);if(typeof body.code!=='string'||!/^\d{8}$/.test(body.code))throw new WalkingError(400,'invalid_pairing_code');
      const time=now();
      await store.rateLimit([{key:'pair-global:'+Math.floor(time/86400000),limit:1000,windowMs:86400000},{key:'pair-network:'+networkKey(request,rateSecret,time),limit:30,windowMs:600000}]);
      return json(await store.pair(body.code,randomToken(),verifyAccount));
    }
    if(path==='unpair'){
      exactFields(body,[]);const token=bearer(request);
      if(!validDeviceToken(token))throw new WalkingError(401,'device_expired');
      // Revocation must still work after a login, consent or token expires.
      // It only deletes this opaque token's link and returns no private data.
      await limit('unpair:'+networkKey(request,rateSecret,now()),60);
      return json(await store.unpair(token));
    }
    if(native){
      const token=await device(request,{pending:path==='confirm'});
      await limit('device:'+hash(token));
      if(path==='confirm'){exactFields(body,['consentVersion','shareTodaySteps']);requireShare(body);return json(await store.confirm(token));}
      if(path==='sync')return json(await store.sync(token,syncInput(body,now())));
      if(path==='board')return json(await store.board({token}));
    }
    const claims=await user(request),uid=claims.uid;
    await limit('user:'+hash(uid));
    if(path==='profile')return json(await store.profile(uid));
    if(path==='join'){
      exactFields(body,['nickname','consentVersion','shareTodaySteps']);requireShare(body);
      return json(await store.join(uid,nickname(body.nickname)));
    }
    if(path==='leave'){exactFields(body,[]);return json(await store.leave(uid));}
    if(path==='pairing'){
      exactFields(body,[]);await limit('pairing:'+hash(uid),10,3600000);
      for(let attempts=0;attempts<3;attempts++){
        try{return json(await store.issuePairing(uid,claims.auth_time,randomCode()));}
        catch(error){if(error?.code!=='pairing_collision')throw error;}
      }
      throw new WalkingError(503,'temporarily_unavailable');
    }
    if(path==='board')return json(await store.board({uid}));
    throw new WalkingError(404,'not_found');
  }
  return async request=>{
    let cors={};
    try{
      const url=new URL(request.url),path=url.pathname.slice(WALKING_PREFIX.length+1),origin=request.headers.get('origin');
      if(url.origin!==config.origin||!url.pathname.startsWith(WALKING_PREFIX+'/')||url.search||url.href.length>512)throw new WalkingError(400,'invalid_request');
      if(!Object.hasOwn(methods,path))throw new WalkingError(404,'not_found');
      const allowed=origin===config.webOrigin||NATIVE_ORIGINS.includes(origin);
      if(origin&&!allowed||path!=='config'&&!allowed)throw new WalkingError(403,'invalid_origin');
      if(allowed)cors={'Access-Control-Allow-Origin':origin,Vary:'Origin'};
      if(request.method==='OPTIONS'){
        const headers=(request.headers.get('access-control-request-headers')||'').split(',').map(value=>value.trim().toLowerCase()).filter(Boolean);
        if(!allowed||request.headers.get('access-control-request-method')!==methods[path]||headers.some(value=>!['authorization','content-type'].includes(value)))throw new WalkingError(403,'invalid_origin');
        if(path!=='config'&&(NATIVE_ORIGINS.includes(origin)?!nativePaths.has(path):!webPaths.has(path)))throw new WalkingError(403,'invalid_origin');
        return new Response(null,{status:204,headers:{...baseHeaders,...cors,'Access-Control-Allow-Methods':methods[path],'Access-Control-Allow-Headers':'Authorization, Content-Type'}});
      }
      if(request.method!==methods[path])return json({error:'method_not_allowed'},405,{...cors,Allow:methods[path]});
      const response=await route(request,path,origin);for(const [key,value]of Object.entries(cors))response.headers.set(key,value);return response;
    }catch(error){
      return json({error:error instanceof WalkingError?error.code:'temporarily_unavailable'},error instanceof WalkingError?error.status:503,cors);
    }
  };
}
