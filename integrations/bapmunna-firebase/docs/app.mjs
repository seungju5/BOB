import {createBunnyGreeting} from './bunny-greeting.mjs';
import {MEALS,LABELS,DAY,DEVICES,dayOf,hhmm,dateLabel,key,createState,record,status,evaluate,activeMeal,inAway,advance,confirmMeal,ingestSensor,ingestDevice,setDeviceOnline,deviceOnline,setAway,cancelAway,setConsent,configure,updateProfile,baseline,report,requestHelp,resolveHelp,setSocial} from './engine.mjs';
import {FAMILY_ROLES,createInvite,acceptInvite,revokeMember,familySummary} from './family.mjs';
import {STATUS_COPY,riceState} from './presentation.mjs';
import {runChecks} from './checks.mjs';
import {mountAccount} from './account-view.mjs';
import {mountSmartThings} from './smartthings-view.mjs';
import {EDITIONS,editionFromLocation,editionView,initialEditionView,editionLink,rememberEdition,recalledEdition} from './editions.mjs';
import {SETUP_STEPS,setupDraft,validateSetup,applySetup,readSetupForm,setupContent,dateInput,parseDateInput,patternComparison} from './worksheet.mjs';
import {mealEvidence,careHeadline,JOURNEY_SCENARIOS,journeyScene,reportDayAfterKey,awayPresetRange} from './experience.mjs';

// Resolve once against the entry document; role switches change the URL without reloading.
const ASSETS=Object.fromEntries(Object.entries({logo:'./assets/rice-logo.png',partner:'./assets/partner.png',bunny:'./assets/bunny.png',underlay:'./assets/bunny-underlay.webp',companion:'./assets/rice-cooker-companion.png',cooker:'./assets/rice-cooker-companion.png',full:'./assets/rice-full.png',half:'./assets/rice-half.webp',empty:'./assets/rice-empty.webp',eatout:'./assets/eatout.svg',away:'./assets/away.svg',help:'./assets/help.svg',family:'./assets/family.svg',info:'./assets/info.svg',phone:'./assets/phone.svg',heart:'./assets/heart.svg',history:'./assets/history.svg'}).map(([name,path])=>[name,new URL(path,document.baseURI).href]));
const root=document.querySelector('#view');
const viewNames=['welcome','senior','guardian','report','family','settings','devices','about','account','more','alerts','privacy','setup','journey','connect'];
const CLOUD_AVAILABLE=document.querySelector('meta[name="bapmunna-cloud"]')?.content==='enabled';
const appBase=new URL('./',import.meta.url);
let edition=editionFromLocation(location,document.querySelector('meta[name="bapmunna-edition"]')?.content,CLOUD_AVAILABLE?recalledEdition(appBase):null);
function initialView(){return initialEditionView(location,edition);}
const editionHref=(id,route='')=>CLOUD_AVAILABLE?editionLink(appBase,id,route):`#${id?`${id}/${route||EDITIONS[id].home}`:'welcome'}`;
const routeHref=route=>`${location.pathname}#${!CLOUD_AVAILABLE&&edition?`${edition}/`:''}${route}`;
let state=demoState(),view=initialView(),accountCleanup=null;
let period=7,chosenMeal=null,modal=null,checkResults=null,toastTimer,focusReturn=null;
let welcomeSeen=false,welcomeGreeting=null;
let setup=null;
let journey={step:0,scenario:'ordinary',returnView:'welcome'},setupWelcome=false,receipt=null,reportDay=null;
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const art=(name,width,height,alt='',className='')=>`<img src="${ASSETS[name]}" width="${width}" height="${height}" alt="${esc(alt)}" class="${className}" decoding="async">`;
const icon=(name,size)=>art(name,size,size);
// A decorative guide, separate from the data-driven full/half/empty rice bowls.
const bunnyCompanion=(className='')=>`<span class="bunny-portrait ${className}" aria-hidden="true">${art('companion',480,480)}</span>`;
const brandSymbol=()=>`<span class="brand-symbol" aria-hidden="true">${art('logo',1254,1254)}</span>`;
const options=(values,current)=>Object.entries(values).map(([id,label])=>`<option value="${esc(id)}" ${String(id)===String(current)?'selected':''}>${esc(label)}</option>`).join('');
const uiIcon=name=>`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${({clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',rhythm:'<path d="M3 12h4l3-7 4 14 3-7h4"/>',bell:'<path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 8H3c0-1 3-1 3-8Z M10 21h4"/>',away:'<path d="M13 5h6v6 M19 5 9 15 M7 5H4v15h15v-6"/>',share:'<path d="M12 21S3 16 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 7-9 12-9 12Z"/>',arrow:'<path d="m9 5 7 7-7 7"/>',check:'<path d="m5 12 4 4L19 6"/>'})[name]||''}</svg>`;
const compactStatus={confirmed:'확인됨',eat_out:'외식',signal:'기기 신호',waiting:'대기 중',missing:'미확인',offline:'연결 확인',away:'부재',upcoming:'시간 전',unobserved:'관찰 전',private:'공유 쉼',unplanned:'설정 없음'};
const statusSymbol=kind=>['confirmed','eat_out'].includes(kind)?'✓':kind==='signal'?'∿':kind==='missing'?'!':kind==='away'?'↗':['offline','unobserved','private','unplanned'].includes(kind)?'—':'◷';

function demoState(seed=true){
  const next=createState(seed);
  if(seed){next.now=702;ingestDevice(next,'cooker','lid');next.now=750;evaluate(next);}
  return next;
}
function meal(){
  if(chosenMeal&&MEALS.includes(chosenMeal))return chosenMeal;
  return activeMeal(state)||state.config.windows.filter(window=>window.start<=state.now%DAY).at(-1)?.id||'breakfast';
}
function started(id){return state.now>=dayOf(state.now)*DAY+state.config.windows.find(window=>window.id===id).start;}
function timeLabel(time){return time===null?'아직 받은 신호 없음':`${dayOf(time)===dayOf(state.now)?'오늘':dateLabel(dayOf(time))} ${hhmm(time)}`;}
function heading(title,kicker='',sub=''){
  return `<header class="page-head">${kicker?`<p>${esc(kicker)}</p>`:''}<h1 tabindex="-1">${title}</h1>${sub?`<p class="sub">${sub}</p>`:''}</header>`;
}
function toast(message){
  const box=document.querySelector('#toast');clearTimeout(toastTimer);box.hidden=false;box.textContent=message;
  toastTimer=setTimeout(()=>{box.hidden=true;},6500);
}
function mealStrip(source=state,interactive=true){
  return `<div class="meal-strip" aria-label="오늘의 끼니별 요약">${MEALS.map(id=>{const kind=status(source,dayOf(source.now),id);const tag=interactive?'button':'div';return `<${tag} class="meal-slot ${kind}" ${interactive?`data-meal-detail="${id}" data-day="${dayOf(source.now)}"`:''} aria-label="${LABELS[id]} · ${STATUS_COPY[kind]}${interactive?' · 근거 보기':''}"><strong>${LABELS[id]}</strong><span class="slot-symbol" aria-hidden="true">${statusSymbol(kind)}</span><span class="pill ${kind}">${compactStatus[kind]}</span></${tag}>`;}).join('')}</div>`;
}

