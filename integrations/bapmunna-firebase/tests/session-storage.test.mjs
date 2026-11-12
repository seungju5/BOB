import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionStorage} from '../cloud/session-storage.mjs';

const memory = () => {
  const data = new Map();
  return {getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key)};
};
const key = 'bapmunna-supabase-session';
for (const remember of [true, false]) {
  test(`OAuth redirect preserves remember=${remember} and removes stale persistence`, () => {
    const local = memory(), session = memory();
    // A previous account may have selected the opposite persistence option.
    (remember ? session : local).setItem(key, 'previous-account');
    const before = createSessionStorage(local, session, key);
    before.remember(remember);
    before.storage.setItem(`${key}-code-verifier`, 'synthetic-verifier');
    const after = createSessionStorage(local, session, key);
    assert.equal(after.storage.getItem(`${key}-code-verifier`), 'synthetic-verifier');
    after.storage.setItem(key, 'new-account');
    assert.equal((remember ? local : session).getItem(key), 'new-account');
    assert.equal((remember ? session : local).getItem(key), null);
    assert.equal(session.getItem(`${key}-persistence`), null);
    after.storage.removeItem(`${key}-code-verifier`);
    const refreshed = createSessionStorage(local, session, key);
    refreshed.storage.setItem(key, 'refreshed-account');
    assert.equal((remember ? local : session).getItem(key), 'refreshed-account');
    refreshed.storage.removeItem(key);
    assert.equal(local.getItem(key), null);
    assert.equal(session.getItem(key), null);
  });
}
