const INTRO_KEY = "bapmutna.intro.seen.";
const COACH_KEY = "bapmutna.setup.device-coach";
const COACH_EVENT = "bapmutna:device-coach";

export function readIntroSeen(ownerId: string | null) {
  try { return localStorage.getItem(INTRO_KEY + (ownerId ?? "demo")) === "1"; }
  catch { return false; }
}

export function rememberIntroSeen(ownerId: string | null) {
  try { localStorage.setItem(INTRO_KEY + (ownerId ?? "demo"), "1"); }
  catch { /* the current visit can still continue */ }
}

export function readDeviceCoach() {
  try { return sessionStorage.getItem(COACH_KEY); }
  catch { return null; }
}

export function setDeviceCoach(key: string | null) {
  try {
    if (key) sessionStorage.setItem(COACH_KEY, key);
    else sessionStorage.removeItem(COACH_KEY);
  } catch { /* the connection card still appears */ }
  window.dispatchEvent(new Event(COACH_EVENT));
}

export function subscribeDeviceCoach(callback: () => void) {
  window.addEventListener(COACH_EVENT, callback);
  return () => window.removeEventListener(COACH_EVENT, callback);
}