function journeyEntry(){
  return `<button class="journey-entry" data-action="journey-start"><span class="journey-play" aria-hidden="true">▷</span><span><strong>밥뭇나, 1분만 만나볼까요?</strong><small>밥솥에서 가족에게, 안부가 전해지는 과정</small></span>${uiIcon('arrow')}</button>`;
}
function journeyView(){
  const j=journey,scene=journeyScene(j.step,j.scenario),headline=careHeadline(scene),evidence=riceState(scene,'lunch');
  const titles=['평소처럼, 밥솥을 써요.','작은 움직임이<br>안부가 됐어요.','이제, 가족의 화면에서.','서로 다른 하루도,<br>다정하게 이해해요.'];
  const descriptions=['별도의 사진이나 확인 버튼 없이, 일상의 신호를 살펴보는 서비스예요.','11:42에 보낸 가상 신호가 점심 기록에 반영됐어요.','중요한 소식부터 보고, 필요할 때 직접 연락해요.','하나를 눌러 보세요. 실제 앱의 판단 규칙으로 바뀌어요.'];
  const scenario=JOURNEY_SCENARIOS.find(item=>item.id===j.scenario);
  return `<div class="journey-toolbar"><span class="brand">${brandSymbol()} 밥뭇나</span><button class="text-button" data-action="journey-close">체험 나가기 <span aria-hidden="true">×</span></button></div>
    <div class="journey-progress" aria-label="안부 체험 ${j.step+1} / 4">${[0,1,2,3].map(i=>`<span class="${i<=j.step?'done':''}"></span>`).join('')}</div>
    ${heading(titles[j.step],`1분 안부 체험 · ${j.step+1} / 4`,descriptions[j.step])}
    ${j.step===3?`<div class="scenario-choices" role="group" aria-label="가상 하루 선택">${JOURNEY_SCENARIOS.map(item=>`<button data-scenario="${item.id}" aria-pressed="${item.id===j.scenario}">${item.label}</button>`).join('')}</div>`:''}
    <section class="journey-scene ${headline.tone}" aria-label="독립된 가상 예시">
      <div class="scene-label"><span>${j.step<2?'어르신의 일상':'보호자가 보는 안부'}</span><span>가상 시계 ${hhmm(scene.now)}</span></div>
      <div class="journey-bowl">${art(evidence.level,800,534,'기록에 따라 달라지는 안부 밥그릇')}${j.step===0?`<span class="scene-signal" aria-hidden="true">${uiIcon('rhythm')}</span>`:'<span class="scene-received">'+statusSymbol(status(scene,0,'lunch'))+' 점심 · '+compactStatus[status(scene,0,'lunch')]+'</span>'}</div>
      <h2>${j.step===0?'새 소식을 기다리고 있어요':headline.title}</h2><p>${j.step===0?'아래 버튼으로 가상 뚜껑 열림을 보내세요.':headline.detail}</p>
      ${j.step>=2?mealStrip(scene,false):`<div class="signal-route"><span>밥솥 움직임</span><span aria-hidden="true">→</span><span>끼니 요약</span><span aria-hidden="true">→</span><span>가족의 안부</span></div>`}
      ${j.step===3?`<div class="scenario-explanation" role="status"><strong>${scenario.title}</strong><p>${scenario.description}</p></div>`:''}
    </section>
    <div class="journey-controls">${j.step?'<button class="journey-previous" data-action="journey-back">이전</button>':''}${j.step<3?`<button class="primary" data-action="journey-next">${['뚜껑 열림 보내보기','보호자 화면에서 보기','다른 하루도 살펴보기'][j.step]} ${uiIcon('arrow')}</button>`:'<button class="primary" data-view="guardian">보호자 홈 둘러보기 '+uiIcon('arrow')+'</button>'}</div>
    ${j.step===3?'<button class="text-button full" data-view="senior">어르신 홈 둘러보기 →</button>':''}
    <p class="journey-scope">독립된 가상 체험이에요. 기존 체험 기록은 바꾸지 않아요.<br>실제 식사량·건강을 판단하거나 가족에게 전송하지 않아요.</p>`;
}
function bowl(compact=false){
  const evidence=riceState(state,meal()),last=state.devices.cooker.lastActivity;
  return `<section class="rice-card ${compact?'compact':''}" aria-label="${LABELS[meal()]} 안부 밥그릇">
    ${art(evidence.level,evidence.level==='full'?800:1536,evidence.level==='full'?534:1024,'',`rice-image ${['away','private','offline'].includes(evidence.status)?'neutral':''}`)}
    <div class="row"><span class="pill ${evidence.status}">${LABELS[meal()]} · ${STATUS_COPY[evidence.status]}</span><button class="bowl-info" data-action="bowl-info" aria-label="밥그릇 표현 안내">${icon('info',18)}<span>표현 안내</span></button></div>
    ${compact?`<div class="compact-cooker"><span>마지막 밥솥 신호<br><small>${deviceOnline(state,'cooker')?'가상 기기 · 연결됨':'기기 연결 확인 필요'}</small></span><strong>${last===null?'—':hhmm(last)}</strong></div><p class="bowl-legend">소식을 담은 그림이에요. 실제 식사량이 아니에요.</p>`:`<p class="rice-title">${evidence.title}</p><p class="rice-detail">${evidence.detail}</p><div class="rice-meta"><div><p class="label">마지막 밥솥 사용 신호 · 가상</p><p class="signal-time">${last===null?'—':hhmm(last)}</p><p class="label">${last===null?'':dayOf(last)===dayOf(state.now)?'오늘 수신한 사용 신호':timeLabel(last)} · ${deviceOnline(state,'cooker')?'기기 연결됨':'기기 연결 확인 필요'}</p></div><span class="brand-disc">${brandSymbol()}</span></div><p class="bowl-legend">소복한 밥 = 취사·열림·외식 확인<br>빈 그릇 = 기록 없음. 실제 식사량을 나타내지 않아요.</p>`}
  </section>`;
}
function welcome(){
  return `<section class="welcome"><div class="welcome-art">
    <div class="welcome-brand" aria-label="밥뭇나와 신이어마켙 인터페이스 시안"><span class="brand">${brandSymbol()}<span>밥뭇나</span></span><span class="collab-x">×</span>${art('partner',123,37,'신이어마켙','partner')}</div>
    <div class="welcome-copy"><h1 tabindex="-1"><span>안부가</span><span>폴짝,</span><span>찾아왔어요.</span></h1></div>
    <span class="welcome-heart" aria-hidden="true">♥</span><p class="welcome-caption">나의 작은<br>안부 친구</p>
    <div class="bunny-slot bunny-stage"><span class="bunny-shadow" aria-hidden="true"></span>${art('bunny',480,480,'초록 가디건을 입고 안부를 전하는 토끼')}</div>
    <button class="welcome-replay" data-action="welcome-replay" aria-label="토끼의 환영 인사 다시 보기"><span aria-hidden="true">↻</span> 다시 인사하기</button>
    </div><div class="welcome-dock"><span class="eyebrow">A LITTLE MESSAGE, A WARM REPLY</span><h2>밥 한 끼로 전하는 안부</h2><p>밥솥을 쓰는 평소의 하루가,<br>멀리 있는 가족에게 작은 안부로.</p>
    <div class="role-buttons edition-choices"><a class="edition-choice senior-choice" href="${editionHref('senior')}" data-edition="senior"><span class="edition-choice-icon">${brandSymbol()}</span><span><small>Senior</small><strong>어르신용</strong><span>필요한 소식만, 한 번에 전해요.</span></span>${uiIcon('arrow')}</a><a class="edition-choice carer-choice" href="${editionHref('carer')}" data-edition="carer"><span class="edition-choice-icon">${uiIcon('share')}</span><span><small>Carer</small><strong>보호자용</strong><span>안부와 하루의 변화를 살펴봐요.</span></span>${uiIcon('arrow')}</a></div><p class="welcome-note">서로의 하루에, 작은 온기를.</p>
    ${journeyEntry()}${CLOUD_AVAILABLE?'<a class="final-release-link" href="/bapmunna/final/">최신 앱·계정·토끼 작업실 모아보기 →</a>':''}<p class="welcome-simple-note">두 화면은 로그인 없이 둘러볼 수 있어요.<br>${CLOUD_AVAILABLE?'본인 식사 저장은 로그인 후, 가족 연동은 아직 체험이에요.':'인터넷 없이 열리는 체험판이에요. 실제 저장·가족 전송은 하지 않아요.'}</p></div></section>`;
}
function greetWelcome(){return welcomeGreeting?.play();}
function senior(){
  const selected=meal(),allowed=state.consent,last=state.devices.cooker.lastActivity;
  return heading('오늘도, 평소처럼.<br>필요할 때 한 번만.',`${dateLabel(dayOf(state.now))} · 가상 시계 ${hhmm(state.now)}`)+`
    ${!state.consent?'<p class="notice">공유를 쉬고 있어요. <a href="#privacy">공유 설정에서 다시 시작할 수 있어요.</a></p>':''}
    ${receipt?`<section class="action-receipt" role="status"><span class="receipt-check" aria-hidden="true">${uiIcon('check')}</span><div><strong>${esc(receipt.title)}</strong><p>${esc(receipt.detail)}</p></div><button data-action="receipt-close" aria-label="확인 안내 닫기">×</button></section>`:''}
    <section class="senior-quiet-signal">${bunnyCompanion()}<div><span>밥솥이 전한 소식</span><strong>${!state.consent?'공유를 쉬어요':inAway(state)?'외출 중이에요':!deviceOnline(state,'cooker')?'연결 확인이 필요해요':last===null?'소식을 기다려요':`${hhmm(last)} · 신호가 왔어요`}</strong></div>${art(riceState(state,selected).level,120,80,'','quiet-rice')}</section>
    <div class="senior-three" aria-label="필요할 때 남기는 세 가지 소식"><button class="primary" data-action="eatout-dialog" ${!allowed?'disabled':''}>${icon('eatout',32)}<span>외식했어요</span>${uiIcon('arrow')}</button><button data-action="away-dialog" ${!state.consent?'disabled':''}>${icon('away',32)}<span>${inAway(state)?'집에 왔어요':'놀러가요'}</span>${uiIcon('arrow')}</button><button class="dark" data-action="help-dialog">${icon('help',32)}<span>${state.help?.status==='pending'?'도움 요청 남겼어요':'도움 요청'}</span>${uiIcon('arrow')}</button></div>
    ${state.away?`<p class="caption away-receipt">${inAway(state)?'외출 중':'예약한 외출'} · ${timeLabel(state.away.start)} — ${timeLabel(state.away.end)}<button class="text-button" data-action="return">${inAway(state)?'지금 귀가':'일정 취소'}</button></p>`:'<p class="senior-reassurance">평소에는 아무것도 누르지 않아도 돼요.</p>'}
    <p class="caption">가구의 가상 신호예요. 실제 식사 여부는 알 수 없어요.</p>
    <a class="senior-save-link" href="#account"><span><strong>내 식사 기록</strong><small>${CLOUD_AVAILABLE?'직접 기록하고 싶을 때 · 로그인 후 저장':'실제 기록은 온라인 서비스에서'}</small></span>${uiIcon('arrow')}</a>`;
}
function alertEntries(){
  // Meal-slot diagnostics stay in the records. Notify only at the chosen threshold.
  return Object.values(state.careAlerts).filter(alert=>!alert.handled);
}
function guardian(){
  const pending=alertEntries(),last=state.devices.cooker.lastActivity;
  const direct=MEALS.filter(id=>record(state,dayOf(state.now),id).manual).map(id=>`${LABELS[id]}${record(state,dayOf(state.now),id).eatOut?' 외식':''}`);
  const connected=state.consent&&deviceOnline(state,'cooker'),showSignal=connected&&!inAway(state)&&last!==null;
  const helpPending=state.help?.status==='pending',headline=careHeadline(state);
  return heading('오늘의 안부',`${dateLabel(dayOf(state.now))} · 마음은 가까이`)+`
    <div class="home-stack">
    ${pending.length?`<section class="attention-card ${helpPending?'help-priority':''}" aria-label="확인이 필요한 안부"><div class="attention-title"><span class="attention-icon">${uiIcon('bell')}</span><h2>${helpPending?'도움 요청이 도착했어요':'확인할 안부가 있어요'}</h2><span class="alert-total">${pending.length}</span></div><p>${helpPending?'가족의 연락을 기다려요. 직접 안부를 확인해 주세요.':'놓친 소식이 있는지, 가볍게 살펴보세요.'}</p>${helpPending?`<button class="dark care-call" data-action="call-dialog">${icon('phone',23)}전화로 안부 묻기</button><small>가상 요청이에요. 실제 전화는 연결되지 않아요.</small>`:''}<div class="attention-actions">${helpPending?'<button class="text-button" data-ack="help">요청을 읽었어요</button>':''}<button class="text-button" data-view="alerts">알림 ${pending.length}개 보기 <span aria-hidden="true">→</span></button></div></section>`:''}
    <section class="care-hero ${headline.tone}" aria-labelledby="care-title"><div class="care-hero-top"><span>${bunnyCompanion()}밥솥이가 전하는 안부</span><button data-action="cooker-info" aria-label="밥솥이와 안부 표현 안내">${icon('info',21)}</button></div><div class="care-illustration"><span class="window-light" aria-hidden="true"></span>${art('cooker',1254,1254,'안부를 전하는 귀여운 밥솥이','care-rice care-cooker')}<span class="care-time">${showSignal?`${hhmm(last)} · 밥솥 소식`:!state.consent?'공유 쉬는 중':inAway(state)?'외출 일정 중':!connected?'연결 확인 필요':'새 소식 기다리는 중'}</span></div><h2 id="care-title">${helpPending?'오늘의 밥솥 소식':headline.title}</h2><p>${helpPending?'기록만으로 지금의 상태를 알 수는 없어요.':headline.detail}</p>${!helpPending?`<button class="dark care-call" data-action="call-dialog">${icon('phone',23)}전화로 안부 묻기</button><small class="call-scope">실제 전화는 연결되지 않는 체험이에요.</small>`:''}<div class="care-hero-foot"><span class="connection-dot ${connected?'online':''}" aria-hidden="true"></span><span>${connected?'가상 기기 연결됨':'기기 관찰 중지'}</span><a href="${CLOUD_AVAILABLE?'#connect':'#devices'}">${CLOUD_AVAILABLE?'기기 연결':'기기 보기'} ${uiIcon('arrow')}</a></div></section>
    <section class="card daily-card"><div class="section-line"><h2>오늘의 끼니</h2><a href="#report" aria-label="식사 기록 자세히 보기">기록 보기 ${uiIcon('arrow')}</a></div>${mealStrip()}<p class="caption meal-hint">끼니를 누르면 어떤 소식인지 볼 수 있어요.</p></section>
    <section class="home-contact"><p class="message">${!state.consent?'공유를 쉬는 중이에요.':direct.length?direct.join(' · ')+' 식사 소식을 남기셨어요.':'짧은 통화가 다정한 안부가 돼요.'}</p><details class="quiet-details"><summary>마음 전하기 · 식사 체크 체험</summary><button class="text-button" data-action="warmth">${icon('heart',19)} 마음 보내기</button><button class="text-button" data-view="senior">식사 체크 체험 →</button>${state.social&&!state.social.handled?'<button class="text-button" data-action="social-ack">전해온 마음 확인</button>':''}</details></section>
    ${!state.setup.complete?'<button class="setup-invitation compact-invitation" data-action="setup-start"><span><small>우리 집의 속도로</small><strong>안부 준비하기</strong><span>가상 연결 · 생활 패턴 · 알림 기준</span></span>'+uiIcon('arrow')+'</button>':''}
    ${journeyEntry()}<p class="care-boundary">${state.profile.residents}명 가구의 가상 요약이에요.<br>개인별 식사량·건강 상태를 나타내지 않아요.</p></div>`;
}
function alertsView(){
  const pending=alertEntries();
  return heading('받은 알림','가상 체험','알림 확인은 식사 확인이나 실제 연락 완료와 달라요.')+`<div class="home-stack">${pending.length?pending.map(alert=>`<article class="card alert-item ${alert.level}"><h2>${esc(alert.title)}</h2><p>${esc(alert.detail)}</p><button class="dark" data-ack="${esc(alert.id)}">${alert.id==='help'?'요청 확인 (체험)':'확인했어요'}</button></article>`).join(''):'<section class="card empty-state"><h2>새로운 알림이 없어요.</h2><p>새 소식이 오면 이곳에서 살펴볼 수 있어요.</p></section>'}</div>`;
}
function moreView(){
  const pending=alertEntries().length;
  const isSenior=edition==='senior';
  const items=isSenior?[['privacy','내가 정하는 공유','공유 범위를 확인하고 쉴 수 있어요.',uiIcon('share')],['about','이용 안내','천천히 사용 방법 알아보기',icon('info',24)]]:[['alerts','받은 알림','확인이 필요한 가상 소식',uiIcon('bell')],['settings','생활·알림 설정','식사 시간 · 외출 일정 · 알림 기준',uiIcon('clock')],['family','가족 초대·공유','함께 돌보는 역할 나누기 · 체험',uiIcon('share')],['about','이용 안내','사용 방법과 서비스 범위',icon('info',24)]];
  if(CLOUD_AVAILABLE)items.unshift(['connect','SmartThings 연결','내 플러그 연결·수신 상태 확인',uiIcon('rhythm')]);
  const demos=isSenior?[]:[['devices','기기 신호','밥솥 신호와 연결 살펴보기']];
  return heading('더보기',EDITIONS[edition].label,isSenior?'필요한 것만, 편하게 찾아보세요.':'우리 가족의 돌봄을 준비해요.')+`
    <a class="more-account" href="#account"><span class="more-account-copy"><small>${CLOUD_AVAILABLE?'로그인 후 이용':'온라인 서비스 안내'}</small><strong>${isSenior?'내 기록':'보호자 계정'}</strong><span>${CLOUD_AVAILABLE?(isSenior?'나의 식사 소식을 보관해요.':'내 회원 정보를 관리해요.'):'실제 저장은 온라인에서 이용해요.'}</span></span><span class="more-account-arrow" aria-hidden="true">${uiIcon('arrow')}</span></a>
    <nav class="more-links" aria-label="설정과 안내">${items.map(([route,title,detail,symbol])=>`<a href="#${route}"><span class="more-icon" aria-hidden="true">${symbol}</span><span class="more-link-copy"><strong>${title}</strong><small>${detail}</small></span>${route==='alerts'&&pending?`<span class="more-count" aria-label="${pending}개 알림">${pending}</span>`:''}<span class="more-chevron" aria-hidden="true">${uiIcon('arrow')}</span></a>`).join('')}</nav>
    ${demos.length?`<details class="more-demo"><summary><span>워크숍 도구<small>가상 기기와 시간 바꿔 보기</small></span><span class="more-demo-chevron" aria-hidden="true">${uiIcon('arrow')}</span></summary><div class="more-demo-content"><p>실제 기록이나 연락 없이 연습해 보세요.</p>${demos.map(([route,title,detail])=>`<a href="#${route}"><span><strong>${title}</strong><small>${detail}</small></span><span aria-hidden="true">${uiIcon('arrow')}</span></a>`).join('')}</div></details>`:''}
    ${versionLinks()}`;
}

