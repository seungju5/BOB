import {ApiError,hash,random,identifier,equal,vault} from './security.mjs';
import {safeDevice,readingSummary} from './smartthings.mjs';

const PREFIX='/api/smartthings';
export const CONSENT='smartthings-status-2026-11-03';
export const configured=config=>Boolean(config.appId&&config.clientId&&config.secret&&config.projectId&&Buffer.from(config.key||'','base64').length===32);
const response=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer',...headers}});
const publicConnection=current=>!current?{stage:'disconnected'}:{stage:current.stage,device:current.deviceId?{id:current.deviceId,label:current.deviceLabel}:null,connectedAt:current.connectedAt,lastSignalAt:current.lastSignalAt||null,lastReceivedAt:current.lastReceivedAt||null,lastCheckedAt:current.lastCheckedAt||null,hasPower:current.hasPower??null};

// Dependencies are injected so authorization and OAuth can be tested without
// contacting a real household, sending email, or changing a production database.
export function createService({config,store,verifyUser,verifyAccount=async()=>{},smartthings,verifyWebhook,now=()=>Date.now()}){
  const ready=configured(config),secrets=ready?vault(config.key):null;
  // Firebase Hosting forwards only __session to Cloud Run. Restrict this nonce
  // cookie to the integration path so it does not replace an app-wide session.
  const cookieName='__session';
  const cookie=(value,age)=>`${cookieName}=${value}; Path=${PREFIX}; HttpOnly; SameSite=Lax; Max-Age=${age}${config.secure?'; Secure':''}`;
  const landing=result=>{const url=new URL(config.appUrl);url.searchParams.set('smartthings',result);url.hash='connect';return url.href;};
  async function user(request){
    const match=/^Bearer ([A-Za-z0-9._-]+)$/.exec(request.headers.get('authorization')||'');
    if(!match)throw new ApiError(401,'login_required');
    let claims;try{claims=await verifyUser(match[1]);}catch{throw new ApiError(401,'login_required');}
    if(!claims?.uid||claims.email_verified!==true)throw new ApiError(403,'verified_email_required');
    return {uid:claims.uid,authTime:claims.auth_time};
  }
  async function json(request){
    if(!request.headers.get('content-type')?.startsWith('application/json'))throw new ApiError(415,'invalid_request');
    const text=await request.text();if(text.length>16384)throw new ApiError(413,'request_too_large');
    try{return JSON.parse(text);}catch{throw new ApiError(400,'invalid_request');}
  }
  function tokenBundle(data,previous){
    if(typeof data.access_token!=='string'||!data.access_token||typeof data.refresh_token!=='string'||!data.refresh_token||!Number.isFinite(Number(data.expires_in))||Number(data.expires_in)<=0)throw new ApiError(502,'reconnect_required');
    if(data.installed_app_id&&previous&&data.installed_app_id!==previous)throw new ApiError(502,'reconnect_required');
    return {access:data.access_token,refresh:data.refresh_token,expiresAt:now()+Number(data.expires_in)*1000};
  }
  async function authorized(uid,operation){
    // The lease spans refresh AND the API call. Refresh tokens are single use.
    return store.withLease(uid,async()=>{
      let current=await store.get(uid);
      if(!current||current.stage==='reconnect_required')throw new ApiError(409,'reconnect_required');
      let tokens=secrets.open(current.tokens,`${uid}:${current.installId}`);
      async function refresh(){
        try{
          tokens=tokenBundle(await smartthings.refresh(tokens.refresh),current.installId);
          current=await store.patch(uid,{tokens:secrets.seal(tokens,`${uid}:${current.installId}`)});
        }catch(error){await store.patch(uid,{stage:'reconnect_required'});throw new ApiError(409,'reconnect_required');}
      }
      if(tokens.expiresAt<now()+30000)await refresh();
      try{return await operation(current,tokens.access);}
      catch(error){
        if(error.code!=='reconnect_required')throw error;
        await refresh();
        try{return await operation(current,tokens.access);}catch(retry){
          if(retry.code==='reconnect_required')await store.patch(uid,{stage:'reconnect_required'});
          throw retry;
        }
      }
    });
  }
  async function webhook(request,url){
    const raw=Buffer.from(await request.arrayBuffer());
    if(raw.length>1048576)throw new ApiError(413,'request_too_large');
    await verifyWebhook({headers:request.headers,method:request.method,path:url.pathname+url.search,raw});
    let message;try{message=JSON.parse(raw);}catch{throw new ApiError(400,'invalid_request');}
    if(message.messageType==='CONFIRMATION'){
      if(message.confirmationData?.appId!==config.appId)throw new ApiError(400,'invalid_confirmation');
      await smartthings.confirm(message.confirmationData.confirmationUrl);return response({ok:true});
    }
    if(message.messageType!=='EVENT')throw new ApiError(400,'unsupported_event');
    const data=message.eventData,installId=data?.installedApp?.installedAppId;
    if(!identifier(installId)||!Array.isArray(data.events)||data.events.length>100)throw new ApiError(400,'invalid_event');
    const owner=await store.installation(installId);if(!owner)return response({ok:true});
    for(const event of data.events){
      const lifecycle=event.installedAppLifecycleEvent;
      if(event.eventType==='INSTALLED_APP_LIFECYCLE_EVENT'&&lifecycle?.lifecycle==='DELETE'&&lifecycle.installedAppId===installId&&lifecycle.appId===config.appId){
        await store.withLease(owner.uid,()=>store.remove(owner.uid,installId));continue;
      }
      const device=event.deviceEvent,time=Date.parse(event.eventTime);
      if(event.eventType!=='DEVICE_EVENT'||!identifier(device?.eventId)||!identifier(device?.deviceId)||!Number.isFinite(time)||time>now()+60000)continue;
      const power=device.capability==='powerMeter'&&device.attribute==='power';
      const energy=(device.capability==='energyMeter'&&device.attribute==='energy')||device.capability==='powerConsumptionReport';
      if(!power&&!energy)continue;
      // Only signal arrival metadata is retained; never a raw power time series.
      await store.receive(owner.uid,installId,{id:device.eventId,deviceId:device.deviceId,time,kind:power?'power':'energy'});
    }
    return response({ok:true});
  }
  const handle=async request=>{
    const url=new URL(request.url),path=url.pathname.slice(PREFIX.length);
    try{
      if(!url.pathname.startsWith(PREFIX+'/'))throw new ApiError(404,'not_found');
      if(path==='/config'&&request.method==='GET')return response({enabled:ready,consentVersion:CONSENT,appOrigins:config.appOrigins||[],returnUrl:config.returnUrl||config.appUrl});
      if(!ready)throw new ApiError(503,'setup_required');
      if(path==='/events'&&request.method==='POST')return await webhook(request,url);
      if(path==='/callback'&&request.method==='GET'){
        const state=url.searchParams.get('state'),code=url.searchParams.get('code');
        const browserNonce=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
        if(!identifier(state)||!identifier(browserNonce))throw new ApiError(400,'invalid_state');
        const pending=await store.consumeState(state,hash(browserNonce));
        let outcome='connected';
        if(url.searchParams.has('error'))outcome='cancelled';
        else try{
          if(!code||code.length>2048)throw new ApiError(400,'invalid_request');
          await store.withLease(pending.uid,async()=>{
            await verifyAccount(pending.uid,pending.authTime);
            const data=await smartthings.exchange(code),installId=data.installed_app_id;
            if(!identifier(installId))throw new ApiError(502,'reconnect_required');
            const old=await store.get(pending.uid);
            // Reauthorization may replace an expired grant, but must not silently
            // orphan an active subscription from a different installation.
            if(old&&old.installId!==installId)throw new ApiError(409,'disconnect_first');
            await verifyAccount(pending.uid,pending.authTime);
            await store.saveConnection(pending.uid,{installId,tokens:secrets.seal(tokenBundle(data),`${pending.uid}:${installId}`),stage:old?.deviceId?'subscribing':'choose_device',connectedAt:old?.connectedAt||now(),consentVersion:CONSENT,consentedAt:pending.consentedAt,...(old?.deviceId?{deviceId:old.deviceId,deviceLabel:old.deviceLabel}: {})},{state,nonceHash:hash(browserNonce)});
          });
        }catch(error){outcome=error.code==='disconnect_first'?'disconnect_first':'failed';}
        if(outcome!=='connected')await store.cancelState(state,pending.uid);
        return new Response(null,{status:303,headers:{Location:landing(outcome),'Set-Cookie':cookie('',0),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
      }
      const requestOrigin=request.headers.get('origin')||'';
      // The OAuth nonce cookie is minted only in the API's own top-level popup.
      // Other app calls use Firebase bearer authentication, never cross-site cookies.
      if(request.method!=='GET'&&!equal(requestOrigin,config.origin)&&!(path!=='/start'&&(config.appOrigins||[]).includes(requestOrigin)))throw new ApiError(403,'invalid_origin');
      const account=await user(request),uid=account.uid;
      if(path==='/status'&&request.method==='GET')return response(publicConnection(await store.get(uid)));
      if(path==='/cancel-start'&&request.method==='POST'){
        const body=await json(request);
        if(!identifier(body.attemptId)||body.attemptId.length<32)throw new ApiError(400,'invalid_request');
        await store.cancelState(body.attemptId,uid);return response({ok:true});
      }
      if(path==='/start'&&request.method==='POST'){
        if(!Number.isInteger(account.authTime)||account.authTime<0)throw new ApiError(401,'login_required');
        const body=await json(request);if(body.consentVersion!==CONSENT)throw new ApiError(400,'consent_required');
        if(body.attemptId!==undefined&&(!identifier(body.attemptId)||body.attemptId.length<32))throw new ApiError(400,'invalid_request');
        const current=await store.get(uid);if(current&&current.stage!=='reconnect_required')throw new ApiError(409,'already_connected');
        const state=body.attemptId||random(),nonce=random();await store.saveState(state,{uid,authTime:account.authTime,nonceHash:hash(nonce),until:now()+600000,consentedAt:now()});
        const target=new URL(`https://api.smartthings.com${config.oauth}/authorize`);
        target.search=new URLSearchParams({client_id:config.clientId,response_type:'code',redirect_uri:config.redirect,scope:'r:devices:*',state}).toString();
        return response({url:target.href},200,{'Set-Cookie':cookie(nonce,600)});
      }
      if(path==='/devices'&&request.method==='GET')return response(await authorized(uid,async(current,token)=>{
        if(current.deviceListCheckedAt&&now()-current.deviceListCheckedAt<30000)throw new ApiError(429,'check_later');
        const devices=(await smartthings.devices(token)).filter(x=>identifier(x.deviceId)).map(safeDevice).filter(x=>x.power);
        await store.patch(uid,{deviceListCheckedAt:now()});return {devices};
      }));
      if(path==='/device'&&request.method==='POST'){
        const body=await json(request);if(!identifier(body.deviceId))throw new ApiError(400,'invalid_device');
        return response(await authorized(uid,async(current,token)=>{
          if(current.deviceId&&current.deviceId!==body.deviceId)throw new ApiError(409,'disconnect_first');
          // Never trust the client-supplied device label/capability or a cached list.
          const device=safeDevice(await smartthings.device(token,body.deviceId));
          if(device.id!==body.deviceId||!device.power)throw new ApiError(422,'power_not_supported');
          const sample=readingSummary(await smartthings.status(token,device.id),now());
          await store.patch(uid,{deviceId:device.id,deviceLabel:device.label,stage:'subscribing'});
          await smartthings.subscribe(token,current.installId,device.id);
          const updated=await store.patch(uid,{stage:'connected',hasPower:sample.hasPower,lastCheckedAt:now(),lastSignalAt:sample.measuredAt});
          return publicConnection(updated);
        }));
      }
      if(path==='/check'&&request.method==='POST')return response(await authorized(uid,async(current,token)=>{
        if(!current.deviceId||current.stage!=='connected')throw new ApiError(409,'choose_device');
        if(current.lastCheckedAt&&now()-current.lastCheckedAt<30000)throw new ApiError(429,'check_later');
        const sample=readingSummary(await smartthings.status(token,current.deviceId),now());
        const updated=await store.patch(uid,{hasPower:sample.hasPower,lastCheckedAt:now(),lastSignalAt:Math.max(current.lastSignalAt||0,sample.measuredAt||0)||null});return publicConnection(updated);
      }));
      if(path==='/connection'&&request.method==='DELETE'){
        const body=await json(request);
        if(body.confirm!==true)throw new ApiError(400,'confirmation_required');
        const current=await store.get(uid);
        if(!current)return response({stage:'disconnected'});
        if(current.stage==='reconnect_required'){
          // An expired grant cannot unsubscribe. Explicit local removal is only
          // offered after the user is told to revoke it in SmartThings as well.
          if(body.forgetExpired!==true)throw new ApiError(409,'revoke_in_smartthings');
          await store.withLease(uid,()=>store.remove(uid,current.installId));
        }else await authorized(uid,async(saved,token)=>{await smartthings.unsubscribe(token,saved.installId);await store.remove(uid,saved.installId);});
        return response({stage:'disconnected'});
      }
      throw new ApiError(404,'not_found');
    }catch(error){
      // Never serialize exception messages, upstream bodies, credentials, or IDs.
      return response({error:error instanceof ApiError?error.code:'temporarily_unavailable'},error instanceof ApiError?error.status:503);
    }
  };
  return async request=>{
    const path=new URL(request.url).pathname.slice(PREFIX.length),origin=request.headers.get('origin');
    const remote=origin&&origin!==config.origin;
    const methods={ '/config':['GET'], '/status':['GET'], '/devices':['GET'], '/device':['POST'], '/check':['POST'], '/connection':['DELETE'], '/cancel-start':['POST'] };
    if(remote&&methods[path]){
      if(!(config.appOrigins||[]).includes(origin))return response({error:'invalid_origin'},403);
      const headers={'Access-Control-Allow-Origin':origin,Vary:'Origin'};
      if(request.method==='OPTIONS'){
        const method=request.headers.get('access-control-request-method');
        const requested=(request.headers.get('access-control-request-headers')||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
        if(!methods[path].includes(method)||requested.some(x=>!['authorization','content-type'].includes(x)))return response({error:'invalid_origin'},403);
        return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':methods[path].join(', '),'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600','Cache-Control':'no-store'}});
      }
      if(!methods[path].includes(request.method))return response({error:'invalid_request'},405,headers);
      const result=await handle(request);
      for(const [key,value] of Object.entries(headers))result.headers.set(key,value);
      return result;
    }
    return handle(request);
  };
}
