import { APP_BASE_PATH, appPath } from "@/lib/app-path";

const destinations = { account: "/account", studio: "/admin", admin: "/admin", connect: "/connect" } as const;
type NextKey = keyof typeof destinations;
const storageKey = "warming.bob.login-return.v1" + APP_BASE_PATH;
const lifetime = 60 * 60 * 1000;

function allowed(value: unknown): value is NextKey {
  return typeof value === "string" && Object.hasOwn(destinations, value);
}
function destinationKey(search: string) {
  const next = new URLSearchParams(search).get("next");
  return allowed(next) ? next : null;
}

export function loginReturn(search: string) {
  const key = destinationKey(search);
  return key ? destinations[key] : "/start";
}

// Keep the previously registered callback URI exact. An email may open a new tab
// in the same browser that holds the PKCE verifier; persist only an allowlisted page name.
export function loginCallbackUrl(origin: string, search: string) {
  const key = destinationKey(search);
  try {
    if (key) localStorage.setItem(storageKey, JSON.stringify({ key, at: Date.now() }));
    else localStorage.removeItem(storageKey);
  } catch { /* Restricted storage still permits the default /start destination. */ }
  return new URL(appPath("/auth/callback"), origin).href;
}

function consumeReturn(search: string) {
  const explicit = destinationKey(search);
  try {
    const raw = localStorage.getItem(storageKey);
    localStorage.removeItem(storageKey);
    const saved = raw && JSON.parse(raw);
    const age = saved && Date.now() - saved.at;
    if (!explicit && allowed(saved?.key) && Number.isFinite(age) && age >= 0 && age <= lifetime) return saved.key as NextKey;
  } catch { /* A missing or malformed pending destination falls back to /start. */ }
  return explicit;
}

export function callbackReturn(search: string) {
  const key = consumeReturn(search);
  return key ? destinations[key] : "/start";
}
export function retryLoginPath(reason: string, search: string) {
  const params = new URLSearchParams({ auth_error: reason });
  const key = consumeReturn(search);
  if (key) params.set("next", key);
  return appPath(`/login?${params}`);
}
