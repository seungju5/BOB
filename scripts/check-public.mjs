// Verify the independent team app before publishing its static export.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEAM_PROJECT_ID, TEAM_SITE_URL, TEAM_SUPPORT_EMAIL } from '../config/team.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceOnly = process.argv.length === 3 && process.argv[2] === '--source-only';
assert(process.argv.length === 2 || sourceOnly, 'Use --source-only or no arguments.');
const firebase = JSON.parse(await readFile(join(root, 'firebase.json'), 'utf8'));
const aliases = JSON.parse(await readFile(join(root, '.firebaserc'), 'utf8'));
assert.equal(TEAM_PROJECT_ID, 'warming-up-bapmunna', 'Expected the independent Warming Up project');
assert.equal(TEAM_SITE_URL, 'https://' + TEAM_PROJECT_ID + '.web.app');
assert.equal(aliases.projects.default, TEAM_PROJECT_ID);
assert.deepEqual(Object.keys(aliases.projects), ['default'], 'Unexpected Firebase project alias');
assert.equal(firebase.hosting.site, TEAM_PROJECT_ID);
assert.equal(firebase.hosting.public, 'out');
assert.equal(firebase.firestore.rules, 'firebase/firestore.rules');

const hostingDomains = new Set([
  new URL(TEAM_SITE_URL).hostname,
  TEAM_PROJECT_ID + '.firebaseapp.com',
  TEAM_PROJECT_ID + '.appspot.com',
  TEAM_PROJECT_ID + '.firebasestorage.app',
]);
const projectHosts = /\b[a-z0-9][a-z0-9-]*\.(?:web\.app|firebaseapp\.com|appspot\.com|firebasestorage\.app|firebaseio\.com|vercel\.app|supabase\.co)\b/gi;
const gmail = /[\w.+-]+@gmail\.com\b/gi;
const secret = /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----|\b(?:ghp_[A-Za-z\d]{36}|github_pat_[A-Za-z\d_]{45,}|ya29\.[A-Za-z\d._-]{30,})/;
const prohibitedFiles = /(?:^|\/)(?:\.[^/]+|node_modules|service[-_]?account[^/]*\.json)(?:\/|$)|\.(?:env|apk|aab|ipa|jks|keystore|p12|pem|mobileprovision|bak|sqlite|zip)$/i;
const textFormats = new Set(['.css','.html','.js','.json','.jsx','.kt','.mjs','.rules','.swift','.svg','.ts','.tsx','.txt','.webmanifest','.xml']);
let checked = 0;

function routeName(directory, file) {
  return relative(directory, file).split(sep).join('/');
}

async function* files(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* files(fullPath);
    } else {
      assert(entry.isFile(), 'Unexpected symbolic link or non-file: ' + relative(root, fullPath));
      yield fullPath;
    }
  }
}

async function inspectFile(path, directory, publicFile) {
  const relativePath = routeName(directory, path);
  if (publicFile) {
    assert(!prohibitedFiles.test(relativePath) && !relativePath.endsWith('.map'), 'Private or non-distributable file: ' + relativePath);
  }
  if (!textFormats.has(extname(path))) return;
  const text = await readFile(path, 'utf8');
  for (const match of text.matchAll(projectHosts)) {
    assert(hostingDomains.has(match[0].toLowerCase()), 'Unexpected cloud project reference in ' + relativePath);
  }
  for (const match of text.matchAll(gmail)) {
    assert(match[0].toLowerCase() === TEAM_SUPPORT_EMAIL.toLowerCase(), 'Unapproved public contact in ' + relativePath);
  }
  assert(!secret.test(text), 'Private credential in ' + relativePath);
  assert(!/(?:file:\/\/\/|\/Users\/)[^\s"'<>]+\/(?:Documents|Downloads|\.config)\//.test(text), 'Personal filesystem path in ' + relativePath);
  checked++;
}

const publicAssets = new Set();
for (const name of ['app', 'components', 'config', 'firebase', 'lib', 'packages', 'public']) {
  for await (const file of files(join(root, name))) {
    if (name === 'public') {
      const asset = routeName(join(root, name), file);
      assert(/^(?:brand\/[^/]+\.(?:png|webp|woff2|ttf|txt)|walking\/[^/]+\.(?:jpg|png)|walking\/wardrobe\/(?:body|item|trail)-[a-z]+(?:-[a-z]+)*\.webp|bapmunna-app-qr\.(?:png|svg)|icon\.svg|sw\.js|notification-content\.js|service-status\/smartthings\.json)$/.test(asset), 'Unexpected public asset: ' + asset);
      publicAssets.add(asset);
    }
    await inspectFile(file, root, name === 'public');
  }
}

const readinessAsset = 'service-status/smartthings.json';
const readiness = JSON.parse(await readFile(join(root, 'public', readinessAsset), 'utf8'));
assert.equal(readiness.projectId, TEAM_PROJECT_ID);
assert.equal(readiness.enabled, false, 'Only a running server can report a working integration.');
assert.equal(readiness.connectionReady, false);
assert.equal(readiness.mode, 'hosting-only');

if (!sourceOnly) {
  const output = resolve(root, firebase.hosting.public);
  const expectedPages = new Set(['404.html', '404/index.html', '500.html', '500/index.html', '_not-found/index.html', '_global-error/index.html']);
  for await (const file of files(join(root, 'app'))) {
    const nameInApp = routeName(join(root, 'app'), file);
    if (posix.basename(nameInApp) !== 'page.tsx') continue;
    const route = nameInApp.split('/').filter(segment => !/^\(.+\)$/.test(segment));
    route[route.length - 1] = 'index.html';
    const name = route.join('/');
    expectedPages.add(name);
    const contents = await readFile(join(output, name), 'utf8');
    assert(contents.includes('name="viewport"') && contents.includes('Warming Up</title>'), 'Incorrect mobile page or title: ' + name);
  }
  for await (const file of files(output)) {
    const name = routeName(output, file);
    await inspectFile(file, output, true);
    if (expectedPages.has(name) || name === 'manifest.webmanifest' || publicAssets.has(name)) continue;
    if (name.startsWith('_next/static/')) {
      const compiled = join(root, '.next', name.slice('_next/'.length));
      assert((await readFile(file)).equals(await readFile(compiled)), 'Unexpected compiled asset: ' + name);
      continue;
    }
    const directory = posix.dirname(name);
    const page = posix.join(directory, 'index.html');
    assert(expectedPages.has(page) && /^(?:index|__next\.[^/]+)\.txt$/.test(posix.basename(name)), 'File outside the team app: ' + name);
  }
  const manifest = JSON.parse(await readFile(join(output, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.name, 'Warming Up');
  for (const key of ['start_url', 'scope', 'id']) assert.equal(new URL(manifest[key], TEAM_SITE_URL).href, TEAM_SITE_URL + '/');
  for (const page of ['privacy/index.html', 'health/privacy/index.html']) {
    assert((await readFile(join(output, page), 'utf8')).includes('mailto:' + TEAM_SUPPORT_EMAIL), 'Missing team contact in ' + page);
  }
  for (const name of ['bapmunna-app-qr.png', 'bapmunna-app-qr.svg', 'brand/bunny.png', readinessAsset]) {
    assert((await readFile(join(output, name))).equals(await readFile(join(root, 'public', name))), 'Public asset differs from source: ' + name);
  }
}

console.log(`Warming Up ${sourceOnly ? 'source' : 'source and static export'} verified (${checked} text files).`);
