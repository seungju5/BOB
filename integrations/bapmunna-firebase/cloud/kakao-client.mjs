// Browser proof-of-possession only. Kakao credentials and Firebase tokens are
// never written to URLs, localStorage, or the pending-login record.
import {deploymentConfig} from './deployment-config.mjs';
const KEY='bapmunna:kakao:pending:v1';
const VALUE=/^[A-Za-z0-9_-]{43}$/;
const MAX_AGE=10*60*1000;
const fail=code=>Object.assign(new Error('Kakao login could not be completed.'),{code:`auth/kakao-${code}`});
const encode=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

export function createKakaoClient({config,storage,location,history,crypto,fetch,now=Date.now}){
  const allowed=config?.enabled===true&&config.apiOrigin===deploymentConfig.webOrigin;
  const endpoint=path=>`${config.apiOrigin}/api/kakao/${path}`;
  let starting=false,completion;
  async function request(path,init={}){
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),10000);
    try{
      const response=await fetch(endpoint(path),{...init,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:abort.signal});
      const data=await response.json();
      if(!response.ok){
        if(response.status===429)throw fail('rate-limited');
        if(response.status===503)throw fail('not-ready');
        throw fail('expired');
      }
      return data;
    }catch(error){if(error?.code)throw error;throw fail('network');}
    finally{clearTimeout(timer);}
  }
  async function available(){if(!allowed)return false;try{return (await request('config')).enabled===true;}catch{return false;}}
  async function begin(keep=false){
    if(starting)throw fail('pending');
    starting=true;
    try{
      if(!allowed||!(await available()))throw fail('not-ready');
      const verifier=encode(crypto.getRandomValues(new Uint8Array(32))),flow=encode(crypto.getRandomValues(new Uint8Array(32)));
      const challenge=encode(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
      const pending={flow,verifier,keep:keep===true,createdAt:now()};
      try{storage.setItem(KEY,JSON.stringify(pending));if(storage.getItem(KEY)!==JSON.stringify(pending))throw Error();}catch{throw fail('storage');}
      const url=new URL(endpoint('start'));url.searchParams.set('challenge',challenge);url.searchParams.set('flow',flow);
      location.assign(url.href);
    }finally{starting=false;}
  }
  async function finishOnce(providedFragment){
    // Clear the one-use handoff from browser history before any network or SDK work.
    const fragment=providedFragment??location.hash;
    history.replaceState(null,'',location.pathname);
    const params=new URLSearchParams(fragment.replace(/^#/,''));
    let pending;
    try{pending=JSON.parse(storage.getItem(KEY)||'null');storage.removeItem(KEY);}catch{throw fail('storage');}
    if(!allowed||!pending||!VALUE.test(pending.flow)||!VALUE.test(pending.verifier)
      ||!Number.isFinite(pending.createdAt)||pending.createdAt>now()||now()-pending.createdAt>MAX_AGE
      ||params.getAll('flow').length!==1||params.get('flow')!==pending.flow)throw fail('expired');
    if(params.has('error'))throw fail(params.get('error')==='cancelled'?'cancelled':'expired');
    const code=params.get('code');
    if(params.getAll('code').length!==1||!VALUE.test(code||''))throw fail('expired');
    const data=await request('exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,verifier:pending.verifier,flow:pending.flow})});
    if(typeof data.customToken!=='string'||data.customToken.length>8192||!/^[-\w]+\.[-\w]+\.[-\w]+$/.test(data.customToken))throw fail('failed');
    return {customToken:data.customToken,keep:pending.keep===true};
  }
  function cancel(){try{storage.removeItem(KEY);}catch{/* No authentication result can be used without browser proof. */}}
  return {available,begin,finish:fragment=>completion??=finishOnce(fragment),cancel};
}

export async function requestAccountEmail({email,expectedUid,currentUser,sendVerification}){
  const user=currentUser();
  const assertCurrent=()=>{if(!user||!expectedUid||user.uid!==expectedUid||currentUser()!==user)throw Object.assign(Error(),{code:'auth/user-changed'});};
  assertCurrent();
  if(user.email)throw Object.assign(Error(),{code:'auth/email-already-set'});
  const address=String(email??'').trim();
  if(address.length>254||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).test(address))throw Object.assign(Error(),{code:'auth/invalid-email'});
  await sendVerification(user,address);assertCurrent();
}

// The SDK remains the authority for token authentication. Decoding uid here
// only identifies the late SDK commit that this guard is allowed to veto.
export async function completeKakaoSession({auth,client,fragment,signal,remember,beforeChange,observe,signIn}){
  const changed=()=>Object.assign(Error(),{code:'auth/user-changed'});
  await auth.authStateReady();
  if(signal?.aborted||auth.currentUser){client.cancel();throw changed();}
  let interrupted=false,expectedUid=null;
  const abort=()=>{interrupted=true;};
  signal?.addEventListener('abort',abort,{once:true});
  const assertCurrent=()=>{if(interrupted||signal?.aborted||auth.currentUser)throw changed();};
  // Cross-tab updates can skip Firebase's before-state callback, so observe
  // them as well. Keep both guards until the *actual* SDK request settles.
  const stopObserve=observe(auth,user=>{if(user&&user.uid!==expectedUid)interrupted=true;});
  const stopBefore=beforeChange(auth,user=>{
    if(expectedUid&&user?.uid===expectedUid){
      if(interrupted||signal?.aborted||auth.currentUser&&auth.currentUser.uid!==expectedUid)throw changed();
    }else interrupted=true;
  });
  try{
    const result=await client.finish(fragment);assertCurrent();
    await remember(result.keep);assertCurrent();
    try{
      const part=result.customToken.split('.')[1];
      expectedUid=JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/'))).uid;
      if(!/^kakao:[a-f0-9]{64}$/.test(expectedUid))throw Error();
    }catch{throw fail('failed');}
    const signedIn=await signIn(auth,result.customToken);
    if(interrupted||signal?.aborted||auth.currentUser!==signedIn.user)throw changed();
    return signedIn.user;
  }finally{stopBefore();stopObserve();signal?.removeEventListener('abort',abort);}
}
