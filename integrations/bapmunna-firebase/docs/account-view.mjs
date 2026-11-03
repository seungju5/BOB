import {connectCloud} from './cloud-api.mjs';
import {koreanDay,MEAL_NAMES,authMessage,CONSENT_VERSION} from './auth-utils.mjs';
let providerPromise;
const getProvider=()=>providerPromise??=connectCloud();
const accountAssetRoot=new URL('./assets/',import.meta.url).href;
const safe=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const selectOptions=(values,current)=>Object.entries(values).map(([id,label])=>`<option value="${id}" ${id===current?'selected':''}>${label}</option>`).join('');

export function mountAccount(element,{admin=false,management,audience='senior',browseHref='#guardian',familyHref='#family',connectHref='#connect'}={}){
  const carer=!admin&&audience==='carer';
  const primaryAccountHref=`https://impact-series.web.app/bapmunna/${carer?'carer':'senior'}/#account`;
  let alive=true,provider,unwatchAuth,unwatchMeals,disposeManagement,generation=0;
  const model={loading:true,busy:false,user:null,profile:null,staff:false,meals:[],tab:'login',notice:'',problem:'',email:'',pendingVerificationEmail:'',recovery:false};
  function feedback(){return `${model.problem?`<p class="notice error" role="alert">${safe(model.problem)}</p>`:''}${model.notice?`<p class="account-success" role="status">${safe(model.notice)}</p>`:''}`;}
  function policy(){return '<details class="account-policy"><summary>저장되는 정보와 이용 목적</summary><p>이메일·표시 이름·가입 및 최근 계정 이용 시각은 회원 서비스와 고객 문의 관리를 위해 저장해요. 식사 직접 확인은 내 계정의 별도 기록으로 저장해요.</p><p>운영자는 고객 기본정보와 운영 메모를 보고, 일반 운영자 권한으로 개인 식사 기록은 조회할 수 없어요. 비밀번호는 인증 서비스가 관리하며 고객관리 표에 저장하지 않아요.</p><p>가상 체험 데이터는 자동으로 업로드하지 않아요. 내 기록에서 직접 입력한 내용만 저장하며, 저장한 식사 기록은 개별 삭제할 수 있어요.</p></details>';}
  function authForm(){
    const signup=model.tab==='signup',reset=model.tab==='reset';
    const title=reset?'비밀번호 찾기':signup?'처음 오셨나요?':admin?'관리센터 로그인':carer?'보호자님, 반가워요.':'오늘도 반가워요.';
    return `<div class="auth-shell"><section class="card account-card"><span class="bunny-portrait auth-mark" aria-hidden="true"><img src="${accountAssetRoot}bunny-natural.png" width="1254" height="1254" alt=""></span><h2>${title}</h2><p class="auth-subtitle">${reset?'재설정 링크를 이메일로 보내드릴게요.':signup?'이름과 이메일로 시작해요.':admin?'등록된 운영자 계정으로 시작하세요.':carer?'멀리 있어도, 안부는 가까이.':'오늘의 작은 소식을 이어가요.'}</p>
    ${feedback()}${provider?.signupNotice?`<p class="notice auth-service-note">가입 메일을 준비 중이에요. <a href="${primaryAccountHref}">기본 앱에서 시작하기 →</a></p>`:''}
    <form id="cloud-auth-form">${signup?'<label class="field">이름<input name="name" minlength="2" maxlength="30" autocomplete="nickname" placeholder="어떻게 불러드릴까요?" required></label>':''}<label class="field">이메일<input name="email" type="email" autocomplete="username" maxlength="254" value="${safe(model.email)}" placeholder="name@example.com" required></label>
    ${!reset?`<label class="field">비밀번호<input name="password" type="password" autocomplete="${signup?'new-password':'current-password'}" ${signup?'minlength="8"':''} maxlength="128" placeholder="${signup?'8자 이상으로 입력해 주세요.':'비밀번호를 입력해 주세요.'}" required></label><label class="check-row remember-row"><input type="checkbox" name="remember">로그인 상태 유지</label>`:''}
    ${signup?'<label class="check-row consent-check"><input type="checkbox" name="consent" required>회원 정보 저장 안내를 확인했어요.</label>':''}
    <button class="primary full" type="submit" ${model.busy?'disabled':''}>${model.busy?'진행 중…':reset?'재설정 메일 받기':signup?'가입하기':'로그인'}</button></form>
    ${provider?.supportsGoogle&&!signup&&!reset?'<button class="full google-login" type="button" data-cloud-action="google">Google로 계속하기</button>':''}
    <div class="auth-links">${signup||reset?'<button type="button" class="text-button" data-auth-tab="login">로그인으로 돌아가기</button>':`${!admin?'<button class="text-button" type="button" data-auth-tab="signup">회원가입</button>':''}<button class="text-button" type="button" data-auth-tab="reset">비밀번호 찾기</button>`}${model.pendingVerificationEmail?'<button class="text-button" type="button" data-cloud-action="resend">확인 메일 다시 받기</button>':''}</div>
    ${carer?'<p class="notice">보호자 본인의 계정으로 시작해요. 로그인해도 어르신의 기록이 자동으로 연결되지는 않아요.</p>':''}${policy()}<p class="auth-provider">${admin?'지정된 운영자만 이용할 수 있어요.':provider?.name==='Supabase'?'Supabase 별도 계정으로 이용해요.':'로그인 없이 먼저 둘러볼 수도 있어요.'}</p></section>${!admin?`<a class="auth-back" href="${safe(browseHref)}">${carer?'보호자용':'어르신용'} 먼저 둘러보기 →</a>`:''}</div>`;
  }
  function verifyView(){
    return `<section class="card account-narrow"><span class="pill">이메일 확인</span><h2>메일함에서 한 번 확인해 주세요.</h2><p>${safe(model.user.email)}</p><p>이메일을 확인한 뒤 ‘확인했어요’를 눌러 주세요. 확인 전에는 식사 기록과 고객관리 정보를 만들지 않아요.</p>${feedback()}<div class="buttons"><button class="primary" data-cloud-action="refresh-user">확인했어요</button><button data-cloud-action="resend">확인 메일 다시 받기</button></div><button class="text-button full" data-cloud-action="logout">로그아웃</button></section>`;
  }
  function profileForm(){
    const needsConsent=!model.profile||model.profile.consentVersion!==CONSENT_VERSION;
    return `<form id="cloud-profile-form" class="profile-form"><h2>${model.profile?'내 정보':'어떻게 불러드릴까요?'}</h2><label class="field">이름<input name="name" minlength="2" maxlength="30" autocomplete="nickname" value="${safe(model.profile?.displayName||model.user.displayName)}" required></label><p class="label">${safe(model.user.email)}</p>${needsConsent?'<label class="check-row consent-check"><input type="checkbox" name="consent" required>회원 정보와 식사 기록의 저장 안내를 확인했어요.</label>':''}${policy()}<button type="submit" class="primary full" ${model.busy?'disabled':''}>${model.profile?'이름 저장':carer?'내 계정 시작':'내 기록 시작'}</button></form>`;
  }
  function mealRows(items,editable=false){return items.map(item=>`<li><div><strong>${safe(item.day)} · ${MEAL_NAMES[item.meal]||safe(item.meal)}</strong><p>${item.kind==='outside'?'외식·배달':'집에서 식사'} · 직접 확인</p></div>${editable?`<button class="text-button danger-text" data-delete-meal="${safe(item.id)}" aria-label="${safe(item.day)} ${MEAL_NAMES[item.meal]} 기록 삭제">삭제</button>`:''}</li>`).join('');}
  function recordsView(){
    const day=koreanDay(),today=model.meals.filter(meal=>meal.day===day),image=today.length?'rice-full.png':'rice-empty.webp';
    const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',hour:'numeric',hourCycle:'h23'}).format(new Date())),slot=hour<11?'breakfast':hour<17?'lunch':'dinner';
    return `<div class="account-welcome"><h2>${safe(model.profile?.displayName||model.user.displayName||'사용자')}님, 안녕하세요.</h2><p class="label">${day} · 나의 식사 기록</p></div>${feedback()}
    <p class="st-account-entry"><a href="${safe(connectHref)}">내 SmartThings 플러그 연결하기 →</a></p>
    ${!model.profile?`<section class="card account-narrow">${profileForm()}<button class="text-button full" data-cloud-action="logout">로그아웃</button></section>`:`<div class="account-record-layout"><div class="stack"><section class="rice-card account-rice"><img class="rice-image" src="${accountAssetRoot}${image}" width="220" height="147" alt=""><h2>오늘 남긴 소식 ${today.length}/3</h2><p class="caption">직접 확인한 기록이에요. 실제 섭취량을 뜻하지 않아요.</p></section>
    <form id="cloud-meal-form" class="card"><h2>오늘 식사를 남겨요.</h2><div class="field-row"><label class="field">끼니<select name="meal">${selectOptions(MEAL_NAMES,slot)}</select></label><label class="field">식사 종류<select name="kind">${selectOptions({home:'집에서',outside:'외식·배달'},'home')}</select></label></div><button class="primary full meal-save" type="submit" ${model.busy?'disabled':''}>식사했어요 · 저장</button><p class="caption">실제로 식사한 뒤 눌러 주세요.<br>같은 끼니를 다시 남기면 종류를 바꿔 저장해요.</p></form></div>
    <section class="card"><h2>최근 기록</h2>${model.meals.length?`<ul class="saved-meals">${mealRows(model.meals.slice(0,5))}</ul><details class="quiet-details account-history"><summary>전체 기록·삭제</summary><p class="caption">최근 90개까지 볼 수 있어요.</p><ul class="saved-meals">${mealRows(model.meals,true)}</ul></details>`:'<p class="muted empty-message">아직 남긴 기록이 없어요.<br>오늘의 첫 소식을 남겨보세요.</p>'}</section></div>
    <details class="card quiet-details account-settings"><summary>내 정보·로그아웃</summary>${profileForm()}<button class="text-button full" data-cloud-action="logout">로그아웃</button>${model.staff?'<a class="quiet-link" href="./manage/">운영자 공간 →</a>':''}</details>`}`;
  }
  function crmView(){
    if(!model.staff)return `<section class="card account-narrow"><h2>운영자 권한이 필요해요.</h2><p>이 계정은 고객관리 담당자로 지정되지 않았어요. 일반 회원의 로그인과 권한을 구분해 보호합니다.</p>${feedback()}<button data-cloud-action="logout">다른 계정으로 로그인</button><p class="caption"><a href="../#account">내 계정으로 돌아가기</a></p></section>`;
    return '<section class="card account-narrow"><p>관리센터를 준비하고 있어요.</p></section>';
  }
  function carerView(){
    return `<div class="account-welcome"><h2>${safe(model.profile?.displayName||model.user.displayName||'보호자')}님, 안녕하세요.</h2><p class="label">보호자 본인의 계정</p></div>${feedback()}<section class="card st-account-entry"><h2>우리 집 플러그 연결</h2><p>삼성 계정으로 허용하고, 내가 쓸 기기를 골라요.</p><a href="${safe(connectHref)}">SmartThings 연결하기 →</a></section><section class="card carer-connection"><span class="pill">가족 연동 준비 중</span><h2>어르신과의 연결은<br>동의부터 시작해요.</h2><p>실제 가족 초대와 다른 계정의 식사 요약은 아직 연결되지 않았어요. 현재 보호자 홈·알림·리포트는 가상 데이터로 둘러볼 수 있어요.</p><a class="quiet-link" href="${safe(familyHref)}">가족 초대 흐름 체험하기 →</a><p class="caption">어르신의 로그인 정보를 공유받지 마세요. 본인 기록과 가족 공유는 별도로 관리해요.</p></section><section class="card account-narrow carer-profile">${profileForm()}<button class="text-button full" data-cloud-action="logout">로그아웃</button>${model.staff?'<a class="quiet-link" href="./manage/">운영자 공간 →</a>':''}</section>`;
  }

  function render(){
    if(!alive)return;
    disposeManagement?.();disposeManagement=null;
    if(admin)document.body.dataset.managerState='guest';
    if(admin&&management&&provider&&model.user?.verified&&model.staff&&!model.loading&&!model.recovery){
      document.body.dataset.managerState='ready';disposeManagement=management(element,{provider,user:model.user});return;
    }
    if(model.loading){element.innerHTML='<section class="card account-narrow" role="status"><p>계정 연결을 확인하고 있어요…</p></section>';return;}
    if(!provider){element.innerHTML=`<section class="card account-narrow"><h2>계정 연결을 확인해 주세요.</h2>${feedback()}<button data-cloud-action="retry">다시 연결</button><p class="caption"><a href="${primaryAccountHref}">기본 앱에서 내 기록 열기</a></p></section>`;return;}
    if(model.recovery&&model.user){element.innerHTML=`<form id="cloud-password-form" class="card account-narrow"><h2>새 비밀번호를 정해 주세요.</h2>${feedback()}<label class="field">새 비밀번호<input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><button class="primary full" type="submit" ${model.busy?'disabled':''}>비밀번호 저장</button></form>`;return;}
    element.innerHTML=!model.user?authForm():!model.user.verified?verifyView():admin?crmView():carer?carerView():recordsView();
  }
  async function loadUser(user,metadata={}){
    const revision=++generation;unwatchMeals?.();unwatchMeals=null;
    model.user=user;model.profile=null;model.staff=false;model.meals=[];model.loading=true;model.recovery=!!metadata.recovery||model.recovery;if(user?.verified)model.pendingVerificationEmail='';render();
    try{
      if(user?.verified&&!model.recovery){
        const [profile,staff]=await Promise.all([provider.getProfile(),provider.isStaff()]);
        if(!alive||revision!==generation)return;
        model.profile=profile;model.staff=staff;
        if(!admin&&profile){if(!carer)unwatchMeals=provider.watchMeals(meals=>{if(alive&&revision===generation){model.meals=meals;render();}},error=>{model.problem=authMessage(error);render();});await provider.touchLogin();}
      }
    }catch(error){model.problem=authMessage(error);}
    if(alive&&revision===generation){model.loading=false;render();}
  }
  async function run(operation,notice=''){
    if(model.busy)return;
    model.busy=true;model.problem='';model.notice='';render();
    try{await operation();if(notice)model.notice=notice;}
    catch(error){model.problem=authMessage(error);}
    finally{model.busy=false;render();}
  }
  const click=async event=>{
    event.stopPropagation();
    const button=event.target.closest('button');if(!button||(button.closest('form')&&button.type==='submit')||model.busy)return;
    if(button.dataset.authTab){model.tab=button.dataset.authTab;model.problem='';model.notice='';render();return;}
    if(button.dataset.deleteMeal&&!carer){
      const id=button.dataset.deleteMeal;
      const dialog=document.createElement('dialog');dialog.setAttribute('aria-label','내 식사 기록 삭제');dialog.innerHTML='<h2>이 식사 기록을 지울까요?</h2><p>저장된 이 기록을 삭제해요. 다시 확인하려면 새로 남겨야 해요.</p><div class="buttons"><button class="dark" data-delete-confirm>기록 삭제</button><button data-delete-cancel>취소</button></div>';
      element.append(dialog);dialog.showModal();
      dialog.addEventListener('cancel',()=>dialog.remove(),{once:true});dialog.querySelector('[data-delete-cancel]').onclick=()=>dialog.remove();dialog.querySelector('[data-delete-confirm]').onclick=()=>{dialog.remove();run(()=>provider.removeMeal(id),'선택한 내 식사 기록을 삭제했어요.');};return;
    }
    const name=button.dataset.cloudAction;if(!name)return;
    if(name==='retry'){location.reload();return;}
    if(name==='logout'){await run(async()=>{await provider.signOut();model.user=null;model.profile=null;model.recovery=false;});return;}
    if(name==='google'){await run(()=>provider.google(false));return;}
    if(name==='refresh-user'){await run(async()=>loadUser(await provider.refreshUser()),'이메일 확인 상태를 갱신했어요.');return;}
    if(name==='resend'){await run(()=>provider.resendVerification(model.pendingVerificationEmail||model.email),'확인 메일을 요청했어요. 메일함과 스팸함을 확인해 주세요.');return;}
  };
  const submit=async event=>{
    const form=event.target;if(!form.matches('#cloud-auth-form,#cloud-profile-form,#cloud-meal-form,#cloud-password-form'))return;
    event.preventDefault();if(model.busy)return;
    const fields=new FormData(form);
    try{
      await run(async()=>{
        if(form.id==='cloud-auth-form'){
          model.email=String(fields.get('email')).trim();const password=String(fields.get('password')||''),remember=fields.get('remember')==='on';
          if(model.tab==='reset'){await provider.resetPassword(model.email);model.notice='입력한 주소로 안내 가능한 경우 재설정 메일을 보냈어요.';}
          else if(model.tab==='signup'){if(fields.get('consent')!=='on')throw Error('저장 목적 확인이 필요해요.');await provider.signUp(model.email,password,fields.get('name'),remember);model.pendingVerificationEmail=model.email;model.notice='확인 메일을 보냈어요. 이메일 확인 뒤 내 기록을 시작해 주세요.';await loadUser(await provider.refreshUser());}
          else await provider.signIn(model.email,password,remember);
        }else if(form.id==='cloud-profile-form'){
          if((!model.profile||model.profile.consentVersion!==CONSENT_VERSION)&&fields.get('consent')!=='on')throw Error('저장 목적 확인이 필요해요.');await provider.saveProfile(fields.get('name'));await loadUser(model.user);model.notice='표시 이름과 회원 기본정보를 저장했어요.';
        }else if(form.id==='cloud-meal-form'){
          if(carer)throw Error('식사 직접 확인은 어르신용의 본인 기록에서 이용해 주세요.');
          await provider.saveMeal(fields.get('meal'),fields.get('kind'));model.notice='내 계정에 실제 식사 직접 확인을 저장했어요.';
        }else if(form.id==='cloud-password-form'){
          await provider.changePassword(String(fields.get('password')));model.recovery=false;await loadUser(await provider.refreshUser());model.notice='새 비밀번호를 저장했어요.';
        }
      });
    }finally{for(const input of form.querySelectorAll('input[type="password"]'))input.value='';}
  };
  element.addEventListener('click',click);element.addEventListener('submit',submit);
  render();getProvider().then(instance=>{if(!alive)return;provider=instance;unwatchAuth=provider.onUser((user,metadata)=>{loadUser(user,metadata);});}).catch(error=>{if(alive){model.loading=false;model.problem=error.message;render();}});
  return ()=>{alive=false;generation++;unwatchAuth?.();unwatchMeals?.();disposeManagement?.();element.removeEventListener('click',click);element.removeEventListener('submit',submit);};
}
