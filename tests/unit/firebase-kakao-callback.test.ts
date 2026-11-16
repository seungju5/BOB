import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { accountError, type FirebaseProvider, type FirebaseUser } from '@/lib/firebase/bridge';

// Execute the shipped callback component. Hook scheduling, the browser URL,
// and the SDK boundary are synthetic; no test-only production exports, DOM,
// Firebase connection, or OAuth requests are needed.
const compiled = ts.transpileModule(
  readFileSync(new URL('../../app/auth/kakao/page.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } },
).outputText;

type Account = {
  user: FirebaseUser | null;
  profile: { ownerUid: string; consentVersion: string } | null;
  view: { onboardingStep: number } | null;
  loading: boolean;
  error: string | null;
};
type Node = { type: unknown; props: Record<string, unknown> };
type Effect = { kind: 'effect'; setup: () => void | (() => void); deps?: readonly unknown[]; cleanup?: () => void };
const anonymous = (): Account => ({ user: null, profile: null, view: null, loading: false, error: null });
const user = (uid: string, verified = true): FirebaseUser => ({ uid, email: `${uid.toLowerCase()}@example.test`, displayName: '가상 사용자', verified });
const ready = (uid: string): Account => ({ ...anonymous(), user: user(uid), profile: { ownerUid: uid, consentVersion: '2026-10-16' }, view: { onboardingStep: 3 } });
const flush = async () => { for (let index = 0; index < 20; index++) await Promise.resolve(); };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (typeof value !== 'object' || value === null || !('props' in value)) return [];
  const node = value as Node;
  return [node, ...nodes(node.props.children)];
}

function fixture() {
  let account = anonymous(), mounted = true, cursor = 0;
  const slots: unknown[] = [];
  let pendingEffects: Array<() => void> = [];
  const stateWrites: Array<{ afterUnmount: boolean }> = [];
  const controllers: AbortController[] = [];
  const initialFragment = '#code=synthetic-one-use-handoff&flow=synthetic-flow';
  const location = { hash: initialFragment, pathname: '/bapmunna/app/auth/kakao/' };
  const history = { replaceState: vi.fn((_state: unknown, _title: string, path: string) => { location.hash = ''; location.pathname = path; }) };
  const provider = { completeKakaoLogin: vi.fn<NonNullable<FirebaseProvider['completeKakaoLogin']>>(async () => user('K')) };
  const connect = vi.fn(async () => provider);
  const refresh = vi.fn(async () => {});
  const setMode = vi.fn<(mode: 'live' | 'demo') => void>();
  const router = { replace: vi.fn<(path: string) => void>(), push: vi.fn<(path: string) => void>() };
  const react = {
    useState<T>(initial: T | (() => T)): [T, (value: T | ((old: T) => T)) => void] {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
      return [slots[index] as T, value => {
        stateWrites.push({ afterUnmount: !mounted });
        slots[index] = typeof value === 'function' ? (value as (old: T) => T)(slots[index] as T) : value;
      }];
    },
    useEffect(setup: Effect['setup'], deps?: readonly unknown[]) {
      const index = cursor++, previous = slots[index] as Effect | undefined;
      if (deps && previous?.deps && deps.length === previous.deps.length && deps.every((value, offset) => Object.is(value, previous.deps![offset]))) return;
      const effect: Effect = { kind: 'effect', setup, deps };
      slots[index] = effect;
      pendingEffects.push(() => {
        previous?.cleanup?.();
        const cleanup = setup();
        if (typeof cleanup === 'function') effect.cleanup = cleanup;
      });
    },
  };
  const jsx = (type: unknown, props: Node['props']): Node => ({ type, props });
  const modules: Record<string, unknown> = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'next/link': { __esModule: true, default: 'Link' },
    'next/navigation': { useRouter: () => router },
    '@/components/Mascot': { Logo: 'Logo', Mascot: 'Mascot' },
    '@/lib/firebase/bridge': { accountError, connectFirebase: connect, usesImpactFirebase: true },
    '@/lib/data/firebase': { useFirebaseAccount: () => account, refreshFirebaseAccount: refresh },
    '@/lib/data/mode': { setMode },
  };
  const exports: Record<string, unknown> = {};
  runInNewContext(compiled, {
    exports,
    window: { location, history },
    AbortController: class extends AbortController {
      constructor() { super(); controllers.push(this); }
    },
    require(id: string) {
      if (!(id in modules)) throw new Error(`Unexpected Kakao callback runtime import: ${id}`);
      return modules[id];
    },
  }, { filename: 'app/auth/kakao/page.tsx' });

  const effects = () => slots.filter((value): value is Effect => typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'effect');
  function render(next = account): Node {
    if (!mounted) throw new Error('Cannot render an unmounted callback');
    account = next; cursor = 0; pendingEffects = [];
    const tree = (exports.default as () => Node)();
    for (const effect of pendingEffects) effect();
    return tree;
  }
  function strictReplay() {
    // React StrictMode runs setup -> cleanup -> setup while keeping state.
    // Both scheduled promise callbacks run only after this synchronous replay.
    for (const effect of effects()) effect.cleanup?.();
    for (const effect of effects()) {
      const cleanup = effect.setup();
      effect.cleanup = typeof cleanup === 'function' ? cleanup : undefined;
    }
  }
  function unmount() {
    mounted = false;
    for (const effect of effects()) effect.cleanup?.();
  }
  return { render, strictReplay, unmount, provider, connect, refresh, setMode, router, history, location, initialFragment, controllers, stateWrites };
}

