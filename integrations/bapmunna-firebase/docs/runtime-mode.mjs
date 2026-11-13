// Presentation state only. The provider and server still enforce authentication.
// Never copy fixture records, credentials or profiles into this controller.
export function runtimeSurface({cloudEnabled,explicitDemo=false,view}){
  if(view==='welcome')return 'welcome';
  if(view==='journey')return 'demo';
  if(cloudEnabled&&['account','connect'].includes(view))return 'service';
  return !cloudEnabled||explicitDemo?'demo':'live';
}

export function runtimeSession(user,metadata={}){
  if(metadata.recovery)return {status:'recovery',uid:null};
  if(!user)return {status:'signed-out',uid:null};
  if(typeof user.uid!=='string'||!user.uid)return {status:'error',uid:null};
  return {status:user.verified===true?'signed-in':'unverified',uid:user.uid};
}

export function accountBoundaryChanged(before,after){
  const resolved=['signed-in','signed-out','unverified','recovery'];
  return resolved.includes(before.status)&&resolved.includes(after.status)&&
    (before.uid!==after.uid||before.status!==after.status);
}
// Keep the last confirmed identity through loading, retries and BFCache restores.
export function createAccountBoundary(){
  let previous={status:'checking',uid:null};
  return next=>{
    const changed=accountBoundaryChanged(previous,next);
    if(['signed-in','signed-out','unverified','recovery'].includes(next.status))previous=next;
    return changed;
  };
}

export function tutorialHintKey(base,uid){
  return typeof uid==='string'&&uid?`bapmunna:tutorial:v2:${new URL(base).pathname}:${uid}`:null;
}
export function readTutorialHint(storage,base,uid){
  const key=tutorialHintKey(base,uid);if(!key)return false;
  try{return storage.getItem(key)==='seen';}catch{return false;}
}
export function writeTutorialHint(storage,base,uid){
  const key=tutorialHintKey(base,uid);if(!key)return;
  try{storage.setItem(key,'seen');}catch{/* Presentation hint only; memory still works. */}
}
export function browserTutorialSeen(base,uid){
  try{return readTutorialHint(localStorage,base,uid);}catch{return false;}
}
export function rememberBrowserTutorial(base,uid){
  try{writeTutorialHint(localStorage,base,uid);}catch{}
}

export function createRuntimeSession({connect,onChange,timeoutMs=10000}){
  let generation=0,unsubscribe=null,timer=null,disposed=false;
  const clean=()=>{clearTimeout(timer);timer=null;unsubscribe?.();unsubscribe=null;};
  function start(){
    if(disposed)return;
    clean();const current=++generation;
    const valid=()=>!disposed&&current===generation;
    const fail=()=>{if(!valid())return;generation++;clean();onChange({status:'error',uid:null});};
    onChange({status:'checking',uid:null});
    timer=setTimeout(fail,timeoutMs);
    Promise.resolve().then(connect).then(provider=>{
      if(!valid())return;
      const stop=provider.onUser((user,metadata)=>{
        if(!valid())return;
        clearTimeout(timer);timer=null;
        onChange(runtimeSession(user,metadata));
      });
      if(valid())unsubscribe=stop;else stop?.();
    }).catch(fail);
  }
  return {start,dispose(){disposed=true;generation++;clean();}};
}