function versionLinks(){
  const other=edition==='senior'?'carer':'senior';
  return `<section class="version-links" aria-label="앱 버전"><p>이 링크는 <strong>${EDITIONS[edition].label}</strong>으로 열려요.</p><a href="${editionHref(other)}" data-edition="${other}">${EDITIONS[other].label}으로 바꾸기 ${uiIcon('arrow')}</a><a href="${editionHref(null)}" data-edition="choose">처음 선택 화면</a><small>다른 기기에서 열면 가상 체험 기록은 이어지지 않아요.</small></section>`;
}
function seniorRecords(){
  const rows=report(state,7).reverse();
  return heading('내가 남긴 소식','어르신용 · 가상 기록','오늘과 지난 일주일을 편하게 살펴보세요.')+`
    <a class="senior-save-link" href="#account"><span><strong>실제 저장한 내 기록 보기</strong><small>${CLOUD_AVAILABLE?'로그인한 계정의 기록을 확인해요.':'온라인 서비스 이용 안내를 확인해요.'}</small></span>${uiIcon('arrow')}</a>
    <section class="card senior-today"><h2>오늘의 식사</h2>${mealStrip()}<p class="caption">✓ 끼니 확인 · 외식은 별도 표시<br>확인됨도 실제 섭취를 증명하지는 않아요.</p></section>
    <section class="card senior-history"><h2>최근 7일 · 체험</h2><ul>${rows.map(row=>`<li><strong>${row.day===dayOf(state.now)?'오늘':dateLabel(row.day)}</strong><span>${row.confirmed?`확인된 소식 ${row.confirmed}끼`:'확인된 소식 없음'}</span></li>`).join('')}</ul></section>`;
}
function privacyView(){
  return heading('내 안부는,<br>내가 정해요.','공유 설정 · 체험','가족에게는 식사 요약만 보여주는 것을 원칙으로 해요.')+`
    <section class="card privacy-card"><div class="privacy-symbol" aria-hidden="true">${uiIcon('share')}</div><h2>${state.consent?'가상 요약을 나누고 있어요.':'지금은 공유를 쉬고 있어요.'}</h2><p>무엇을 얼마나 먹었는지는 알 수 없어요. 기기 신호와 직접 확인은 구분해요.</p><button class="${state.consent?'':'primary'} full" data-action="consent-toggle">${state.consent?'공유 쉬기':'새 기록부터 공유 시작'}</button><p class="caption">이 탭의 체험에만 적용돼요. 실제 저장한 내 식사 기록은 삭제되지 않아요.</p></section>
    <section class="card"><h2>함께 보는 가상 가족</h2>${state.family.members.length?`<ul class="privacy-family">${state.family.members.map(member=>`<li><div><strong>${esc(member.name)}</strong><small>${FAMILY_ROLES[member.role]}</small></div><button data-revoke="${member.id}">연결 해제</button></li>`).join('')}</ul>`:'<p>연결된 가상 가족이 없어요.</p>'}<p class="caption">실제 계정 간 가족 공유는 아직 연결되지 않았어요. 초대 체험은 보호자용에서 볼 수 있어요.</p></section>`;
}

