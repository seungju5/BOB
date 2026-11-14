import { cp, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isAllowedWebAsset, protectHtml } from './web-assets.mjs';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(workspace, '../..');
const source = path.resolve(repo, process.argv[2] ?? 'out');
const destination = path.join(workspace, 'www');
if (!source.startsWith(`${repo}${path.sep}`) || source.startsWith(workspace)) throw new Error('Use the original app export inside this repository');
if (!(await stat(path.join(source, 'health/index.html')).catch(() => null))?.isFile()) {
  throw new Error('Original /health/ export is missing. Build the root app with BAPMUNNA_STATIC_EXPORT=1 and an empty NEXT_PUBLIC_APP_BASE_PATH first. No substitute UI or native login is generated.');
}
if ((await realpath(source)) !== source) throw new Error('Export symlinks are not accepted');
const pending = [];
const publicFiles = new Set();
const generatedManifest = 'manifest.webmanifest';
async function discoverPublic(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const filename = path.join(folder, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Public assets contain a symlink');
    if (entry.isDirectory()) await discoverPublic(filename);
    else publicFiles.add(path.relative(path.join(repo, 'public'), filename).split(path.sep).join('/'));
  }
}
await discoverPublic(path.join(repo, 'public'));
// Next emits this App Router metadata file outside public/. Preserve it only
// after every referenced image is known to be part of the local web bundle.
const manifest = JSON.parse(await readFile(path.join(source, generatedManifest), 'utf8'));
const manifestBase = new URL(generatedManifest, 'https://localhost/');
const manifestAssets = [
  ...(manifest.icons ?? []),
  ...(manifest.screenshots ?? []),
  ...(manifest.shortcuts ?? []).flatMap(shortcut => shortcut.icons ?? []),
];
for (const asset of manifestAssets) {
  if (typeof asset.src !== 'string' || !asset.src.trim() || asset.src.includes('\\')) throw new Error('Manifest asset needs a local image path');
  const url = new URL(asset.src, manifestBase);
  if (url.origin !== manifestBase.origin) throw new Error('Manifest assets must be packaged locally');
  const relative = decodeURIComponent(url.pathname).replace(/^\//, '');
  if (relative.split('/').some(part => part === '..' || part === '.') || relative.includes('\\') || relative.includes('\0')) throw new Error('Manifest asset path is invalid');
  if (!isAllowedWebAsset(relative, publicFiles)) throw new Error(`Manifest asset is not allowlisted: ${relative}`);
  const filename = path.resolve(source, relative);
  if (!filename.startsWith(`${source}${path.sep}`) || !(await stat(filename).catch(() => null))?.isFile()) throw new Error(`Manifest asset is missing: ${relative}`);
  if ((await realpath(filename)) !== filename) throw new Error('Manifest assets cannot be symlinks');
}
async function inspect(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const filename = path.join(folder, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Export contains a symlink');
    if (entry.isDirectory()) await inspect(filename);
    else {
      const relative = path.relative(source, filename).split(path.sep).join('/');
      if (relative !== generatedManifest && !isAllowedWebAsset(relative, publicFiles)) continue;
      pending.push({ relative, html: entry.name.endsWith('.html') ? protectHtml(await readFile(filename, 'utf8'), relative) : null });
    }
  }
}
await inspect(source); // Reject unsafe exports before replacing the existing local bundle.
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const entry of pending) {
  const output = path.join(destination, entry.relative);
  await mkdir(path.dirname(output), { recursive: true });
  if (entry.html !== null) await writeFile(output, entry.html);
  else await cp(path.join(source, entry.relative), output, { dereference: false });
}
// Capacitor serves index.html for extensionless paths on both OSs. The health
// entry therefore uses the exact health HTML, never the separate Supabase login.
const index = await readFile(path.join(source, 'health/index.html'));
await writeFile(path.join(destination, 'index.html'), protectHtml(index.toString('utf8'), 'health/index.html'));
await writeFile(path.join(destination, 'native-build.json'), `${JSON.stringify({
  source: path.relative(repo, source), preparedAt: new Date().toISOString(),
  sourceIndexSha256: createHash('sha256').update(index).digest('hex'),
  htmlPages: pending.filter(entry => entry.html !== null).length, webFiles: pending.length,
  ui: 'existing-health-route', edition: 'local-only-health', entryPath: '/health/',
  auth: 'external-production-web-only', healthDataUpload: false,
}, null, 2)}\n`);
console.log(`Prepared ${pending.length} allowlisted original app files in the local native bundle.`);
