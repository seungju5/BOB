const STORAGE_KEY = 'warming-up:office-decor:v1';
const POSITIONS = [
  {x:23,y:56},{x:44,y:56},{x:65,y:56},{x:85,y:56},
  {x:20,y:94},{x:50,y:94},{x:81,y:94},
];

/** The room is presentation only: selecting a member never grants access. */
export function initOffice({members,onSelect}) {
  if (!Array.isArray(members) || !members.length) throw new TypeError('Office members are required.');
  const frame = document.getElementById('room-frame');
  const room = document.getElementById('room-members');
  const roster = document.getElementById('member-roster');
  const dialog = document.getElementById('decor-dialog');
  const motionButton = document.getElementById('motion-toggle');
  const notice = document.getElementById('office-notice');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const abort = new AbortController();
  const timers = new Set();
  const poses = new Map();
  const buttons = new Map();
  let selected = members[0].id;
  let destroyed = false;
  let ambientTimer;
  let noticeTimer;
  let preferences = {light:'day',rug:'sage',plants:true,motion:true};
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (['day','night'].includes(saved.light)) preferences.light = saved.light;
    if (['sage','butter','rose'].includes(saved.rug)) preferences.rug = saved.rug;
    if (typeof saved.plants === 'boolean') preferences.plants = saved.plants;
    if (typeof saved.motion === 'boolean') preferences.motion = saved.motion;
  } catch { /* A blocked browser store must not block the room. */ }

  const listen = (target,event,fn) => target?.addEventListener(event,fn,{signal:abort.signal});
  const later = (fn,ms) => {
    const timer = setTimeout(() => {timers.delete(timer);if(!destroyed) fn();},ms);
    timers.add(timer);
    return timer;
  };
  const moving = () => preferences.motion && !reducedMotion.matches && !document.hidden;
  const save = () => {
    try {localStorage.setItem(STORAGE_KEY,JSON.stringify(preferences));} catch { /* Session-only preferences still work. */ }
  };
  const showNotice = text => {
    if (!notice) return;
    if (noticeTimer) clearTimeout(noticeTimer);
    notice.textContent = text;
    notice.classList.add('visible');
    noticeTimer = later(() => notice.classList.remove('visible'),2200);
  };

  function applyPreferences() {
    frame.dataset.light = preferences.light;
    frame.dataset.rug = preferences.rug;
    frame.dataset.plants = String(preferences.plants);
    document.getElementById('room-light-label').textContent = preferences.light === 'night' ? '포근한 밤의 작업실' : '햇살 드는 오후';
    document.querySelectorAll('[data-light-choice]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.lightChoice===preferences.light)));
    document.querySelectorAll('[data-rug-choice]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.rugChoice===preferences.rug)));
    document.getElementById('plants-toggle').checked = preferences.plants;
    updateMotion();
  }

  function updateMotion() {
    const paused = !moving();
    document.documentElement.dataset.motion = paused ? 'paused' : 'playing';
    motionButton.setAttribute('aria-pressed',String(!preferences.motion || reducedMotion.matches));
    const label = reducedMotion.matches ? '기기의 모션 줄이기 설정이 적용되었어요' : preferences.motion ? '캐릭터 움직임 멈추기' : '캐릭터 움직임 켜기';
    motionButton.setAttribute('aria-label',label);
    motionButton.title = label;
    if (paused) {
      for (const state of poses.values()) state.button.dataset.pose = 'idle';
    }
  }

  function pose(id,name,duration=1300) {
    const state = poses.get(id);
    if (!state || !moving()) return;
    if (state.timer) {clearTimeout(state.timer);timers.delete(state.timer);}
    state.button.dataset.pose = name;
    state.timer = later(() => {state.button.dataset.pose = state.talking && moving() ? 'talk' : 'idle';state.timer=null;},duration);
  }

  function greet(id) {
    const state = poses.get(id);
    if (!state) return;
    if (state.greetTimer) {clearTimeout(state.greetTimer);timers.delete(state.greetTimer);}
    state.button.dataset.greeting = 'true';
    state.greetTimer = later(() => {state.button.dataset.greeting='false';state.greetTimer=null;},3000);
    pose(id,'wave',1600);
  }

  function select(id) {
    if (!buttons.has(id)) return;
    selected = id;
    for (const [memberId,pair] of buttons) {
      for (const button of pair) button.setAttribute('aria-pressed',String(memberId===id));
    }
    greet(id);
  }

  members.forEach((member,index) => {
    const position = POSITIONS[index] || {x:50,y:75};
    const sprite = typeof member.sprite === 'string' ? member.sprite : `./assets/${member.english.toLowerCase()}.png`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bunny';
    button.dataset.member = member.id;
    button.dataset.pose = 'idle';
    button.style.setProperty('--x',`${position.x}%`);
    button.style.setProperty('--y',`${position.y}%`);
    button.style.setProperty('--member-color',member.color || '#c8b77e');
    button.style.setProperty('--bob-delay',`${index * -0.6}s`);
    button.style.zIndex = String(Math.round(position.y));
    button.setAttribute('aria-label',`${member.name}, ${member.role}. 대화하기`);
    button.setAttribute('aria-pressed',String(index===0));
    const avatar = document.createElement('span');
    avatar.className = 'sprite bunny-sprite';
    avatar.style.backgroundImage = `url(${JSON.stringify(sprite)})`;
    avatar.setAttribute('aria-hidden','true');
    const name = document.createElement('span');
    name.className = 'bunny-name';
    name.textContent = member.name;
    const bubble = document.createElement('span');
    bubble.className = 'bunny-bubble';
    bubble.textContent = member.greeting || '반가워요. 함께 시작해 볼까요?';
    bubble.setAttribute('aria-hidden','true');
    button.append(avatar,name,bubble);
    room.append(button);

    const rosterButton = document.createElement('button');
    rosterButton.type='button';
    rosterButton.className='roster-member';
    rosterButton.dataset.member=member.id;
    rosterButton.setAttribute('aria-pressed',String(index===0));
    rosterButton.setAttribute('aria-label',`${member.name}, ${member.role}. 대화하기`);
    const rosterAvatar=avatar.cloneNode();
    rosterAvatar.className='sprite';
    const rosterName=document.createElement('strong');
    rosterName.textContent=member.name;
    const rosterRole=document.createElement('small');
    rosterRole.textContent=member.role;
    rosterButton.append(rosterAvatar,rosterName,rosterRole);
    roster.append(rosterButton);
    buttons.set(member.id,[button,rosterButton]);
    poses.set(member.id,{button,talking:false,timer:null,greetTimer:null});
    const choose=() => {
      select(member.id);onSelect?.(member.id);
      if (window.matchMedia('(max-width:850px)').matches) {
        document.querySelector('.chat-panel')?.scrollIntoView({behavior:reducedMotion.matches ? 'auto' : 'smooth',block:'start'});
      }
    };
    listen(button,'click',choose);
    listen(rosterButton,'click',choose);
    listen(button,'pointerenter',() => pose(member.id,'wave',1000));
    listen(button,'focus',() => greet(member.id));
    const image=new Image();
    image.onerror=() => {if (!destroyed) button.dataset.missing='true';};
    image.onload=() => {if (!destroyed) delete button.dataset.missing;};
    image.src=sprite;
  });

  const art=document.querySelector('.room-art');
  listen(art,'error',() => {art.hidden=true;});
  const openDecor=() => {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open','');
  };
  const closeDecor=() => {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    document.getElementById('decorate-open').focus();
  };
  listen(document.getElementById('decorate-open'),'click',openDecor);
  listen(document.getElementById('decorate-close'),'click',closeDecor);
  listen(document.getElementById('decorate-done'),'click',() => {closeDecor();showNotice('우리 작업실이 한층 포근해졌어요.');});
  listen(dialog,'click',event => {
    if (event.target!==dialog) return;
    const rect=dialog.getBoundingClientRect();
    if (event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom) closeDecor();
  });
  document.querySelectorAll('[data-light-choice]').forEach(button => listen(button,'click',() => {preferences.light=button.dataset.lightChoice;applyPreferences();save();}));
  document.querySelectorAll('[data-rug-choice]').forEach(button => listen(button,'click',() => {preferences.rug=button.dataset.rugChoice;applyPreferences();save();}));
  listen(document.getElementById('plants-toggle'),'change',event => {preferences.plants=event.target.checked;applyPreferences();save();});
  listen(motionButton,'click',() => {
    if (reducedMotion.matches) {showNotice('기기의 모션 줄이기 설정에 맞춰 쉬고 있어요.');return;}
    preferences.motion=!preferences.motion;updateMotion();save();
    showNotice(preferences.motion ? '토끼 친구들이 다시 움직여요.' : '움직임을 잠시 멈췄어요.');
  });
  listen(reducedMotion,'change',updateMotion);
  listen(document,'visibilitychange',updateMotion);
  applyPreferences();

  ambientTimer=setInterval(() => {
    if (!moving() || destroyed) return;
    const talking=[...poses.values()].some(state=>state.talking);
    if (talking) {
      for (const [id,state] of poses) if (state.talking) pose(id,state.button.dataset.pose==='talk' ? 'idle' : 'talk',850);
      return;
    }
    const member=members[Math.floor(Math.random()*members.length)];
    if (member.id!==selected || Math.random()<.45) pose(member.id,Math.random()<.25 ? 'hop' : 'wave',1800);
  },3300);

  return {
    select,
    setTalking(id,isTalking) {
      const state=poses.get(id);
      if (!state) return;
      state.talking=Boolean(isTalking);
      if (state.timer) {clearTimeout(state.timer);timers.delete(state.timer);state.timer=null;}
      state.button.dataset.pose=isTalking && moving() ? 'talk' : 'idle';
    },
    destroy() {
      destroyed=true;abort.abort();clearInterval(ambientTimer);for (const timer of timers) clearTimeout(timer);timers.clear();room.replaceChildren();roster.replaceChildren();
    },
  };
}
