// Original artwork layers: hand and pencil rotate together without changing their shape.
// The same controller is shared by the static app and the Next.js welcome page.
export const BUNNY_BEATS = [
  [0, 300, 'ready'],
  [1, 110, 'crouch'], [2, 90, 'spring'], [3, 150, 'hop'], [4, 90, 'descend'], [5, 110, 'land'], [6, 140, 'settle'],
  [1, 100, 'crouch'], [2, 80, 'spring'], [3, 120, 'hop'], [4, 80, 'descend'], [5, 100, 'land'], [6, 160, 'settle'],
  [7, 120, 'raise'], [8, 140, 'wave'], [9, 120, 'wave'], [10, 140, 'wave'],
  [9, 120, 'wave'], [11, 150, 'wave'], [12, 150, 'wave'], [9, 120, 'wave'], [12, 150, 'wave'],
  [8, 140, 'wave'], [7, 120, 'lower'], [13, 220, 'bow'], [14, 140, 'lower'], [15, 140, 'rest'],
];
export const BUNNY_DURATION = BUNNY_BEATS.reduce((total, beat) => total + beat[1], 0);
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

// Separate rigid artwork parts: a hand gesture must never pull the face or stretch the paw.
const smooth = (a, b, value) => { const t = Math.max(0, Math.min(1, (value - a) / (b - a))); return t * t * (3 - 2 * t); };
const pulse = (time, start, peak, end) => smooth(start, peak, time) * (1 - smooth(peak, end, time));

export function bunnyRigAt(time) {
  const greet = smooth(1510, 1760, time) * (1 - smooth(2870, 3110, time));
  const crouch = pulse(time, 300, 410, 520) + .65 * pulse(time, 980, 1090, 1190);
  const land = pulse(time, 700, 780, 980) + .65 * pulse(time, 1330, 1410, 1570);
  const bow = pulse(time, 3070, 3230, 3510);
  return {
    lift: bunnyLiftAt(time),
    arm: greet * (-.43 + .17 * Math.sin((time - 1760) / 245 * Math.PI)),
    lean: -.04 * bow + .012 * land,
    bodyY: 4 * (crouch + land),
  };
}

export const BUNNY_WRIST = [170, 333];
// Both contours are sampled from the approved original, not from the generated repair plate.
export const BUNNY_HAND_PATH = [
  'M185 285 C198 278 214 282 220 294 C225 310 214 326 201 338 C190 349 175 346 164 334 C155 325 156 313 164 304 C169 297 176 291 185 285 Z',
  'M176 255 C180 251 186 253 189 258 L233 323 L229 327 L177 265 C173 261 173 258 176 255 Z',
].join(' ');

/** Independent rigid matrices; the hand matrix cannot affect the body or facial features. */
export function bunnyTransformAt(rig, part = 'body') {
  const around = (angle, x, y) => {
    const c = Math.cos(angle), s = Math.sin(angle);
    return [c, s, -s, c, x - c * x + s * y, y - s * x - c * y];
  };
  const body = around(rig.lean, 230, 456); body[5] += rig.bodyY;
  if (part !== 'hand') return body;
  const hand = around(rig.arm, BUNNY_WRIST[0], BUNNY_WRIST[1]);
  const [a,b,c,d,e,f] = body, [g,h,i,j,k,l] = hand;
  return [a*g+c*h,b*g+d*h,a*i+c*j,b*i+d*j,a*k+c*l+e,b*k+d*l+f];
}
export function bunnyPointAt(x, y, rig, part = 'body') {
  const [a,b,c,d,e,f] = bunnyTransformAt(rig, part);
  return [a*x+c*y+e,b*x+d*y+f];
}

/** Reconstruct only the hidden patch and its baked shadow; keep the moving hand's original pixels. */
export function createBunnyLayers(image, underlay) {
  const make = () => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 480; return canvas; };
  const hand = make(), repair = make(), mask = make(), path = new Path2D(BUNNY_HAND_PATH);
  const handContext = hand.getContext('2d'), repairContext = repair.getContext('2d'), maskContext = mask.getContext('2d');
  if (!handContext || !repairContext || !maskContext) throw Error('Greeting layers unavailable');
  handContext.clip(path); handContext.drawImage(image, 0, 0, 480, 480);
  // A small feather removes the old hand/pencil shadow without leaving a hard cutout seam.
  maskContext.fillStyle = maskContext.strokeStyle = '#fff'; maskContext.lineWidth = 10; maskContext.lineJoin = 'round'; maskContext.filter = 'blur(1.5px)';
  maskContext.fill(path); maskContext.stroke(path);
  repairContext.drawImage(underlay, 0, 0, 480, 480);
  repairContext.globalCompositeOperation = 'destination-in'; repairContext.drawImage(mask, 0, 0);
  return {hand, repair};
}

/** Draw intact original pixels. The generated plate only repairs the area hidden by the hand. */
export function drawBunnyFrame(context, image, layers, rig, size = 640) {
  context.clearRect(0, 0, size, size);
  context.save();
  // Uniform scaling only. No mesh, shear, facial compression or weighted skin deformation.
  context.scale(size / 600, size / 600);
  context.translate(60, 60);
  context.save(); context.transform(...bunnyTransformAt(rig));
  context.drawImage(image, 0, 0, 480, 480);
  if (Math.abs(rig.arm) > .0001) {
    context.drawImage(layers.repair, 0, 0, 480, 480);
  }
  context.restore();
  if (Math.abs(rig.arm) > .0001) {
    context.save(); context.transform(...bunnyTransformAt(rig, 'hand'));
    context.shadowColor = '#49352322'; context.shadowBlur = 2; context.shadowOffsetY = 1;
    context.drawImage(layers.hand, 0, 0, 480, 480); context.restore();
  }
  context.restore();
}

