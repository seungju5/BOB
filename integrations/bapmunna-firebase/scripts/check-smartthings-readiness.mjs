import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { servingConfig } from '../../../apps/warming-up/scripts/publish-hosting.mjs';
import { CONSENT, readConfig } from '../../../apps/warming-up/server/smartthings/security.mjs';

const teamApp = new URL('../../../apps/warming-up/', import.meta.url);
async function readJson(name) {
  return JSON.parse(await readFile(new URL(name, teamApp), 'utf8'));
}

export async function checkTeamSource() {
  const [aliases, { hosting }, fallback] = await Promise.all([
    readJson('.firebaserc'), readJson('firebase.json'), readJson('public/service-status/smartthings.json'),
  ]);
  const runtime = readConfig({ FIREBASE_PROJECT_ID: aliases.projects.default });
  assert.equal(aliases.projects.default, runtime.projectId, 'Unexpected default Firebase project.');
  assert.equal(hosting.site, runtime.projectId, 'Unexpected Hosting site.');
  const [route] = servingConfig(hosting).rewrites;
  assert.equal(runtime.origin, 'https://' + hosting.site + '.web.app');
  assert.equal(fallback.projectId, runtime.projectId);
  assert.equal(fallback.consentVersion, CONSENT);
  assert.equal(fallback.mode, 'hosting-only');
  assert.equal(fallback.enabled, false, 'The static response cannot enable SmartThings.');
  assert.equal(fallback.connectionReady, false, 'The static response cannot open OAuth.');
  return {
    source: 'checked_in_team_configuration',
    projectId: runtime.projectId,
    hostingSite: hosting.site,
    hostingRoute: route,
    redirectUri: runtime.redirect,
    webhookUrl: runtime.origin + '/api/smartthings/events',
    liveEndpointsChecked: false,
    registrationChecked: false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.includes('--offline')) {
    assert.deepEqual(args, ['--offline'], 'Use --offline on its own.');
    console.log(JSON.stringify(await checkTeamSource(), null, 2));
  } else {
    await import('../../../apps/warming-up/scripts/check-smartthings.mjs');
  }
}
