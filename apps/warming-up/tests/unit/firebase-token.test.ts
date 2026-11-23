import { afterEach, expect, it, vi } from 'vitest';
import { createProvider } from '@/firebase/provider/firebase-provider.src.mjs';

type TestUser = {uid: string; emailVerified: boolean; getIdToken: (force: boolean) => Promise<string>};
const mock = vi.hoisted(() => ({
  auth: {currentUser: null as TestUser | null},
  onChange: new Set<(user: TestUser | null) => void>(),
}));
vi.mock('firebase/app', () => ({
  getApps: () => [],
  initializeApp: (options: object) => ({options}),
}));
vi.mock('firebase/firestore', () => ({getFirestore: () => ({})}));
vi.mock('firebase/auth', () => ({
  getAuth: () => mock.auth,
  onAuthStateChanged: (_auth: unknown, listener: (user: TestUser | null) => void) => {
    mock.onChange.add(listener);
    return () => mock.onChange.delete(listener);
  },
}));
function setup(getIdToken: TestUser['getIdToken']) {
  vi.stubGlobal('window', {location: {origin: 'https://example.test'}});
  mock.auth.currentUser = {uid: 'test-a', emailVerified: true, getIdToken};
  return createProvider({projectId: 'demo-warming-up', appId: 'test'});
}
afterEach(() => { mock.auth.currentUser = null; mock.onChange.clear(); vi.unstubAllGlobals(); });

it('uses cached SDK authentication by default and forwards an explicit refresh for the verified account', async () => {
  const sdk = vi.fn().mockResolvedValue('test-only-token');
  const provider = setup(sdk);
  await expect(provider.getIdToken('different-user', true)).rejects.toMatchObject({code:'auth/user-changed'});
  expect(sdk).not.toHaveBeenCalled();
  await provider.getIdToken('test-a');
  await provider.getIdToken('test-a', true);
  expect(sdk.mock.calls).toEqual([[false], [true]]);
});

it('discards a delayed refreshed token if the auth session changes, including A→B→A', async () => {
  let resolve!: (value: string) => void;
  const provider = setup(() => new Promise(done => {resolve = done;}));
  const lookup = provider.getIdToken('test-a', true);
  for (const listener of mock.onChange) listener(null);
  for (const listener of mock.onChange) listener(mock.auth.currentUser);
  resolve('test-only-old-session');
  await expect(lookup).rejects.toMatchObject({code:'auth/user-changed'});
  expect(mock.onChange.size).toBe(0);
});