function createBunnyRenderer(canvas) {
  const context = canvas.getContext('2d');
  if (!context || typeof Path2D !== 'function') return null;
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
  let original, layers;
  return {
    load(image, underlay) { original = image; layers = createBunnyLayers(image, underlay); },
    draw(rig) { drawBunnyFrame(context, original, layers, rig, canvas.width); },
    dispose() { original = layers = null; context.clearRect(0, 0, canvas.width, canvas.height); },
  };
}

/** @param {HTMLElement} scene @param {{imageUrl?: string, underlayUrl?: string, spriteUrl?: string}} options */
export function createBunnyGreeting(scene, {imageUrl, underlayUrl, spriteUrl} = {}) {
  const slot = scene.querySelector('.bunny-slot');
  const button = scene.querySelector('[data-action="welcome-replay"]');
  const shadow = scene.querySelector('.bunny-shadow');
  const canvas = document.createElement('canvas');
  canvas.className = 'bunny-motion'; canvas.width = 640; canvas.height = 640;
  canvas.setAttribute('aria-hidden', 'true'); canvas.hidden = true;
  let renderer = null;
  const original = slot?.querySelector('img');
  // Accept old callers while always preferring their approved original image.
  const sourceUrl = imageUrl || original?.currentSrc || original?.src || spriteUrl;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let image, underlay, loading, disposed = false, ready = false, failed = false, playing = false, queued = false;
  let raf = 0, elapsed = 0, previousTime = null, generation = 0;
  slot?.append(canvas);

  function layout() {
    if (!original || !slot) return;
    const rect = original.getBoundingClientRect(), stage = slot.getBoundingClientRect();
    // Match object-fit:contain exactly, including older apps with non-square img boxes.
    const size = Math.min(rect.width, rect.height);
    canvas.style.left = `${rect.left - stage.left + (rect.width - size) / 2 - size / 8}px`;
    canvas.style.top = `${rect.top - stage.top + (rect.height - size) / 2 - size / 8}px`;
    canvas.style.width = canvas.style.height = `${size * 1.25}px`;
    if (shadow) {
      shadow.style.left = `${rect.left - stage.left + (rect.width - size) / 2 + size * .32}px`;
      shadow.style.top = `${rect.top - stage.top + (rect.height - size) / 2 + size * .945}px`;
      shadow.style.bottom = 'auto'; shadow.style.width = `${size * .38}px`; shadow.style.height = `${size * .045}px`;
    }
  }
  function setStatus(status) {
    scene.dataset.greetingState = status;
    if (button) {
      button.disabled = status === 'loading';
      button.setAttribute('aria-label', status === 'loading' ? '토끼 인사를 준비하고 있어요' : '토끼의 점프와 손 인사 다시 보기');
    }
  }
  function draw(time) {
    if (!ready || !renderer) return;
    const pose = bunnyPoseAt(time), rig = bunnyRigAt(time);
    renderer.draw(rig);
    canvas.style.setProperty('--bunny-lift', `${-rig.lift}px`);
    scene.dataset.greetingFrame = String(pose.frame);
    scene.dataset.greetingPhase = pose.phase;
    if (shadow) {
      const altitude = rig.lift / 42;
      shadow.style.transform = `scale(${1 - .3 * altitude},${1 - .15 * altitude})`;
      shadow.style.opacity = String(.65 - .35 * altitude);
      shadow.style.filter = `blur(${3 + altitude * 4}px)`;
    }
  }

  function stop() {
    generation++; playing = false; queued = false; previousTime = null;
    cancelAnimationFrame(raf); raf = 0; elapsed = 0;
    scene.classList.remove('is-greeting'); canvas.hidden = true; slot?.classList.remove('has-bunny-motion'); draw(0); setStatus('idle');
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
    if (!slot || !sourceUrl) return false;
    if (!renderer) renderer = createBunnyRenderer(canvas);
    if (!renderer) return false;
    if (!loading) {
      image = new Image(); image.decoding = 'async'; image.src = sourceUrl;
      underlay = new Image(); underlay.decoding = 'async';
      underlay.src = underlayUrl || new URL('bunny-underlay.webp', new URL(sourceUrl, document.baseURI)).href;
      loading = Promise.all([image.decode(), underlay.decode()]).then(() => {
        if (disposed || !scene.isConnected) return false;
        if (image.naturalWidth !== 480 || image.naturalHeight !== 480) throw Error('Invalid original bunny texture');
        if (underlay.naturalWidth !== 480 || underlay.naturalHeight !== 480) throw Error('Invalid hand repair plate');
        renderer.load(image, underlay); ready = true; draw(0);
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
    layout(); playing = true; canvas.hidden = false; slot.classList.add('has-bunny-motion'); scene.classList.add('is-greeting'); setStatus('playing');
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
  function contextLost(event) {
    event.preventDefault(); stop(); failed = true; setStatus('unavailable'); if (button) button.hidden = true;
  }
  window.addEventListener('resize', layout);
  canvas.addEventListener('contextlost', contextLost);
  document.addEventListener('visibilitychange', visibilityChanged);
  preference.addEventListener('change', preferenceChanged);
  preferenceChanged(); layout();
  return {
    play,
    dispose() {
      stop(); disposed = true;
      document.removeEventListener('visibilitychange', visibilityChanged);
      preference.removeEventListener('change', preferenceChanged);
      window.removeEventListener('resize', layout);
      canvas.removeEventListener('contextlost', contextLost); renderer?.dispose();
      slot?.classList.remove('has-bunny-motion'); canvas.remove();
    },
  };
}