function recent(){
  const rows=report(state,period),observed=baseline(state),total=rows.reduce((sum,row)=>sum+row.confirmed,0),cook=rows.reduce((sum,row)=>sum+row.cook,0),lid=rows.reduce((sum,row)=>sum+row.lid,0),max=Math.max(1,...rows.map(row=>row.cook+row.lid));
  const pattern=patternComparison(state);
  const shortDate=day=>{const date=new Date(Date.UTC(2026,9,7+day));return `${date.getUTCMonth()+1}/${date.getUTCDate()}`;};
  const selected=rows.find(row=>row.day===reportDay)||rows.at(-1);
  return heading('일상이 보이는 기록','식사 기록','작은 소식을 모아, 하루의 리듬을 살펴봐요.')+`
    <div class="segment record-period" aria-label="기록 기간">${[1,7,30].map(span=>`<button data-period="${span}" aria-pressed="${period===span}">${span===1?'일':span===7?'주':'월'}</button>`).join('')}</div>
    ${!state.consent?'<p class="notice">공유 중지 후의 빈 기록이에요.</p>':''}
    <p class="record-range">${shortDate(rows[0].day)} — ${shortDate(rows.at(-1).day)} <span>가상 기록 · ${period}일</span></p>
    <section class="pattern-note"><span class="pattern-icon" aria-hidden="true">${uiIcon('rhythm')}</span><div><h2>우리 집의 일주일</h2>${pattern.ready?`<p>끼니 확인율이 이전 28일 <strong>${pattern.before}%</strong>에서 최근 7일 <strong>${pattern.after}%</strong>로 ${pattern.delta===0?'같아요':`${Math.abs(pattern.delta)}%p ${pattern.delta>0?'높아졌어요':'낮아졌어요'}`}. </p><small>오늘 제외 · 이전 28일과 최근 7일 비교. 식사·건강 변화로 단정하지 않아요.</small>`:`<p>변화를 비교할 기록을 모으고 있어요.</p><small>관찰 완료 ${pattern.days}일 · 외출·연결 중단·관찰 전 날짜는 제외해요.</small>`}</div></section>
    <div class="usage-metrics"><section><p>밥을 지은 신호</p><strong>${cook}<small> 회</small></strong><span class="metric-detail">취사</span></section><section><p>뚜껑을 연 신호</p><strong>${lid}<small> 회</small></strong><span class="metric-detail">열림</span></section></div>
    <section class="card usage-card"><div class="section-line"><h2>하루 밥솥 사용</h2><span class="chart-unit">단위: 회</span></div><div class="plot-wrap" tabindex="0" role="region" aria-label="날짜별 밥솥 사용 그래프"><div class="usage-chart interactive-chart" style="min-width:${rows.length>1?rows.length*49-5:0}px" role="group" aria-label="날짜를 선택해 기록 살펴보기" aria-describedby="chart-keyboard-hint">${rows.map(row=>`<button class="usage-column" data-record-day="${row.day}" tabindex="${row.day===selected.day?0:-1}" aria-pressed="${row.day===selected.day}" aria-label="${shortDate(row.day)} 취사 ${row.cook}회, 열림 ${row.lid}회"><span class="stacked-bar" aria-hidden="true"><span class="lid" style="height:${row.lid/max*100}%"></span><span class="cook" style="height:${row.cook/max*100}%"></span></span><small>${row.day===dayOf(state.now)?'오늘':shortDate(row.day)}</small></button>`).join('')}</div></div><span class="sr-only" id="chart-keyboard-hint">좌우 방향키로 날짜를 이동해요. Home은 첫날, End는 오늘이에요.</span><div class="usage-legend"><span><i></i>취사</span><span><i></i>뚜껑 열림</span><small>날짜를 눌러 보세요</small></div>${cook+lid===0?'<p class="caption">이 기간에 기록된 기기 신호가 없어요.</p>':''}
      <section class="day-insight" aria-label="선택한 날짜의 기록"><div class="day-insight-title" role="status"><strong>${shortDate(selected.day)}${selected.day===dayOf(state.now)?' · 오늘':''}</strong><span>취사 ${selected.cook}회 · 열림 ${selected.lid}회</span></div><div class="day-meals">${MEALS.map(id=>{const kind=status(state,selected.day,id);return `<button data-meal-detail="${id}" data-day="${selected.day}" class="${kind}" aria-label="${shortDate(selected.day)} ${LABELS[id]} · ${STATUS_COPY[kind]} · 근거 보기"><span>${LABELS[id]}</span><strong>${statusSymbol(kind)} ${compactStatus[kind]}</strong></button>`;}).join('')}</div></section></section>
    <section class="card calendar-card"><div class="section-line"><h2>한눈에 보는 끼니</h2><span class="chart-unit">끼니 확인 ${total}끼</span></div><div class="table-scroll" tabindex="0" role="region" aria-label="기간별 끼니 상태"><table class="meal-calendar" style="min-width:${rows.length>7?rows.length*42+40:0}px"><thead><tr><th><span class="sr-only">끼니</span></th>${rows.map(row=>`<th scope="col">${row.day===dayOf(state.now)?'오늘':shortDate(row.day)}</th>`).join('')}</tr></thead><tbody>${MEALS.map(id=>`<tr><th scope="row">${LABELS[id]}</th>${rows.map(row=>{const kind=status(state,row.day,id);return `<td><span class="meal-dot ${kind}" title="${shortDate(row.day)} ${LABELS[id]} · ${STATUS_COPY[kind]}" aria-label="${STATUS_COPY[kind]}">${statusSymbol(kind)}</span></td>`;}).join('')}</tr>`).join('')}</tbody></table></div><div class="calendar-key"><span>✓ 끼니 확인·외식</span><span>! 확인 필요</span><span>◷ 대기·시간 전</span></div><p class="caption">신호는 식사량이 아니에요.<br>기록이 없다고 결식으로 판단하지 않아요.</p></section>
    <details class="card quiet-details record-detail"><summary>집계·상세 기록 보기</summary><p class="caption">끼니 확인 ${total}끼 · 관찰 완료 ${observed.days}일 · 평균 ${observed.meals===null?'—':observed.meals.toFixed(1)}끼/일. 오늘을 제외한 관찰 완료일 기준이며 AI 분석이 아니에요.</p><div class="table-scroll" tabindex="0" role="region" aria-label="상세 식사와 기기 기록"><table><thead><tr><th>날짜</th><th>끼니 확인</th><th>기기 확인</th><th>외식 확인</th><th>외출 제외</th><th>취사</th><th>열림</th></tr></thead><tbody>${rows.map(row=>`<tr><th>${shortDate(row.day)}</th><td>${row.confirmed}</td><td>${row.signals}</td><td>${row.eatOut}</td><td>${row.excluded}</td><td>${row.cook}</td><td>${row.lid}</td></tr>`).join('')}</tbody></table></div></details>`;
}

function familyView(){
  const invite=state.family.invite;
  return heading('안부를 나누는 사람들.','가족 공유 체험','가상 별명으로 초대·수락·연결 해제를 경험해 보세요.')+`
    <p class="notice">초대 코드는 현재 탭 안의 연습용이에요. 다른 기기·사람에게 전송되지 않아요. 실제 이름이나 이메일 대신 가상 별명을 사용해 주세요.</p>
    <div class="grid"><div class="stack"><section class="card"><h2>함께하는 가상 가족</h2>${state.family.members.length?`<ul class="member-list">${state.family.members.map(member=>`<li class="member"><div class="row"><strong>${esc(member.name)}님</strong><span class="pill">${FAMILY_ROLES[member.role]}</span></div><div class="buttons"><button data-preview="${member.id}">공유 요약 미리보기</button><button data-revoke="${member.id}">연결 해제</button></div></li>`).join('')}</ul>`:'<p class="muted">연결된 가족이 없어요. 공유를 켜고 초대를 체험해 보세요.</p>'}<p class="caption">돌봄 가족: 식사 요약과 도움 요청 체험 보기<br>요약 보기: 식사·기기 요약만 보기</p></section>
    <section class="card"><h2>내가 정하는 공유</h2><p>${state.consent?'식사·기기 요약을 공유하는 상태예요.':'공유를 쉬고 있어요.'}</p><button class="${state.consent?'':'primary'} full" data-action="consent-toggle">${state.consent?'공유 쉬기':'새 기록부터 공유 시작'}</button><p class="caption">공유를 쉬면 현재 탭의 기록·요청·초대·가족 연결을 지워요. 다시 시작해도 지운 기록과 연결은 돌아오지 않아요.</p></section></div>
    <div class="stack"><form id="invite-form" class="card"><h2>1. 초대 만들기</h2><label class="field">가상 가족 별명<input name="alias" minlength="2" maxlength="20" placeholder="예: 다정이" autocomplete="off" required ${!state.consent?'disabled':''}></label><label class="field">공유 역할<select name="role" ${!state.consent?'disabled':''}>${options(FAMILY_ROLES,'viewer')}</select></label><p class="error" role="alert"></p><button class="primary full" type="submit" ${!state.consent?'disabled':''}>체험 초대 만들기</button><p class="caption">새 초대를 만들면 이전 초대 코드는 사용할 수 없어요.</p></form>
    <section class="card"><h2>2. 같은 화면에서 수락</h2>${invite?`<p class="label">현재 초대: ${esc(invite.name)} · ${FAMILY_ROLES[invite.role]}</p><p class="invite-code">${invite.code}</p><p class="caption">가상 시계 ${timeLabel(invite.expiresAt)} 만료 · ${state.now>=invite.expiresAt?'이미 만료됐어요':'한 번만 사용 가능해요'}</p>`:'<p class="muted">먼저 위에서 체험 초대를 만들어 주세요.</p>'}
    <form id="accept-form"><label class="field">연습용 초대 코드<input name="code" id="invite-code" placeholder="DEMO-0000" maxlength="30" autocomplete="off" required ${!invite?'disabled':''}></label><p class="error" role="alert"></p><div class="buttons"><button type="button" data-action="fill-code" ${!invite?'disabled':''}>위 코드 입력</button><button class="primary" type="submit" ${!invite?'disabled':''}>체험 초대 수락</button></div></form></section></div></div>`;
}

function devices(){
  const mode={waiting:'신호 대기',checking:'연속 전력 관찰 중',cooking:'취사 후보', 'keep-warm':'보온 · 집계 제외',idle:'대기 전력',unknown:'분류되지 않은 변화'}[state.power.mode];
  return heading('작은 신호를,<br>정확한 소식으로.','센서 시뮬레이터','실제 스마트플러그에 연결되지 않은 가상 실험실이에요.')+`
    <section class="virtual-clock" aria-label="가상 시계"><div><span class="label">${dateLabel(dayOf(state.now))}</span><br><strong>${hhmm(state.now)}</strong></div><div class="buttons"><button data-advance="30">+30분</button><button data-advance="720">+12시간</button><button data-advance="1440">+하루</button></div></section>
    <section class="card power-lab"><div class="row"><h2>밥솥 전력</h2><span class="pill ${deviceOnline(state,'cooker')?'confirmed':'offline'}">${deviceOnline(state,'cooker')?'가상 연결됨':'연결 중단'}</span></div><div class="cooker-lab-reading"><div class="power-reading"><strong>${state.devices.cooker.watts}<small> W</small></strong><span>${mode}</span></div>${bunnyCompanion('bunny-portrait-large')}</div>
    <p class="caption">취사: 800W 이상 5분 연속 · 보온: 30–60W 10분 연속<br>1분 간격 예시 측정. 5분 취사·3분 허용 간격은 검증 전 가정이에요.</p>
    <div class="power-presets"><button data-power-preset="cook"><strong>취사해 보기</strong><small>900W · 5분</small></button><button data-power-preset="warm"><strong>보온해 보기</strong><small>45W · 10분</small></button><button data-power-preset="spike"><strong>순간 상승</strong><small>900W · 1분 뒤 종료</small></button><button data-power-preset="rebound"><strong>보온 뒤 변화</strong><small>공통 규칙으로 열림 판단</small></button></div>
    <div class="lab-feedback" role="status">${state.power.possibleOpeningAt!==null?'보온 뒤 변화가 Supabase 열림 규칙을 만족했어요. 실측 검증이 필요한 추정이에요.':'각 예시가 밥솥 기록에 어떻게 반영되는지 비교해 보세요.'}</div>
    <details class="editor-extra"><summary>전력을 직접 입력하기</summary><form class="power-form" data-device="cooker"><div class="field-row"><label class="field">가상 전력 (W)<input type="number" name="watts" min="0" max="3500" step="1" value="900" required></label><label class="field">유지 시간 (분)<input type="number" name="duration" min="1" max="30" step="1" value="5" required></label></div><p class="error" role="alert"></p><button type="submit">1분 간격으로 측정</button></form></details>
    </section>
    <section class="card lid-lab"><div class="section-line"><h2>뚜껑 열림</h2><span class="pill">별도 센서 예시</span></div><p>마지막 열림 · <strong>${timeLabel(state.lastLidAt)}</strong></p><button class="full" data-device="cooker" data-signal="lid">뚜껑 열림 신호 만들기</button><p class="caption">가상의 개폐 센서 신호예요. 전력 판정은 Supabase와 같아요. 자이로 대조와 실측 검증은 아직 필요해요.</p></section>
    <section class="card"><h2>48시간 · 72시간, 그다음은?</h2><p>취사·열림·어르신 활동이 없으면 주의 → 가족 재확인 알림이 생겨요. 위 시계를 옮겨 보세요.</p><p class="caption">기본값은 기능정의서의 실험 기준이에요. 오프라인·외출·공유 중지 중에는 미사용으로 판단하지 않아요. 긴급 신고는 연결되어 있지 않아요.</p><button data-connection="cooker">${deviceOnline(state,'cooker')?'가상 연결 끊기':'가상 기기 다시 연결'}</button></section>
    <div class="buttons"><button data-view="report">기록 비교</button><button class="primary" data-view="guardian">보호자 홈</button></div><p class="caption lab-footer">원시 측정은 보관하지 않고 최소 판별 상태와 요약만 이 탭에 유지해요. 다른 가전 연동은 후속 확장 범위예요.</p>`;
}

