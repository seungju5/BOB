import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUNNY_BEATS, BUNNY_DURATION, bunnyLiftAt, bunnyPoseAt, createBunnyGreeting } from '../../integrations/bapmunna-firebase/docs/bunny-greeting.mjs';

function browser({reduced = false, decode = () => Promise.resolve()} = {}) {
  const frames = new Map<number, FrameRequestCallback>(); let next = 0;
  const events = new Map<string, () => void>();
  const drawImage = vi.fn();
  const slot = {append: vi.fn(), classList: {add: vi.fn(), remove: vi.fn()}};
  const button = {disabled: false, hidden: false, setAttribute: vi.fn()};
  const shadow = {style: {}};
  const canvas = {hidden: true, style: {setProperty: vi.fn()}, setAttribute: vi.fn(), remove: vi.fn(), getContext: () => ({clearRect: vi.fn(), drawImage})};
  const scene = {isConnected: true, dataset: {} as Record<string, string>, classList: {add: vi.fn(), remove: vi.fn()},
    querySelector: (selector: string) => selector === '.bunny-slot' ? slot : selector === '.bunny-shadow' ? shadow : button};
  const document = {hidden: false, createElement: () => canvas, addEventListener: (name: string, fn: () => void) => events.set(name, fn), removeEventListener: (name: string) => events.delete(name)};
  const preference = {matches: reduced, addEventListener: (_: string, fn: () => void) => events.set('preference', fn), removeEventListener: () => events.delete('preference')};
  const decodeSpy = vi.fn(decode);
  vi.stubGlobal('Image', class {naturalWidth = 1254; naturalHeight = 1254; decode = decodeSpy;});
  vi.stubGlobal('window', {matchMedia: () => preference}); vi.stubGlobal('document', document);
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {frames.set(++next, fn); return next;});
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const advance = (time: number) => {const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(time));};
  return {scene, slot, canvas, button, frames, events, document, preference, drawImage, decodeSpy, advance,
    mount: () => createBunnyGreeting(scene as unknown as HTMLElement, {spriteUrl: '/bunny.webp'})};
}

afterEach(() => vi.unstubAllGlobals());

describe('finite bunny greeting', () => {
  it('keeps two hops and includes actual wave, blink and bow poses within five seconds', () => {
    expect(BUNNY_DURATION).toBeLessThan(5000);
    expect(BUNNY_BEATS.filter(beat => beat[2] === 'hop')).toHaveLength(2);
    for (const phase of ['crouch','land','wave','blink','bow']) expect(BUNNY_BEATS.some(beat => beat[2] === phase)).toBe(true);
    expect(bunnyLiftAt(575)).toBeCloseTo(42);
    expect(bunnyLiftAt(1230)).toBeCloseTo(26);
    expect(bunnyLiftAt(2000)).toBe(0);
    expect(bunnyPoseAt(BUNNY_DURATION)).toMatchObject({phase: 'rest', frame: 0});
  });
  it('does not download or animate when reduced motion is enabled', async () => {
    const env = browser({reduced: true}), greeting = env.mount(); await greeting.play();
    expect(env.decodeSpy).not.toHaveBeenCalled(); expect(env.frames.size).toBe(0); expect(env.button.hidden).toBe(true);
    greeting.dispose();
  });
  it('retains the original picture if the atlas cannot load', async () => {
    const env = browser({decode: () => Promise.reject(Error('offline'))}), greeting = env.mount(); await greeting.play();
    expect(env.canvas.hidden).toBe(true); expect(env.slot.classList.add).not.toHaveBeenCalled();
    expect(env.frames.size).toBe(0); expect(env.scene.dataset.greetingState).toBe('unavailable'); greeting.dispose();
  });
  it('ignores a late download after navigating away', async () => {
    let finish!: () => void;
    const env = browser({decode: () => new Promise<void>(resolve => {finish = resolve;})}), greeting = env.mount();
    const play = greeting.play(); greeting.dispose(); finish(); await play;
    expect(env.drawImage).not.toHaveBeenCalled(); expect(env.frames.size).toBe(0); expect(env.events.size).toBe(0);
  });
  it('replays without overlapping animation loops and stops on its own', async () => {
    const env = browser(), greeting = env.mount(); await Promise.all([greeting.play(), greeting.play()]);
    expect(env.frames.size).toBe(1); expect(env.decodeSpy).toHaveBeenCalledOnce();
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