describe('Firebase Kakao callback lifetime and completed UID', () => {
  it('does not consume the fragment or load the SDK when the first effect is immediately disposed', async () => {
    const f = fixture();
    f.render(); f.unmount(); await flush();
    expect(f.controllers).toHaveLength(1); expect(f.controllers[0].signal.aborted).toBe(true);
    expect(f.location.hash).toBe(f.initialFragment); expect(f.history.replaceState).not.toHaveBeenCalled();
    expect(f.connect).not.toHaveBeenCalled(); expect(f.provider.completeKakaoLogin).not.toHaveBeenCalled();
    expect(f.setMode).not.toHaveBeenCalled(); expect(f.router.replace).not.toHaveBeenCalled();
    expect(f.stateWrites).toEqual([]);
  });

  it('consumes the original fragment exactly once after StrictMode cleanup and setup replay', async () => {
    const f = fixture();
    f.render(); f.strictReplay();
    expect(f.location.hash).toBe(f.initialFragment); expect(f.connect).not.toHaveBeenCalled();
    await flush();
    expect(f.controllers).toHaveLength(2); expect(f.controllers[0].signal.aborted).toBe(true); expect(f.controllers[1].signal.aborted).toBe(false);
    expect(f.history.replaceState).toHaveBeenCalledExactlyOnceWith(null, '', '/bapmunna/app/auth/kakao/');
    expect(f.connect).toHaveBeenCalledOnce();
    expect(f.provider.completeKakaoLogin).toHaveBeenCalledExactlyOnceWith(f.initialFragment, f.controllers[1].signal);
    expect(f.location.hash).toBe(''); expect(f.setMode).toHaveBeenCalledExactlyOnceWith('live'); expect(f.refresh).toHaveBeenCalledOnce();
    f.render(ready('K'));
    expect(f.router.replace).toHaveBeenCalledExactlyOnceWith('/start');
  });

  it('aborts Back/unmount during SDK loading and ignores a provider that arrives later', async () => {
    const f = fixture(), loading = deferred<typeof f.provider>();
    f.connect.mockReturnValueOnce(loading.promise);
    f.render(); await flush();
    expect(f.connect).toHaveBeenCalledOnce(); expect(f.provider.completeKakaoLogin).not.toHaveBeenCalled();
    f.unmount(); expect(f.controllers[0].signal.aborted).toBe(true);
    loading.resolve(f.provider); await flush();
    expect(f.provider.completeKakaoLogin).not.toHaveBeenCalled(); expect(f.refresh).not.toHaveBeenCalled();
    expect(f.setMode).not.toHaveBeenCalled(); expect(f.router.replace).not.toHaveBeenCalled(); expect(f.router.push).not.toHaveBeenCalled();
    expect(f.stateWrites).toEqual([]);
  });

  it('passes the abort to a pending completion and ignores late SDK success after unmount', async () => {
    const f = fixture(), signingIn = deferred<FirebaseUser>();
    f.provider.completeKakaoLogin.mockReturnValueOnce(signingIn.promise);
    f.render(); await flush();
    const signal = f.provider.completeKakaoLogin.mock.calls[0][1]!;
    expect(signal.aborted).toBe(false); f.unmount(); expect(signal.aborted).toBe(true);
    // Deliberately model an SDK that resolves despite cancellation.
    signingIn.resolve(user('K')); await flush();
    expect(f.setMode).not.toHaveBeenCalled(); expect(f.refresh).not.toHaveBeenCalled();
    expect(f.router.replace).not.toHaveBeenCalled(); expect(f.router.push).not.toHaveBeenCalled(); expect(f.stateWrites).toEqual([]);
  });

  it('does not update an abandoned callback when the cancelled SDK rejects later', async () => {
    const f = fixture(), signingIn = deferred<FirebaseUser>();
    f.provider.completeKakaoLogin.mockReturnValueOnce(signingIn.promise);
    f.render(); await flush(); f.unmount();
    signingIn.reject(Object.assign(new Error('Synthetic cancellation'), { code: 'auth/kakao-cancelled' })); await flush();
    expect(f.controllers[0].signal.aborted).toBe(true); expect(f.stateWrites).toEqual([]);
    expect(f.setMode).not.toHaveBeenCalled(); expect(f.refresh).not.toHaveBeenCalled(); expect(f.router.replace).not.toHaveBeenCalled();
  });

  it('waits for refresh and account loading, then advances only a verified profile matching the completed UID', async () => {
    const f = fixture(), refreshing = deferred<void>(), account = ready('K');
    f.refresh.mockReturnValueOnce(refreshing.promise);
    f.render(account); await flush();
    expect(f.refresh).toHaveBeenCalledOnce(); f.render(account); expect(f.router.replace).not.toHaveBeenCalled();
    refreshing.resolve(); await flush();
    f.render({ ...account, loading: true }); expect(f.router.replace).not.toHaveBeenCalled();
    f.render(account);
    expect(f.router.replace).toHaveBeenCalledExactlyOnceWith('/start'); expect(f.router.push).not.toHaveBeenCalled();
    expect(f.provider.completeKakaoLogin).toHaveBeenCalledOnce();
  });

  it.each([
    ['missing email', { ...anonymous(), user: { ...user('K', false), email: '' } }],
    ['unverified email', { ...anonymous(), user: user('K', false) }],
    ['missing profile', { ...anonymous(), user: user('K') }],
  ] as const)('returns a completed matching account with %s to the login completion flow', async (_label, account) => {
    const f = fixture();
    f.provider.completeKakaoLogin.mockResolvedValueOnce(account.user);
    f.render(); await flush(); f.render(account);
    expect(f.router.replace).toHaveBeenCalledExactlyOnceWith('/login'); expect(f.router.push).not.toHaveBeenCalled();
    expect(f.refresh).toHaveBeenCalledOnce();
  });

  it('does not advance a restored or changed account whose UID differs from the completed login', async () => {
    const f = fixture(), signingIn = deferred<FirebaseUser>(), other = ready('B');
    f.provider.completeKakaoLogin.mockReturnValueOnce(signingIn.promise);
    f.render(other); await flush(); expect(f.router.replace).not.toHaveBeenCalled();
    signingIn.resolve(user('K')); await flush(); f.render(other);
    const tree = f.render(other), alert = nodes(tree).find(node => node.props.role === 'alert');
    expect(alert?.props.children).toBe('계정이 바뀌었어요. 현재 계정으로 다시 확인해 주세요.');
    expect(nodes(tree).find(node => node.type === 'Link' && node.props.href === '/login')).toBeDefined();
    expect(f.router.replace).not.toHaveBeenCalled(); expect(f.router.push).not.toHaveBeenCalled();
  });

  it('does not navigate or save completion state after unmount during the account refresh', async () => {
    const f = fixture(), refreshing = deferred<void>();
    f.refresh.mockReturnValueOnce(refreshing.promise);
    f.render(); await flush(); expect(f.refresh).toHaveBeenCalledOnce();
    f.unmount(); refreshing.resolve(); await flush();
    expect(f.controllers[0].signal.aborted).toBe(true);
    expect(f.stateWrites.some(write => write.afterUnmount)).toBe(false);
    expect(f.router.replace).not.toHaveBeenCalled(); expect(f.router.push).not.toHaveBeenCalled();
  });
});
