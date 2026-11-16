import {KakaoError,KAKAO_PREFIX,STATE_LIFETIME,HANDOFF_LIFETIME,hash,challengeFor,randomToken,opaqueToken,validVerifier,kakaoUid,stateCookie,readStateCookie,networkBucket,boundedJson} from './kakao-security.mjs';

const baseHeaders={'Cache-Control':'no-store','Pragma':'no-cache','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{...baseHeaders,'Content-Type':'application/json; charset=utf-8',...headers}});
const one=(params,name)=>params.getAll(name).length===1?params.get(name):null;
function landing(config,values,cookie){
  const url=new URL(config.returnUrl);url.hash=new URLSearchParams(values).toString();
  return new Response(null,{status:303,headers:{...baseHeaders,Location:url.href,...(cookie?{'Set-Cookie':cookie}:{})}});
}

export function kakaoClient(config,fetcher=fetch){
  async function request(url,init){
    try{
      const response=await fetcher(url,{...init,redirect:'error',signal:AbortSignal.timeout(8000)});
      if(!response.ok||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||''))throw Error();
      return await boundedJson(response.body,65536,'upstream_unavailable');
    }catch{throw new KakaoError(502,'upstream_unavailable');}
  }
  return {
    async userId(code){
      const token=await request('https://kauth.kakao.com/oauth/token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded;charset=utf-8'},body:new URLSearchParams({grant_type:'authorization_code',client_id:config.clientId,client_secret:config.secret,redirect_uri:config.redirect,code})});
      if(typeof token?.access_token!=='string'||token.access_token.length>4096||!/^[A-Za-z0-9._~-]+$/.test(token.access_token)||typeof token.token_type!=='string'||token.token_type.toLowerCase()!=='bearer')throw new KakaoError(502,'upstream_unavailable');
      const user=await request('https://kapi.kakao.com/v2/user/me',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded;charset=utf-8',Authorization:'Bearer '+token.access_token},body:new URLSearchParams({property_keys:'[]',secure_resource:'true'})});
      // Only the application-scoped numeric ID is used. Provider email and
      // profile data can never link or modify an existing Firebase account.
      if(user?.has_signed_up===false)throw new KakaoError(502,'upstream_unavailable');
      kakaoUid(config.appId,user?.id);return user.id;
    },
  };
}

