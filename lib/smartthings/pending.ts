// Only a random attempt identifier and its expiry are shared between this site's
// tabs. The Samsung nonce is a server-set HttpOnly cookie.
const namespace = "warming-up:smartthings:pending:";
const lifetime = 10 * 60_000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Attempt = { bucket: string; id: string };

async function bucketFor(uid: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(uid));
  return namespace + Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("") + ":";
}

function pendingKeys() {
  const result = [];
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key?.startsWith(namespace)) continue;
    const until = Number(localStorage.getItem(key));
    if (!Number.isSafeInteger(until) || until <= Date.now() || until > Date.now() + lifetime) localStorage.removeItem(key);
    else result.push(key);
  }
  return result;
}

export async function rememberAttempt(uid: string): Promise<Attempt> {
  const bucket = await bucketFor(uid);
  const id = crypto.randomUUID();
  pendingKeys();
  sessionStorage.setItem(bucket, id);
  localStorage.setItem(bucket + id, String(Date.now() + lifetime));
  return { bucket, id };
}

export function attemptIsPending({ bucket, id }: Attempt) {
  return Number(localStorage.getItem(bucket + id)) > Date.now();
}

/** A return in one tab must not erase a newer attempt from another tab. */
export function forgetAttempt({ bucket, id }: Attempt) {
  localStorage.removeItem(bucket + id);
  if (sessionStorage.getItem(bucket) === id) sessionStorage.removeItem(bucket);
}

export async function returnedToAccount(uid: string) {
  try {
    const bucket = await bucketFor(uid);
    const id = sessionStorage.getItem(bucket);
    if (id && uuid.test(id)) forgetAttempt({ bucket, id });
  } catch { /* The callback can still show the server's actual account status. */ }
}

export async function pendingForAccount(uid: string): Promise<Attempt[]> {
  try {
    const keys = pendingKeys();
    if (!keys.length) return [];
    const bucket = await bucketFor(uid);
    return keys.filter(key => key.startsWith(bucket)).map(key => ({ bucket, id: key.slice(bucket.length) })).filter(item => uuid.test(item.id));
  } catch { return []; }
}
