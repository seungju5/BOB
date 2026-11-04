// Original-texture animation: the approved character itself bends at its joints.
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

// Animate the approved 480px original texture; never redraw the character.
// The small 2.5D rig keeps its face, knitted cardigan, pencil and clipboard.
const smooth = (a, b, value) => { const t = Math.max(0, Math.min(1, (value - a) / (b - a))); return t * t * (3 - 2 * t); };
const pulse = (time, start, peak, end) => smooth(start, peak, time) * (1 - smooth(peak, end, time));
const ellipse = (x, y, cx, cy, rx, ry) => 1 - smooth(.35, 1, Math.hypot((x - cx) / rx, (y - cy) / ry));

export function bunnyRigAt(time) {
  const lift = bunnyLiftAt(time), airborne = lift / 42;
  const greet = smooth(1510, 1760, time) * (1 - smooth(2870, 3110, time));
  const crouch = pulse(time, 300, 410, 520) + .65 * pulse(time, 980, 1090, 1190);
  const land = pulse(time, 700, 780, 980) + .65 * pulse(time, 1330, 1410, 1570);
  const bow = pulse(time, 3040, 3200, 3460);
  const wave = Math.sin((time - 1760) / 190 * Math.PI);
  return {
    lift, squash: .065 * (crouch + land) - .025 * airborne,
    arm: greet * (-.32 + .13 * wave),
    head: .025 * greet * Math.sin((time - 1510) / 650 * Math.PI) + .055 * bow,
    bow, tuck: airborne,
    ear: .11 * airborne + .055 * land + .035 * greet * Math.sin((time - 1510) / 210),
    blink: pulse(time, 2220, 2300, 2390),
    turn: .018 * greet * Math.sin((time - 1510) / 440),
  };
}

// Joint weights use original artwork coordinates. One continuous mesh avoids
// cutout seams; accessories follow the paw, eyes and mouth keep their texture.
export function bunnyVertexAt(x, y, rig) {
  let px = x, py = y;
  const rotate = (cx, cy, angle, weight) => {
    const dx = px - cx, dy = py - cy, a = angle * weight;
    px = cx + dx * Math.cos(a) - dy * Math.sin(a);
    py = cy + dx * Math.sin(a) + dy * Math.cos(a);
  };
  // Integrate a smooth joint field in small steps so the original texture never folds over itself.
  for (let step = 0; step < 8; step++) {
    const armWeight = ellipse(px, py, 180, 299, 76, 91) * (1 - smooth(218, 248, px));
    rotate(152, 336, rig.arm / 8, armWeight);
  }
  // A brief blink compresses the existing glossy eye pixels, without painting a new face.
  for (const [cx, cy] of [[183, 198], [268, 221]]) {
    const eye = ellipse(x, y, cx, cy, 22, 27);
    py += (cy - y) * .92 * rig.blink * eye;
  }
  rotate(185, 135, -rig.ear, (1 - smooth(100, 143, y)) * (1 - smooth(230, 260, x)));
  rotate(278, 141, rig.ear * 1.2, smooth(260, 305, x) * (1 - smooth(175, 195, y)));
  const head = 1 - smooth(257, 302, y);
  rotate(223, 274, rig.head, head);
  py += rig.bow * 9 * head;
  const feet = smooth(385, 446, y);
  px += (230 - x) * .075 * rig.tuck * feet;
  py -= 12 * rig.tuck * feet;
  // Slight foreshortening, independent limb movement and contact shadow give depth.
  px = 230 + (px - 230) * (1 + rig.squash * .45) + (y - 300) * rig.turn;
  py = 456 + (py - 456) * (1 - rig.squash);
  return [px, py];
}

/** GPU texture mesh: original pixels, smooth joints, no triangle clip seams. */
function createBunnyRenderer(canvas) {
  const gl = canvas.getContext('webgl', {alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: false});
  if (!gl) return null;
  const resources = [];
  const shader = (type, source) => {
    const value = gl.createShader(type); resources.push(['deleteShader', value]);
    gl.shaderSource(value, source); gl.compileShader(value);
    if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw Error('Greeting shader unavailable');
    return value;
  };
  let disposed = false;
  const dispose = () => { if (disposed) return; disposed = true; for (const [method, value] of resources) gl[method](value); gl.getExtension?.('WEBGL_lose_context')?.loseContext(); };
  try {
    const vertex = shader(gl.VERTEX_SHADER, 'attribute vec2 point; attribute vec2 uv; varying vec2 tex; void main(){tex=uv;gl_Position=vec4((point.x+60.0)/300.0-1.0,1.0-(point.y+60.0)/300.0,0.0,1.0);}');
    const fragment = shader(gl.FRAGMENT_SHADER, 'precision mediump float; varying vec2 tex; uniform sampler2D artwork; void main(){gl_FragColor=texture2D(artwork,tex);}');
    const program = gl.createProgram(); resources.push(['deleteProgram', program]);
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error('Greeting shader unavailable');
    gl.useProgram(program);
    const points = [], uv = [], indices = [], segments = 40;
    for (let row = 0; row <= segments; row++) for (let col = 0; col <= segments; col++) {
      points.push(col * 12, row * 12); uv.push(col / segments, row / segments);
      if (row < segments && col < segments) {
        const a = row * (segments + 1) + col, b = a + segments + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const source = new Float32Array(points), deformed = new Float32Array(points);
    const buffer = (target, data, usage) => {
      const value = gl.createBuffer(); resources.push(['deleteBuffer', value]); gl.bindBuffer(target, value); gl.bufferData(target, data, usage); return value;
    };
    const position = buffer(gl.ARRAY_BUFFER, deformed, gl.DYNAMIC_DRAW);
    const pointLocation = gl.getAttribLocation(program, 'point'); gl.enableVertexAttribArray(pointLocation); gl.vertexAttribPointer(pointLocation, 2, gl.FLOAT, false, 0, 0);
    buffer(gl.ARRAY_BUFFER, new Float32Array(uv), gl.STATIC_DRAW);
    const uvLocation = gl.getAttribLocation(program, 'uv'); gl.enableVertexAttribArray(uvLocation); gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 0, 0);
    buffer(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    const texture = gl.createTexture(); resources.push(['deleteTexture', texture]); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.clearColor(0, 0, 0, 0); gl.viewport(0, 0, canvas.width, canvas.height);
    return {
      load(image) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image); },
      draw(rig) {
        for (let i = 0; i < source.length; i += 2) {
          const point = bunnyVertexAt(source[i], source[i + 1], rig); deformed[i] = point[0]; deformed[i + 1] = point[1];
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, position); gl.bufferSubData(gl.ARRAY_BUFFER, 0, deformed);
        gl.clear(gl.COLOR_BUFFER_BIT); gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
      },
      dispose,
    };
  } catch { dispose(); return null; }
}

/** @param {HTMLElement} scene @param {{imageUrl?: string, spriteUrl?: string}} options */
export function createBunnyGreeting(scene, {imageUrl, spriteUrl} = {}) {
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
  let image, loading, disposed = false, ready = false, failed = false, playing = false, queued = false;
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
      loading = image.decode().then(() => {
        if (disposed || !scene.isConnected) return false;
        if (image.naturalWidth !== 480 || image.naturalHeight !== 480) throw Error('Invalid original bunny texture');
        renderer.load(image); ready = true; draw(0);
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
  canvas.addEventListener('webglcontextlost', contextLost);
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
      canvas.removeEventListener('webglcontextlost', contextLost); renderer?.dispose();
      slot?.classList.remove('has-bunny-motion'); canvas.remove();
    },
  };
}
