import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import StartPage from '@/app/page';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUNNY_BEATS, BUNNY_DURATION, bunnyLiftAt, bunnyPoseAt, bunnyRigAt, bunnyPointAt, bunnyTransformAt, createBunnyGreeting } from '../../integrations/bapmunna-firebase/docs/bunny-greeting.mjs';

function browser({reduced = false, decode = () => Promise.resolve(), canvasAvailable = true} = {}) {
  const frames = new Map<number, FrameRequestCallback>(); let next = 0;
  const events = new Map<string, () => void>();
  const drawImage = vi.fn(), imageSources: string[] = [];
  const context = Object.fromEntries(['save','restore','scale','translate','transform','clearRect','clip','fill','stroke'].map(name => [name,vi.fn()]));
  Object.assign(context,{drawImage});
  const rect = () => ({left:0, top:0, width:218, height:273});
  const original = {src:'/approved-original.png', currentSrc:'/approved-original.png', getBoundingClientRect:rect};
  const slot = {querySelector: () => original, getBoundingClientRect:rect, append: vi.fn(), classList: {add: vi.fn(), remove: vi.fn()}};
  const button = {disabled: false, hidden: false, setAttribute: vi.fn()};
  const shadow = {style: {}};
  const canvas = {hidden: true, style: {setProperty: vi.fn()}, setAttribute: vi.fn(), remove: vi.fn(), addEventListener: (name: string, fn: () => void) => events.set(name, fn), removeEventListener: (name: string) => events.delete(name), getContext: () => canvasAvailable ? context : null};
  const scene = {isConnected: true, dataset: {} as Record<string, string>, classList: {add: vi.fn(), remove: vi.fn()},
    querySelector: (selector: string) => selector === '.bunny-slot' ? slot : selector === '.bunny-shadow' ? shadow : button};
  const document = {baseURI: 'https://example.test/', hidden: false, createElement: (() => {let first=true; return () => {if(first){first=false;return canvas;}return {width:480,height:480,getContext:()=>context};};})(), addEventListener: (name: string, fn: () => void) => events.set(name, fn), removeEventListener: (name: string) => events.delete(name)};
  const preference = {matches: reduced, addEventListener: (_: string, fn: () => void) => events.set('preference', fn), removeEventListener: () => events.delete('preference')};
  const decodeSpy = vi.fn(decode);
  vi.stubGlobal('Path2D', class {});
  vi.stubGlobal('Image', class {naturalWidth = 480; naturalHeight = 480; decode = decodeSpy; set src(value:string){imageSources.push(value);}});
  vi.stubGlobal('window', {matchMedia: () => preference, addEventListener:(name: string, fn: () => void) => events.set(name, fn), removeEventListener:(name: string) => events.delete(name)}); vi.stubGlobal('document', document);
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {frames.set(++next, fn); return next;});
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const advance = (time: number) => {const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(time));};
  return {scene, slot, canvas, button, frames, events, document, preference, drawImage, imageSources, decodeSpy, advance,
    mount: () => createBunnyGreeting(scene as unknown as HTMLElement, {spriteUrl: '/bunny.webp'})};
}

afterEach(() => vi.unstubAllGlobals());

