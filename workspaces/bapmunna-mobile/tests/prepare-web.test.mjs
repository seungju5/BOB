import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const execute = promisify(execFile);
const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function fixture(run) {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'bapmunna-native-manifest-'));
  const mobile = path.join(repo, 'workspaces/mobile');
  const exported = path.join(repo, 'out');
  try {
    await mkdir(path.join(mobile, 'www'), { recursive: true });
    await mkdir(path.join(repo, 'public/brand'), { recursive: true });
    await mkdir(path.join(exported, 'brand'), { recursive: true });
    await mkdir(path.join(exported, 'health'), { recursive: true });
    await cp(path.join(workspace, 'scripts'), path.join(mobile, 'scripts'), { recursive: true });
    await writeFile(path.join(mobile, 'www/previous.txt'), 'previous validated bundle');
    await writeFile(path.join(exported, 'health/index.html'), '<html><head><link rel="manifest" href="/manifest.webmanifest"></head><body>original app</body></html>');
    const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0h1v1H0z"/></svg>';
    await writeFile(path.join(repo, 'public/brand/icon.svg'), icon);
    await writeFile(path.join(exported, 'brand/icon.svg'), icon);
    const manifest = { name: 'Synthetic app', scope: './', start_url: './', icons: [{ src: 'brand/icon.svg', sizes: 'any', type: 'image/svg+xml' }] };
    const saveManifest = value => writeFile(path.join(exported, 'manifest.webmanifest'), JSON.stringify(value));
    await saveManifest(manifest);
    const prepare = () => execute(process.execPath, [path.join(mobile, 'scripts/prepare-web.mjs'), 'out']);
    await run({ repo, mobile, exported, manifest, saveManifest, prepare });
  } finally { await rm(repo, { recursive: true, force: true }); }
}

test('generated web manifest and its local icon are copied with the original app', async () => fixture(async ({ mobile, manifest, prepare }) => {
  await prepare();
  assert.deepEqual(JSON.parse(await readFile(path.join(mobile, 'www/manifest.webmanifest'), 'utf8')), manifest);
  assert.match(await readFile(path.join(mobile, 'www/brand/icon.svg'), 'utf8'), /<svg/);
  assert.match(await readFile(path.join(mobile, 'www/index.html'), 'utf8'), /Content-Security-Policy/);
}));

test('missing referenced manifest asset fails before replacing a validated bundle', async () => fixture(async ({ mobile, exported, prepare }) => {
  await rm(path.join(exported, 'brand/icon.svg'));
  await assert.rejects(prepare(), /Manifest asset is missing/);
  assert.equal(await readFile(path.join(mobile, 'www/previous.txt'), 'utf8'), 'previous validated bundle');
}));

test('remote manifest assets are rejected before packaging', async () => fixture(async ({ mobile, manifest, saveManifest, prepare }) => {
  await saveManifest({ ...manifest, icons: [{ src: 'https://example.invalid/remote.png' }] });
  await assert.rejects(prepare(), /Manifest assets must be packaged locally/);
  assert.equal(await readFile(path.join(mobile, 'www/previous.txt'), 'utf8'), 'previous validated bundle');
}));

test('shortcut icons and screenshots must also reference included local files', async () => fixture(async ({ manifest, saveManifest, prepare }) => {
  await saveManifest({ ...manifest, shortcuts: [{ name: 'Settings', url: '/settings/', icons: [{ src: 'brand/missing.svg' }] }] });
  await assert.rejects(prepare(), /Manifest asset is not allowlisted/);
  await saveManifest({ ...manifest, screenshots: [{ src: 'https://example.invalid/remote.png' }] });
  await assert.rejects(prepare(), /Manifest assets must be packaged locally/);
}));