function setupView(){
  setup??=setupDraft(state);
  if(setupWelcome)return `<section class="setup-welcome">${art('cooker',220,220,'안부를 전하는 귀여운 밥솥이')}<span class="eyebrow">반가워요, 우리 가족</span>${heading('우리 집의 안부가,<br>이제 시작돼요.','','생활에 맞춰, 부담 없이 소식을 나눠요.')}<div class="household-receipt"><span>함께 사는 사람 <strong>${setup.residents}명</strong></span><span>반려동물 <strong>${setup.pets?setup.pets+'마리':'없어요'}</strong></span></div><p>다음에는 평소 식사 시간과<br>밥솥 습관만 알려주세요.</p><button class="primary full" data-action="setup-welcome-next">식사 습관 알려주기 ${uiIcon('arrow')}</button><button class="text-button full" data-action="setup-welcome-back">가구 정보 다시 보기</button><small>아직 저장하지 않았어요. 마지막 단계에서 함께 적용해요.</small></section>`;
  return heading('우리 집 안부 준비','처음 연결 · 가상 체험')+`
    <div class="setup-progress"><div><strong>${setup.step+1} <span>/ 6</span></strong><span>${SETUP_STEPS[setup.step]}</span></div><progress value="${setup.step+1}" max="6" aria-label="초기 설정 진행률"></progress></div>
    <form id="setup-form" class="card setup-card">${setupContent(setup)}<p class="error" role="alert"></p><div class="setup-actions">${setup.step?'<button type="button" data-action="setup-back">이전</button>':''}<button type="submit" class="primary">${setup.step===5?'이 기준으로 시작':'다음으로'}</button></div></form>
    <button class="text-button full" data-view="settings">지금은 둘러볼게요</button><p class="caption setup-scope">완료하기 전까지 기존 설정은 바뀌지 않아요.<br>가족의 동의를 받은 실제 연결은 후속 개발입니다.</p>`;
}
function settings(){
  const p=state.profile,r=state.rules;
  const section=(id,iconName,title,summary,content)=>`<details class="setting-section" id="setting-${id}" name="settings-editor"><summary><span class="setting-icon">${uiIcon(iconName)}</span><span class="setting-copy"><strong>${title}</strong><small>${summary}</small></span><span class="setting-chevron">${uiIcon('arrow')}</span></summary><div class="setting-content">${content}</div></details>`;
  return heading('우리 집의 속도로.','생활 · 알림 설정','필요한 것만, 편하게 바꿔요.')+`
    <button class="setup-invitation" data-action="setup-start"><span><small>${state.setup.complete?'우리 집 설정 완료 · 체험':'처음 연결하시나요?'}</small><strong>${state.setup.complete?'우리 집 설정 다시 살펴보기':'6단계로 안부 준비하기'}</strong><span>가상 연결부터 생활 패턴까지</span></span>${uiIcon('arrow')}</button>
    <div class="settings-list">
    ${section('schedule','clock','식사 시간',p.meals.map(id=>LABELS[id]).join(' · '),`<form id="schedule-form" data-section="schedule"><p class="editor-note">평소 식사하는 시간대를 알려주세요.</p>${state.config.windows.map(w=>`<fieldset class="meal-time-field"><legend>${LABELS[w.id]}</legend><div class="field-row"><label class="field">시작<input type="time" name="${w.id}-start" value="${hhmm(w.start)}" required></label><label class="field">종료<input type="time" name="${w.id}-end" value="${hhmm(w.end)}" required></label></div></fieldset>`).join('')}<label class="field">식사 후 더 기다리는 시간 (분)<input name="grace" type="number" min="0" max="180" step="1" value="${state.config.grace}" required></label><p class="caption">식사 시간은 서로 겹치지 않게 설정해요. 기존 기록은 유지돼요.</p><p class="error" role="alert"></p><button class="primary full" type="submit">이 시간으로 저장</button></form>`)}
    ${section('profile','rhythm','우리 집 생활',`${p.residents}명 · 하루 ${p.meals.length}끼 · 주 ${p.cookWeekly}회 취사`,`<ul class="summary-list"><li>함께 사는 사람 ${p.residents}명 · 반려동물 ${p.pets}마리</li><li>외식 주 ${p.eatOutWeekly}회 · ${p.keepWarm?'보온 사용':'보온 안 함'}</li></ul><p class="caption">가구 전체의 신호예요. 개인별 식사 여부는 구별할 수 없어요.</p><button class="full" data-action="setup-start">생활 패턴 바꾸기</button>`)}
    ${section('rules','bell','안부를 확인할 때',`${r.consecutiveMissed}끼 · 활동 ${r.inactiveHours}시간 / ${r.followupHours}시간`,`<form id="rules-form" data-section="rules"><label class="field">연속으로 소식이 없는 끼니<input name="consecutiveMissed" type="number" min="1" max="6" step="1" value="${r.consecutiveMissed}" required></label><details class="editor-extra"><summary>마지막 활동의 시간 기준</summary><label class="field">주의 알림 (시간)<input name="inactiveHours" type="number" min="1" max="71" step="1" value="${r.inactiveHours}" required></label><label class="field">가족 재확인 (시간)<input name="followupHours" type="number" min="2" max="72" step="1" value="${r.followupHours}" required></label></details><p class="caption">기본 2끼·48시간·72시간은 검증 전 실험 기준이에요. 실제 결식·건강 판단이나 자동 신고를 하지 않아요.</p><p class="error" role="alert"></p><button class="primary full" type="submit">알림 기준 저장</button></form>`)}
    ${section('away','away','외출·여행',state.away?`${timeLabel(state.away.end)}까지 ${inAway(state)?'외출 중':'외출 예약'}`:'집을 비울 땐 확인 알림을 쉬어요',`<p>출발과 귀가 날짜·시간을 정해 주세요. 겹치는 끼니는 확인 알림에서 제외해요.</p><button class="full" data-action="away-dialog">${inAway(state)?'지금 집에 왔어요':'외출 일정 정하기'}</button>${state.away?'<button class="text-button full" data-action="return">일정 해제</button>':''}`)}
    ${section('sharing','share','공유와 기록',state.consent?'가상 요약 공유 중':'공유 쉬는 중',`<button class="full" data-action="consent-toggle">${state.consent?'공유 쉬기':'새 기록부터 공유 시작'}</button><button class="text-button full" data-view="family">가족 연결과 공유 범위 보기 →</button><p class="caption">공유를 쉬면 이 탭의 식사·기기 요약, 외출, 요청, 가족 연결을 지워요. 실제 계정 기록은 유지돼요.</p>`)}
    </div><p class="settings-footnote">이 탭의 가상 체험에만 적용돼요.<br>새로고침하면 처음 예시로 돌아가요.</p><details class="reset-details"><summary>체험 다시 시작</summary><p class="caption">현재 탭의 체험 기록과 설정을 초기화해요.</p><div class="buttons"><button data-reset="seed">가상 예시로</button><button data-reset="empty">빈 기록으로</button></div></details>`;
}

function about(){
  return heading('평소의 하루가,<br>반가운 소식이 되도록.','밥뭇나 프로젝트','문제정의·기능정의 워크시트와 선택하신 Figma A·B·C를 바탕으로 만든 체험입니다.')+`
    <div class="grid"><section class="card"><h2>먼저, 1분만 만나볼까요?</h2><p>밥솥 신호가 안부로 이어지는 과정을 네 장면으로 살펴봐요. 기존 체험 기록은 바뀌지 않아요.</p>${journeyEntry()}<details class="quiet-details"><summary>더 자세히 둘러보기</summary><ol class="checklist"><li>보호자용 ‘우리 집 안부 준비’에서 가상 연결과 생활 패턴을 정해요.</li><li>어르신용의 ‘외식했어요 · 놀러가요 · 도움 요청’으로 필요한 소식만 남겨요.</li><li>기기 체험에서 취사·보온·순간 상승을 비교하고 48·72시간 알림을 살펴봐요.</li><li>기록에서 일·주·월 사용과 이전 28일과 최근 7일의 변화를 확인해요.</li></ol><div class="buttons"><button data-view="senior" class="primary">어르신 체험</button><button data-view="guardian">보호자 체험</button></div></details></section>
    <section class="card"><h2>안부를 위한 구분</h2><p>밥솥 사용은 실제 식사 확인과 달라요. 직접 확인도 무엇을 얼마나 먹었는지는 알려주지 않아요.</p><p>이 체험은 식사·영양·건강·응급 상태를 판단하지 않아요. 걱정되는 상황은 사람이 직접 안부를 확인해 주세요.</p><p class="notice">${CLOUD_AVAILABLE?'‘내 기록’에서는 실제 로그인과 식사 직접 확인을 저장할 수 있어요.':'이 파일에서는 로그인하거나 실제 기록을 저장하지 않아요. 온라인 서비스 안내만 제공해요.'} 기기 신호·가족 공유·푸시·음성 인식·전화·긴급 신고는 가상 체험이며 실제 서비스와 연결되지 않았어요.</p><p class="caption">시작 화면의 브랜드 조합은 사용자가 제공한 Figma 디자인 시안에서 가져왔어요. 공식 제휴·공동 운영을 뜻하지 않아요.</p></section>
    <section class="card"><h2>직접 조절할 수 있어요.</h2><p>큰 글씨 버튼, 식사 시간, 생활 패턴, 외출, 가족 연결, 공유 중지를 조절해 보세요.</p><p>화면의 이름·시각·식사·기기 정보는 모두 예시예요. 입력한 가상 별명은 이 탭에서만 사용하고 새로고침하면 사라져요.</p><button data-view="settings">생활·알림 설정</button></section>
    <details class="card quiet-details"><summary>워크숍 동작 점검</summary><h2>동작 점검</h2><p>현재 체험 기록을 바꾸지 않고 독립된 가상 상태로 경계 조건을 검사해요.</p><button data-action="checks">전체 동작 검사</button>${checkResults?`<p class="count" role="status">${checkResults.filter(result=>result.pass).length} / ${checkResults.length} 통과</p><ul class="checklist check-results">${checkResults.map(result=>`<li class="${result.pass?'':'failed'}">${result.pass?'통과':'실패'} · ${esc(result.name)}</li>`).join('')}</ul>`:''}</details><p class="operator-entry"><a href="./manage/">운영자 공간 →</a></p></div>`;
}

