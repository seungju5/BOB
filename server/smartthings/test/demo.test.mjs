import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoApi } from '../demo.mjs';
import { smartThingsClient } from '../smartthings.mjs';

const origin = 'http://127.0.0.1:4317';
const initial = Date.UTC(2026, 10, 26, 8);
const measuredAt = initial - 5000;
const pat = 'test-fixture-local-only';
const components = ['one', 'two'].map(id => ({
  id, capabilities: [{ id: 'powerMeter' }], categories: [{ name: 'SmartPlug', categoryType: 'manufacturer' }],
}));
const device = { deviceId: 'demo-fixture', type: 'VIPER', label: '테스트 멀티탭', components };
function outlet(value) {
  return { powerMeter: { power: { value, unit: 'W', timestamp: new Date(measuredAt).toISOString() } } };
}
function setup(t, { items = [device], status, listCode } = {}) {
  let time = initial;
  const paths = [];
  const smartthings = smartThingsClient({}, async (url, options) => {
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.Authorization, 'Bearer ' + pat);
    assert.equal(new URL(url).origin, 'https://api.smartthings.com');
    const path = new URL(url).pathname + new URL(url).search;
    paths.push(path);
    if (path === '/v1/devices?capability=powerMeter')
      return listCode ? Response.json({ detail: pat }, { status: listCode }) : Response.json({ items });
    assert.equal(path, '/v1/devices/demo-fixture/status');
    return status ? await status() : Response.json({ components: { one: outlet(10), two: outlet(930) } });
  });
  const api = createDemoApi({ origin, smartthings, now: () => time });
  t.after(api.clear);
  const call = (action, body, grant, overrides) => api.handle(new Request(origin + '/api/demo/smartthings/' + action, {
    method: 'POST',
    headers: { host: new URL(origin).host, origin, 'content-type': 'application/json', ...(grant && { authorization: 'Bearer ' + grant }), ...overrides },
    body: JSON.stringify(body),
  }));
  const prepare = async () => {
    const response = await call('prepare', { pat });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return response.json();
  };
  return { paths, call, prepare, advance: ms => { time += ms; } };
}

test('meter selection is scoped to the listed outlet and returns only a signal and timestamps', async t => {
  const { paths, call, prepare } = setup(t);
  const prepared = await prepare();
  assert.equal(prepared.choices.length, 2);
  assert.deepEqual(prepared.choices[1], { index: 1, label: '테스트 멀티탭 · two' });
  assert.doesNotMatch(JSON.stringify(prepared), /test-fixture-local-only|demo-fixture/);
  assert.equal((await call('read', { choice: 'another-device' }, prepared.grant)).status, 400);
  assert.deepEqual(await (await call('read', { choice: 1 }, prepared.grant)).json(), {
    deviceKind: 'recognized', checkedAt: initial, reading: { cooking: true, measuredAt }, energy: null,
  });
  assert.equal((await call('read', { choice: 0 }, prepared.grant)).status, 410);
  assert.deepEqual(paths, ['/v1/devices?capability=powerMeter', '/v1/devices/demo-fixture/status']);
});

test('overlapping reads consume the grant before the upstream response arrives', async t => {
  const entered = Promise.withResolvers(), reply = Promise.withResolvers();
  const { paths, call, prepare } = setup(t, { status: () => { entered.resolve(); return reply.promise; } });
  const { grant } = await prepare();
  const first = call('read', { choice: 0 }, grant);
  await entered.promise;
  assert.equal((await call('read', { choice: 0 }, grant)).status, 410);
  reply.resolve(Response.json({ components: { one: outlet(0) } }));
  assert.equal((await (await first).json()).reading.cooking, false);
  assert.equal(paths.length, 2);
});

test('another setup, cancellation and expiration retire unused grants', async t => {
  const { paths, call, prepare, advance } = setup(t);
  const old = await prepare(), current = await prepare();
  assert.notEqual(old.grant, current.grant);
  assert.equal((await call('read', { choice: 0 }, old.grant)).status, 410);
  assert.equal((await call('cancel', {}, current.grant)).status, 200);
  assert.equal((await call('read', { choice: 0 }, current.grant)).status, 410);
  const end = await prepare();
  advance(end.expiresAt - initial);
  assert.equal((await call('read', { choice: 0 }, end.grant)).status, 410);
  assert.ok(paths.every(path => !path.endsWith('/status')));
});

test('rejects foreign origins, host, URL credentials and non-JSON forms before contacting Samsung', async t => {
  const { paths, call } = setup(t);
  for (const headers of [{ origin: 'https://elsewhere.invalid' }, { host: 'elsewhere.invalid' }, { origin: '' }])
    assert.equal((await call('prepare', { pat }, null, headers)).status, 403);
  assert.equal((await call('prepare?pat=test', {}, null)).status, 404);
  assert.equal((await call('prepare', { pat }, null, { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await call('prepare', { pat: '' })).status, 400);
  assert.equal(paths.length, 0);
});

test('permission and empty device list errors preserve no upstream body or grant', async t => {
  for (const [options, code] of [[{ listCode: 401 }, 'reconnect_required'], [{ listCode: 403 }, 'permission_required'], [{ items: [] }, 'no_meters']]) {
    const { call } = setup(t, options);
    assert.deepEqual(await (await call('prepare', { pat })).json(), { error: code });
  }
});

test('a failed Samsung status call still consumes the one-time grant', async t => {
  const { call, prepare, paths } = setup(t, { status: () => Response.json({ detail: pat }, { status: 429 }) });
  const { grant } = await prepare();
  const result = await call('read', { choice: 0 }, grant);
  assert.equal(result.status, 429);
  assert.deepEqual(await result.json(), { error: 'rate_limited' });
  assert.equal((await call('read', { choice: 0 }, grant)).status, 410);
  assert.equal(paths.length, 2);
});

test('marks virtual devices and leaves missing measurements empty', async t => {
  const { call, prepare } = setup(t, { items: [{ ...device, type: 'VIRTUAL' }], status: () => Response.json({ components: {} }) });
  const { grant } = await prepare();
  assert.deepEqual(await (await call('read', { choice: 0 }, grant)).json(), {
    deviceKind: 'virtual', checkedAt: initial, reading: null, energy: null,
  });
});