export function createKakaoService({config,ready=false,store,auth,kakao,now=()=>Date.now()}){
  async function callback(request,url){
    let flow,clearCookie;
    try{
      const state=one(url.searchParams,'state');
      if(!opaqueToken(state))throw new KakaoError(400,'invalid_state');
      const cookie=readStateCookie(request,state);
      if(!cookie)throw new KakaoError(400,'invalid_state');
      const saved=await store.consumeState(state,hash(cookie));
      flow=saved.flow;clearCookie=stateCookie(state,'',0);
      if(saved.expired)return landing(config,{error:'expired',flow},clearCookie);
      if(url.searchParams.has('error'))return landing(config,{error:one(url.searchParams,'error')==='access_denied'?'cancelled':'failed',flow},clearCookie);
      const code=one(url.searchParams,'code');
      if(typeof code!=='string'||code.length>2048||!/^[A-Za-z0-9._~-]+$/.test(code))throw new KakaoError(400,'invalid_request');
      const id=await kakao.userId(code),handoff=randomToken();
      await store.saveHandoff(handoff,{uid:kakaoUid(config.appId,id),challenge:saved.challenge,flow,until:now()+HANDOFF_LIFETIME});
      return landing(config,{code:handoff,flow},clearCookie);
    }catch{
      // Neither provider errors nor arbitrary return parameters are echoed.
      return landing(config,{error:'failed',...(opaqueToken(flow)?{flow}:{})},clearCookie);
    }
  }
  async function route(request,url){
    const path=url.pathname.slice(KAKAO_PREFIX.length);
    if(path==='/config'&&request.method==='GET')return json({enabled:ready});
    if(!ready)throw new KakaoError(503,'setup_required');
    if(path==='/start'&&request.method==='GET'){
      const challenge=one(url.searchParams,'challenge'),flow=one(url.searchParams,'flow');
      if(!opaqueToken(challenge)||!opaqueToken(flow)||[...url.searchParams.keys()].some(key=>!['challenge','flow'].includes(key)))throw new KakaoError(400,'invalid_request');
      const state=randomToken(),nonce=randomToken(),time=now();
      await store.saveState(state,{challenge,flow,nonceHash:hash(nonce),until:time+STATE_LIFETIME},{networkKey:networkBucket(request,config.secret,time)});
      const target=new URL('https://kauth.kakao.com/oauth/authorize');
      // This challenge secures the browser handoff, not the upstream code
      // exchange. Request no profile/email/openid scopes from Kakao.
      target.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirect,response_type:'code',state}).toString();
      return new Response(null,{status:303,headers:{...baseHeaders,Location:target.href,'Set-Cookie':stateCookie(state,nonce)}});
    }
    if(path==='/callback'&&request.method==='GET')return callback(request,url);
    if(path==='/exchange'&&request.method==='POST'){
      if(request.headers.get('origin')!==config.webOrigin)throw new KakaoError(403,'invalid_origin');
      if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))throw new KakaoError(400,'invalid_request');
      const body=await boundedJson(request.body,2048);
      if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==3||!opaqueToken(body.code)||!opaqueToken(body.flow)||!validVerifier(body.verifier))throw new KakaoError(400,'invalid_request');
      const uid=await store.consumeHandoff(body.code,challengeFor(body.verifier),body.flow);
      if(!/^kakao:[a-f0-9]{64}$/.test(uid))throw new KakaoError(400,'invalid_handoff');
      try{
        const user=await auth.getUser(uid);
        if(user.disabled)throw new KakaoError(403,'login_unavailable');
      }catch(error){if(error?.code!=='auth/user-not-found')throw error;}
      const customToken=await auth.createCustomToken(uid,{bapmunnaProvider:'kakao'});
      if(typeof customToken!=='string'||!customToken||customToken.length>16384)throw new KakaoError(503,'temporarily_unavailable');
      return json({customToken});
    }
    throw new KakaoError(404,'not_found');
  }
  return async request=>{
    let cors={};
    try{
      const url=new URL(request.url),path=url.pathname.slice(KAKAO_PREFIX.length),origin=request.headers.get('origin');
      if(url.origin!==config.origin||!url.pathname.startsWith(KAKAO_PREFIX+'/')||url.href.length>8192)throw new KakaoError(400,'invalid_request');
      if(['/config','/exchange'].includes(path)){
        if(origin&&origin!==config.webOrigin)throw new KakaoError(403,'invalid_origin');
        if(origin===config.webOrigin)cors={'Access-Control-Allow-Origin':config.webOrigin,Vary:'Origin'};
      }else if(path==='/start'&&origin&&origin!==config.webOrigin&&origin!==config.origin)throw new KakaoError(403,'invalid_origin');
      if(request.method==='OPTIONS'){
        const method=path==='/exchange'?'POST':path==='/config'?'GET':null;
        const requested=(request.headers.get('access-control-request-headers')||'').split(',').map(value=>value.trim().toLowerCase()).filter(Boolean);
        if(!method||origin!==config.webOrigin||request.headers.get('access-control-request-method')!==method||requested.some(header=>header!=='content-type'))throw new KakaoError(403,'invalid_origin');
        return new Response(null,{status:204,headers:{...baseHeaders,...cors,'Access-Control-Allow-Methods':method,'Access-Control-Allow-Headers':'Content-Type'}});
      }
      const response=await route(request,url);for(const [name,value] of Object.entries(cors))response.headers.set(name,value);return response;
    }catch(error){
      // External exceptions can contain credentials. Never serialize/log them.
      return json({error:error instanceof KakaoError?error.code:'temporarily_unavailable'},error instanceof KakaoError?error.status:503,cors);
    }
  };
}
