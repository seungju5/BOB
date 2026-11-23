import test from 'node:test';
import assert from 'node:assert/strict';
import { firestoreStore } from '../store.mjs';

// A deterministic Firestore boundary fake, not an emulator or live-policy test.
function fakeDatabase(entries, { beforeTransaction } = {}) {
  const documents = new Map(Object.entries(entries)),
    queried = [],
    transactions = [];
  const snapshot = (path) => ({
    ref: { path },
    exists: documents.has(path),
    data: () => documents.get(path),
  });
  const db = {
    collection(name) {
      return {
        where(field, operator, cutoff) {
          assert.equal(field, 'expiresAt');
          assert.equal(operator, '<=');
          return {
            orderBy(order) {
              assert.equal(order, 'expiresAt');
              return {
                limit(count) {
                  return {
                    async get() {
                      queried.push({ name, count });
                      return {
                        docs: [...documents]
                          .filter(
                            ([path, value]) =>
                              path.startsWith(name + '/') &&
                              value.expiresAt instanceof Date &&
                              value.expiresAt <= cutoff,
                          )
                          .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
                          .slice(0, count)
                          .map(([path]) => snapshot(path)),
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
    async runTransaction(operation) {
      await beforeTransaction?.(documents);
      const reads = [],
        deletes = [];
      transactions.push({ reads, deletes });
      const result = await operation({
        async get(ref) {
          reads.push(ref.path);
          return snapshot(ref.path);
        },
        delete(ref) {
          deletes.push(ref.path);
        },
      });
      for (const path of deletes) documents.delete(path);
      return result;
    },
  };
  return { db, documents, queried, transactions };
}
const now = 1000000,
  prefix = 'bapmunnaSmartThings';
const expired = { expiresAt: new Date(now - 1), until: now - 1 };

test('cleanup only deletes expired transient metadata and never connections or household data', async () => {
  const fixture = fakeDatabase({
    [`${prefix}States/expired`]: expired,
    [`${prefix}States/valid`]: { expiresAt: new Date(now + 1), until: now + 1 },
    [`${prefix}Locks/expired`]: expired,
    [`${prefix}Locks/active`]: { expiresAt: new Date(now - 1), until: now + 120000 },
    [`${prefix}Receipts/expired`]: { expiresAt: new Date(now - 1) },
    [`${prefix}Receipts/valid`]: { expiresAt: new Date(now + 1) },
    [`${prefix}Connections/owner`]: { ...expired, tokens: { encrypted: true } },
    [`${prefix}Installations/owner`]: expired,
    'bapmunnaHouseholds/owner': expired,
  });
  const result = await firestoreStore(fixture.db, () => now).cleanupExpired();
  assert.equal(result.deleted, 3);
  assert.equal(result.scanned, 4);
  assert.equal(result.limitReached, false);
  assert.deepEqual(
    fixture.queried.map((x) => x.name),
    ['States', 'Pending', 'Locks', 'Receipts'].map((x) => prefix + x),
  );
  assert.ok(fixture.documents.has(`${prefix}Connections/owner`));
  assert.ok(fixture.documents.has(`${prefix}Installations/owner`));
  assert.ok(fixture.documents.has('bapmunnaHouseholds/owner'));
  assert.ok(fixture.documents.has(`${prefix}States/valid`));
  assert.ok(fixture.documents.has(`${prefix}Locks/active`));
  assert.ok(fixture.documents.has(`${prefix}Receipts/valid`));
});

test('cleanup rechecks a renewed lock inside the transaction before deleting', async () => {
  const path = `${prefix}Locks/renewed`;
  const fixture = fakeDatabase(
    { [path]: expired },
    {
      beforeTransaction(documents) {
        documents.set(path, {
          owner: 'new-owner',
          until: now + 120000,
          expiresAt: new Date(now + 120000),
        });
      },
    },
  );
  const result = await firestoreStore(fixture.db, () => now).cleanupExpired();
  assert.equal(result.scanned, 1);
  assert.equal(result.deleted, 0);
  assert.equal(fixture.documents.get(path).owner, 'new-owner');
});

test('cleanup enforces a global candidate budget and makes repeated runs idempotent', async () => {
  const fixture = fakeDatabase(
    Object.fromEntries(
      ['States/a', 'Locks/b', 'Receipts/c', 'Receipts/d'].map((path) => [prefix + path, expired]),
    ),
  );
  const store = firestoreStore(fixture.db, () => now);
  const first = await store.cleanupExpired({ limit: 3 });
  assert.equal(first.scanned, 3);
  assert.equal(first.deleted, 3);
  assert.equal(first.limitReached, true);
  assert.equal(fixture.documents.size, 1);
  const second = await store.cleanupExpired({ limit: 3 });
  assert.equal(second.deleted, 1);
  assert.equal(second.limitReached, false);
  assert.equal((await store.cleanupExpired({ limit: 3 })).deleted, 0);
  for (const limit of [0, -1, 1.5, 5001, Infinity, '50'])
    await assert.rejects(() => store.cleanupExpired({ limit }), RangeError);
});

test('cleanup transactions stay at 100 documents while a bounded larger batch is drained', async () => {
  const fixture = fakeDatabase(
    Object.fromEntries(Array.from({ length: 237 }, (_, i) => [`${prefix}Receipts/${i}`, expired])),
  );
  const result = await firestoreStore(fixture.db, () => now).cleanupExpired({ limit: 237 });
  assert.equal(result.deleted, 237);
  assert.deepEqual(
    fixture.transactions.map((x) => x.reads.length),
    [100, 100, 37],
  );
  assert.deepEqual(
    fixture.transactions.map((x) => x.deletes.length),
    [100, 100, 37],
  );
});
