import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createNodeHandler } from './http-adapter.mjs';
import { ApiError, readConfig, webhookVerifier } from './security.mjs';
import { configured, createService } from './service.mjs';
import { smartThingsClient } from './smartthings.mjs';
import { firestoreStore } from './store.mjs';
import { createNotifier, vapidKeys } from './notifications.mjs';

export function createRuntime(env = process.env, { auth, db } = {}) {
  const config = readConfig(env);
  const ready = configured(config);
  const keys = vapidKeys(env);
  const protectionKey = env.WEB_PUSH_ENCRYPTION_KEY || config.key;
  const pushReady = Boolean(keys && Buffer.from(protectionKey || '', 'base64').length === 32);
  if (Boolean(auth) !== Boolean(db)) throw Error('Both Firebase services are required.');
  if (ready || pushReady) {
    if (!auth) {
      const app = initializeApp({ projectId: config.projectId, credential: applicationDefault() });
      auth = getAuth(app);
      db = getFirestore(app);
    }
    if (auth.app?.options?.projectId !== config.projectId || db.projectId !== config.projectId)
      throw Error('Unexpected Firebase service project.');
  }
  const store = (ready || pushReady) ? firestoreStore(db) : null;
  async function verifyAccount(uid, authTime) {
    let user;
    try {
      user = await auth.getUser(uid);
    } catch (error) {
      if (error.code === 'auth/user-not-found') throw new ApiError(401, 'login_required');
      throw error;
    }
    const validAfter = Date.parse(user.tokensValidAfterTime ?? '1970-01-01T00:00:00Z');
    if (
      user.disabled ||
      !user.emailVerified ||
      !Number.isInteger(authTime) ||
      !Number.isFinite(validAfter) ||
      authTime * 1000 < validAfter
    )
      throw new ApiError(401, 'login_required');
  }
  const handle = createService({
    config,
    store,
    verifyAccount,
    verifyConsent: (uid) => store.verifyConsent(uid),
    verifyUser: (token) => auth.verifyIdToken(token, true),
    smartthings: smartThingsClient(config),
    verifyWebhook: webhookVerifier(),
    notifier: pushReady ? createNotifier({ db, store, verifyAccount,
      config: { origin: config.origin, key: protectionKey }, keys }) : null,
  });
  return { config, ready, store, handle };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { config, handle } = createRuntime();
    createServer(createNodeHandler({ origin: config.origin, handle })).listen(
      Number(process.env.PORT || 8080),
      '0.0.0.0',
    );
  } catch {
    console.error('Invalid SmartThings server configuration.');
    process.exitCode = 1;
  }
}
