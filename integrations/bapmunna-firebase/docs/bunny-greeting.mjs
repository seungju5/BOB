// Pose animation: the legs, ears, arm and expression change inside the artwork.
// The same controller is shared by the static app and the Next.js welcome page.
export const BUNNY_BEATS = [
  [0, 300, 'ready'],
  [1, 110, 'crouch'], [2, 90, 'spring'], [3, 150, 'hop'], [4, 90, 'descend'], [5, 110, 'land'], [6, 140, 'settle'],
  [1, 100, 'crouch'], [2, 80, 'spring'], [3, 120, 'hop'], [4, 80, 'descend'], [5, 100, 'land'], [6, 160, 'settle'],
  [7, 120, 'raise'], [8, 140, 'wave'], [9, 120, 'wave'], [10, 140, 'wave'],
  [9, 120, 'wave'], [11, 150, 'blink'], [12, 150, 'wave'], [9, 120, 'wave'], [12, 150, 'wave'],
  [8, 140, 'wave'], [7, 120, 'lower'], [13, 220, 'bow'], [14, 140, 'lower'], [15, 140, 'rest'],
];
export const BUNNY_DURATION = BUNNY_BEATS.reduce((total, beat) => total + beat[1], 0);
// Foot anchors measured from the generated 1254px atlas prevent grid-frame jitter.
const BUNNY_ANCHORS = [[162,275],[162,274],[143,271],[150,253],[161,265],[163,270],[152,271],[156,272],[165,271],[167,271],[154,271],[158,271],[167,270],[165,271],[153,270],[154,271]];

export function bunnyLiftAt(elapsed) {
  for (const [start, end, height] of [[410,740,42],[1090,1370,26]]) {
    if (elapsed >= start && elapsed <= end) return Math.sin(Math.PI * (elapsed - start) / (end - start)) * height;
  }
  return 0;
}

export function bunnyPoseAt(elapsed) {
  let end = 0;
  for (const [frame, duration, phase] of BUNNY_BEATS) {
    const start = end; end += duration;
    if (elapsed < end) return {frame, phase, progress: Math.max(0, (elapsed - start) / duration)};
  }
  return {frame: 0, phase: 'rest', progress: 1};
}

/** @param {HTMLElement} scene @param {{spriteUrl: string}} options */
export function createBunnyGreeting(scene, {spriteUrl}) {
  const slot = scene.querySelector('.bunny-slot');
  const button = scene.querySelector('[data-action="welcome-replay"]');
  const shadow = scene.querySelector('.bunny-shadow');
  const canvas = document.createElement('canvas');
  canvas.className = 'bunny-motion'; canvas.width = 640; canvas.height = 640;
  canvas.setAttribute('aria-hidden', 'true'); canvas.hidden = true;
  const context = canvas.getContext('2d');
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let image, loading, disposed = false, ready = false, failed = false, playing = false, queued = false;
  let raf = 0, elapsed = 0, previousTime = null, generation = 0;
  slot?.append(canvas);

  function setStatus(status) {
    scene.dataset.greetingState = status;
    if (button) {
      button.disabled = status === 'loading';
      button.setAttribute('aria-label', status === 'loading' ? '토끼 인사를 준비하고 있어요' : '토끼의 점프와 손 인사 다시 보기');
    }
  }
  function draw(time) {
    if (!ready || !context || !image) return;
    const pose = bunnyPoseAt(time), size = image.naturalWidth / 4;
    context.clearRect(0, 0, 640, 640);
    const [anchorX, anchorY] = BUNNY_ANCHORS[pose.frame];
    // Articulated poses provide the motion; the arc preserves the two original hops.
    context.drawImage(image, (pose.frame % 4) * size, Math.floor(pose.frame / 4) * size, size, size,
      (156.75 - anchorX) / 313.5 * 640, (275 - anchorY) / 313.5 * 640, 640, 640);
    canvas.style.setProperty('--bunny-lift', `${-bunnyLiftAt(time)}px`);
    scene.dataset.greetingFrame = String(pose.frame);
    scene.dataset.greetingPhase = pose.phase;
    if (shadow) {
      const airborne = ['spring', 'hop', 'descend'].includes(pose.phase);
      shadow.style.transform = `scaleX(${airborne ? '.72' : '1'})`;
      shadow.style.opacity = airborne ? '.4' : '.75';
    }
  }
  function stop() {
    generation++; playing = false; queued = false; previousTime = null;
    cancelAnimationFrame(raf); raf = 0; elapsed = 0;
    scene.classList.remove('is-greeting'); draw(0); setStatus('idle');
  }
  function tick(now) {
    if (disposed || !playing || document.hidden || !scene.isConnected) { raf = 0; return; }
    if (previousTime !== null) elapsed += now - previousTime;
    previousTime = now;
    if (elapsed >= BUNNY_DURATION) { stop(); return; }
    draw(elapsed); raf = requestAnimationFrame(tick);
  }
  async function load() {
    if (ready) return true;
    if (!context || !slot) return false;
    if (!loading) {
      image = new Image(); image.decoding = 'async'; image.src = spriteUrl;
      loading = image.decode().then(() => {
        if (disposed || !scene.isConnected) return false;
        if (image.naturalWidth !== image.naturalHeight || image.naturalWidth < 1000) throw Error('Invalid greeting atlas');
        ready = true; draw(0); canvas.hidden = false; slot.classList.add('has-bunny-motion');
        return true;
      }).catch(() => {
        if (!disposed) { setStatus('unavailable'); if (button) button.hidden = true; }
        return false; // The original mascot and entry links stay available.
      });
    }
    return loading;
  }
  async function play() {
    if (disposed || preference.matches || failed) return;
    stop(); const request = generation; setStatus('loading');
    const loaded = await load();
    if (disposed || request !== generation || preference.matches) return;
    if (!loaded) { failed = true; setStatus('unavailable'); if (button) button.hidden = true; return; }
    if (document.hidden) { queued = true; setStatus('idle'); return; }
    playing = true; scene.classList.add('is-greeting'); setStatus('playing');
    raf = requestAnimationFrame(tick);
  }
  function visibilityChanged() {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; previousTime = null; }
    else if (queued) void play();
    else if (playing && !raf) raf = requestAnimationFrame(tick);
  }
  function preferenceChanged() {
    if (preference.matches) stop();
    if (button) button.hidden = preference.matches || failed;
  }
  document.addEventListener('visibilitychange', visibilityChanged);
  preference.addEventListener('change', preferenceChanged);
  preferenceChanged();
  return {
    play,
    dispose() {
      stop(); disposed = true;
      document.removeEventListener('visibilitychange', visibilityChanged);
      preference.removeEventListener('change', preferenceChanged);
      slot?.classList.remove('has-bunny-motion'); canvas.remove();
    },
  };
}
