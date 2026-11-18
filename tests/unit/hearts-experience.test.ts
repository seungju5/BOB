import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RankingLinkStatus } from '@bapmunna/phone-steps';
import * as core from '@/packages/walking-hearts/core.mjs';
import * as client from '@/lib/hearts/client';
import * as demo from '@/lib/hearts/demo';
import * as presentation from '@/lib/hearts/presentation';
import * as native from '@/lib/hearts/native';
import { healthAppLink } from '@/lib/mobile/links';

// Execute unchanged TSX, including its forms and the native parent's keyed child.
// Hooks/effects, time, bridge responses and leaf UI are synthetic. This deliberately
// does not establish browser focus/layout, real React concurrency, OS bridge events,
// device permissions, real accounts, Firestore transactions or live delivery.
type Props = Record<string, unknown>;
type Node = { type: unknown; props: Props; key?: unknown; rendered?: unknown };
type Effect = { deps?: readonly unknown[]; cleanup?: () => void };
type Frame = { slots: unknown[]; cursor: number; cleanups: Set<Effect>; alive: boolean };
const files = ['components/walking/HeartsExperience.tsx', 'components/walking/HeartsEntry.tsx', 'components/senior/HealthConnectionPage.tsx'];
const compiled = Object.fromEntries(files.map(file => [file, ts.transpileModule(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText]));
const disposals: Array<() => void> = [];
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const same = (a?: readonly unknown[], b?: readonly unknown[]) => !!a && !!b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
function isNode(value: unknown): value is Node { return !!value && typeof value === 'object' && 'props' in value; }
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  return isNode(value) ? [value, ...nodes('rendered' in value ? value.rendered : value.props.children)] : [];
}
function text(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(text).join('');
  return isNode(value) ? text('rendered' in value ? value.rendered : value.props.children) : '';
}
function find(tree: unknown, predicate: (node: Node) => boolean): Node {
  const found = nodes(tree).find(predicate);
  if (!found) throw Error('Expected heart screen control was not rendered');
  return found;
}
function button(tree: unknown, label: string): Node {
  return find(tree, node => node.type === 'button' && text(node).includes(label));
}
function click(node: Node) {
  if (node.props.disabled) throw Error('Cannot click a disabled control');
  return (node.props.onClick as () => unknown)();
}
function submit(node: Node) {
  return (node.props.onSubmit as (event: { preventDefault(): void }) => Promise<unknown>)({ preventDefault() {} });
}
const photo = 'data:image/jpeg;base64,QUFB'; // Synthetic bytes: no personal image is read.
function snapshot(label = 'A', leagueEnabled = false): client.HeartsSnapshot {
  const date = core.heartDate(new Date());
  return { enabled: true, joined: true, state: core.advanceHearts(core.createHeartState({ date }), { date, count: 2500, now: new Date() }),
    messages: [{ id: `letter-${label}`, text: `${label} private letter`, photo, createdAt: new Date().toISOString(), readAt: null, locked: false, unlockPercent: 0, type: 'message' }], leagueEnabled, region: 'Sejong' };
}
const disconnected: RankingLinkStatus = { linked: false, confirmed: false, revokePending: false };
const link = (id: string): RankingLinkStatus => ({ linked: true, confirmed: true, revokePending: false, publicId: `public-${id}`, nickname: `가상 ${id}`, sharingScope: 'private', expiresAt: '2026-12-18T03:00:00.000Z' });

