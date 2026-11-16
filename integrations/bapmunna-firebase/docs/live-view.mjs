// These screens deliberately contain no synthetic meals, alerts, dates or people.
// Family summaries are not wired to a server in this Firebase edition yet.
const liveEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const livePolicy='https://impact-series.web.app/bapmunna/app/privacy/';
const liveHeading=(title,detail='')=>`<header class="page-head"><h1 tabindex="-1">${title}</h1>${detail?`<p class="sub">${detail}</p>`:''}</header>`;
export function liveTutorialPage({index=0,companion}){
  const slides=[
    ['멀리 있어도, 안부는 가까이.','매일 쓰는 밥솥의 소식으로 안부를 물어볼 계기를 만들어요.','밥솥 사용이 실제 식사나 건강 상태를 뜻하지는 않아요.'],
    ['필요한 순간에 알려드려요.','가족 연결과 어르신 동의를 마친 뒤 안부 알림을 시작해요.','기기가 없어도 홈을 먼저 둘러볼 수 있어요.'],
    ['오늘의 소식을 쉽게 살펴봐요.','확인된 소식과 아직 모르는 상태를 구분해 보여드려요.','기기 미연결·수신 대기를 식사를 거른 것으로 표시하지 않아요.'],
    ['어르신은 세 가지만 누르면 돼요.','외식했어요 · 놀러가요 · 도와줘요','가족 연결이 준비되면 필요한 날에만 간단히 소식을 전해요.'],
    ['누구의 안부가 듣고 싶으세요?','다음 화면에서 어떤 댁인지 알려 주세요. 입력을 마치면 홈으로 이어져요.','기기는 홈의 “기기 연결 확인하기”에서 나중에 연결할 수 있어요.'],
  ];
  const position=Math.max(0,Math.min(4,index)),slide=slides[position];
  return `<div class="home-stack" data-runtime-mode="live"><p class="label">밥뭇나 알아보기 · ${position+1}/5</p>${liveHeading(slide[0],slide[1])}<section class="card"><img src="${liveEscape(companion)}" width="180" height="180" alt="귀여운 밥솥 안부 친구" style="display:block;object-fit:contain;margin:0 auto 20px;max-width:100%"><p>${slide[2]}</p></section><button class="primary full" data-action="${position===4?'finish-tutorial':'next-live-tutorial'}">${position===4?'우리 집 알려주기':'다음'}</button>${position?'<button data-action="previous-live-tutorial">이전</button>':''}<button class="text-button" data-action="finish-tutorial">설명 건너뛰기</button></div>`;
}
export function livePage({view,edition,session,href,companion}){
  const link=(route,label)=>`<a class="quiet-link" style="display:block;min-height:44px;padding:10px 0" href="${liveEscape(href(route))}">${label} →</a>`;
  const demo='<button type="button" class="text-button" data-action="enter-demo">예시로 체험하기</button>';
  const policy=`<a class="quiet-link" href="${livePolicy}" target="_blank" rel="noopener noreferrer">개인정보 이용·제공 안내</a>`;
  const image=`<img src="${liveEscape(companion)}" width="160" height="160" alt="안부를 기다리는 밥솥이" style="display:block;object-fit:contain;margin:0 auto 18px;max-width:100%">`;
  const shell=body=>`<div class="home-stack" data-runtime-mode="live">${body}</div>`;
  if(session.status==='checking')return shell(liveHeading('계정을 확인하고 있어요.')+'<section class="card" role="status"><p>저장된 로그인 상태를 확인하고 있어요.</p></section>');
  if(session.status==='error')return shell(liveHeading('계정 확인을 마치지 못했어요.')+`<section class="card"><p role="alert">인터넷 연결을 확인하고 다시 시도해 주세요.</p><button class="primary full" data-action="retry-session">다시 확인하기</button>${link('account','로그인 화면으로')}</section>`);
  if(session.status!=='signed-in')return shell(liveHeading(session.status==='unverified'?'이메일 확인을 마쳐 주세요.':session.status==='recovery'?'계정 확인을 이어가 주세요.':'내 계정으로 시작해요.')+`<section class="card">${image}<p>로그인을 마친 뒤 내 계정과 연결 상태를 확인할 수 있어요.</p>${link('account',session.status==='signed-out'?'로그인·가입하기':'계정 확인하기')}<p class="caption">체험을 선택하면 예시 화면을 볼 수 있어요.</p>${demo}</section>`);
  if(view==='guardian')return shell(liveHeading('오늘도, 반가워요.','우리 가족의 소식을 차근차근 준비해요.')+`<section class="card" aria-label="기기 연결 안내"><p class="label">다음은 기기 연결</p><h2>여기서 연결 상태를 확인해 주세요.</h2><p>삼성 연결 안내로 이어져요. 나중에 설정에서도 찾을 수 있어요.</p>${link('connect','기기 연결 확인하기')}</section><section class="card">${image}<span class="pill">가족 연결 준비 중</span><h2>아직 확인할 가족 소식이 없어요.</h2><p>가족 공유와 기기 수신이 준비되면 실제 소식을 보여드릴게요.</p><p class="caption">로그인만으로 어르신이나 기기가 연결되지는 않아요. 받은 기록이 없을 때 식사를 거른 것으로 표시하지 않아요.</p>${link('setup','우리 집 정보 입력·수정')}${link('connect','여기서 기기 연결을 확인해 주세요')}${link('account','내 계정 확인하기')}</section>`);
  if(view==='senior')return shell(liveHeading('오늘도 반가워요.','가족에게 전할 소식을 준비하고 있어요.')+`<section class="card">${image}<p>가족 연결이 준비되면 아래 버튼으로 소식을 전할 수 있어요.</p><div class="senior-three" aria-label="가족 연결 후 사용할 소식"><button disabled>외식했어요</button><button disabled>놀러가요</button><button disabled>도와줘요</button></div><p class="caption">현재는 가족에게 전송되지 않아요. 급한 연락은 평소 사용하는 전화로 직접 해 주세요.</p>${link('account','내 계정·내 기록 보기')}</section>`);
  if(view==='report')return shell(liveHeading('기록을 기다리고 있어요.')+`<section class="card"><h2>${edition==='senior'?'내가 남긴 기록은 내 계정에서':'가족 기록은 연결을 마친 뒤'}</h2><p>${edition==='senior'?'직접 저장한 본인 기록을 확인할 수 있어요.':'가족 공유와 실제 수신이 준비되면 기록과 리포트를 확인할 수 있어요.'}</p>${link(edition==='senior'?'account':'connect',edition==='senior'?'내 기록 보기':'기기 연결 확인하기')}</section>`);
  if(view==='alerts')return shell(liveHeading('가족 알림을 준비하고 있어요.')+`<section class="card"><p>아직 실제 가족 알림 서비스가 연결되지 않았어요.</p><p class="caption">알림이 없다는 것을 식사 확인이나 건강 상태로 해석하지 않아요.</p>${link('connect','기기 연결 확인하기')}</section>`);
  if(view==='setup')return shell(liveHeading('누구의 안부가 듣고 싶으세요?','기본 정보만 알려주시면 홈으로 이어져요.')+'<div id="household-surface"></div>');
  if(['settings','devices'].includes(view))return shell(liveHeading('우리 집에 맞게 준비해요.')+`<section class="card"><h2>알림 기준</h2><p>실제 가족 알림 연결 후 설정할 수 있어요.</p></section><section class="card"><h2>생활 기준</h2><p>우리 집 기본 정보는 내 계정에 저장할 수 있어요.</p>${link('setup','우리 집 정보 입력·수정')}<p>식사 시간과 자동 알림 설정은 연결을 준비하고 있어요.</p><p class="caption">안부 정보 공유는 어르신의 별도 동의가 있어야 시작해요.</p></section><section class="card"><h2>기기</h2>${link('connect','SmartThings 연결 확인하기')}${policy}</section>`);
  if(view==='family')return shell(liveHeading('가족 연결을 준비하고 있어요.')+`<section class="card"><p>어르신의 동의를 확인한 뒤 가족 소식을 나누도록 준비하고 있어요.</p><p class="caption">현재 다른 계정의 기록을 읽거나 가족 초대를 전송하지 않아요.</p>${policy}</section>`);
  if(view==='privacy')return shell(liveHeading('공유는 내가 정해요.')+`<section class="card"><p>안부 공유는 어르신의 별도 동의 후 시작해요. 동의하지 않아도 가입할 수 있어요.</p>${policy}${link('account','내 계정 확인하기')}</section>`);
  if(view==='about')return shell(liveHeading('밥 한 끼로 전하는 안부')+`<section class="card"><p>밥솥 사용 소식은 안부를 물어볼 계기예요. 실제 식사량이나 건강 상태를 판단하지 않아요.</p><p>본인 계정과 직접 남긴 기록은 사용할 수 있어요. 가족 공유·기기 자동 수신·가족 알림은 준비 중이에요.</p>${policy}</section><section class="card"><h2>사용 방법을 먼저 볼까요?</h2>${demo}</section>`);
  return shell(liveHeading('필요한 곳으로 바로 가요.')+`<section class="card"><div class="stack">${link('account','내 계정')}${link('settings','생활·알림 설정')}${link('connect','기기 연결')}${link('alerts','받은 알림')}${link('family','가족 공유')}${link('privacy','개인정보 안내')}${link('about','이용 안내')}${link('tutorial','앱 사용법 다시 보기')}</div></section><section class="card"><h2>예시 화면 둘러보기</h2><p>체험 기록은 내 계정에 저장하지 않아요.</p>${demo}</section>`);
}
