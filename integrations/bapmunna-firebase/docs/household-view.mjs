import {connectCloud} from './cloud-api.mjs';
import {deploymentConfig} from './deployment-config.mjs';

const RELATIONS={mother:'어머니',father:'아버지',parents:'부모님',other:'그 밖의 소중한 분'};
const PRIVACY_URL=`${deploymentConfig.webOrigin}/bapmunna/app/privacy/`;
const safe=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const emptyDraft=()=>({relation:'',alias:'',residentCount:1,hasPet:false});

function homeLink(value){
  if(typeof value!=='string'||!value||/[\u0000-\u0020\\]/.test(value)||value.startsWith('//')||/^[a-z][a-z\d+.-]*:/i.test(value))return '#guardian';
  try{
    const url=new URL(value,'https://bapmunna.invalid/');
    if(url.origin!=='https://bapmunna.invalid'||url.search||!['#guardian','#senior'].includes(url.hash))return '#guardian';
    return value;
  }catch{return '#guardian';}
}

function validDraft(draft){
  return draft&&Object.hasOwn(RELATIONS,draft.relation)&&typeof draft.alias==='string'
    &&draft.alias.trim().length>=1&&draft.alias.trim().length<=30
    &&Number.isInteger(draft.residentCount)&&draft.residentCount>=1&&draft.residentCount<=6
    &&typeof draft.hasPet==='boolean';
}

function storedDraft(record,uid){
  if(!record||record.ownerUid!==uid||!validDraft(record)||record.alias!==record.alias.trim()||!record.updatedAt)throw Error('invalid-household');
  return {relation:record.relation,alias:record.alias,residentCount:record.residentCount,hasPet:record.hasPet};
}