describe('finite bunny greeting', () => {
  it('makes the original bunny the greeting button and keeps both start links directly available', () => {
    const html = renderToStaticMarkup(createElement(StartPage));
    const button = html.match(/<button\b[^>]*aria-label="토끼에게 인사하기"[^>]*>([\s\S]*?)<\/button>/)?.[1];
    expect(button).toContain('bunny.png');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('다시 인사하기');
    expect(html).not.toContain('밥 한 끼로 전하는 안부');
    expect(html).toContain('보호자로 시작');
    expect(html).toContain('어르신으로 시작');
  });

  it('keeps two hops and includes actual wave and bow poses within five seconds', () => {
    expect(BUNNY_DURATION).toBeLessThan(5000);
    expect(BUNNY_BEATS.filter(beat => beat[2] === 'hop')).toHaveLength(2);
    for (const phase of ['crouch','land','wave','bow']) expect(BUNNY_BEATS.some(beat => beat[2] === phase)).toBe(true);
    expect(bunnyLiftAt(575)).toBeCloseTo(42);
    expect(bunnyLiftAt(1230)).toBeCloseTo(26);
    expect(bunnyLiftAt(2000)).toBe(0);
    expect(bunnyPoseAt(BUNNY_DURATION)).toMatchObject({phase: 'rest', frame: 0});
  });
  it('uses the exact original even when an older app supplies a sprite atlas URL', async () => {
    const env = browser(), greeting = env.mount(); await greeting.play();
    expect(env.imageSources).toEqual(['/approved-original.png','https://example.test/bunny-underlay.webp']);
    env.advance(0); env.advance(BUNNY_DURATION + 1);
    expect(env.canvas.hidden).toBe(true); greeting.dispose();
  });
  it('leaves the original and entry links usable when Canvas is unavailable', async () => {
    const env = browser({canvasAvailable:false}), greeting = env.mount(); await greeting.play();
    expect(env.decodeSpy).not.toHaveBeenCalled(); expect(env.button.hidden).toBe(true);
    expect(env.canvas.hidden).toBe(true); expect(env.frames.size).toBe(0); greeting.dispose();
  });
  it('keeps original proportions at rest and articulates the paw independently', () => {
    for (const time of [0, BUNNY_DURATION]) for (const point of [[183,198],[268,221],[196,308],[286,340],[200,450]]) {
      expect(bunnyPointAt(point[0], point[1], bunnyRigAt(time))).toEqual(point);
    }
    const rig = bunnyRigAt(1850), paw = bunnyPointAt(196,308,rig,'hand'), clipboard = bunnyPointAt(286,340,rig);
    expect(Math.hypot(paw[0]-196,paw[1]-308)).toBeGreaterThan(5);
    expect(Math.hypot(clipboard[0]-286,clipboard[1]-340)).toBeLessThan(3);
  });
  it('keeps every facial feature fixed through the entire waving interval', () => {
    for(let time=1760;time<=2870;time+=10) {
      const rig=bunnyRigAt(time);
      for(const [x,y] of [[130,215],[183,198],[222,220],[220,235],[268,221],[304,245]]) {
        expect(bunnyPointAt(x,y,rig)).toEqual([x,y]);
      }
    }
  });
  it('preserves hand and pencil shape instead of stretching their texture', () => {
    const hand=[[176,255],[220,295],[164,333],[229,325]];
    for(let time=0;time<=BUNNY_DURATION;time+=20) {
      const rig=bunnyRigAt(time), matrix=bunnyTransformAt(rig,'hand');
      expect(matrix[0]*matrix[3]-matrix[1]*matrix[2]).toBeCloseTo(1,12);
      const points=hand.map(([x,y])=>bunnyPointAt(x,y,rig,'hand'));
      for(let i=1;i<hand.length;i++) expect(Math.hypot(points[i][0]-points[0][0],points[i][1]-points[0][1])).toBeCloseTo(Math.hypot(hand[i][0]-hand[0][0],hand[i][1]-hand[0][1]),10);
    }
  });
  it('does not download or animate when reduced motion is enabled', async () => {
    const env = browser({reduced: true}), greeting = env.mount(); await greeting.play();
    expect(env.decodeSpy).not.toHaveBeenCalled(); expect(env.frames.size).toBe(0); expect(env.button.hidden).toBe(true);
    greeting.dispose();
  });
  it('retains the original picture if the original texture cannot load', async () => {
    const env = browser({decode: () => Promise.reject(Error('offline'))}), greeting = env.mount(); await greeting.play();
    expect(env.canvas.hidden).toBe(true); expect(env.slot.classList.add).not.toHaveBeenCalled();
    expect(env.frames.size).toBe(0); expect(env.scene.dataset.greetingState).toBe('unavailable'); greeting.dispose();
  });
  it('keeps the original visible if the hidden-body repair image cannot load', async () => {
    const env = browser(), greeting = env.mount();
    env.decodeSpy.mockResolvedValueOnce(undefined).mockRejectedValueOnce(Error('repair unavailable'));
    await greeting.play();
    expect(env.canvas.hidden).toBe(true); expect(env.frames.size).toBe(0); expect(env.button.hidden).toBe(true);
    expect(env.scene.dataset.greetingState).toBe('unavailable'); greeting.dispose();
  });
  it('restores the original immediately if the drawing context is lost', async () => {
    const env = browser(), greeting = env.mount(); await greeting.play(); env.advance(0); env.advance(500);
    (env.events.get('contextlost') as unknown as (event: {preventDefault: () => void}) => void)({preventDefault: vi.fn()});
    expect(env.canvas.hidden).toBe(true); expect(env.frames.size).toBe(0); expect(env.button.hidden).toBe(true);
    expect(env.scene.dataset.greetingState).toBe('unavailable'); greeting.dispose();
  });
  it('ignores a late download after navigating away', async () => {
    let finish!: () => void;
    const pending = new Promise<void>(resolve => {finish = resolve;});
    const env = browser({decode: () => pending}), greeting = env.mount();
    const play = greeting.play(); greeting.dispose(); finish(); await play;
    expect(env.drawImage).not.toHaveBeenCalled(); expect(env.frames.size).toBe(0); expect(env.events.size).toBe(0);
  });
  it('replays without overlapping animation loops and stops on its own', async () => {
    const env = browser(), greeting = env.mount(); await Promise.all([greeting.play(), greeting.play()]);
    expect(env.frames.size).toBe(1); expect(env.decodeSpy).toHaveBeenCalledTimes(2);
    env.advance(0); env.advance(1800); expect(env.scene.dataset.greetingPhase).toBe('wave');
    env.advance(BUNNY_DURATION + 10); expect(env.frames.size).toBe(0); expect(env.scene.dataset.greetingState).toBe('idle');
    await greeting.play(); expect(env.frames.size).toBe(1); greeting.dispose(); expect(env.frames.size).toBe(0);
  });
  it('pauses in a hidden tab and resumes without skipping to the end', async () => {
    const env = browser(), greeting = env.mount(); await greeting.play(); env.advance(0); env.advance(500);
    env.document.hidden = true; env.events.get('visibilitychange')!(); expect(env.frames.size).toBe(0);
    env.document.hidden = false; env.events.get('visibilitychange')!(); env.advance(30000);
    expect(env.scene.dataset.greetingPhase).toBe('hop'); greeting.dispose();
  });
  it('cancels an in-progress greeting when motion preferences change', async () => {
    const env = browser(), greeting = env.mount(); await greeting.play(); env.advance(0); env.advance(500);
    env.preference.matches = true; env.events.get('preference')!();
    expect(env.frames.size).toBe(0); expect(env.button.hidden).toBe(true); expect(env.scene.dataset.greetingState).toBe('idle'); greeting.dispose();
  });
});