function connectView(){
  return heading('우리 집 기기 연결','SmartThings','내 계정으로, 처음 한 번만 연결해요.')+(CLOUD_AVAILABLE?'<section id="smartthings-surface"></section>':'<section class="card"><p>기기 연결은 온라인 앱에서 이용해 주세요.</p></section>');
}
function accountView(){
  const isCarer=edition==='carer';
  return heading(isCarer?'보호자 계정':'내 식사 기록',EDITIONS[edition].label,isCarer?'내 회원 정보를 안전하게 관리해요.':'식사한 뒤 작은 소식 하나를 남겨보세요.')+(CLOUD_AVAILABLE?'<section id="account-surface" data-cloud-surface></section>':`<section class="card"><h2>실제 저장은 온라인에서 이용해 주세요.</h2><p>내려받는 파일은 가상 체험용이에요.</p><a href="https://impact-series.web.app/bapmunna/${edition}/#account">온라인 ${isCarer?'보호자 계정':'내 기록'} 열기 →</a></section>`);
}
function modalMarkup(){
  if(!modal)return '';
  let title='',body='',buttons='';
  switch(modal.type){
    case 'meal':{
      const detail=mealEvidence(state,modal.day,modal.meal);
      title=`${dateLabel(detail.day)} · ${detail.label}`;
      body=`<div class="evidence-status ${detail.kind}"><span aria-hidden="true">${statusSymbol(detail.kind)}</span><strong>${STATUS_COPY[detail.kind]}</strong><small>설정한 시간 ${detail.window}</small></div><p>${detail.detail}</p>${detail.sources.length?`<ul class="evidence-sources">${detail.sources.map(source=>`<li><strong>${source.label}</strong><p>${source.detail}</p></li>`).join('')}</ul>`:''}<p class="caption">가상 기록의 근거예요. 실제 섭취량·영양·건강 상태를 판단하지 않아요.</p>`;break;
    }
    case 'cooker':
      title='밥솥이가 안부를 전해요.';
      body='<p>밥솥이는 안부를 함께 살펴보는 캐릭터예요. 실제 소식은 화면의 시간·연결 상태·끼니 기록으로 확인해 주세요.</p><p>캐릭터의 표정은 실제 식사량이나 건강 상태를 뜻하지 않아요.</p>';break;
    case 'bowl':
      title='밥그릇은 소식의 표현이에요.';
      body='<ul class="summary-list"><li>소복한 밥: 취사·열림 또는 직접 확인 소식이 있어요.</li><li>빈 그릇: 기록이 없거나 공유·관찰을 쉬고 있어요.</li></ul><p>그림의 밥 양은 실제 먹은 양·영양·건강 상태와 관계없어요. 외출·연결 장애는 별도 문구로 표시해요.</p>';break;
    case 'eatout':
      title='밖에서 식사하셨어요?';
      body='<p>현재 시각에 가장 가까운 끼니에 외식 소식을 남겨요.</p><p class="caption">같은 탭의 가상 체험에만 반영돼요. 실제 가족에게 전송하지 않아요.</p>';
      buttons='<button class="primary" data-action="eatout-save">네, 외식했어요</button>';break;
    case 'away':{
      const selected=modal.awayDays??null,range=selected?awayPresetRange(state.now,selected):{start:state.away&&state.away.start>=state.now?state.away.start:state.now,end:state.away&&state.away.end>state.now?state.away.end:state.now+180};
      title='며칠 다녀오세요?';body=`<p>외출과 겹치는 끼니의 확인 알림은 쉬어요.</p><form id="away-form"><div class="away-presets" role="group" aria-label="외출 기간 선택">${[1,2,3,7].map(days=>`<button type="button" data-away-days="${days}" aria-pressed="${selected===days}">${days===1?'오늘만':days===7?'일주일':days+'일'}</button>`).join('')}</div><p class="away-range" id="away-range" role="status">${selected?`지금부터 ${dateLabel(dayOf(range.end-1))}까지`:'선택한 날짜·시간으로 적용해요.'}</p><details class="quiet-details away-custom" ${selected?'':'open'}><summary>날짜·시간 직접 선택</summary><label class="field">출발 날짜·시간<input type="datetime-local" name="start" value="${dateInput(range.start)}" min="${dateInput(state.now)}" max="${dateInput(state.now+30*DAY)}" required></label><label class="field">귀가 날짜·시간<input type="datetime-local" name="end" value="${dateInput(range.end)}" min="${dateInput(state.now+1)}" required></label></details><p class="caption">가상 일정 · 실제 가족에게 전송하지 않아요.<br>오늘 ${dateLabel(dayOf(state.now))} ${hhmm(state.now)}</p><p class="error" role="alert"></p><button type="submit" class="primary full">이 일정으로 남기기</button></form>`;break;
    }
    case 'help':
      title=state.help?.status==='pending'?'도움 요청을 남겼어요.':'도움 요청을 남길까요?';
      body='<p>같은 탭의 보호자 화면에 요청을 표시하는 체험이에요. 실제 전화·문자·긴급 신고는 연결되지 않아요.</p><p class="notice">실제로 급한 도움이 필요하면 이 화면을 기다리지 말고 가족이나 긴급전화로 직접 연락해 주세요.</p>';
      buttons=state.help?.status==='pending'?'<button data-action="help-cancel">가상 도움 요청 취소</button>':'<button class="dark" data-action="help-save">가상 도움 요청 남기기</button>';break;
    case 'consent':
      title='공유를 쉬시겠어요?';body='<p>현재 탭의 식사·기기 요약, 외출, 요청, 초대와 가족 연결을 지워요.</p><p>다시 공유해도 지운 기록과 연결은 돌아오지 않아요. 생활·알림 설정은 유지해요.</p>';
      buttons='<button class="dark" data-action="consent-stop">기록 지우고 공유 쉬기</button>';break;
    case 'reset':
      title=modal.seed?'가상 예시로 돌아갈까요?':'빈 기록으로 시작할까요?';body='<p>현재 탭의 체험 기록과 설정을 초기화해요.</p>';
      buttons='<button class="primary" data-action="reset-save">새 체험 시작</button>';break;
    case 'revoke':
      title='가족 연결을 해제할까요?';body='<p>이 연결로 보는 가상 요약에 더 이상 접근할 수 없어요. 식사 기록은 유지해요.</p>';
      buttons='<button class="dark" data-action="revoke-save">연결 해제</button>';break;
    case 'preview':{
      const summary=familySummary(state,modal.memberId),member=state.family.members.find(item=>item.id===modal.memberId);
      title=`${member.name}님의 공유 요약`;
      body=`<p><span class="pill">${FAMILY_ROLES[summary.role]} · 같은 탭의 미리보기</span></p><ul class="summary-list">${summary.meals.map(item=>`<li>${LABELS[item.id]} · ${STATUS_COPY[item.status]}</li>`).join('')}<li>마지막 밥솥 신호 · ${summary.lastCookerSignal??'아직 없음'}</li>${summary.role==='caregiver'?`<li>도움 요청 · ${summary.helpRequested?'있어요 (체험)':'없어요'}</li>`:''}</ul><p class="caption">개별 전력 수치·생활 설정·원시 신호는 이 요약에 포함하지 않아요. 실제 서버 권한 기능은 연결되지 않았어요.</p>`;
      break;
    }
    case 'call':
      title='목소리로 안부를 전해요.';body='<p>전화로 짧게 안부를 물어보는 흐름의 체험이에요.</p><p>이 공개 예시에는 전화번호가 연결되어 있지 않아요. 실제 연락은 평소 사용하는 전화 앱에서 해 주세요.</p>';break;
  }
  return `<dialog id="confirm-dialog" aria-labelledby="dialog-title"><h2 id="dialog-title">${esc(title)}</h2>${body}<div class="buttons">${buttons}<button data-action="dialog-close">닫기</button></div></dialog>`;
}

