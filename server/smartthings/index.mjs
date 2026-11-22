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

export function createRuntime(env = process.env) {
  const config = readConfig(env);
  const ready = configured(config);
  const app = ready
    ? initializeApp({ projectId: config.projectId, credential: applicationDefault() })
    : null;
  const store = app ? firestoreStore(getFirestore(app)) : null;
  async function verifyAccount(uid, authTime) {
    let user;
    try {
      user = await getAuth(app).getUser(uid);
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
    verifyUser: (token) => getAuth(app).verifyIdToken(token, true),
    smartthings: smartThingsClient(config),
    verifyWebhook: webhookVerifier(),
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
