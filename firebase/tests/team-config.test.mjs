import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { teamFirebaseConfig } from '../provider/team-config.mjs';
import { servingConfig } from '../../scripts/publish-hosting.mjs';

const project = 'demo-warming-up';
const valid = {
  projectId: project,
  authDomain: project + '.firebaseapp.com',
  apiKey: 'AIza' + 'A'.repeat(35),
  appId: '1:1000:web:1234abcd',
};
test('initialization keeps only the approved project settings', () => {
  assert.deepEqual(teamFirebaseConfig({...valid, databaseURL: 'https://unused.example.test'}, project), valid);
});
test('a mismatched project, authorization domain, or incomplete app is rejected', () => {
  for (const changed of [null, {projectId: 'demo-other'}, {authDomain: 'different.example.test'}, {appId: ''}, {apiKey: 'example'}]) {
    assert.throws(() => teamFirebaseConfig(changed && {...valid, ...changed}, project));
  }
});
test('public readiness stays separate from private SmartThings requests and retains their exact paths', async () => {
  const { hosting } = JSON.parse(await readFile(new URL('../../firebase.json', import.meta.url), 'utf8'));
  const status = JSON.parse(await readFile(new URL('../../public/service-status/smartthings.json', import.meta.url), 'utf8'));
  assert.equal(status.projectId, hosting.site);
  assert.equal(status.enabled, false);
  assert.equal(status.connectionReady, false);
  const readyRoute = { regex: '^/api/smartthings/config/?$', destination: '/service-status/smartthings.json' };
  const config = servingConfig({ ...hosting, rewrites: [readyRoute] });
  assert.deepEqual(config.rewrites, [{ regex: readyRoute.regex, path: readyRoute.destination }]);
  assert(!config.trailingSlashBehavior);
  assert.equal(config.headers.find(item => item.glob === '/api/smartthings/**').headers['Cache-Control'], 'private, no-store');
  for (const action of ['status', 'start', 'callback', 'events']) {
    assert(!new RegExp(config.rewrites[0].regex).test('/api/smartthings/' + action));
  }
  const run = { serviceId: 'warming-up-smartthings', region: 'asia-northeast3' };
  const gateway = { source: '/api/smartthings/**', run };
  assert.deepEqual(servingConfig({...hosting, rewrites: [gateway]}).rewrites, [{glob: gateway.source, run}]);
  assert.throws(() => servingConfig({...hosting, rewrites: [{...gateway, run: {...run, serviceId: 'other-app'}}]}));
});
