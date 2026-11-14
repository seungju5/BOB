import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountError, within, type FirebaseProvider, type FirebaseUser } from '@/lib/firebase/bridge';

// Execute the actual parent and LoginForm without production-only test exports,
// a DOM dependency, a Firebase connection, or changes to the implementation.
const source = readFileSync(new URL('../../components/auth/FirebaseLogin.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

type Account = {
  user: FirebaseUser | null;
  view: { onboardingStep: number } | null;
  loading: boolean;
  error: string | null;
};
type Node = { type: unknown; props: Record<string, unknown>; key?: unknown };
type Effect = { deps?: readonly unknown[]; cleanup?: () => void };
type Frame = { slots: unknown[]; cursor: number; effects: Array<() => void> };
const frame = (): Frame => ({ slots: [], cursor: 0, effects: [] });
const anonymous = (): Account => ({ user: null, view: null, loading: false, error: null });
const user = (uid: string, verified = true): FirebaseUser => ({ uid, email: `${uid.toLowerCase()}@example.test`, displayName: `가상 ${uid}`, verified });
const ready = (uid: string): Account => ({ ...anonymous(), user: user(uid), view: { onboardingStep: 3 } });
const unverified = (uid: string): Account => ({ ...anonymous(), user: user(uid, false) });
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && 'props' in value;
}
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  return isNode(value) ? [value, ...nodes(value.props.children)] : [];
}
function find(tree: Node, predicate: (node: Node) => boolean): Node {
  const found = nodes(tree).find(predicate);
  if (!found) throw new Error('Expected login control was not rendered');
  return found;
}
function button(tree: Node, label: string): Node {
  return find(tree, node => ['Button', 'button'].includes(String(node.type)) && node.props.children === label);
}
function click(node: Node): Promise<void> {
  if (node.props.disabled) throw new Error('Cannot click a disabled control');
  return Promise.resolve((node.props.onClick as () => void | Promise<void>)());
}
function change(tree: Node, id: string, value: string) {
  const input = find(tree, node => node.props.id === id);
  (input.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
}
function submit(tree: Node): Promise<void> {
  const form = find(tree, node => node.type === 'form');
  return Promise.resolve((form.props.onSubmit as (event: { preventDefault(): void }) => void | Promise<void>)({ preventDefault() {} }));
}

function fixture() {
  let account = anonymous(), mode: 'live' | 'demo' | null = 'live';
  const parent = frame();
  let child = frame(), childKey: unknown, active = parent;
  const provider = {
    signIn: vi.fn<FirebaseProvider['signIn']>(async () => user('A')),
    signUp: vi.fn<FirebaseProvider['signUp']>(async () => user('A', false)),
    google: vi.fn<FirebaseProvider['google']>(async () => user('G')),
    resetPassword: vi.fn<FirebaseProvider['resetPassword']>(async () => {}),
    resendVerification: vi.fn<FirebaseProvider['resendVerification']>(async () => {}),
    saveProfile: vi.fn<FirebaseProvider['saveProfile']>(async () => {}),
  };
  const refresh = vi.fn(async () => {}), signOut = vi.fn(async () => {});
  const router = { push: vi.fn<(path: string) => void>(), replace: vi.fn<(path: string) => void>() };
  const react = {
    useState<T>(initial: T | (() => T)): [T, (value: T | ((old: T) => T)) => void] {
      const owner = active, index = owner.cursor++;
      if (!(index in owner.slots)) owner.slots[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
      return [owner.slots[index] as T, value => {
        owner.slots[index] = typeof value === 'function' ? (value as (old: T) => T)(owner.slots[index] as T) : value;
      }];
    },
    useRef<T>(initial: T): { current: T } {
      const index = active.cursor++;
      if (!(index in active.slots)) active.slots[index] = { current: initial };
      return active.slots[index] as { current: T };
    },
    useEffect(effect: () => void | (() => void), deps?: readonly unknown[]) {
      const owner = active, index = owner.cursor++, previous = owner.slots[index] as Effect | undefined;
      if (deps && previous?.deps && deps.length === previous.deps.length && deps.every((value, i) => Object.is(value, previous.deps![i]))) return;
      const next: Effect = { deps };
      owner.slots[index] = next;
      owner.effects.push(() => {
        previous?.cleanup?.();
        const cleanup = effect();
        if (typeof cleanup === 'function') next.cleanup = cleanup;
      });
    },
  };
  const jsx = (type: unknown, props: Record<string, unknown>, key?: unknown): Node => ({ type, props, key });
  const modules: Record<string, unknown> = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'next/link': { __esModule: true, default: 'Link' },
    'next/navigation': { useRouter: () => router },
    '@/components/Mascot': { Logo: 'Logo', Mascot: 'Mascot' },
    '@/components/ui': { Button: 'Button' },
    '@/components/forms': { TextInput: 'TextInput' },
    '@/components/onboarding/FlowProgress': { FlowProgress: 'FlowProgress' },
    '@/lib/data/mode': { useMode: () => mode, setMode: (next: typeof mode) => { mode = next; } },
    '@/lib/data/firebase': { useFirebaseAccount: () => account, refreshFirebaseAccount: refresh, signOutFirebase: signOut },
    '@/lib/firebase/bridge': { connectFirebase: async () => provider, within, accountError },
  };
  const exports: Record<string, unknown> = {};
  runInNewContext(compiled, {
    exports,
    require: (id: string) => {
      if (!(id in modules)) throw new Error(`Unexpected login runtime import: ${id}`);
      return modules[id];
    },
  }, { filename: 'FirebaseLogin.tsx' });

  function render(next = account): Node {
    account = next;
    active = parent; parent.cursor = 0; parent.effects = [];
    const element = (exports.default as () => Node)();
    if (element.key !== childKey) { child = frame(); childKey = element.key; }
    active = child; child.cursor = 0; child.effects = [];
    const tree = (element.type as (props: Record<string, unknown>) => Node)(element.props);
    for (const effect of [...parent.effects, ...child.effects]) effect();
    return tree;
  }
  function credentials(uid: string): Node {
    const tree = render();
    change(tree, 'login-email', `${uid.toLowerCase()}@example.test`);
    change(tree, 'login-password', 'Valid-Synthetic-Password-2026');
    return render();
  }
  return { provider, refresh, signOut, router, render, credentials, mode: () => mode };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

// Auth events are rendered at explicit scheduling boundaries. Returned users
// are the real sanitized provider contract, not undefined success placeholders.
// These are component-flow regressions, not browser or live OAuth evidence.
describe('Firebase login intent and completed-user navigation', () => {
  it('keeps account switching reachable when an existing session is restored', async () => {
    const f = fixture(), tree = f.render(ready('A'));
    expect(f.router.replace).not.toHaveBeenCalled();
    expect(button(tree, '다른 계정으로 로그인').props.disabled).toBe(false);
    await click(button(tree, '내 계정으로 계속하기'));
    expect(f.router.push).toHaveBeenCalledWith('/start');
  });

  it('advances a completed email login only when its returned UID matches the current account', async () => {
    const f = fixture();
    await submit(f.credentials('A'));
    expect(f.provider.signIn).toHaveBeenCalledWith('a@example.test', 'Valid-Synthetic-Password-2026', false);
    f.render(ready('B'));
    expect(f.router.replace).not.toHaveBeenCalled();
    f.render(ready('A'));
    expect(f.router.replace).toHaveBeenCalledExactlyOnceWith('/start');
  });

  it('advances a completed Google login using its sanitized returned user', async () => {
    const f = fixture();
    await click(button(f.render(), 'Google로 계속하기'));
    expect(f.provider.google).toHaveBeenCalledWith(false);
    f.render(ready('G'));
    expect(f.router.replace).toHaveBeenCalledExactlyOnceWith('/start');
  });

  it('keeps signup busy across the UID remount and advances after email verification', async () => {
    const f = fixture(), signup = deferred<FirebaseUser>();
    f.provider.signUp.mockReturnValueOnce(signup.promise);
    await click(button(f.render(), '회원가입'));
    let tree = f.credentials('S');
    change(tree, 'signup-name', '가상 가입자');
    const consent = find(tree, node => node.type === 'input' && node.props.type === 'checkbox' && node.props.required === true);
    (consent.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } });
    const signingUp = submit(f.render()); await flush();
    tree = f.render(unverified('S'));
    expect(button(tree, '로그인 없이 데모로 둘러보기').props.disabled).toBe(true);
    expect(button(tree, '다른 계정으로 로그인').props.disabled).toBe(true);
    signup.resolve(user('S', false)); await signingUp;
    tree = f.render(unverified('S'));
    expect(f.router.replace).not.toHaveBeenCalled();
    await click(button(tree, '이메일 확인했어요'));
    f.render(ready('S'));
    expect(f.router.replace).toHaveBeenCalledExactlyOnceWith('/start');
  });

  it('clears the previous login intent when switching accounts', async () => {
    const f = fixture(); f.provider.signIn.mockResolvedValueOnce(user('A', false));
    await submit(f.credentials('A'));
    await click(button(f.render(unverified('A')), '다른 계정으로 로그인'));
    expect(f.signOut).toHaveBeenCalledOnce();
    f.render(anonymous()); f.render(ready('B'));
    expect(f.router.replace).not.toHaveBeenCalled();
  });

  it('ignores late A success after timeout while B is pending, and advances only for completed B', async () => {
    const f = fixture(), a = deferred<FirebaseUser>(), b = deferred<FirebaseUser>();
    f.provider.signIn.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const first = submit(f.credentials('A')); await flush();
    await vi.advanceTimersByTimeAsync(12_001); await first;
    const second = submit(f.credentials('B')); await flush();
    expect(f.provider.signIn.mock.calls.map(call => call[0])).toEqual(['a@example.test', 'b@example.test']);
    a.resolve(user('A')); await flush();
    let tree = f.render(ready('A'));
    expect(button(tree, '다른 계정으로 로그인').props.disabled).toBe(true);
    expect(f.router.replace).not.toHaveBeenCalled();
    b.resolve(user('B')); await second;
    tree = f.render(ready('A'));
    expect(button(tree, '다른 계정으로 로그인').props.disabled).toBe(false);
    expect(f.router.replace).not.toHaveBeenCalled();
    f.render(ready('B'));
    expect(f.router.replace).toHaveBeenCalledExactlyOnceWith('/start');
  });

  it('keeps an explicit demo choice when a timed-out login later succeeds', async () => {
    const f = fixture(), pending = deferred<FirebaseUser>();
    f.provider.signIn.mockReturnValueOnce(pending.promise);
    const signingIn = submit(f.credentials('A')); await flush();
    await vi.advanceTimersByTimeAsync(12_001); await signingIn;
    await click(button(f.render(), '로그인 없이 데모로 둘러보기'));
    pending.resolve(user('A')); await flush(); f.render(ready('A'));
    expect(f.mode()).toBe('demo');
    expect(f.router.push).toHaveBeenCalledExactlyOnceWith('/start');
    expect(f.router.replace).not.toHaveBeenCalled();
  });

  it('waits for post-login refresh and clears navigation intent when that refresh fails', async () => {
    const f = fixture(), pending = deferred<void>();
    f.refresh.mockReturnValueOnce(pending.promise);
    const signingIn = submit(f.credentials('A')); await flush();
    const tree = f.render(ready('A'));
    expect(button(tree, '다른 계정으로 로그인').props.disabled).toBe(true);
    expect(f.router.replace).not.toHaveBeenCalled();
    pending.reject(new Error('Synthetic refresh failure')); await signingIn;
    f.render(ready('A'));
    expect(f.router.replace).not.toHaveBeenCalled();
  });
});
