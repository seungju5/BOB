/** Owner workstation only. Synchronize the Firebase Auth directory into the same project's private Studio index. */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile, realpath } from 'node:fs/promises';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
const emulatorAuth = process.env.FIREBASE_AUTH_EMULATOR_HOST,
  emulatorDb = process.env.FIRESTORE_EMULATOR_HOST;
const local = !!(emulatorAuth || emulatorDb);
if (local && ![emulatorAuth, emulatorDb].every((v) => /^127[.]0[.]0[.]1:[0-9]+$/.test(v ?? '')))
  throw Error('Use both loopback emulators together.');
const project = local ? 'demo-warming-up' : 'warming-up-bapmunna';
const root = fileURLToPath(new URL('../', import.meta.url));
const prefix = 'projects/' + project + '/databases/(default)/documents';
const base = (local ? 'http://' + emulatorDb : 'https://firestore.googleapis.com') + '/v1/' + prefix;
const authURL =
  (local
    ? 'http://' + emulatorAuth + '/identitytoolkit.googleapis.com'
    : 'https://identitytoolkit.googleapis.com') +
  '/v1/projects/' +
  project +
  '/accounts';
async function credentials() {
  // Use the same project-specific account selection as the Firebase CLI used for release.
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    let bin;
    try {
      bin = await realpath(join(dir, 'firebase'));
    } catch {
      continue;
    }
    const pkg = resolve(dirname(bin), '../../package.json');
    try {
      if (JSON.parse(await readFile(pkg, 'utf8')).name !== 'firebase-tools') continue;
    } catch {
      continue;
    }
    const sdk = createRequire(pkg);
    const options = { project, projectRoot: root, nonInteractive: true };
    const auth = sdk('./lib/auth');
    auth.setActiveAccount(options, auth.getProjectDefaultAccount(root));
    await sdk('./lib/requireAuth').requireAuth(options);
    return () => sdk('./lib/apiv2').getAccessToken();
  }
  return () =>
    execFileSync('gcloud', ['auth', 'print-access-token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
}
const access = local ? () => 'owner' : await credentials();
async function request(url, body, missing = false) {
  const res = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    redirect: 'error',
    cache: 'no-store',
    headers: { authorization: 'Bearer ' + (await access()), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 404 && missing) return null;
  if (!res.ok) {
    const code = (await res.json().catch(() => ({}))).error?.status || '';
    throw Object.assign(Error('Google API ' + res.status + ' ' + code), { code });
  }
  return res.json();
}
const str = (value) => ({ stringValue: value });
const time = (value) => ({ timestampValue: new Date(Number(value)).toISOString() });
const condition = (before) => (before ? { updateTime: before.updateTime } : { exists: false });
const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');
async function get(path, fields = []) {
  const params = new URLSearchParams(fields.map((f) => ['mask.fieldPaths', f]));
  return request(base + '/' + encodePath(path) + '?' + params, undefined, true);
}
async function list(path, fields) {
  const docs = [];
  let token = '';
  do {
    const params = new URLSearchParams(fields.map((f) => ['mask.fieldPaths', f]));
    params.set('pageSize', '300');
    if (token) params.set('pageToken', token);
    const page = await request(base + '/' + path + '?' + params);
    docs.push(...(page.documents ?? []));
    token = page.nextPageToken;
  } while (token);
  return docs;
}
const commit = (writes) => request(base + ':commit', { writes });
function update(path, fields, before) {
  return {
    update: { name: prefix + '/' + path, fields },
    updateMask: { fieldPaths: Object.keys(fields) },
    currentDocument: condition(before),
  };
}
async function retry(action) {
  for (let i = 0; ; i++) {
    try {
      return await action();
    } catch (e) {
      if (i >= 3 || !['FAILED_PRECONDITION', 'ABORTED', 'ALREADY_EXISTS', 'NOT_FOUND'].includes(e.code))
        throw e;
    }
  }
}
function equivalent(a, b) {
  if (a?.timestampValue && b?.timestampValue)
    return Date.parse(a.timestampValue) === Date.parse(b.timestampValue);
  return JSON.stringify(a) === JSON.stringify(b);
}
async function syncMember(user) {
  const path = 'bapmunnaMemberDirectory/' + user.localId;
  if (!user.createdAt) throw Error('A Firebase account lacks its creation time.');
  await retry(async () => {
    const before = await get(path),
      prev = before?.fields ?? {};
    const fields = {
      email: str(user.email ?? ''),
      emailLower: str((user.email ?? '').toLowerCase()),
      verified: { booleanValue: !!user.emailVerified },
      disabled: { booleanValue: !!user.disabled },
      joinedAt: time(user.createdAt),
    };
    const login = Math.floor(Number(user.lastLoginAt ?? 0) / 1000) * 1000;
    if (login > 0) fields.lastLoginAt = time(login);
    if (prev.lastLoginAt && Date.parse(prev.lastLoginAt.timestampValue) > login) {
      delete fields.lastLoginAt;
      delete fields.email;
      delete fields.emailLower;
      delete fields.verified;
    }
    if (Object.entries(fields).some(([k, v]) => !equivalent(prev[k], v)))
      await commit([update(path, fields, before)]);
  });
}
async function storage(id) {
  const path = 'bapmunnaStorageStatus/' + id;
  await retry(async () => {
    const before = await get(path);
    const [home, settings] = await Promise.all(
      ['household', 'settings'].map((k) =>
        get('bapmunnaAccounts/' + id + '/preferences/' + k, ['updatedAt']),
      ),
    );
    const fields = {};
    if (home?.fields?.updatedAt) fields.householdAt = home.fields.updatedAt;
    if (settings?.fields?.updatedAt) fields.settingsAt = settings.fields.updatedAt;
    if (!Object.keys(fields).length) {
      if (before) await commit([{ delete: prefix + '/' + path, currentDocument: condition(before) }]);
    } else if (['householdAt', 'settingsAt'].some((k) => !equivalent(fields[k], before?.fields?.[k]))) {
      await commit([
        { update: { name: prefix + '/' + path, fields }, currentDocument: condition(before) },
      ]);
    }
  });
}
async function groups(items, fn) {
  for (let i = 0; i < items.length; i += 6) await Promise.all(items.slice(i, i + 6).map(fn));
}
async function sync() {
  let next = '';
  const ids = new Set();
  do {
    const params = new URLSearchParams({
      maxResults: '500',
      fields: 'nextPageToken,users(localId,email,emailVerified,disabled,createdAt,lastLoginAt)',
    });
    if (next) params.set('nextPageToken', next);
    const batch = await request(authURL + ':batchGet?' + params);
    const users = batch.users ?? [];
    await groups(users, syncMember);
    for (const u of users) ids.add(u.localId);
    next = batch.nextPageToken;
  } while (next);
  // Re-check an absent UID against Auth before removing only the derived directory row.
  const entries = await list('bapmunnaMemberDirectory', ['joinedAt']);
  await groups(
    entries.filter((d) => !ids.has(d.name.split('/').at(-1))),
    async (entry) => {
      const id = entry.name.split('/').at(-1);
      const hit = await request(authURL + ':lookup?fields=users(localId)', { localId: [id] });
      if (!hit.users?.length) await commit([{ delete: entry.name, currentDocument: condition(entry) }]);
    },
  );
  const profiles = await list('bapmunnaAccounts', ['ownerUid']);
  await groups(profiles, (d) => storage(d.name.split('/').at(-1)));
  await commit([
    {
      update: { name: prefix + '/bapmunnaOpsMeta/directory', fields: {} },
      updateMask: { fieldPaths: [] },
      updateTransforms: [{ fieldPath: 'syncedAt', setToServerValue: 'REQUEST_TIME' }],
    },
  ]);
  console.log('Firebase Auth directory and application storage times synchronized.');
}
async function setMemberships(file, enabled) {
  const emails = [
    ...new Set(
      (await readFile(file, 'utf8'))
        .split(/\s+/)
        .filter(Boolean)
        .map((e) => e.toLowerCase()),
    ),
  ];
  if (
    !emails.length ||
    emails.length > 100 ||
    emails.some((e) => !/^[-a-z0-9._+]+@[-a-z0-9.]+[.][a-z]{2,}$/.test(e))
  )
    throw Error('Enter the approved email addresses, one per line, in a private file.');
  for (const email of emails) {
    const path = 'bapmunnaOperators/' + email,
      before = await get(path);
    if (before?.fields?.enabled?.booleanValue !== enabled)
      await commit([update(path, { enabled: { booleanValue: enabled } }, before)]);
    if ((await get(path))?.fields?.enabled?.booleanValue !== enabled)
      throw Error('Membership readback failed.');
  }
  console.log(
    'Verified ' + (enabled ? 'active' : 'revoked') + ' app operator memberships: ' + emails.length,
  );
}
const args = process.argv.slice(2);
if (!args.length) await sync();
else if (args.length === 2 && ['--grant-file', '--revoke-file'].includes(args[0]))
  await setMemberships(args[1], args[0] === '--grant-file');
else
  throw Error(
    'Use no arguments to synchronize, or --grant-file / --revoke-file with an approved private list.',
  );
