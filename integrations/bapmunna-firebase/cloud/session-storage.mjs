// Keep the user's persistence choice through the full-page OAuth redirect.
export function createSessionStorage(local, session, sessionKey) {
  const preferenceKey = `${sessionKey}-persistence`;
  const pending = session.getItem(preferenceKey);
  let keep = pending ? pending === 'local' : !!local.getItem(sessionKey);
  return {
    remember(value) {
      keep = !!value;
      session.setItem(preferenceKey, keep ? 'local' : 'session');
    },
    clearPreference() { session.removeItem(preferenceKey); },
    storage: {
      getItem(key) { return local.getItem(key) || session.getItem(key); },
      setItem(key, value) {
        (keep ? local : session).setItem(key, value);
        (keep ? session : local).removeItem(key);
        if (key === sessionKey) session.removeItem(preferenceKey);
      },
      removeItem(key) {
        local.removeItem(key);
        session.removeItem(key);
        if (key === sessionKey) session.removeItem(preferenceKey);
      },
    },
  };
}