function openModal(type,extra={}){
  const focused=document.activeElement;
  focusReturn=focused?.id?`#${focused.id}`:focused?.dataset.mealDetail?`[data-meal-detail="${focused.dataset.mealDetail}"][data-day="${focused.dataset.day}"]`:focused?.dataset.action?`[data-action="${focused.dataset.action}"]`:focused?.dataset.preview?`[data-preview="${focused.dataset.preview}"]`:null;
  modal={type,...extra};
}
function closeModal(){
  modal=null;render();
  (focusReturn?document.querySelector(focusReturn):null)?.focus();
}
function render(focus=false){
  const active=document.activeElement;
  const preserve=active&&root.contains(active)?['data-action','data-period','data-record-day','data-scenario','data-away-days'].find(name=>active.hasAttribute(name)):null;
  const restore=preserve?`[${preserve}="${active.getAttribute(preserve)}"]`:null;
  const wasModal=!!root.querySelector('dialog[open]');
  const scrollPositions=[...root.querySelectorAll('.plot-wrap,.table-scroll')].map(el=>({label:el.getAttribute('aria-label'),left:el.scrollLeft}));
  accountCleanup?.();accountCleanup=null;
  welcomeGreeting?.dispose();welcomeGreeting=null;
  evaluate(state);
  document.body.dataset.view=view;
  document.body.dataset.edition=edition||'choose';
  if(CLOUD_AVAILABLE&&edition)rememberEdition(appBase,edition);
  document.title=edition?`밥뭇나 ${EDITIONS[edition].label} · ${EDITIONS[edition].english}`:'밥뭇나 · 밥 한 끼로 전하는 안부';
  document.querySelector('#app-header').hidden=['welcome','journey'].includes(view);
  document.querySelector('#app-nav').hidden=['welcome','journey'].includes(view);
  document.querySelector('#account-entry').hidden=view==='account';
  document.querySelector('#account-entry').textContent=edition?EDITIONS[edition].account:'내 기록';
  document.querySelector('#edition-switcher').innerHTML=Object.entries(EDITIONS).map(([id,details])=>`<a href="${esc(editionHref(id))}" data-edition="${id}"${id===edition?' aria-current="true"':''}><span class="edition-check" aria-hidden="true">${id===edition?'✓':''}</span>${details.label}</a>`).join('');
  document.querySelector('#app-header .brand').setAttribute('href',edition?routeHref(EDITIONS[edition].home):routeHref('welcome'));
  document.querySelector('#app-header .brand').setAttribute('aria-label',edition?`밥뭇나 ${EDITIONS[edition].label} 홈`:'밥뭇나 처음으로');
  document.querySelector('[data-nav-home]').dataset.view=edition?EDITIONS[edition].home:'guardian';
  document.querySelector('#storage-hint').textContent=['account','connect'].includes(view)&&CLOUD_AVAILABLE?'로그인한 본인의 정보만 다뤄요.':'새로고침하면 가상 예시로 돌아갑니다.';
  const navCount=document.querySelector('#nav-alert-count');navCount.textContent=String(alertEntries().length);navCount.hidden=edition!=='carer'||!alertEntries().length;
  for(const button of document.querySelectorAll('#app-nav button')){
    if(button.dataset.view===(['senior','guardian','report'].includes(view)?view:'more'))button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  }
  const liveAccount=['account','connect'].includes(view)&&CLOUD_AVAILABLE;
  const mode=['welcome','journey'].includes(view)?'':`<div class="edition-mode ${liveAccount?'is-live':''}" role="note"><span class="mode-dot" aria-hidden="true"></span><span>${liveAccount?(view==='connect'?'내 기기 연결 확인':edition==='carer'?'실제 계정 관리':'실제 내 기록 저장'):'둘러보기 · 가상 데이터'}</span>${liveAccount?'<small>로그인한 본인 계정</small>':'<small>실제 가족에게 전송되지 않아요</small>'}</div>`;
  root.innerHTML=mode+({welcome,senior,guardian,report:edition==='senior'?seniorRecords:recent,family:familyView,settings,setup:setupView,devices,about,account:accountView,connect:connectView,more:moreView,alerts:alertsView,privacy:privacyView,journey:journeyView}[view]||welcome)()+modalMarkup();
  // The canonical Supabase model has no independent post-window grace interval.
  for(const field of root.querySelectorAll('input[name="grace"]')){field.value='0';field.type='hidden';field.closest('label')?.setAttribute('hidden','');}
  for(const link of root.querySelectorAll('a[href^="#"]'))link.setAttribute('href',routeHref(link.getAttribute('href').slice(1)));
  document.querySelector('.skip-link').setAttribute('href',`${location.pathname}#main`);
  if(view==='welcome'){
    welcomeGreeting=createBunnyGreeting(root.querySelector('.welcome'),{imageUrl:ASSETS.bunny,underlayUrl:ASSETS.underlay});
    if(!welcomeSeen){welcomeSeen=true;void greetWelcome();}
  }
  if(view==='account'&&CLOUD_AVAILABLE)accountCleanup=mountAccount(document.querySelector('#account-surface'),{audience:edition,browseHref:routeHref(EDITIONS[edition].home),familyHref:routeHref('family'),connectHref:routeHref('connect')});
  if(view==='connect'&&CLOUD_AVAILABLE)accountCleanup=mountSmartThings(document.querySelector('#smartthings-surface'),{accountHref:routeHref('account')});
  if(modal){const dialog=root.querySelector('dialog');dialog.showModal();dialog.addEventListener('cancel',event=>{event.preventDefault();closeModal();});}
  else if(focus)root.querySelector('h1')?.focus({preventScroll:true});
  else if(wasModal&&focusReturn)root.querySelector(focusReturn)?.focus({preventScroll:true});
  else if(restore)root.querySelector(restore)?.focus({preventScroll:true});
  for(const el of root.querySelectorAll('.plot-wrap,.table-scroll')){const saved=scrollPositions.find(item=>item.label===el.getAttribute('aria-label'));if(saved)el.scrollLeft=saved.left;}
}
function go(next,push=true){
  if(!viewNames.includes(next))return;
  if(push&&next==='welcome'&&edition!==null){switchEdition(null);return;}
  if(push&&(next==='senior'&&edition!=='senior'||next==='guardian'&&edition!=='carer')){switchEdition(next==='senior'?'senior':'carer');return;}
  view=editionView(edition,next);modal=null;
  if(push&&location.hash!==`#${view}`)history.pushState(null,'',routeHref(view));
  render(true);window.scrollTo({top:0,behavior:'instant'});
}
function switchEdition(next){
  // Presentation only: no sign-in, account update or demo reset on a screen switch.
  if(next===edition||next!==null&&!Object.hasOwn(EDITIONS,next))return;
  edition=next;view=next?EDITIONS[next].home:'welcome';modal=null;
  history.pushState(null,'',editionHref(next,next?'':'welcome'));
  render(true);window.scrollTo({top:0,behavior:'instant'});
  if(next)toast(`${EDITIONS[next].label}으로 바꿨어요.`);
}
function action(name,explicitMeal){
  switch(name){
    case 'journey-start':journey={step:0,scenario:'ordinary',returnView:view};go('journey');return;
    case 'journey-next':journey.step=Math.min(3,journey.step+1);render(true);window.scrollTo({top:0,behavior:'instant'});return;
    case 'journey-back':journey.step=Math.max(0,journey.step-1);render(true);window.scrollTo({top:0,behavior:'instant'});return;
    case 'journey-close':go(journey.returnView);return;
    case 'receipt-close':receipt=null;render();root.querySelector('.senior-three button')?.focus({preventScroll:true});return;
    case 'setup-start':setup=setupDraft(state);setupWelcome=false;go('setup');return;
    case 'setup-welcome-next':setupWelcome=false;render(true);window.scrollTo({top:0,behavior:'instant'});return;
    case 'setup-welcome-back':setupWelcome=false;setup.step=2;render(true);window.scrollTo({top:0,behavior:'instant'});return;
    case 'setup-plug':setup.plug=true;break;
    case 'setup-wifi':setup.wifi=true;break;
    case 'setup-back':setup=readSetupForm(setup,new FormData(root.querySelector('#setup-form')));setup.step=Math.max(0,setup.step-1);render(true);window.scrollTo({top:0,behavior:'instant'});return;
    case 'welcome-replay':void greetWelcome();return;
    case 'text-size':{
      const enabled=document.body.classList.toggle('large-text'),button=document.querySelector('[data-action="text-size"]');
      button.setAttribute('aria-pressed',String(enabled));button.setAttribute('aria-label',enabled?'큰 글씨 끄기':'큰 글씨 켜기');button.textContent=enabled?'가−':'가+';return;
    }
    case 'confirm':confirmMeal(state,explicitMeal||meal());toast(`${LABELS[explicitMeal||meal()]} 식사를 확인했어요. 이 탭의 가상 요약에 반영했어요.`);break;
    case 'cooker-info':openModal('cooker');break;
    case 'bowl-info':openModal('bowl');break;
    case 'eatout-dialog':openModal('eatout',{meal:meal()});break;
    case 'eatout-save':

      confirmMeal(state,meal(),true);modal=null;receipt={title:'외식 소식을 남겼어요',detail:'같은 탭의 보호자 화면에도 보여요. 실제 전송은 아니에요.'};toast('외식 소식을 가상 기록에 반영했어요.');break;
    case 'away-dialog':if(inAway(state)){cancelAway(state);receipt={title:'집에 돌아왔어요',detail:'다시 평소의 밥솥 소식을 기다려요. 잘 다녀오셨어요.'};toast('귀가를 반영했어요.');}else openModal('away',{awayDays:state.away?null:1});break;
    case 'return':cancelAway(state);receipt={title:'외출 일정을 마쳤어요',detail:'다시 평소의 밥솥 소식을 기다려요.'};toast('귀가를 반영했어요.');break;
    case 'help-dialog':openModal('help');break;
    case 'help-save':requestHelp(state);modal=null;receipt={title:'가상 도움 요청을 남겼어요',detail:'실제 전화·신고는 연결되지 않아요. 급하면 직접 연락해 주세요.'};toast('가상 도움 요청을 표시했어요. 실제 전화·신고는 연결되지 않아요.');break;
    case 'help-cancel':resolveHelp(state,'cancelled');modal=null;receipt=null;toast('가상 도움 요청을 취소했어요.');break;
    case 'call-dialog':openModal('call');break;
    case 'warmth':if(!state.consent)throw Error('공유를 쉬는 중이에요.');state.warmth={at:state.now};toast('같은 화면의 어르신에게 가상의 마음을 남겼어요.');break;
    case 'social-ack':if(state.social)state.social.handled=true;toast('전해 온 마음을 확인했어요.');break;
    case 'consent-toggle':if(state.consent)openModal('consent');else{setConsent(state,true);toast('새 기록부터 공유해요. 가족 연결도 새로 시작해 주세요.');}break;
    case 'consent-stop':setConsent(state,false);state.warmth=null;modal=null;receipt=null;toast('공유를 쉬고 기록·요청·가족 연결을 지웠어요.');break;
    case 'reset-save':state=demoState(modal.seed);setup=null;setupWelcome=false;chosenMeal=null;modal=null;checkResults=null;receipt=null;reportDay=null;toast('새 체험을 시작했어요.');break;
    case 'fill-code':document.querySelector('#invite-code').value=state.family.invite.code;document.querySelector('#invite-code').focus();return;
    case 'revoke-save':revokeMember(state,modal.memberId);modal=null;toast('가족 연결을 해제했어요.');break;
    case 'checks':checkResults=runChecks();break;
    case 'sensor':toast(ingestSensor(state).reason);break;
    case 'advance30':advance(state,30);chosenMeal=null;break;
    case 'dialog-close':closeModal();return;
    default:throw Error('지원하지 않는 체험 동작이에요.');
  }
  render();
  if(!modal)root.querySelector(`[data-action="${name}"]`)?.focus({preventScroll:true});
}

function powerRun(watts,duration){
  if(!Number.isInteger(duration)||duration<1||duration>30||!Number.isFinite(watts)||watts<0||watts>3500)throw Error('전력 0–3,500W와 유지 시간 1–30분을 입력해 주세요.');
  if(!state.consent||!deviceOnline(state,'cooker')||inAway(state))throw Error('공유 중이고 기기가 연결된 집 안에서 체험해 주세요.');
  if(state.power.at===state.now)advance(state,1);
  let result=ingestDevice(state,'cooker','power',watts);
  for(let i=1;i<duration;i++){advance(state,1);result=ingestDevice(state,'cooker','power',watts);}
  return result;
}

