import {STAGES,authMessage} from '../auth-utils.mjs';
import {asDate,summarize,filterCustomers,mergeCustomers} from './metrics.mjs';
import {deploymentConfig} from '../deployment-config.mjs';

const assets=new URL('../assets/',import.meta.url).href;
const safe=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const colors={new:'#eab943',contacted:'#6b8e7b',active:'#264c3d',paused:'#b4bbb3'};
const paths={grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',people:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',arrow:'M5 12h14 M13 6l6 6-6 6',refresh:'M20 7v5h-5 M4 17v-5h5 M6 6a8 8 0 0 1 13 2 M18 18A8 8 0 0 1 5 16',search:'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',clock:'M12 8v4l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',check:'M5 12l4 4L19 6',plus:'M12 5v14 M5 12h14',database:'M4 6c0-5 16-5 16 0s-16 5-16 0 M4 6v12c0 5 16 5 16 0V6 M4 12c0 5 16 5 16 0',lock:'M6 10h12v11H6z M8 10V6a4 4 0 0 1 8 0v4',close:'M6 6l12 12 M6 18L18 6',note:'M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h5'};
const icon=(name)=>`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.grid}"/></svg>`;
const date=value=>{const d=asDate(value);return d?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(d):'기록 없음';};
const time=value=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'}).format(value);
const badge=stage=>`<span class="mc-badge mc-${Object.hasOwn(STAGES,stage)?stage:'paused'}">${safe(STAGES[stage]||'미분류')}</span>`;
const options=(items,current)=>Object.entries(items).map(([value,label])=>`<option value="${value}" ${value===current?'selected':''}>${label}</option>`).join('');

