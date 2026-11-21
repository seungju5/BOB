// Publish one checked static export using the Firebase Hosting REST API.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join, matchesGlob, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const site = 'warming-up-bapmunna';
const projectNumber = '446376297496';
const repository = 'seungju5/BOB';
const branch = 'codex/warming-up-firebase';
const sitePath = `sites/${site}`;
const api = 'https://firebasehosting.googleapis.com/v1beta1/';
const uploadOrigin = 'https://upload-firebasehosting.googleapis.com';
const headUrl = `https://api.github.com/repos/${repository}/git/ref/heads/${branch}`;

function siteResource(name) {
  assert.equal(typeof name, 'string', 'Missing Firebase resource name.');
  for (const project of [projectNumber, site]) {
    if (name.startsWith(`projects/${project}/`)) return name.slice(`projects/${project}/`.length);
  }
  return name;
}

export function servingConfig(hosting) {
  assert.equal(hosting.site, site);
  assert.equal(hosting.public, 'out');
  assert.deepEqual(Object.keys(hosting).sort(), ['headers', 'ignore', 'public', 'site', 'trailingSlash']);
  assert.equal(typeof hosting.trailingSlash, 'boolean');
  assert(Array.isArray(hosting.ignore) && hosting.ignore.every(pattern => typeof pattern === 'string'));
  return {
    trailingSlashBehavior: hosting.trailingSlash ? 'ADD' : 'REMOVE',
    headers: hosting.headers.map(rule => ({
      glob: rule.source,
      headers: Object.fromEntries(rule.headers.map(({ key, value }) => [key, value])),
    })),
  };
}

export async function collectFiles(root, ignore) {
  assert((await lstat(root)).isDirectory(), 'Expected a static-export directory.');
  const files = new Map();
  const blobs = new Map();
  async function walk(relative) {
    for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      assert(!entry.isSymbolicLink(), 'The release contains a symbolic link.');
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || ignore.some(pattern => matchesGlob(name, pattern))) continue;
      if (entry.isDirectory()) {
        await walk(name);
        continue;
      }
      assert(entry.isFile(), 'Unexpected file type in release.');
      const compressed = gzipSync(await readFile(join(root, name)), { level: 9 });
      const hash = createHash('sha256').update(compressed).digest('hex');
      files.set('/' + name, hash);
      blobs.set(hash, compressed);
    }
  }
  await walk('');
  for (const name of ['/index.html', '/login/index.html', '/connect/index.html']) {
    assert(files.has(name), 'Missing exported page ' + name);
  }
  return { files, blobs };
}

function uploadBase(value, version) {
  const url = new URL(value);
  const resourcePaths = [version, ...[site, projectNumber].map(id => `projects/${id}/${version}`)];
  assert(url.origin === uploadOrigin && !url.username && !url.password && !url.search && !url.hash
    && resourcePaths.some(path => url.pathname === `/upload/${path}/files`), 'Unexpected Hosting upload destination.');
  return url.href;
}

