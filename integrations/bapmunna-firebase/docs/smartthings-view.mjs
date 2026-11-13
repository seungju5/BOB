import {connectCloud} from './cloud-api.mjs';

const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const asset=new URL('./assets/rice-cooker-companion.png',import.meta.url).href;
const messages={login_required:'다시 로그인해 주세요.',verified_email_required:'먼저 이메일을 확인해 주세요.',setup_required:'연결 기능을 준비하고 있어요. 준비가 끝나면 이곳에서 시작할 수 있어요.',consent_required:'정보 이용 안내를 확인해 주세요.',reconnect_required:'삼성 계정 연결이 만료됐어요. 다시 연결해 주세요.',permission_required:'SmartThings에서 이 기기를 읽을 권한을 허용해 주세요.',plan_required:'삼성 API 이용 계획을 확인해야 해요. 운영팀에 알려 주세요.',rate_limited:'요청이 많아요. 잠시 후 다시 눌러 주세요.',check_later:'방금 확인했어요. 30초 뒤 다시 확인할 수 있어요.',busy:'앞선 작업을 마치는 중이에요. 잠시 후 다시 눌러 주세요.',subscription_conflict:'기존 기기 연결 정보를 확인해야 해요. 연결을 해제한 뒤 다시 연결해 주세요.',device_missing:'이 기기를 찾을 수 없어요. SmartThings 앱에서 먼저 확인해 주세요.',power_not_supported:'전력을 읽을 수 있는 플러그를 선택해 주세요.',disconnect_first:'다른 기기를 연결하려면 현재 연결을 먼저 해제해 주세요.',already_connected:'이미 연결되어 있어요. 연결 상태를 다시 확인해 주세요.',revoke_in_smartthings:'SmartThings 앱에서 밥뭇나 권한을 해제한 뒤 아래 연결을 지워 주세요.'};
messages.timeout='응답이 늦어지고 있어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.';
messages.invalid_response='연결 정보를 읽지 못했어요. 잠시 후 다시 확인해 주세요.';
export const smartThingsMessage=code=>messages[code]||'연결을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.';
const validTime=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&Number.isFinite(new Date(value).getTime());
export function signalLabel(connection,now=Date.now()){
  if(connection.lastSignalAt==null)return '아직 신호를 기다리고 있어요';
  if(!validTime(connection.lastSignalAt))return '신호 시각을 확인해 주세요';
  if(now-connection.lastSignalAt>86400000)return '최근 신호를 확인해 주세요';
  return '기기 신호를 받았어요';
}
const timeLabel=value=>value==null?'아직 없음':validTime(value)?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value)):'확인 필요';

// A fetch timeout alone cannot bound SDK import, auth events or token refresh.
async function withinDeadline(work,parentSignal,timeoutMs){
  const controller=new AbortController();
  const cancel=()=>controller.abort(parentSignal.reason);
  parentSignal.addEventListener('abort',cancel,{once:true});
  if(parentSignal.aborted)cancel();
  const timer=setTimeout(()=>controller.abort(Object.assign(Error(),{code:'timeout'})),timeoutMs);
  let rejectAbort;
  const aborted=new Promise((_,reject)=>{rejectAbort=()=>reject(controller.signal.reason);if(controller.signal.aborted)rejectAbort();else controller.signal.addEventListener('abort',rejectAbort,{once:true});});
  try{return await Promise.race([Promise.resolve().then(()=>{ensureActive(controller.signal);return work(controller.signal);}),aborted]);}
  finally{clearTimeout(timer);parentSignal.removeEventListener('abort',cancel);controller.signal.removeEventListener('abort',rejectAbort);}
}
function ensureActive(signal){if(signal.aborted)throw signal.reason;}
function hasJSON(response){return response.headers?.get('content-type')?.toLowerCase().includes('application/json');}
function connectionData(value){
  if(!['disconnected','choose_device','subscribing','connected','reconnect_required'].includes(value?.stage))throw Object.assign(Error(),{code:'invalid_response'});
  for(const field of ['lastSignalAt','lastReceivedAt','lastCheckedAt'])if(value[field]!=null&&!validTime(value[field]))throw Object.assign(Error(),{code:'invalid_response'});
  return value;
}

