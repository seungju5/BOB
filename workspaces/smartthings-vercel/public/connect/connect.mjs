const title=document.querySelector('#title'),description=document.querySelector('#description'),back=document.querySelector('#return');
const query=new URL(location.href).searchParams,storageKey='bapmunna-connection-window';
let parentOrigin,channel,settings,used=false,timeout;
function show(heading,text){title.textContent=heading;description.textContent=text;}
function tell(type,result){if(window.opener&&parentOrigin)window.opener.postMessage({type,channel,result},parentOrigin);}
function validChannel(value){return typeof value==='string'&&/^[a-zA-Z0-9_-]{16,128}$/.test(value);}
function fail(){clearTimeout(timeout);show('연결을 마치지 못했어요.','밥뭇나로 돌아가 다시 시작해 주세요.');tell('bapmunna-error');}
back.addEventListener('click',()=>{if(!query.get('smartthings'))tell('bapmunna-result','cancelled');});
try{
  const response=await fetch('/api/smartthings/config',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(12000)});
  settings=await response.json();
  if(!response.ok||!settings.enabled||!Array.isArray(settings.appOrigins))throw Error();
  const returnUrl=new URL(settings.returnUrl);
  if(!settings.appOrigins.includes(returnUrl.origin))throw Error();
  back.href=returnUrl.href;back.hidden=false;
  const result=query.get('smartthings');
  if(result){
    const saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');sessionStorage.removeItem(storageKey);
    if(saved&&settings.appOrigins.includes(saved.origin)&&validChannel(saved.channel)){parentOrigin=saved.origin;channel=saved.channel;}
    history.replaceState(null,'',location.pathname);
    if(result==='connected')show('삼성 계정을 확인했어요.','밥뭇나 화면에서 밥솥에 꽂은\n플러그를 골라 주세요.');
    else if(result==='cancelled')show('연결을 취소했어요.','원할 때 다시 시작할 수 있어요.');
    else show('연결을 마치지 못했어요.','밥뭇나에서 연결 상태를 확인하고\n다시 시작해 주세요.');
    tell('bapmunna-result',result);
  }else{
    parentOrigin=query.get('opener');channel=query.get('channel');
    if(!window.opener||!settings.appOrigins.includes(parentOrigin)||!validChannel(channel))throw Error();
    sessionStorage.setItem(storageKey,JSON.stringify({origin:parentOrigin,channel}));
    history.replaceState(null,'',location.pathname);
    window.addEventListener('message',async event=>{
      if(used||event.source!==window.opener||event.origin!==parentOrigin||event.data?.type!=='bapmunna-start'||event.data.channel!==channel)return;
      used=true;clearTimeout(timeout);
      if(typeof event.data.token!=='string'||!/^[-_.a-zA-Z0-9]+$/.test(event.data.token)||event.data.consentVersion!==settings.consentVersion){fail();return;}
      try{
        const response=await fetch('/api/smartthings/start',{method:'POST',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${event.data.token}`,'Content-Type':'application/json'},body:JSON.stringify({consentVersion:settings.consentVersion,attemptId:channel})});
        const data=await response.json();
        if(!response.ok)throw Error();
        const target=new URL(data.url);
        if(target.origin!=='https://api.smartthings.com'||!['/oauth/authorize','/v1/oauth/authorize'].includes(target.pathname))throw Error();
        location.replace(target.href);
      }catch{fail();}
    });
    timeout=setTimeout(fail,30000);
    tell('bapmunna-ready');
  }
}catch{fail();}
