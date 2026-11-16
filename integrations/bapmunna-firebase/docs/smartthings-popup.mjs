const failure=code=>Object.assign(new Error(code),{code});

// The ID token travels only in memory to the exact, configured backend window.
// It is never put in a URL, browser storage, logs, or the Samsung authorization URL.
export function connectInPopup({origin,consentVersion,getIdToken,readStatus,signal,cancelAttempt=async()=>{},browser=window,pollMs=5000,timeoutMs=600000}){
  const target=new URL('/connect/',origin);
  if(target.origin!==origin||target.protocol!=='https:')throw failure('invalid_response');
  const channel=browser.crypto.randomUUID()+browser.crypto.randomUUID();
  target.searchParams.set('opener',browser.location.origin);target.searchParams.set('channel',channel);
  if(['/bapmunna/app/connect/','/bapmunna/app/connect','/bapmunna/app/settings/','/bapmunna/app/settings'].includes(browser.location.pathname))target.searchParams.set('returnPath',browser.location.pathname);
  const popup=browser.open(target.href,'bapmunna-smartthings-connect','popup,width=520,height=760');
  if(!popup)return Promise.reject(failure('popup_blocked'));
  return new Promise((resolve,reject)=>{
    let done=false,sent=false,polling=false,timer,authToken;
    const finish=async(error,value)=>{
      if(done)return;done=true;clearInterval(timer);clearTimeout(deadline);
      browser.removeEventListener('message',message);signal.removeEventListener('abort',abort);
      const cancelToken=authToken;
      authToken=undefined;
      try{popup.close();}catch{}
      if(error&&cancelToken)try{await cancelAttempt(cancelToken,channel);}catch{}
      if(error)reject(error);else resolve(value);
    };
    const abort=()=>finish(failure('connection_cancelled'));
    async function poll(){
      if(done||polling||!sent)return;polling=true;
      try{
        const value=await readStatus();
        if(done)return;
        if(['choose_device','subscribing','connected'].includes(value?.stage))finish(null,value);
      }catch(error){if(error?.code==='login_required')finish(error);}
      finally{polling=false;}
    }
    async function message(event){
      if(done||event.origin!==origin||event.source!==popup||event.data?.channel!==channel)return;
      if(event.data.type==='bapmunna-ready'&&!sent){
        sent=true;
        try{
          const token=await getIdToken();
          if(done||signal.aborted)return;
          authToken=token;
          popup.postMessage({type:'bapmunna-start',channel,token,consentVersion},origin);
        }catch{finish(failure('login_required'));}
      }else if(event.data.type==='bapmunna-result'){
        if(event.data.result==='connected')void poll();
        else finish(failure(event.data.result==='cancelled'?'connection_cancelled':'connection_failed'));
      }else if(event.data.type==='bapmunna-error')finish(failure('connection_failed'));
    }
    const deadline=setTimeout(()=>finish(failure('connection_timeout')),timeoutMs);
    timer=setInterval(()=>{if(!sent&&popup.closed)finish(failure('connection_cancelled'));else void poll();},pollMs);
    browser.addEventListener('message',message);signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted)abort();
  });
}
