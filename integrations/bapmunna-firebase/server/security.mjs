import {createHash,createCipheriv,createDecipheriv,randomBytes,timingSafeEqual,verify} from 'node:crypto';

export class ApiError extends Error {
  constructor(status,code){super(code);this.status=status;this.code=code;}
}
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const random=()=>randomBytes(32).toString('base64url');
export const identifier=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
export function equal(a,b){
  const x=Buffer.from(String(a)),y=Buffer.from(String(b));
  return x.length===y.length&&timingSafeEqual(x,y);
}
export function vault(key){
  const bytes=Buffer.from(key||'','base64');
  if(bytes.length!==32)throw new ApiError(503,'setup_required');
  return {
    seal(value,owner){
      const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',bytes,iv);
      cipher.setAAD(Buffer.from(owner));
      const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
      return {version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};
    },
    open(value,owner){
      if(value?.version!==1)throw new ApiError(503,'reconnect_required');
      const decipher=createDecipheriv('aes-256-gcm',bytes,Buffer.from(value.iv,'base64'));
      decipher.setAAD(Buffer.from(owner));decipher.setAuthTag(Buffer.from(value.tag,'base64'));
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data,'base64')),decipher.final()]).toString('utf8'));
    },
  };
}

export function webhookVerifier({fetcher=fetch,now=()=>Date.now()}={}){
  const keys=new Map();
  return async request=>{
    const {headers,method,path,raw}=request;
    const authorization=headers.get('authorization')||'',digest=headers.get('digest')||'',date=headers.get('date')||'';
    if(!authorization.startsWith('Signature ')||Math.abs(now()-Date.parse(date))>300000||!Number.isFinite(Date.parse(date)))throw new ApiError(401,'invalid_webhook');
    const entries=[...authorization.slice(10).matchAll(/([A-Za-z]+)="([^"\r\n]*)"(?:,\s*|$)/g)];
    const params=Object.fromEntries(entries.map(x=>[x[1],x[2]]));
    if(entries.map(x=>x[0]).join('')!==authorization.slice(10)||entries.length!==4||new Set(entries.map(x=>x[1])).size!==4||params.algorithm!=='rsa-sha256')throw new ApiError(401,'invalid_webhook');
    if(!/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(params.keyId||''))throw new ApiError(401,'invalid_webhook');
    const names=(params.headers||'').split(' ');
    if(names.length!==3||new Set(names).size!==3||!['(request-target)','digest','date'].every(x=>names.includes(x)))throw new ApiError(401,'invalid_webhook');
    const match=/^SHA-?256=([A-Za-z0-9+/]+={0,2})$/i.exec(digest);
    if(!match||!equal(match[1],createHash('sha256').update(raw).digest('base64')))throw new ApiError(401,'invalid_webhook');
    let cached=keys.get(params.keyId);
    if(!cached||cached.until<now()){
      const response=await fetcher(`https://key.smartthings.com${params.keyId}`,{redirect:'error',signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw new ApiError(503,'verification_unavailable');
      const pem=await response.text();
      if(pem.length>65536||!pem.startsWith('-----BEGIN '))throw new ApiError(401,'invalid_webhook');
      cached={pem,until:now()+3600000};if(keys.size>=32)keys.delete(keys.keys().next().value);keys.set(params.keyId,cached);
    }
    const values={'(request-target)':`${method.toLowerCase()} ${path}`,digest,date};
    const signing=names.map(name=>`${name}: ${values[name]}`).join('\n');
    let valid=false;try{valid=verify('RSA-SHA256',Buffer.from(signing),cached.pem,Buffer.from(params.signature,'base64'));}catch{}
    if(!valid)throw new ApiError(401,'invalid_webhook');
  };
}

export function readConfig(env = {}) {
  const app = env.APP_URL ? new URL(env.APP_URL) : new URL('/connect/', env.PUBLIC_ORIGIN || 'http://127.0.0.1:8080');
  const origin=new URL(env.PUBLIC_ORIGIN||app.origin);
  const local=['127.0.0.1','localhost'].includes(origin.hostname);
  if(app.origin!==origin.origin||(!local&&origin.protocol!=='https:')||app.username||app.password)throw Error('APP_URL must use the same HTTPS origin as PUBLIC_ORIGIN.');
  if(!['/v1/oauth','/oauth'].includes(env.SMARTTHINGS_OAUTH_PREFIX||'/oauth'))throw Error('Unsupported OAuth prefix.');
  const appOrigins=[...new Set((env.BAPMUNNA_APP_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean))];
  for(const value of appOrigins){
    const parsed=new URL(value);
    if(parsed.origin!==value||parsed.protocol!=='https:'||parsed.username||parsed.password)throw Error('BAPMUNNA_APP_ORIGINS must contain exact HTTPS origins.');
  }
  const returnUrl=new URL(env.BAPMUNNA_RETURN_URL||app.href);
  if(![origin.origin,...appOrigins].includes(returnUrl.origin)||returnUrl.username||returnUrl.password)throw Error('BAPMUNNA_RETURN_URL must use an explicitly allowed app origin.');
  const redirect = env.APP_URL || env.PUBLIC_ORIGIN ? origin.origin + '/api/smartthings/callback' : '';
  return {
    appUrl: app.href, origin: origin.origin, appOrigins, returnUrl: returnUrl.href,
    secure: !local, connectionEnabled: env.SMARTTHINGS_CONNECTION_ENABLED === 'true',
    appId: env.SMARTTHINGS_APP_ID || '', clientId: env.SMARTTHINGS_CLIENT_ID || '',
    secret: env.SMARTTHINGS_CLIENT_SECRET || '', key: env.SMARTTHINGS_ENCRYPTION_KEY || '',
    oauth: env.SMARTTHINGS_OAUTH_PREFIX || '/oauth', redirect, projectId: env.FIREBASE_PROJECT_ID || '',
  };
}