function fixture({ nativePage = false, mode = 'web' as 'web' | 'native' } = {}) {
  const request = vi.fn<client.HeartTransport['request']>(async () => snapshot());
  const transport = { request };
  const openWalkingWebApp = vi.fn(async () => {});
  const frames = new Map<string, Frame>(), cache = new Map<string, Record<string, unknown>>();
  const listeners = new Map<string, Set<() => void>>();
  let active: Frame, effects: Array<() => void> = [], seen: Set<string>;
  const events = {
    addEventListener(name: string, fn: () => void) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(fn); },
    removeEventListener(name: string, fn: () => void) { listeners.get(name)?.delete(fn); },
  };
  const react = {
    useState<T>(initial: T | (() => T)): [T, (value: T | ((old: T) => T)) => void] {
      const owner = active, i = owner.cursor++;
      if (!(i in owner.slots)) owner.slots[i] = typeof initial === 'function' ? (initial as () => T)() : initial;
      return [owner.slots[i] as T, value => { if (owner.alive) owner.slots[i] = typeof value === 'function' ? (value as (old: T) => T)(owner.slots[i] as T) : value; }];
    },
    useRef<T>(value: T): { current: T } { const i = active.cursor++; return (active.slots[i] ??= { current: value }) as { current: T }; },
    useMemo<T>(fn: () => T, deps: readonly unknown[]): T {
      const i = active.cursor++, previous = active.slots[i] as { deps: readonly unknown[]; value: T } | undefined;
      if (previous && same(previous.deps, deps)) return previous.value;
      const value = fn(); active.slots[i] = { deps, value }; return value;
    },
    useCallback<T>(fn: T, deps: readonly unknown[]): T { return react.useMemo(() => fn, deps); },
    useSyncExternalStore(_subscribe: unknown, read: () => unknown) { active.cursor++; return read(); },
    useEffect(fn: () => void | (() => void), deps?: readonly unknown[]) {
      const owner = active, i = owner.cursor++, previous = owner.slots[i] as Effect | undefined;
      if (previous && same(previous.deps, deps)) return;
      const next: Effect = { deps }; owner.slots[i] = next;
      effects.push(() => {
        previous?.cleanup?.(); if (previous) owner.cleanups.delete(previous);
        const cleanup = fn(); if (typeof cleanup === 'function') next.cleanup = cleanup;
        owner.cleanups.add(next);
      });
    },
  };
  const jsx = (type: unknown, props: Props, key?: unknown): Node => ({ type, props, key });
  const modules: Record<string, unknown> = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'next/link': { __esModule: true, default: 'Link' },
    '@capacitor/core': { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } },
    '@bapmunna/phone-steps': { PhoneSteps: { openWalkingWebApp, openWebApp: vi.fn(async () => {}), heartsRequest: ({ action, body }: { action: client.HeartAction; body?: Props }) => request(action, body) } },
    '@/components/Mascot': { Logo: 'Logo', Mascot: 'Mascot' }, '@/components/ui': { Button: 'Button' },
    './HeartsScene': { HeartsGarden: 'HeartsGarden', BunnyScene: 'BunnyScene', HeartIcon: 'HeartIcon', EquippedNames: 'EquippedNames' },
    './PhoneStepsCard': { PhoneStepsCard: 'PhoneStepsCard' }, './HealthPrivacyContent': { HealthPrivacyContent: 'HealthPrivacyContent' }, './HealthInstallGuide': { HealthInstallGuide: 'HealthInstallGuide' },
    '@/components/walking/NativeWalkingPanel': { NativeWalkingPanel: 'NativeWalkingPanel' },
    '@/lib/hearts/client': client, '@/lib/hearts/demo': demo, '@/lib/hearts/presentation': presentation, '@/lib/hearts/native': native,
    '@/packages/walking-hearts/core.mjs': core, '@/lib/mobile/links': { healthAppLink },
    '@/lib/firebase/bridge': { usesImpactFirebase: true }, '@/lib/data/firebase': { useFirebaseAccount: () => ({ user: null, loading: false }) },
  };
  function load(file: string): Record<string, unknown> {
    if (cache.has(file)) return cache.get(file)!;
    const exports: Record<string, unknown> = {}; cache.set(file, exports);
    runInNewContext(compiled[file], {
      exports, module: { exports }, Date, Error, DOMException, AbortController, crypto: { randomUUID }, setTimeout, clearTimeout, setInterval, clearInterval,
      navigator: { userAgent: 'Android synthetic test' }, window: events, document: { ...events, visibilityState: 'visible', body: { style: { overflow: '' } }, querySelector: () => null },
      require(id: string) {
        if (id.endsWith('.css')) return {};
        if (id === './HeartsExperience') return load('components/walking/HeartsExperience.tsx');
        if (id === '@/components/walking/HeartsEntry') return load('components/walking/HeartsEntry.tsx');
        if (!(id in modules)) throw Error(`Unexpected heart runtime import: ${id}`);
        return modules[id];
      },
    }, { filename: file });
    return exports;
  }
  const root = nativePage ? load(files[2]).HealthConnectionPage : load(files[0]).HeartsExperience;
  const rootProps = nativePage ? {} : { mode, transport, embedded: mode === 'native' };
  function disposeFrame(frame: Frame) { frame.alive = false; for (const effect of frame.cleanups) effect.cleanup?.(); }
  function walk(value: unknown, path: string): unknown {
    if (Array.isArray(value)) return value.map((child, i) => walk(child, `${path}/${i}`));
    if (!isNode(value)) return value;
    const ownPath = `${path}:${String(value.key ?? '')}`;
    if (typeof value.type === 'function') {
      const id = `${ownPath}:${value.type.name}`; seen.add(id);
      if (!frames.has(id)) frames.set(id, { slots: [], cursor: 0, cleanups: new Set(), alive: true });
      const previous = active; active = frames.get(id)!; active.cursor = 0;
      const rendered = (value.type as (props: Props) => unknown)(value.props); active = previous;
      return { ...value, rendered: walk(rendered, `${id}/rendered`) };
    }
    return { ...value, props: { ...value.props, children: walk(value.props.children, `${ownPath}/children`) } };
  }
  function render(): unknown {
    seen = new Set(); effects = [];
    const tree = walk(jsx(root, rootProps), 'root');
    for (const [id, frame] of frames) if (!seen.has(id)) { disposeFrame(frame); frames.delete(id); }
    for (const effect of effects) effect();
    return tree;
  }
  async function settle() { let tree: unknown; for (let i = 0; i < 4; i++) { await vi.advanceTimersByTimeAsync(0); await flush(); tree = render(); } return tree; }
  function reportLink(value: RankingLinkStatus) {
    const panel = find(render(), node => node.type === 'NativeWalkingPanel');
    (panel.props.onLinkChange as (link: RankingLinkStatus) => void)(value);
    return render();
  }
  disposals.push(() => { for (const frame of frames.values()) disposeFrame(frame); frames.clear(); });
  return { request, openWalkingWebApp, render, settle, reportLink, focus: () => { for (const fn of listeners.get('focus') ?? []) fn(); } };
}
async function openLetter(f: ReturnType<typeof fixture>) {
  click(button(f.render(), '가족 응원')); const tree = f.render();
  click(button(tree, '가족의 응원이 도착')); return f.settle();
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-18T03:00:00Z')); });
afterEach(() => { for (const dispose of disposals.splice(0)) dispose(); vi.clearAllTimers(); vi.useRealTimers(); });

describe('heart screen identity, consent and committed mutations', () => {
  it('clears an open private letter and photo when a refresh revokes the connection', async () => {
    const f = fixture({ mode: 'native' }); f.render(); await f.settle();
    expect(text(await openLetter(f))).toContain('A private letter');
    f.request.mockRejectedValueOnce(Object.assign(Error('revoked'), { code: 'device_revoked' }));
    f.focus(); const tree = await f.settle();
    expect(text(tree)).not.toContain('A private letter');
    expect(nodes(tree).some(node => node.props.src === photo || node.props.role === 'dialog')).toBe(false);
    expect(nodes(tree).some(node => node.props.className === 'hearts-tabs')).toBe(false);
  });

  it('clears the just-opened letter when marking it read reports revoked credentials', async () => {
    const f = fixture({ mode: 'native' }); f.render(); await f.settle();
    f.request.mockRejectedValueOnce(Object.assign(Error('revoked'), { code: 'unauthorized' }));
    expect(text(await openLetter(f))).not.toContain('A private letter');
    expect(nodes(f.render()).some(node => node.props.role === 'dialog')).toBe(false);
    expect(button(f.render(), '다시 확인').props.disabled).toBe(false);
  });

  it('remounts the actual native parent on disconnect and B identity, ignoring a late A read', async () => {
    const f = fixture({ nativePage: true }); f.render(); f.reportLink(link('A')); await f.settle();
    expect(text(await openLetter(f))).toContain('A private letter');
    const pending = deferred<unknown>(); f.request.mockReturnValueOnce(pending.promise); f.focus(); await flush();
    const cleared = f.reportLink(disconnected);
    expect(text(cleared)).not.toContain('A private letter');
    expect(nodes(cleared).some(node => node.props.src === photo)).toBe(false);
    f.request.mockResolvedValue(snapshot('B')); f.reportLink(link('B')); await f.settle();
    pending.resolve(snapshot('A')); await f.settle();
    const tree = await openLetter(f);
    expect(text(tree)).toContain('B private letter'); expect(text(tree)).not.toContain('A private letter');
  });

  it('loads the actual server league shape immediately after opting in on the league tab', async () => {
    const f = fixture(); let value = snapshot();
    f.request.mockImplementation(async (action, body) => {
      if (action === 'heartsettings') value = { ...value, ...body };
      if (action === 'heartleague') return { enabled: true, week: '2026-11-16', weekEnd: '2026-11-22', region: 'Sejong', total: 1, practice: true,
        entries: [{ publicId: 'public-A', nickname: 'Synthetic Walker', score: 50, rank: 1, tier: 0, isMe: true }] };
      return value;
    });
    f.render(); await f.settle(); click(button(f.render(), '주간 리그')); await f.settle();
    expect(f.request.mock.calls.some(([action]) => action === 'heartleague')).toBe(false);
    click(button(f.render(), '주간 리그 참여 설정')); let tree = f.render();
    const check = find(tree, node => node.type === 'label' && text(node).includes('별명·주간 하트 점수'));
    (find(check, node => node.type === 'input').props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } });
    tree = f.render(); await submit(find(tree, node => node.type === 'form')); tree = await f.settle();
    expect(f.request.mock.calls.filter(([action]) => action === 'heartleague')).toHaveLength(1);
    expect(text(tree)).toContain('Synthetic Walker'); expect(text(tree)).not.toContain('같이 걷는 분들을 확인하고 있어요');
  });

  it('accepts the committed message response without a second GET and clears the composer', async () => {
    const f = fixture(); f.render(); await f.settle(); click(button(f.render(), '가족 응원'));
    let tree = f.render();
    (find(tree, node => node.type === 'textarea').props.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'Synthetic encouragement' } });
    f.request.mockClear(); f.request.mockImplementation(async action => { if (action !== 'heartmessage') throw Error('A follow-up read must not negate a committed write'); return snapshot(); });
    tree = f.render(); await submit(find(tree, node => node.type === 'form')); tree = await f.settle();
    expect(f.request.mock.calls.map(([action]) => action)).toEqual(['heartmessage']);
    expect(find(tree, node => node.type === 'textarea').props.value).toBe('');
    expect(text(tree)).toContain('연결된 휴대폰의 가족 응원함에 담았어요');
  });

  it('uses the fixed web opener or a local health anchor instead of unbundled native routes', async () => {
    const f = fixture({ mode: 'native' }); f.request.mockRejectedValue(Object.assign(Error('not joined'), { code: 'not_joined' }));
    f.render(); let tree = await f.settle();
    expect(nodes(tree).filter(node => typeof node.props.href === 'string' && node.props.href.startsWith('/walking'))).toHaveLength(0);
    await click(button(tree, '웹앱에서 산책 체험')); expect(f.openWalkingWebApp).toHaveBeenCalledExactlyOnceWith();
    f.request.mockResolvedValue(snapshot()); f.focus(); await f.settle(); click(button(f.render(), '주간 리그')); tree = await f.settle();
    expect(nodes(tree).filter(node => typeof node.props.href === 'string' && node.props.href.startsWith('/walking'))).toHaveLength(0);
    expect(find(tree, node => node.type === 'a' && text(node).includes('걸음수 공유·연결')).props.href).toBe('#native-ranking-title');
    expect(f.openWalkingWebApp).toHaveBeenCalledOnce();
  });

  it('does not repopulate revoked data from a concurrent read that finishes later', async () => {
    const f = fixture({ mode: 'native' }); f.render(); await f.settle();
    const pending = deferred<unknown>(); f.request.mockReturnValueOnce(pending.promise); f.focus(); await flush();
    f.request.mockRejectedValueOnce(Object.assign(Error('revoked'), { code: 'device_revoked' })); f.focus(); await f.settle();
    pending.resolve(snapshot('A')); const tree = await f.settle();
    expect(nodes(tree).some(node => node.props.className === 'hearts-tabs')).toBe(false);
  });
});
