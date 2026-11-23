import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkTeamSource } from '../../scripts/check-smartthings-readiness.mjs';
import { publish, servingConfig } from '../../../../apps/warming-up/scripts/publish-hosting.mjs';
import { readConfig as readTeamRuntime } from '../../../../apps/warming-up/server/smartthings/security.mjs';
import { readConfig } from '../security.mjs';
import { configured } from '../service.mjs';

const teamProject = 'warming-up-bapmunna';
const teamOrigin = 'https://warming-up-bapmunna.web.app';
const { hosting } = JSON.parse(await readFile(new URL('../../../../apps/warming-up/firebase.json', import.meta.url), 'utf8'));

test('offline check uses the team site and runtime without granting registration status', async () => {
  const settings = await checkTeamSource();
  assert.equal(settings.projectId, teamProject);
  assert.equal(settings.hostingSite, teamProject);
  assert.equal(settings.redirectUri, teamOrigin + '/api/smartthings/callback');
  assert.equal(settings.webhookUrl, teamOrigin + '/api/smartthings/events');
  assert.equal(settings.registrationChecked, false);
  assert.equal(settings.liveEndpointsChecked, false);
});

test('team configuration rejects a different Hosting site, service, Firebase project or OAuth origin', () => {
  assert.throws(() => servingConfig({ ...hosting, site: 'another-project' }));
  const wrongGateway = { source: '/api/smartthings/**', run: { serviceId: 'another-service', region: 'asia-northeast3' } };
  assert.throws(() => servingConfig({ ...hosting, rewrites: [wrongGateway] }));
  for (const key of ['FIREBASE_PROJECT_ID', 'GOOGLE_CLOUD_PROJECT', 'GCLOUD_PROJECT']) {
    assert.throws(() => readTeamRuntime({ [key]: 'another-project' }));
  }
  assert.throws(() => readTeamRuntime({ PUBLIC_ORIGIN: 'https://other.example.test' }));
  assert.throws(() => readTeamRuntime({ APP_URL: teamOrigin + '/unregistered/' }));
  assert.equal(readTeamRuntime().connectionEnabled, false);
});

test('team publisher retries the ownership read and stops before a write when another project owns the site', async () => {
  const sha = 'a'.repeat(40);
  const ownerPath = '/v1beta1/projects/446376297496/sites/' + teamProject;
  const calls = [];
  async function fetchImpl(url, { method }) {
    const { hostname, pathname } = new URL(url);
    calls.push({ method, hostname, pathname });
    if (hostname === 'api.github.com') return Response.json({ object: { sha } });
    if (calls.length === 2) return Response.json({}, { status: 503 });
    return Response.json({ name: 'projects/111111111111/sites/' + teamProject });
  }
  const artifact = { files: new Map(), blobs: new Map() };
  await assert.rejects(publish(artifact, servingConfig(hosting), {
    sha, firebaseToken: 'fixture', githubToken: 'fixture', fetchImpl,
  }), { code: 'ERR_ASSERTION' });
  assert.deepEqual(calls.map(call => call.method), ['GET', 'GET', 'GET']);
  for (const call of calls.slice(1)) {
    assert.equal(call.hostname, 'firebasehosting.googleapis.com');
    assert.equal(call.pathname, ownerPath);
  }
});

test('standalone adapter requires an explicit callback origin before exposing configured OAuth', () => {
  const env = {
    FIREBASE_PROJECT_ID: 'demo-bapmunna', SMARTTHINGS_APP_ID: 'fixture-app',
    SMARTTHINGS_CLIENT_ID: 'fixture-client', SMARTTHINGS_CLIENT_SECRET: 'fixture-secret',
    SMARTTHINGS_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  };
  assert.equal(configured(readConfig(env)), false);
  for (const url of [{ APP_URL: 'https://app.example.test/connect/' }, { PUBLIC_ORIGIN: 'https://app.example.test' }]) {
    const config = readConfig({ ...env, ...url });
    assert.equal(configured(config), true);
    assert.equal(config.redirect, 'https://app.example.test/api/smartthings/callback');
  }
});

test('container build context only includes reviewed runtime files', async () => {
  const ignore = await readFile(new URL('../.dockerignore', import.meta.url), 'utf8');
  const rules = ignore.split('\n').filter(line => line && !line.startsWith('#'));
  const allowed = ['.dockerignore', 'Dockerfile', 'package.json', 'package-lock.json', 'index.mjs',
    'http-adapter.mjs', 'security.mjs', 'service.mjs', 'smartthings.mjs', 'store.mjs'];
  assert.equal(rules.shift(), '**');
  assert.deepEqual(rules.sort(), allowed.map(name => '!' + name).sort());
  const dockerfile = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8');
  assert.doesNotMatch(dockerfile, /COPY\s+\*|COPY\s+\.\s/);
});