export async function publish({ files, blobs }, config, { sha, firebaseToken, githubToken, fetchImpl = fetch }) {
  assert(/^[a-f0-9]{40}$/.test(sha), 'Expected a full Git commit.');
  assert(firebaseToken && githubToken, 'Missing CI authentication.');

  async function request(label, url, { method = 'GET', json, bytes, retry = method === 'GET' } = {}) {
    const onGitHub = url === headUrl;
    const origin = new URL(url).origin;
    assert(onGitHub || url.startsWith(api) || origin === uploadOrigin, 'Unexpected API endpoint.');
    const headers = { authorization: 'Bearer ' + (onGitHub ? githubToken : firebaseToken) };
    if (!onGitHub) headers['x-goog-user-project'] = site;
    if (json !== undefined) headers['content-type'] = 'application/json';
    if (bytes) headers['content-type'] = 'application/octet-stream';
    const body = bytes ?? (json === undefined ? undefined : JSON.stringify(json));
    for (let attempt = 1; ; attempt++) {
      let response;
      try {
        response = await fetchImpl(url, { method, body, headers, redirect: 'error', signal: AbortSignal.timeout(60_000) });
      } catch {
        if (!retry || attempt >= 3) throw new Error(label + ' failed at the network layer.');
      }
      if (response?.ok) {
        if (bytes || method === 'DELETE') {
          await response.arrayBuffer();
          return;
        }
        return await response.json();
      }
      if (response && (!retry || attempt >= 3 || ![429, 500, 502, 503, 504].includes(response.status))) {
        const { error } = await response.json().catch(() => ({}));
        const reasons = [error?.status, ...(error?.details ?? []).flatMap(d => [d.reason, d.metadata?.permission])];
        const detail = reasons.filter(reason => typeof reason === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{1,100}$/.test(reason));
        throw new Error(`${label} returned HTTP ${response.status} ${detail.join(' ')}`.trim());
      }
      if (response) await response.body?.cancel();
      await delay(attempt * 500);
    }
  }

  async function assertBranchHead() {
    const ref = await request('GitHub branch head', headUrl);
    assert(ref.object?.sha === sha, 'A newer branch head exists. Stopping this release.');
  }
  async function latestRelease() {
    const list = await request('Latest Hosting release', api + sitePath + '/releases?pageSize=1');
    return list.releases?.[0] ?? null;
  }
  await assertBranchHead();
  const target = await request('Verify team Hosting site', api + `projects/${projectNumber}/${sitePath}`);
  assert.equal(siteResource(target.name), sitePath);
  const baseline = await latestRelease();
  const created = await request('Create draft Hosting version', api + sitePath + '/versions', { method: 'POST', json: { config } });
  const version = siteResource(created.name);
  assert(version.startsWith(sitePath + '/versions/') && /^[A-Za-z0-9_-]+$/.test(version.slice((sitePath + '/versions/').length)), 'Unexpected Hosting version.');
  assert.equal(created.status, 'CREATED');
  const versionUrl = api + version;
  let finalized = false;
  try {
    const entries = [...files];
    for (let start = 0; start < entries.length; start += 1000) {
      const batch = Object.fromEntries(entries.slice(start, start + 1000));
      const result = await request('Register file hashes', versionUrl + ':populateFiles', { method: 'POST', json: { files: batch }, retry: true });
      const missing = [...new Set(result.uploadRequiredHashes ?? [])];
      if (!missing.length) continue;
      const prefix = uploadBase(result.uploadUrl, version);
      const batchHashes = new Set(Object.values(batch));
      assert(missing.every(hash => batchHashes.has(hash) && blobs.has(hash)), 'Firebase requested an unknown file hash.');
      for (let index = 0; index < missing.length; index += 8) {
        await Promise.all(missing.slice(index, index + 8).map(hash => request(
          'Upload compressed file', prefix + '/' + hash, { method: 'POST', bytes: blobs.get(hash), retry: true },
        )));
      }
    }
    await assertBranchHead();
    const ready = await request('Finalize complete draft', versionUrl + '?updateMask=status', { method: 'PATCH', json: { status: 'FINALIZED' } });
    finalized = true;
    assert.equal(siteResource(ready.name), version);
    assert.equal(ready.status, 'FINALIZED');
    assert.equal(Number(ready.fileCount), files.size, 'Firebase file count differs from the checked export.');

    // The live site changes only here. Preserve another publisher's newer release.
    await assertBranchHead();
    assert.equal((await latestRelease())?.name, baseline?.name, 'The live release changed during the upload.');
    let release;
    try {
      release = await request('Publish finalized version', api + sitePath + '/releases?versionName=' + encodeURIComponent(version), {
        method: 'POST', json: { message: `${repository}@${sha}` },
      });
    } catch (error) {
      // A release may have succeeded even if its HTTP response was interrupted.
      release = await latestRelease();
      if (!release?.version || siteResource(release.version.name) !== version) throw error;
    }
    assert.equal(siteResource(release.version.name), version);
    console.log(`Released ${version} from ${sha} (${files.size} files).`);
  } catch (error) {
    if (!finalized) {
      // A timed-out finalization can already have succeeded. Delete only our still-open draft.
      // Firebase automatically abandons unfinished versions after twelve hours if cleanup fails.
      await request('Check incomplete draft', versionUrl).then(async draft => {
        if (siteResource(draft.name) === version && draft.status === 'CREATED') {
          await request('Remove incomplete draft', versionUrl, { method: 'DELETE' });
        }
      }).catch(() => {});
    }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [mode, outputDirectory] = process.argv.slice(2);
    assert(['--check', '--publish'].includes(mode) && outputDirectory && process.argv.length === 4, 'Use --check or --publish followed by the export directory.');
    const { hosting } = JSON.parse(await readFile(new URL('../firebase.json', import.meta.url), 'utf8'));
    const config = servingConfig(hosting);
    const manifest = await collectFiles(resolve(outputDirectory), hosting.ignore);
    if (mode === '--check') {
      console.log(`Verified ${manifest.files.size} files for ${site}.`);
    } else {
      assert(process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_EVENT_NAME === 'push'
        && process.env.GITHUB_REPOSITORY_ID === '1421511921' && process.env.GITHUB_REPOSITORY_OWNER_ID === '342332225'
        && process.env.GITHUB_REF === 'refs/heads/' + branch, 'Expected the team deployment workflow.');
      await publish(manifest, config, { sha: process.env.GITHUB_SHA, githubToken: process.env.GH_TOKEN, firebaseToken: process.env.HOSTING_ACCESS_TOKEN });
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
