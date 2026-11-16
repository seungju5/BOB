import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';

export const KAKAO_PREFIX='/api/kakao';
export const STATE_LIFETIME=600000;
export const HANDOFF_LIFETIME=120000;
export const STARTS_PER_DAY=300;
export const STARTS_PER_NETWORK_WINDOW=10;
export class KakaoError extends Error {
  constructor(status,code){super(code);this.status=status;this.code=code;}
}
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const challengeFor=value=>createHash('sha256').update(value).digest('base64url');
export const randomToken=()=>randomBytes(32).toString('base64url');
export const opaqueToken=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value)&&Buffer.from(value,'base64url').toString('base64url')===value;
export const validVerifier=value=>typeof value==='string'&&/^[A-Za-z0-9._~-]{43,128}$/.test(value);
export function equal(a,b){
  if(typeof a!=='string'||typeof b!=='string')return false;
  const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);
}
function origin(value){
  const parsed=new URL(value);
  if(parsed.protocol!=='https:'||parsed.origin!==value||parsed.username||parsed.password)throw Error('Invalid Kakao server configuration.');
  return parsed.origin;
}
export function readKakaoConfig(env={}){
  try{
    const apiOrigin=origin(env.KAKAO_API_ORIGIN||'https://bapmunna-smartthings.vercel.app');
    const webOrigin=origin(env.BAPMUNNA_WEB_ORIGIN||'https://impact-series.web.app');
    const clientId=env.KAKAO_CLIENT_ID||'',secret=env.KAKAO_CLIENT_SECRET||'',appId=env.KAKAO_APP_ID||'',projectId=env.FIREBASE_PROJECT_ID||'';
    if(clientId&&!/^[A-Za-z0-9_-]{1,128}$/.test(clientId)||secret&&!/^[A-Za-z0-9_-]{1,256}$/.test(secret)||appId&&!/^[1-9][0-9]{0,17}$/.test(appId)||projectId&&!/^[a-z][a-z0-9-]{1,62}$/.test(projectId))throw Error();
    return {origin:apiOrigin,webOrigin,returnUrl:webOrigin+'/bapmunna/app/auth/kakao/',redirect:apiOrigin+KAKAO_PREFIX+'/callback',clientId,secret,appId,projectId};
  }catch{throw Error('Invalid Kakao server configuration.');}
}
export const kakaoConfigured=config=>Boolean(config.clientId&&config.secret&&config.appId&&config.projectId);
// The app ID is immutable; rotating the REST API key must not fork accounts.
export function kakaoUid(appId,id){
  if(!/^[1-9][0-9]{0,17}$/.test(appId)||!Number.isSafeInteger(id)||id<1)throw new KakaoError(502,'upstream_unavailable');
  return 'kakao:'+hash(appId+':'+id);
}
export const cookieName=state=>'__Host-bapmunna-kakao-'+hash(state).slice(0,24);
export const stateCookie=(state,value,maxAge=STATE_LIFETIME/1000)=>`${cookieName(state)}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
export function readStateCookie(request,state){
  const header=request.headers.get('cookie')||'';
  if(header.length>32768)return null;
  const name=cookieName(state),matches=header.split(';').map(part=>part.trim()).filter(part=>part.startsWith(name+'='));
  if(matches.length!==1)return null;
  const value=matches[0].slice(name.length+1);return opaqueToken(value)?value:null;
}
// Only Vercel's platform header is considered; never use X-Forwarded-For.
// An absent/invalid address shares one conservative bucket. The daily global
// cap still bounds storage if a non-Vercel deployment supplies forged headers.
export function networkBucket(request,secret,now){
  const address=request.headers.get('x-vercel-forwarded-for')||'';
  const network=isIP(address)?address:'unknown';
  return createHmac('sha256',secret).update(`kakao-rate:${Math.floor(now/86400000)}:${network}`).digest('hex');
}
export async function boundedJson(body,maxBytes,errorCode='invalid_request'){
  const reader=body?.getReader();
  if(!reader)throw new KakaoError(400,errorCode);
  const chunks=[];let size=0;
  try{
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;
      if(size>maxBytes){await reader.cancel();throw new KakaoError(400,errorCode);}
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks,size).toString('utf8'));
  }catch{throw new KakaoError(400,errorCode);}
  finally{reader.releaseLock();}
}
