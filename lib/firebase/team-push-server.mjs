import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Firestore } from 'firebase-admin/firestore';
import { GoogleAuth, IdentityPoolClient } from 'google-auth-library';
import { headers } from 'next/headers.js';
import deployment from '../../config/deployment.json' with { type: 'json' };
import { createRuntime } from '../../apps/warming-up/server/smartthings/index.mjs';
import { TEAM_PROJECT_ID } from '../../apps/warming-up/server/smartthings/security.mjs';

const closed = createRuntime({}).handle;
const providerPath = /^projects\/446376297496\/locations\/global\/workloadIdentityPools\/([a-z0-9-]{4,32})\/providers\/[a-z0-9-]{4,32}$/;
const runtimeAccount = /^[a-z][a-z0-9-]{4,28}[a-z0-9]@warming-up-bapmunna\.iam\.gserviceaccount\.com$/;
const configPath = '/api/smartthings/config';
const subscriptionPath = '/api/smartthings/notification-subscription';

function connectFirebase(provider, account) {
  const identity = new IdentityPoolClient({
    audience: `//iam.googleapis.com/${provider}`,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${account}:generateAccessToken`,
    scopes: ['https://www.googleapis.com/auth/identitytoolkit', 'https://www.googleapis.com/auth/datastore'],
    subject_token_supplier: {
      async getSubjectToken() {
        const token = (await headers()).get('x-vercel-oidc-token');
        if (!token) throw Error('Vercel workload identity unavailable.');
        return token;
      },
    },
  });
  const credential = {
    async getAccessToken() {
      const { token } = await identity.getAccessToken();
      const expires = Math.floor((identity.credentials.expiry_date - Date.now()) / 1000);
      if (!token || !Number.isFinite(expires) || expires <= 0) throw Error('Workload identity unavailable.');
      return { access_token: token, expires_in: expires };
    },
  };
  const name = 'bapmunna-vercel-push';
  const app = getApps().find(item => item.name === name) ??
    initializeApp({ projectId: TEAM_PROJECT_ID, credential }, name);
  const db = new Firestore({ projectId: TEAM_PROJECT_ID, preferRest: true,
    auth: new GoogleAuth({ projectId: TEAM_PROJECT_ID, authClient: identity }) });
  return { auth: getAuth(app), db, authorize: () => credential.getAccessToken() };
}

export function createNotificationHandler(env = process.env, connect = connectFirebase) {
  let backend, handle;
  return async function handleRequest(request) {
    const url = new URL(request.url);
    if (url.pathname !== configPath && url.pathname !== subscriptionPath) {
      return Response.json({ error: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    if (request.method === 'OPTIONS') return closed(request);
    const provider = env.FIREBASE_PUSH_WIF_PROVIDER ?? '';
    const account = env.FIREBASE_PUSH_SERVICE_ACCOUNT ?? '';
    const encryptionKey = env.FIREBASE_PUSH_ENCRYPTION_KEY ?? '';
    const vapidKey = env.FIREBASE_PUSH_VAPID_PRIVATE_KEY ?? '';
    const bytes = Buffer.from(encryptionKey, 'base64');
    if (url.origin !== deployment.supabaseWebOrigin || env.VERCEL_ENV !== 'production' ||
        !request.headers.get('x-vercel-oidc-token') ||
        env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST ||
        !providerPath.test(provider) || provider.includes('/github-hosting/') ||
        !runtimeAccount.test(account) || account.startsWith('github-hosting@') ||
        !vapidKey || bytes.length !== 32 || bytes.toString('base64') !== encryptionKey ||
        bytes.equals(Buffer.from(vapidKey, 'base64url'))) return closed(request);
    try {
      backend ??= connect(provider, account);
      if (!backend.auth || !backend.db) throw Error('Team Firebase workload clients unavailable.');
      handle ??= createRuntime({
        FIREBASE_PROJECT_ID: TEAM_PROJECT_ID,
        WEB_PUSH_ENCRYPTION_KEY: encryptionKey,
        WEB_PUSH_PRIVATE_KEY: vapidKey,
      }, backend).handle;
      // The Firebase client may send its ID token after seeing a public key.
      // Verify the production workload can obtain its team credential first.
      if (url.pathname === configPath) await backend.authorize();
      return await handle(request);
    } catch {
      return closed(request);
    }
  };
}

export const handleNotificationRequest = createNotificationHandler();