export function mountSmartThings(element,{accountHref='#account',homeHref='',connect=connectCloud,fetcher=fetch,requestTimeoutMs=12000}={}){
  let alive=true,provider,unsubscribe,revision=0,loadController;
  const model={loading:true,failed:false,busy:false,user:null,enabled:false,consentVersion:'',connection:{stage:'disconnected'},devices:null,error:'',notice:'',confirm:false};
  const query=new URL(location.href),outcome=query.searchParams.get('smartthings');
  if(outcome){model.notice=({connected:'삼성 계정을 확인했어요. 연결할 플러그를 골라 주세요.',cancelled:'연결을 취소했어요. 원할 때 다시 시작할 수 있어요.',disconnect_first:'기존 연결을 먼저 해제한 뒤 다시 시작해 주세요.',failed:'삼성 계정 연결을 마치지 못했어요. 다시 시도해 주세요.'})[outcome]||'';query.searchParams.delete('smartthings');history.replaceState(null,'',query);}
  async function api(signal,path,method='GET',body){
    const token=await provider.getIdToken();
    ensureActive(signal);
    const result=await fetcher(`/api/smartthings/${path}`,{method,cache:'no-store',credentials:'same-origin',signal,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    if(!hasJSON(result))throw Object.assign(Error(),{code:result.status===404?'setup_required':'invalid_response'});
    const data=await result.json();ensureActive(signal);
    if(!result.ok)throw Object.assign(Error(),{code:data?.error});
    if(!data||typeof data!=='object')throw Object.assign(Error(),{code:'invalid_response'});
    return data;
  }
  const action=(name,label,primary=false)=>`<button type="button" data-st-action="${name}" class="${primary?'primary':'st-secondary'} full" ${model.busy?'disabled':''}>${model.busy?'잠시만요…':label}</button>`;
  const returnLink=(primary=false)=>`<a class="${primary?'primary full ':''}st-link" href="${escape(homeHref||accountHref)}">${homeHref?'홈으로 돌아가기':'내 계정으로 돌아가기'}</a>`;
  function consent(){return `<div class="st-consent"><strong>내가 고른 기기만, 내 계정에</strong><p>삼성에서 허용한 기기 목록을 읽고, 선택한 플러그의 전력 신호 도착 시각과 기기 이름을 저장해요. 삼성 연결 열쇠는 서버에 암호화해 보관해요.</p><p>전력 수치의 장기 기록·갤럭시폰 사용 기록·가족에게 자동 전송하는 기능은 포함하지 않아요. 연결은 언제든 해제할 수 있어요.</p><label class="check-row"><input type="checkbox" name="st-consent" ${model.busy?'disabled':''}>이 내용을 확인하고 연결할게요.</label></div>`;}
  function disconnected(){return `<div class="st-intro"><span class="bunny-portrait st-mascot" aria-hidden="true"><img src="${asset}" alt=""></span><h2>우리 집 플러그를<br>만나볼까요?</h2><p>처음 한 번 연결하면,<br>기기가 보내는 소식을 받을 수 있어요.</p></div><ol class="st-steps"><li><b>1</b><span>밥뭇나에 로그인</span><small>완료</small></li><li><b>2</b><span>삼성 계정으로 허용</span><small>다음</small></li><li><b>3</b><span>우리 집 플러그 선택</span></li></ol>${consent()}${action('start','SmartThings 연결하기',true)}<p class="caption st-center">삼성 계정 화면으로 이동해요.</p>`;}
  function selected(){
    const c=model.connection;
    return `<div class="st-status-icon" aria-hidden="true">✓</div><span class="st-status-label">${c.stage==='connected'?'연결 설정 완료':'연결 마무리 중'}</span><h2>${escape(c.device?.label||'우리 집 플러그')}</h2><p class="st-summary">${signalLabel(c)}</p><dl class="st-details"><div><dt>마지막 기기 신호</dt><dd>${escape(timeLabel(c.lastSignalAt))}</dd></div><div><dt>자동 수신 확인</dt><dd>${escape(timeLabel(c.lastReceivedAt))}</dd></div><div><dt>직접 확인한 시각</dt><dd>${escape(timeLabel(c.lastCheckedAt))}</dd></div></dl><p class="st-note">신호가 늦어도 식사를 거른 뜻은 아니에요.<br>이 화면은 기기 연결만 확인해요.</p>${c.stage==='subscribing'?action('finish','연결 마무리하기',true):action('check','지금 연결 확인하기',true)}${action('disconnect','연결 해제')}<p class="caption st-center">식사 판정과 가족 알림은 아직 연결하지 않았어요.</p>`;
  }
  function choose(){return `<span class="st-small-label">삼성 계정 확인 완료 · 3 / 3</span><h2>밥솥에 꽂은<br>플러그를 골라 주세요.</h2><p>현재 전력을 읽을 수 있는 기기만 보여요.</p>${model.devices===null?action('devices','플러그 목록 보기',true):!model.devices.length?'<div class="st-note"><strong>호환 플러그가 보이지 않아요.</strong><p>SmartThings 앱에 먼저 등록하고 전력 측정을 지원하는 모델인지 확인해 주세요.</p></div>':`<div class="st-device-list">${model.devices.map(device=>`<button type="button" data-st-device="${escape(device.id)}" ${model.busy?'disabled':''}><span class="st-device-glyph" aria-hidden="true">⌁</span><span><strong>${escape(device.label)}</strong><small>현재 전력 읽기 가능</small></span><span aria-hidden="true">→</span></button>`).join('')}</div>`}${action('disconnect','계정 연결 취소')}`;}
  function render(){
    if(!alive)return;
    const feedback=`${model.error?`<p role="alert" class="notice error">${escape(model.error)}</p>`:''}${model.notice?`<p role="status" class="account-success">${escape(model.notice)}</p>`:''}`;
    let content;
    if(model.loading)content=`<p role="status">연결 상태를 확인하고 있어요…</p>${returnLink()}`;
    else if(model.failed)content=`<h2>연결 상태를<br>확인하지 못했어요.</h2><p>잠시 후 다시 확인할 수 있어요.<br>내 계정과 다른 화면은 계속 이용해 주세요.</p>${action('reload','연결 상태 다시 확인',true)}${returnLink()}`;
    else if(!model.enabled)content=`<div class="st-intro"><span class="bunny-portrait st-mascot" aria-hidden="true"><img src="${asset}" alt=""></span><span class="st-small-label">준비 중</span><h2>우리 집 기기와<br>만날 준비를 해요.</h2><p>연결 기능을 준비하고 있어요.<br>준비가 끝나면 여기서 시작할 수 있어요.</p></div><div class="st-note">먼저 SmartThings 앱에 플러그를 등록해 주세요.</div>${returnLink(true)}${action('reload','준비 상태 다시 확인')}`;
    else if(!model.user?.verified)content=`<span class="st-small-label">1 / 3</span><h2>내 계정부터<br>확인해 주세요.</h2><p>로그인하고 이메일을 확인한 뒤 내 기기를 연결할 수 있어요.</p><a class="primary full st-link" href="${escape(accountHref)}">로그인하러 가기</a>`;
    else if(model.connection.stage==='disconnected')content=disconnected();
    else if(model.connection.stage==='choose_device')content=choose();
    else if(model.connection.stage==='reconnect_required')content=`<span class="st-small-label">다시 연결 필요</span><h2>삼성 계정 연결을<br>한 번 확인해 주세요.</h2><p>허용 기간이 끝났거나 권한이 바뀌었을 수 있어요.</p>${consent()}${action('start','삼성 계정 다시 연결',true)}${action('disconnect','기존 연결 지우기')}`;
    else content=selected();
    if(model.confirm)content=`<h2>기기 연결을 해제할까요?</h2><p>이 기기에서 새 소식을 받지 않고, 밥뭇나에 저장된 연결 열쇠와 기기 정보를 지워요.</p><p class="st-note">${model.connection.stage==='reconnect_required'?'연결이 만료되어 삼성에 해제 요청을 보낼 수 없어요. SmartThings 앱의 연결된 서비스에서 밥뭇나 권한도 직접 해제해 주세요.':'삼성 계정의 서비스 이용 권한까지 지우려면 SmartThings 앱의 연결된 서비스에서 밥뭇나를 해제해 주세요.'}</p>${action('remove','연결 해제하기',true)}${action('cancel','계속 연결해 둘게요')}`;
    const companion=!model.loading&&!content.includes('st-intro')?`<span class="bunny-portrait st-helper" aria-hidden="true"><img src="${asset}" alt=""></span>`:'';
    element.innerHTML=`<section class="card st-card" aria-busy="${model.loading||model.busy}">${feedback}${companion}${content}</section>`;
  }
  async function load(){
    const current=++revision;loadController?.abort();unsubscribe?.();unsubscribe=null;
    loadController=new AbortController();
    model.loading=true;model.failed=false;model.busy=false;model.enabled=false;model.user=null;model.connection={stage:'disconnected'};model.devices=null;model.confirm=false;model.error='';render();
    try{
      await withinDeadline(async signal=>{
        // An undeployed API must not wait for the auth SDK or its first event.
        const result=await fetcher('/api/smartthings/config',{cache:'no-store',signal});
        ensureActive(signal);
        if(result.status===404||result.ok&&!hasJSON(result))return;
        if(!result.ok||!hasJSON(result))throw Error();
        const settings=await result.json();ensureActive(signal);
        if(!settings||typeof settings.enabled!=='boolean')throw Object.assign(Error(),{code:'invalid_response'});
        if(!settings.enabled)return;
        const instance=await connect();ensureActive(signal);
        if(!instance?.getIdToken)return; // Separate auth providers do not share credentials.
        provider=instance;model.enabled=true;model.consentVersion=settings.consentVersion;
        const user=await new Promise(resolve=>{
          let received=false,lastIdentity;
          unsubscribe=provider.onUser(next=>{
            if(!alive||current!==revision||signal.aborted)return;
            const identity=`${next?.uid||''}:${next?.verified===true}`;
            if(!received){received=true;lastIdentity=identity;resolve(next);}
            else if(identity!==lastIdentity){lastIdentity=identity;void load();}
          });
        });
        ensureActive(signal);model.user=user;
        if(user?.verified){const connection=connectionData(await api(signal,'status'));ensureActive(signal);model.connection=connection;}
      },loadController.signal,requestTimeoutMs);
    }catch(error){if(alive&&current===revision){model.failed=true;model.error=smartThingsMessage(error?.code);unsubscribe?.();unsubscribe=null;}}
    finally{if(alive&&current===revision){model.loading=false;render();}}
  }
  async function click(event){
    event.stopPropagation();const target=event.target.closest('[data-st-action],[data-st-device]');if(!target||model.busy)return;
    const name=target.dataset.stAction;
    if(name==='reload'){void load();return;}
    if(name==='disconnect'||name==='cancel'){model.confirm=name==='disconnect';model.error='';render();element.querySelector('h2')?.scrollIntoView({block:'nearest'});return;}
    if(name==='start'&&!element.querySelector('[name="st-consent"]')?.checked){model.error=smartThingsMessage('consent_required');render();element.querySelector('[name="st-consent"]')?.focus();return;}
    const current=revision;model.busy=true;model.error='';model.notice='';render();
    try{
      if(name==='start'){
        const result=await withinDeadline(signal=>api(signal,'start','POST',{consentVersion:model.consentVersion}),loadController.signal,requestTimeoutMs),url=new URL(result.url);
        if(url.origin!=='https://api.smartthings.com'||!['/v1/oauth/authorize','/oauth/authorize'].includes(url.pathname))throw Error();
        if(alive&&current===revision)location.assign(url.href);
      }else if(name==='devices'){
        const result=await withinDeadline(signal=>api(signal,'devices'),loadController.signal,requestTimeoutMs);
        if(!Array.isArray(result.devices)||result.devices.some(device=>typeof device?.id!=='string'||typeof device?.label!=='string'))throw Object.assign(Error(),{code:'invalid_response'});
        if(alive&&current===revision)model.devices=result.devices;
      }else{
        const connection=await withinDeadline(signal=>name==='remove'?api(signal,'connection','DELETE',{confirm:true,forgetExpired:model.connection.stage==='reconnect_required'}):name==='check'?api(signal,'check','POST',{}):api(signal,'device','POST',{deviceId:target.dataset.stDevice||model.connection.device?.id}),loadController.signal,requestTimeoutMs);
        if(alive&&current===revision){model.connection=connectionData(connection);model.confirm=false;model.notice=name==='remove'?'밥뭇나의 기기 연결을 해제했어요.':name==='check'?'기기의 최근 상태를 확인했어요.':'기기를 연결했어요.';}
      }
    }catch(error){if(alive&&current===revision){model.error=smartThingsMessage(error.code);if(error.code==='reconnect_required')model.connection.stage='reconnect_required';}}
    finally{if(alive&&current===revision){model.busy=false;render();}}
  }
  element.addEventListener('click',click);render();
  void load();
  return ()=>{alive=false;revision++;loadController?.abort();unsubscribe?.();element.removeEventListener('click',click);};
}