export function mountDashboard(element,{provider,user}){
  let alive=true,request=0;
  const state={customers:[],cursor:null,hasMore:false,loaded:false,loading:true,saving:false,problem:'',notice:'',updated:null,period:7,query:'',stage:'all',day:'',recent:false,sort:'newest',selected:null,draft:null,pending:null};
  const dirty=()=>{const person=state.customers.find(p=>p.id===state.selected);return !!person&&!!state.draft&&(person.stage!==state.draft.stage||(person.note||'')!==state.draft.note);};
  const scope=()=>state.hasMore?`최근 ${state.customers.length}명 기준 · 다음 페이지가 있어요`:`전체 등록 회원 ${state.customers.length}명 기준`;
  function feedback(){return `${state.problem?`<div class="mc-feedback mc-error" role="alert">${icon('note')}<span>${safe(state.problem)}</span></div>`:''}${state.notice?`<div class="mc-feedback mc-success" role="status">${icon('check')}<span>${safe(state.notice)}</span></div>`:''}`;}
  function trendChart(stats){
    const max=Math.max(1,...stats.trend.map(item=>item.count));
    return `<section class="mc-panel mc-trend" aria-labelledby="mc-trend-title"><header class="mc-panel-head"><div><p class="mc-overline">REGISTRATION</p><h2 id="mc-trend-title">회원가입 흐름</h2></div><div class="mc-segment" aria-label="가입 추이 기간">${[7,30].map(period=>`<button data-period="${period}" aria-pressed="${state.period===period}">${period}일</button>`).join('')}</div></header><div class="mc-chart-summary"><strong>${stats.periodTotal}<small>명</small></strong><span>최근 ${state.period}일에 가입했어요</span></div><div class="mc-chart-frame"><div class="mc-axis" aria-hidden="true"><span>${max}명</span><span>${max/2}</span><span>0</span></div><div class="mc-bars ${state.period===30?'mc-dense':''}" role="group" aria-label="날짜를 선택하면 해당 날짜에 가입한 회원을 볼 수 있습니다">${stats.trend.map((item,index)=>`<button class="mc-bar-column ${item.day===state.day?'is-chosen':''}" data-day="${item.day}" aria-pressed="${item.day===state.day}" aria-label="${item.day} 가입 ${item.count}명, 회원 보기"><span class="mc-bar-tip">${item.day.slice(5).replace('-','/')} · ${item.count}명</span><span class="mc-bar-track"><span class="mc-bar ${index===stats.trend.length-1?'mc-bar-today':''}" style="height:${item.count/max*100}%"></span></span><span class="mc-bar-label">${state.period===7||index%5===0||index===stats.trend.length-1?item.day.slice(5).replace('-','/'):'·'}</span></button>`).join('')}</div></div><p class="mc-chart-caption">${icon('plus')} 막대를 누르면 해당 날짜의 회원만 보여요.</p></section>`;
  }
  function stagesChart(stats){
    const radius=64,circumference=2*Math.PI*radius;let offset=0;
    const arcs=Object.keys(STAGES).map(stage=>{const length=stats.total?stats.stages[stage]/stats.total*circumference:0;const arc=`<circle cx="88" cy="88" r="${radius}" fill="none" stroke="${colors[stage]}" stroke-width="20" stroke-dasharray="${length} ${circumference-length}" stroke-dashoffset="${-offset}"/>`;offset+=length;return arc;}).join('');
    return `<section class="mc-panel mc-distribution" aria-labelledby="mc-stage-title"><header class="mc-panel-head"><div><p class="mc-overline">CARE STATUS</p><h2 id="mc-stage-title">운영 단계별 현황</h2></div>${icon('people')}</header><div class="mc-donut-wrap"><svg class="mc-donut" viewBox="0 0 176 176" role="img" aria-label="${safe(Object.keys(STAGES).map(stage=>`${STAGES[stage]} ${stats.stages[stage]}명`).join(', '))}"><circle cx="88" cy="88" r="64" fill="none" stroke="#eeeee6" stroke-width="20"/><g transform="rotate(-90 88 88)">${arcs}</g></svg><div class="mc-donut-label"><strong>${stats.total}</strong><span>조회한 회원</span></div></div><div class="mc-legend">${Object.keys(STAGES).map(stage=>`<button data-stage="${stage}" aria-pressed="${state.stage===stage}"><span><i style="background:${colors[stage]}"></i>${STAGES[stage]}</span><strong>${stats.stages[stage]}<small>명</small></strong></button>`).join('')}</div><p class="mc-chart-caption">단계를 누르면 회원 목록을 좁혀 볼 수 있어요.</p></section>`;
  }
  function detailView(){
    const person=state.customers.find(p=>p.id===state.selected);
    if(!person)return `<aside class="mc-panel mc-detail mc-detail-empty"><div class="mc-empty-art"><img src="${assets}rice-cooker-companion.png" alt="" width="100" height="125"></div><p class="mc-overline">ONE PERSON AT A TIME</p><h2>한 사람을 더 가까이.</h2><p>목록에서 이름을 선택해 보세요.<br>회원정보와 안내 이력을<br>이곳에서 살펴볼 수 있어요.</p><span class="mc-detail-hint">${icon('note')} 운영 메모는 담당자에게만 보여요</span></aside>`;
    return `<aside class="mc-panel mc-detail" id="mc-detail" tabindex="-1" aria-label="${safe(person.displayName)} 회원 상세"><header class="mc-panel-head"><span class="mc-overline">MEMBER DETAILS</span><button class="mc-icon-button" data-crm="close-detail" aria-label="회원 상세 닫기">${icon('close')}</button></header><div class="mc-person-heading"><span class="mc-avatar mc-avatar-large" aria-hidden="true">${safe(person.displayName?.slice(0,1)||'?')}</span><div><h2>${safe(person.displayName||'이름 없음')}</h2>${badge(person.stage)}</div></div><p class="mc-person-email">${safe(person.email)}</p><dl class="mc-person-facts"><div><dt>가입일</dt><dd>${date(person.createdAt)}</dd></div><div><dt>최근 계정 이용</dt><dd>${date(person.lastLoginAt)}</dd></div><div><dt>메모 수정일</dt><dd>${date(person.noteUpdatedAt)}</dd></div></dl><form id="mc-note-form"><fieldset ${state.saving?'disabled':''}><label class="field">운영 단계<select name="stage">${options(STAGES,state.draft.stage)}</select></label><label class="field">운영 메모<textarea name="note" rows="5" maxlength="1000" placeholder="예: 첫 이용 안내 완료. 다음 문의 때 확인할 내용을 남겨 주세요.">${safe(state.draft.note)}</textarea></label><div class="mc-draft-meta"><span id="mc-save-state">${dirty()?'저장하지 않은 변경사항':'저장된 내용'}</span><span id="mc-note-count">${state.draft.note.length}/1,000</span></div><p class="mc-note-help">문의·안내 내용만 간단히 기록해 주세요. 건강 정보나 비밀번호는 적지 않아요.</p><p class="mc-note-result ${state.problem?'has-error':''}">${safe(state.problem||state.notice)}</p><button class="mc-primary" type="submit" ${state.saving?'disabled':''}>${icon('check')} ${state.saving?'저장 중…':'변경사항 저장'}</button></fieldset></form></aside>`;
  }
  function customerList(){
    const filtered=filterCustomers(state.customers,state);
    const narrowed=state.stage!=='all'||state.query||state.day||state.recent;
    return `<section class="mc-customers" id="members"><div class="mc-section-heading"><div><p class="mc-overline">MEMBERS</p><h2 id="mc-members-heading" tabindex="-1">회원 관리 <span>${filtered.length}</span></h2></div><p>회원 선택 → 단계 확인 → 메모 저장</p></div><div class="mc-workbench"><section class="mc-panel mc-directory"><form id="mc-filter-form"><label class="mc-search">${icon('search')}<input name="query" type="search" aria-label="이름 또는 이메일 검색" placeholder="이름 또는 이메일 검색" value="${safe(state.query)}" maxlength="100"><button type="submit">검색</button></label><div class="mc-filter-row"><label><span class="sr-only">운영 단계 필터</span><select name="stage">${options({all:'모든 단계',...STAGES},state.stage)}</select></label><label><span class="sr-only">회원 정렬</span><select name="sort">${options({newest:'최근 가입순',login:'최근 이용순',name:'이름순'},state.sort)}</select></label></div></form>${narrowed?`<div class="mc-applied"><span>${safe([state.stage!=='all'?STAGES[state.stage]:null,state.day?`${state.day} 가입`:null,state.recent?'최근 7일 가입':null,state.query?`“${state.query}”`:null].filter(Boolean).join(' · '))}</span><button data-crm="reset-filters">초기화 ×</button></div>`:''}<div class="mc-list-caption"><span>회원 / 이메일</span><span>운영 단계 · 가입일</span></div><ul class="mc-member-list">${filtered.map(person=>`<li><button class="mc-member ${person.id===state.selected?'is-selected':''}" data-person="${safe(person.id)}" aria-pressed="${person.id===state.selected}"><span class="mc-avatar" aria-hidden="true">${safe(person.displayName?.slice(0,1)||'?')}</span><span class="mc-member-name"><strong>${safe(person.displayName||'이름 없음')}</strong><small>${safe(person.email)}</small></span><span class="mc-member-meta">${badge(person.stage)}<small>${date(person.createdAt)}</small></span><span class="mc-member-arrow" aria-hidden="true">${icon('arrow')}</span></button></li>`).join('')}</ul>${!filtered.length?`<div class="mc-list-empty">${icon('search')}<h3>${state.customers.length?'검색 결과가 없어요':'첫 회원을 기다리고 있어요'}</h3><p>${state.customers.length?'검색어나 운영 단계를 바꿔 보세요.':'회원이 내 기록을 시작하면 여기에 표시됩니다.'}</p>${narrowed?'<button data-crm="reset-filters">전체 회원 보기</button>':''}</div>`:''}<footer class="mc-directory-footer"><span>${scope()}</span>${state.hasMore?`<button data-crm="load-more" ${state.loading?'disabled':''}>${state.loading?'불러오는 중…':'다음 50명 불러오기'} ↓</button>`:''}</footer></section>${detailView()}</div></section>`;
  }
  function render(focus){
    if(!alive)return;
    const stats=summarize(state.customers,state.period);
    element.innerHTML=`<div class="mc-layout"><aside class="mc-rail"><p class="mc-rail-label">WORKSPACE</p><nav aria-label="관리센터 메뉴"><a class="mc-rail-link is-active" href="#overview">${icon('grid')} 한눈에 보기</a><a class="mc-rail-link" href="#members">${icon('people')} 회원 관리</a></nav><div class="mc-rail-note">${icon('lock')}<strong>필요한 정보만,<br>안전하게.</strong><p>회원 기본정보와<br>운영 메모를 관리해요.</p></div><details class="mc-tools"><summary>${icon('database')} 데이터 도구</summary><a href="${provider.name==='Supabase'?'https://supabase.com/dashboard/project/dakozsbqltciqihazzel/editor':`https://console.firebase.google.com/project/${deploymentConfig.firebaseProjectId}/firestore`}" target="_blank" rel="noopener">데이터베이스 콘솔 ↗</a><p>프로젝트 관리자 계정으로 열립니다.</p></details><div class="mc-operator"><span class="mc-avatar">${safe(user.displayName?.slice(0,1)||'운')}</span><div><strong>관리자</strong><small>${safe(user.email)}</small></div><button data-cloud-action="logout">로그아웃</button></div></aside><div class="mc-workspace"><header class="mc-heading" id="overview"><div><p class="mc-overline">밥뭇나 · MANAGEMENT</p><h1>오늘의 돌봄을, 한눈에.</h1><p>작은 관심이 이어지는 곳. 회원의 다음 단계를 살펴보세요.</p></div><button class="mc-refresh" data-crm="refresh" ${state.loading||state.saving?'disabled':''}>${icon('refresh')} ${state.loading?'불러오는 중':'새로고침'}</button></header><div class="mc-sync"><span class="mc-live-dot"></span><span>${provider.name} · ${state.loaded?(state.updated?`${time(state.updated)}에 조회`:'조회 완료'):'회원 정보 연결 중'}</span><span>${state.loaded?scope():'권한을 확인한 회원 정보만 불러옵니다'}</span></div>${feedback()}
      ${state.loaded?`<div class="mc-summary-grid"><button class="mc-metric" data-metric="all"><span>${icon('people')} 조회한 회원</span><strong>${stats.total}<small>명</small></strong><p>${state.hasMore?'최근 조회한 회원 기준':'등록된 모든 회원'}</p></button><button class="mc-metric" data-metric="recent"><span>${icon('plus')} 최근 7일 신규 가입</span><strong>${stats.newWeek}<small>명</small></strong><p>새롭게 연결된 인연</p></button><button class="mc-metric mc-metric-yellow" data-metric="new"><span>${icon('clock')} 첫 안내 대기</span><strong>${stats.stages.new}<small>명</small></strong><p>‘신규’ 단계의 회원 ${icon('arrow')}</p></button><button class="mc-metric" data-metric="active"><span>${icon('check')} 이용 중</span><strong>${stats.stages.active}<small>명</small></strong><p>운영자가 ‘이용 중’으로 분류</p></button></div><div class="mc-chart-grid">${trendChart(stats)}${stagesChart(stats)}</div><section class="mc-focus-banner"><div class="mc-focus-copy"><span class="mc-overline">A LITTLE CARE, EVERY DAY</span><h2>${stats.stages.new?`첫 인사를 기다리는 ${stats.stages.new}명`:'오늘도 한 사람씩, 세심하게.'}</h2><p>${stats.stages.new?'새로운 회원을 확인하고 필요한 안내를 이어가세요.':'회원의 안내 이력을 확인하고 다음 소식을 준비하세요.'}</p></div><button data-metric="${stats.stages.new?'new':'all'}">${stats.stages.new?'신규 회원 살펴보기':'회원 목록 보기'} ${icon('arrow')}</button><img src="${assets}rice-cooker-companion.png" alt="" width="96" height="120"></section>${customerList()}`:`<section class="mc-panel mc-loading" role="status">${icon('database')}<h2>${state.problem?'회원 정보를 불러오지 못했어요':'회원 정보를 정리하고 있어요'}</h2><p>${state.problem?'연결 상태를 확인한 뒤 새로고침해 주세요.':'잠시만 기다려 주세요.'}</p></section>`}<footer class="mc-footnote">${icon('lock')} 차트는 조회한 회원정보를 집계합니다. 개인 식사 기록·건강 상태는 포함하지 않습니다.</footer></div></div>`;
    if(focus)element.querySelector(focus)?.focus({preventScroll:true});
  }
  async function load(append=false){
    if(state.loading&&state.loaded)return;
    const revision=++request;state.loading=true;state.problem='';state.notice='';render();
    try{
      const page=await provider.listCustomers({cursor:append?state.cursor:null});
      if(!alive||revision!==request)return;
      state.customers=append?mergeCustomers(state.customers,page.customers):page.customers;state.cursor=page.nextCursor;state.hasMore=page.hasMore;state.loaded=true;state.updated=new Date();
      if(!append){state.selected=null;state.draft=null;}
    }catch(error){
      if(!alive||revision!==request)return;
      if(/permission-denied|42501|PGRST301/.test(String(error.code))){state.customers=[];state.selected=null;state.draft=null;state.loaded=false;}
      state.problem=authMessage(error);
    }finally{if(alive&&revision===request){state.loading=false;render();}}
  }
  function guarded(action){
    if(!dirty()){action();return;}
    const dialog=document.createElement('dialog');dialog.className='mc-discard';dialog.setAttribute('aria-label','저장하지 않은 변경사항');dialog.innerHTML='<h2>작성 중인 메모가 있어요.</h2><p>계속 편집하거나, 변경사항을 버리고 이동할 수 있어요.</p><div class="buttons"><button data-keep autofocus>계속 편집</button><button class="primary" data-discard>변경 버리고 이동</button></div>';
    const previous=document.activeElement;element.append(dialog);dialog.showModal();
    const close=()=>{dialog.close();dialog.remove();previous?.focus();};dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.querySelector('[data-keep]').onclick=close;dialog.querySelector('[data-discard]').onclick=()=>{close();action();};
  }
  const showMembers=()=>{element.querySelector('#mc-members-heading')?.focus({preventScroll:true});element.querySelector('#members')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});};
  const click=event=>{
    const link=event.target.closest('.mc-rail-link');
    if(link){event.preventDefault();const target=link.getAttribute('href');element.querySelectorAll('.mc-rail-link').forEach(item=>item.classList.toggle('is-active',item===link));element.querySelector(target)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});return;}
    const button=event.target.closest('button');if(!button||state.saving)return;
    if(button.dataset.person){guarded(()=>{state.selected=button.dataset.person;const person=state.customers.find(p=>p.id===state.selected);state.draft={stage:person.stage,note:person.note||''};state.notice='';render('#mc-detail');if(matchMedia('(max-width: 760px)').matches)element.querySelector('#mc-detail')?.scrollIntoView({block:'start'});});return;}
    if(button.dataset.period){if(![7,30].includes(Number(button.dataset.period)))return;state.period=Number(button.dataset.period);render(`[data-period="${state.period}"]`);return;}
    if(button.dataset.stage){state.stage=button.dataset.stage;state.day='';state.recent=false;state.query='';render();showMembers();return;}
    if(button.dataset.day){state.day=state.day===button.dataset.day?'':button.dataset.day;state.stage='all';state.recent=false;state.query='';render();showMembers();return;}
    if(button.dataset.metric){const kind=button.dataset.metric;state.stage=['new','active'].includes(kind)?kind:'all';state.recent=kind==='recent';state.day='';state.query='';render();showMembers();return;}
    if(button.dataset.cloudAction==='logout'&&dirty()){event.stopImmediatePropagation();guarded(()=>{state.draft=null;provider.signOut().catch(error=>{state.problem=authMessage(error);render();});});return;}
    const action=button.dataset.crm;
    if(action==='refresh')guarded(()=>load());
    if(action==='load-more'&&!state.loading)load(true);
    if(action==='reset-filters'){state.query='';state.stage='all';state.recent=false;state.day='';render('[name="query"]');}
    if(action==='close-detail')guarded(()=>{const id=state.selected;state.selected=null;state.draft=null;render();element.querySelectorAll('[data-person]').forEach(item=>{if(item.dataset.person===id)item.focus();});});
  };
  const input=event=>{
    const form=event.target.closest('form');if(form?.id!=='mc-note-form'||!state.draft)return;
    state.draft={stage:form.elements.stage.value,note:form.elements.note.value};element.querySelector('.mc-note-result').textContent='';element.querySelector('#mc-note-count').textContent=`${state.draft.note.length}/1,000`;element.querySelector('#mc-save-state').textContent=dirty()?'저장하지 않은 변경사항':'저장된 내용';
  };
  function applyFilter(form){state.query=form.elements.query.value;state.stage=form.elements.stage.value;state.sort=form.elements.sort.value;render('[name="query"]');}
  const change=event=>{input(event);const form=event.target.closest('form');if(form?.id==='mc-filter-form')applyFilter(form);};
  const submit=async event=>{
    const form=event.target;if(!['mc-filter-form','mc-note-form'].includes(form.id))return;event.preventDefault();event.stopPropagation();
    if(form.id==='mc-filter-form'){applyFilter(form);return;}
    if(state.saving||!state.selected||!state.draft)return;
    const id=state.selected,draft={...state.draft};state.saving=true;state.problem='';state.notice='';render();
    try{const saved=await provider.saveCustomerNote(id,draft.stage,draft.note);if(!alive)return;const person=state.customers.find(p=>p.id===id);Object.assign(person,saved);state.draft={stage:person.stage,note:person.note};state.notice='운영 정보를 저장했어요. 차트에도 반영했습니다.';}
    catch(error){if(alive)state.problem=authMessage(error);}
    finally{if(alive){state.saving=false;render('#mc-detail');}}
  };
  const unload=event=>{if(dirty()){event.preventDefault();event.returnValue='';}};
  // Capture dirty logout before the shared account controller handles it.
  element.addEventListener('click',click,true);element.addEventListener('input',input);element.addEventListener('change',change);element.addEventListener('submit',submit);window.addEventListener('beforeunload',unload);
  render();load();
  return ()=>{alive=false;request++;element.removeEventListener('click',click,true);element.removeEventListener('input',input);element.removeEventListener('change',change);element.removeEventListener('submit',submit);window.removeEventListener('beforeunload',unload);};
}
