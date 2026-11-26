import { afterEach, expect, it, vi } from 'vitest';
import { createProvider } from '@/firebase/provider/firebase-provider.src.mjs';

type TestUser = {uid: string; emailVerified: boolean; getIdToken: (force: boolean) => Promise<string>};
const mock = vi.hoisted(() => ({
  auth: {currentUser: null as TestUser | null},
  linkPopup: vi.fn(), signPopup: vi.fn(), persistence: vi.fn(), addScope: vi.fn(),
  onChange: new Set<(user: TestUser | null) => void>(),
}));
vi.mock('firebase/app', () => ({
  getApps: () => [],
  initializeApp: (options: object) => ({options}),
}));
vi.mock('firebase/firestore', () => ({getFirestore: () => ({})}));
vi.mock('firebase/auth', () => ({
  getAuth: () => mock.auth,
  OAuthProvider: class { constructor(readonly providerId:string) {} addScope=mock.addScope; },
  linkWithPopup: mock.linkPopup, signInWithPopup: mock.signPopup, setPersistence: mock.persistence,
  browserLocalPersistence: "local", browserSessionPersistence: "session",
  onAuthStateChanged: (_auth: unknown, listener: (user: TestUser | null) => void) => {
    mock.onChange.add(listener);
    return () => mock.onChange.delete(listener);
  },
}));
function setup(getIdToken: TestUser['getIdToken'], samsungEnabled = false) {
  vi.stubGlobal('window', {location: {origin: 'https://example.test'}});
  mock.auth.currentUser = {uid: 'test-a', emailVerified: true, getIdToken};
  return createProvider({projectId: 'demo-warming-up', appId: 'test'}, {samsungEnabled});
}
afterEach(() => { mock.auth.currentUser = null; mock.onChange.clear(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

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

it('keeps unissued Samsung login closed without opening a popup or changing persistence', async () => {
  const provider = setup(vi.fn());
  await expect(provider.samsung(false)).rejects.toMatchObject({code:'auth/operation-not-allowed'});
  await expect(provider.linkSamsung('test-a')).rejects.toMatchObject({code:'auth/operation-not-allowed'});
  expect(mock.persistence).not.toHaveBeenCalled();
  expect(mock.signPopup).not.toHaveBeenCalled();
  expect(mock.linkPopup).not.toHaveBeenCalled();
});

it('selects the Samsung identity provider and links only the current verified Firebase UID', async () => {
  const provider = setup(vi.fn(), true);
  const user = mock.auth.currentUser!;
  await expect(provider.linkSamsung('other')).rejects.toMatchObject({code:'auth/user-changed'});
  expect(mock.linkPopup).not.toHaveBeenCalled();
  mock.linkPopup.mockResolvedValue({user:{...user,providerData:[{providerId:'oidc.samsung'}]}});
  await expect(provider.linkSamsung(user.uid)).resolves.toMatchObject({uid:user.uid,samsungLinked:true});
  expect(mock.linkPopup).toHaveBeenCalledWith(user,expect.objectContaining({providerId:'oidc.samsung'}));
  mock.auth.currentUser = null;
  mock.signPopup.mockResolvedValue({user});
  await expect(provider.samsung(false)).resolves.toMatchObject({uid:user.uid});
  expect(mock.signPopup).toHaveBeenCalledWith(mock.auth,expect.objectContaining({providerId:'oidc.samsung'}));
  expect(mock.persistence).toHaveBeenCalledWith(mock.auth,'session');
  expect(mock.addScope).toHaveBeenCalledWith('email');
});