document.addEventListener('keydown',event=>{
  const button=event.target.closest('[data-record-day]');
  if(!button||modal||view!=='report')return;
  const next=reportDayAfterKey(report(state,period).map(row=>row.day),Number(button.dataset.recordDay),event.key);
  if(next===null)return;
  event.preventDefault();reportDay=next;render();
  const target=root.querySelector(`[data-record-day="${next}"]`);
  target?.focus({preventScroll:true});target?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
});

document.addEventListener('click',event=>{
  const link=event.target.closest('a');
  // Skip navigation moves focus, not the route (including portable role hashes).
  if(link?.classList.contains('skip-link')){event.preventDefault();const main=document.querySelector('#main');main?.focus({preventScroll:true});main?.scrollIntoView({block:'start',behavior:'instant'});return;}
  if(link?.dataset.edition&&event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();switchEdition(link.dataset.edition==='choose'?null:link.dataset.edition);return;}
  if(event.composedPath().some(node=>node instanceof Element&&node.hasAttribute('data-cloud-surface')))return;
  const button=event.target.closest('button');if(!button||button.disabled)return;
  // Let native validation and the submit listener handle forms before rerendering.
  if(button.closest('form')&&button.type==='submit')return;
  try{
    if(button.dataset.view){go(button.dataset.view);return;}
    if(button.dataset.mealDetail){openModal('meal',{meal:button.dataset.mealDetail,day:Number(button.dataset.day)});render();return;}
    if(button.dataset.awayDays&&modal?.type==='away'){
      awayPresetRange(state.now,Number(button.dataset.awayDays));modal.awayDays=Number(button.dataset.awayDays);render();
      root.querySelector(`[data-away-days="${modal.awayDays}"]`)?.focus({preventScroll:true});return;
    }
    if(button.dataset.scenario){if(JOURNEY_SCENARIOS.some(item=>item.id===button.dataset.scenario))journey.scenario=button.dataset.scenario;render();return;}
    if(button.hasAttribute('data-record-day')){reportDay=Number(button.dataset.recordDay);render();return;}
    if(button.dataset.action){action(button.dataset.action);return;}
    if(button.dataset.period){period=Number(button.dataset.period);render();return;}
    if(button.dataset.powerPreset){
      const preset=button.dataset.powerPreset;
      powerRun(0,1);
      let result;
      if(preset==='cook')result=powerRun(900,5);
      else if(preset==='warm')result=powerRun(45,10);
      else if(preset==='spike'){powerRun(900,1);result=powerRun(0,1);}
      else {powerRun(45,10);result=powerRun(180,1);}
      chosenMeal=null;toast(preset==='spike'?'짧은 상승은 취사로 세지 않았어요.':result.reason);render();return;
    }
    if(button.dataset.advance){advance(state,Number(button.dataset.advance));chosenMeal=null;toast(`가상 시계를 ${button.dataset.advance}분 옮겼어요.`);}
    else if(button.dataset.signal)toast(ingestDevice(state,button.dataset.device,button.dataset.signal).reason);
    else if(button.dataset.connection)setDeviceOnline(state,button.dataset.connection,!deviceOnline(state,button.dataset.connection));
    else if(button.dataset.away){if(!state.consent)throw Error('공유를 시작한 뒤 외출을 체험해 주세요.');setAway(state,state.now,state.now+Number(button.dataset.away));modal=null;toast('외출과 겹친 끼니는 확인 알림에서 제외해요.');}
    else if(button.dataset.social){setSocial(state,button.dataset.social);toast('같은 탭의 보호자 화면에 가상의 마음을 남겼어요.');}
    else if(button.dataset.reset)openModal('reset',{seed:button.dataset.reset==='seed'});
    else if(button.dataset.preview)openModal('preview',{memberId:button.dataset.preview});
    else if(button.dataset.revoke)openModal('revoke',{memberId:button.dataset.revoke});
    else if(button.dataset.ack){
      const id=button.dataset.ack;
      if(id.startsWith('slot:'))state.alerts[id.slice(5)].handled=true;
      else if(id==='help')resolveHelp(state,'acknowledged');
      else state.careAlerts[id].handled=true;
      toast('알림을 확인했어요. 식사 확인이나 실제 연락 완료와는 달라요.');
    }
    render();
    if(button.dataset.ack){
      const next=view==='guardian'?root.querySelector('[data-action="call-dialog"]'):root.querySelector('[data-ack]');
      (next||root.querySelector('h1'))?.focus({preventScroll:true});
    }
  }catch(error){toast(error.message);}
});
document.addEventListener('change',event=>{
  if(event.target.closest('#away-form')&&['start','end'].includes(event.target.name)&&modal?.type==='away'){
    modal.awayDays=null;
    for(const button of root.querySelectorAll('[data-away-days]'))button.setAttribute('aria-pressed','false');
    root.querySelector('#away-range').textContent='선택한 날짜·시간으로 적용해요.';
  }
  if(event.target.name==='meals'&&event.target.closest('#setup-form')){
    const selected=root.querySelectorAll('#setup-form input[name="meals"]:checked').length;
    root.querySelector('#setup-form .meal-choices legend').textContent=`평소 챙기는 끼니 · 하루 ${selected}끼`;
  }
  if(event.target.id==='meal-choice'){chosenMeal=event.target.value;render();document.querySelector('#meal-choice')?.focus();}
  if(event.target.id==='ate-out-check')document.querySelector('[data-action="eatout-save"]').disabled=!event.target.checked;
});
document.addEventListener('submit',event=>{
  const form=event.target;
  if(!form.matches('#setup-form,#away-form,#schedule-form,#profile-form,#rules-form,#invite-form,#accept-form,.power-form'))return;
  event.preventDefault();const fields=new FormData(form);
  try{
    if(form.id==='setup-form'){
      const next=readSetupForm(setup,fields);validateSetup(next,next.step);
      if(next.step===5){applySetup(state,next);setup=null;toast('우리 집 가상 설정을 적용했어요.');go('guardian');}
      else{setupWelcome=next.step===2;next.step++;setup=next;render(true);window.scrollTo({top:0,behavior:'instant'});}
      return;
    }else if(form.id==='away-form'){
      if(!state.consent)throw Error('공유를 시작한 뒤 외출을 남겨 주세요.');
      setAway(state,parseDateInput(fields.get('start')),parseDateInput(fields.get('end')));modal=null;receipt={title:'외출 일정을 남겼어요',detail:'겹치는 끼니의 확인 알림은 쉬어요. 돌아오면 집에 왔다고 알려주세요.'};toast('외출 일정을 남겼어요. 겹치는 끼니의 확인 알림은 쉬어요.');
    }else if(form.id==='schedule-form'){
      const minute=value=>{const [hours,minutes]=String(value).split(':').map(Number);return hours*60+minutes;};
      configure(state,MEALS.map(id=>({id,start:minute(fields.get(`${id}-start`)),end:minute(fields.get(`${id}-end`))})),Number(fields.get('grace')));chosenMeal=null;toast('식사 시간을 저장했어요.');
    }else if(form.id==='profile-form'){
      updateProfile(state,{household:fields.get('household'),ageBand:fields.get('ageBand'),riceRoutine:fields.get('riceRoutine'),primaryDevice:fields.get('primaryDevice'),meals:fields.getAll('meals'),eatOutWeekly:Number(fields.get('eatOutWeekly')),cookEveryDays:Number(fields.get('cookEveryDays'))},state.rules);toast('생활 패턴을 저장했어요.');
    }else if(form.id==='rules-form'){
      updateProfile(state,state.profile,{consecutiveMissed:Number(fields.get('consecutiveMissed')),inactiveHours:Number(fields.get('inactiveHours')),followupHours:Number(fields.get('followupHours'))});toast('알림 기준을 저장했어요.');
    }else if(form.id==='invite-form'){
      createInvite(state,fields.get('alias'),fields.get('role'));toast('24시간 동안 유효한 연습용 초대를 만들었어요.');
    }else if(form.id==='accept-form'){
      const member=acceptInvite(state,fields.get('code'));toast(`${member.name}님을 가상 가족으로 연결했어요.`);
    }else toast(powerRun(Number(fields.get('watts')),Number(fields.get('duration'))).reason);
    const savedSection=form.dataset.section;
    render();
    if(savedSection)document.querySelector(`#setting-${savedSection}>summary`)?.focus({preventScroll:true});
  }catch(error){const output=form.querySelector('.error')||form.closest('.card')?.querySelector('.error');if(output){output.textContent=error.message;output.tabIndex=-1;output.focus();}else toast(error.message);}
});
function restoreRoute(){if(location.hash==='#main'||location.hash.endsWith('/main'))return;edition=editionFromLocation(location,'',CLOUD_AVAILABLE?recalledEdition(appBase):null);go(initialView(),false);}
window.addEventListener('hashchange',restoreRoute);
window.addEventListener('popstate',restoreRoute);
// Hidden advanced fields still validate. Reveal their group before native error focus.
document.addEventListener('invalid',event=>{
  let ancestor=event.target.parentElement;
  while(ancestor){if(ancestor.tagName==='DETAILS')ancestor.open=true;ancestor=ancestor.parentElement;}
},true);

// Tools act only on this tab's fake data and cannot message people or control devices.
const modelContext=document.modelContext;
if(modelContext?.registerTool){
  const controller=new AbortController();
  const demoSummary=()=>({demo:true,now:hhmm(state.now),consent:state.consent,online:state.online,meals:MEALS.map(id=>({id,status:status(state,dayOf(state.now),id)})),alerts:alertEntries()});
  const demoTools=[
    {name:'read_meal_demo',description:'Read this tab’s in-memory meal-care demonstration. Never real health or device data.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:demoSummary},
    {name:'simulate_meal_demo_action',description:'Simulate a sensor, 30-minute clock advance or self-report in this tab. Does not notify people or operate hardware.',inputSchema:{type:'object',properties:{action:{type:'string',enum:['sensor','advance30','confirm']},meal:{type:'string',enum:MEALS}},required:['action'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{if(!input||!['sensor','advance30','confirm'].includes(input.action)||Object.keys(input).some(name=>!['action','meal'].includes(name))||(input.action==='confirm'&&!MEALS.includes(input.meal)))throw Error('Invalid demo action');action(input.action,input.meal);return demoSummary();}},
  ];
  for(const tool of demoTools){try{Promise.resolve(modelContext.registerTool(tool,{signal:controller.signal})).catch(()=>{});}catch{}}
  window.addEventListener('pagehide',()=>controller.abort(),{once:true});
}
render();