export function mountHousehold(element,{homeHref='#guardian',connect=connectCloud}={}){
  const home=homeLink(homeHref),account=`${home.split('#')[0]}#account`;
  let alive=true,provider,unwatchAuth,connectionEpoch=0,operation=0,authSeen=false;
  const pending=new Map();
  const model={phase:'connecting',user:null,draft:emptyDraft(),existing:false,consent:false,problem:''};
  const current=(revision,uid)=>alive&&operation===revision&&model.user?.uid===uid&&model.user?.verified===true;
  const skip=()=>`<p class="caption"><a href="${safe(home)}">나중에 홈으로 →</a></p>`;
  const privacy=()=>`<p class="caption">입력한 기본정보는 내 계정에 저장해요. 어르신께 안내하고 동의를 확인한 뒤 저장해 주세요. 실제 기기 연결과 가족 공유 권한은 별도로 확인해요. <a href="${PRIVACY_URL}" target="_blank" rel="noopener noreferrer">개인정보 안내 보기</a></p>`;
  const problem=()=>model.problem?`<p class="notice error" role="alert">${safe(model.problem)}</p>`:'';

  function bounded(run){
    return new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(callback,value)=>{if(settled)return;settled=true;clearTimeout(timer);pending.delete(timer);callback(value);};
      const timer=setTimeout(()=>finish(reject,Error('household-timeout')),12_000);
      pending.set(timer,()=>finish(reject,Error('household-unmounted')));
      Promise.resolve().then(run).then(value=>finish(resolve,value),error=>finish(reject,error));
    });
  }

  function render(){
    if(!alive)return;
    const phase=model.phase;
    let body;
    if(['connecting','auth','loading'].includes(phase)){
      body=`<p role="status">${phase==='loading'?'이 계정에 저장된 기본정보를 확인하고 있어요…':'로그인한 계정을 확인하고 있어요…'}</p>${skip()}`;
    }else if(phase==='connect-error'){
      body=`${problem()}<button type="button" data-household-action="retry-connect">다시 연결</button>${skip()}`;
    }else if(phase==='signed-out'||phase==='unverified'){
      body=`<p>${phase==='unverified'?'이메일 확인을 마친 뒤 기본정보를 저장할 수 있어요.':'먼저 보호자 본인의 계정으로 로그인해 주세요.'}</p><p><a href="${safe(account)}">내 계정 확인하기 →</a></p>${skip()}`;
    }else if(phase==='unsupported'){
      body=`<p class="notice">이 버전의 가구 정보 저장은 준비 중이에요.</p><p>Firebase와 Supabase는 별도 계정이에요. 이 화면에서 입력 정보를 다른 서비스로 옮기지 않아요.</p>${skip()}`;
    }else if(phase==='load-error'){
      body=`${problem()}<button type="button" data-household-action="retry-load">기본정보 다시 불러오기</button>${skip()}`;
    }else if(phase==='saved'){
      body=`<p class="account-success" role="status">내 계정에 기본정보를 저장했어요.</p><dl><dt>호칭</dt><dd>${safe(model.draft.alias)}</dd><dt>관계</dt><dd>${RELATIONS[model.draft.relation]}</dd><dt>함께 사는 인원</dt><dd>${model.draft.residentCount}명</dd><dt>반려동물</dt><dd>${model.draft.hasPet?'함께 살아요':'없어요'}</dd></dl><p>기기 연결과 가족 공유 권한은 따로 확인해요. 연결 전에도 홈을 둘러볼 수 있어요.</p><p><a class="account-browse-link" href="${safe(home)}">홈으로 가기 →</a></p><button class="text-button" type="button" data-household-action="edit">기본정보 수정</button>`;
    }else{
      const disabled=phase==='saving'?'disabled':'',draft=model.draft;
      body=`${model.existing?'<p class="caption">이 계정에 저장된 기본정보예요. 필요하면 수정해 주세요.</p>':''}${problem()}${model.problem?'<button class="text-button" type="button" data-household-action="retry-load">저장 결과 다시 확인하기</button>':''}${privacy()}
        <form data-household-form aria-busy="${phase==='saving'}">
          <fieldset ${disabled}><legend>가구 기본정보</legend>
            <label class="field">누구의 안부를 살필까요?<select name="relation" required><option value="">관계를 선택해 주세요</option>${Object.entries(RELATIONS).map(([value,label])=>`<option value="${value}" ${draft.relation===value?'selected':''}>${label}</option>`).join('')}</select></label>
            <label class="field">어떻게 불러드릴까요?<input name="alias" value="${safe(draft.alias)}" minlength="1" maxlength="30" autocomplete="off" placeholder="호칭을 입력해 주세요" aria-describedby="household-alias-help" required></label><p class="caption" id="household-alias-help">호칭은 1~30자로 적어요. 실명이나 자세한 주소는 필요하지 않아요.</p>
            <label class="field">함께 사는 인원<select name="residentCount" required>${[1,2,3,4,5,6].map(count=>`<option value="${count}" ${draft.residentCount===count?'selected':''}>${count}명</option>`).join('')}</select></label><p class="caption">안부를 살필 분을 포함한 인원이에요.</p>
            <label class="check-row"><input type="checkbox" name="hasPet" ${draft.hasPet?'checked':''}>반려동물과 함께 살아요</label>
            <label class="check-row"><input type="checkbox" name="privacyConsent" required ${model.consent?'checked':''}>필수 · 어르신께 개인정보 안내를 설명하고 정보 이용 동의를 확인했어요.</label>
          </fieldset>
          <button type="submit" class="primary full" ${disabled}>${phase==='saving'?'저장 확인 중…':'기본정보 저장'}</button>
          ${phase==='saving'?'<p role="status">서버에서 저장 결과를 확인하고 있어요.</p>':''}
        </form>${skip()}`;
    }
    element.innerHTML=`<section class="card account-narrow"><span class="pill">홈에 가기 전</span><h2>어떤 댁의 안부를 살필까요?</h2><p>기본정보만 먼저 알려주세요.</p>${body}</section>`;
  }

  async function loadHousehold(){
    if(!alive||!model.user?.verified)return;
    const uid=model.user.uid,revision=++operation;
    model.existing=false;model.consent=false;model.problem='';
    if(typeof provider?.getHousehold!=='function'||typeof provider?.saveHousehold!=='function'){
      model.phase='unsupported';render();return;
    }
    model.phase='loading';render();
    try{
      const record=await bounded(()=>{if(!current(revision,uid))throw Error('stale-household');return provider.getHousehold(uid);});if(!current(revision,uid))return;
      if(record!==null)model.draft=storedDraft(record,uid);model.existing=record!==null;model.phase='ready';
    }catch{
      if(!current(revision,uid))return;
      model.phase='load-error';model.problem='기본정보를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.';
    }
    render();
  }

  function acceptUser(user){
    if(!alive)return;
    const changed=!authSeen||model.user?.uid!==user?.uid||model.user?.verified!==user?.verified;
    if(!changed)return; // A same-account auth event must not replace an unsaved draft.
    authSeen=true;operation++;model.user=user;model.draft=emptyDraft();model.existing=false;model.consent=false;model.problem='';
    if(!user){model.phase='signed-out';render();return;}
    if(user.verified!==true){model.phase='unverified';render();return;}
    void loadHousehold();
  }

  async function startConnection(){
    const revision=++connectionEpoch;operation++;unwatchAuth?.();unwatchAuth=null;provider=null;authSeen=false;
    model.user=null;model.draft=emptyDraft();model.existing=false;model.consent=false;model.problem='';model.phase='connecting';render();
    try{
      const connected=await bounded(connect);if(!alive||revision!==connectionEpoch)return;
      provider=connected;model.phase='auth';render();
      await bounded(()=>new Promise(resolve=>{
        const unsubscribe=provider.onUser(user=>{if(alive&&revision===connectionEpoch){acceptUser(user);resolve();}});
        if(!alive||revision!==connectionEpoch)unsubscribe?.();else unwatchAuth=unsubscribe;
      }));
    }catch{
      if(!alive||revision!==connectionEpoch)return;
      operation++;connectionEpoch++;unwatchAuth?.();unwatchAuth=null;provider=null;model.phase='connect-error';model.problem='계정 연결을 확인하지 못했어요. 다시 시도해 주세요.';render();
    }
  }

  async function onSubmit(event){
    if(!event.target?.matches?.('[data-household-form]'))return;
    event.preventDefault();event.stopPropagation?.();
    if(!alive||model.phase!=='ready'||model.user?.verified!==true)return;
    const values=new FormData(event.target);
    const draft={relation:String(values.get('relation')??''),alias:String(values.get('alias')??'').trim(),residentCount:Number(values.get('residentCount')),hasPet:values.get('hasPet')==='on'};
    model.draft=draft;model.consent=values.get('privacyConsent')==='on';model.problem='';
    if(!validDraft(draft)){model.problem='관계, 1~30자의 호칭, 함께 사는 인원을 확인해 주세요.';render();return;}
    if(!model.consent){model.problem='개인정보 안내를 읽고 어르신의 동의를 확인해 주세요.';render();return;}
    const uid=model.user.uid,revision=++operation;model.phase='saving';render();
    try{
      const record=await bounded(()=>{if(!current(revision,uid))throw Error('stale-household');return provider.saveHousehold({...draft},uid);});if(!current(revision,uid))return;
      model.draft=storedDraft(record,uid);model.existing=true;model.phase='saved';
    }catch{
      if(!current(revision,uid))return;
      model.phase='ready';model.problem='저장 결과를 확인하지 못했어요. 입력한 내용은 그대로 두었어요. 다시 저장해 주세요.';
    }
    render();
  }

  function onClick(event){
    const action=event.target?.closest?.('[data-household-action]')?.dataset.householdAction;
    if(!action||!alive)return;event.stopPropagation?.();
    if(action==='retry-connect'&&model.phase==='connect-error')return startConnection();
    if(action==='retry-load'&&(model.phase==='load-error'||model.phase==='ready'&&model.problem))return loadHousehold();
    if(action==='edit'&&model.phase==='saved'){model.phase='ready';model.consent=false;render();}
  }
  element.addEventListener('submit',onSubmit);element.addEventListener('click',onClick);void startConnection();
  return ()=>{if(!alive)return;alive=false;connectionEpoch++;operation++;unwatchAuth?.();unwatchAuth=null;for(const cancel of pending.values())cancel();element.removeEventListener('submit',onSubmit);element.removeEventListener('click',onClick);};
}
