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
if (!(await stat(path.join(source, 'index.html')).catch(() => null))?.isFile()) {
  throw new Error('Original app export is missing. Build the root app with BAPMUNNA_STATIC_EXPORT=1 and an empty NEXT_PUBLIC_APP_BASE_PATH first. No substitute UI is generated.');
}
if ((await realpath(source)) !== source) throw new Error('Export symlinks are not accepted');
const pending = [];
const publicFiles = new Set();
async function discoverPublic(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const filename = path.join(folder, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Public assets contain a symlink');
    if (entry.isDirectory()) await discoverPublic(filename);
    else publicFiles.add(path.relative(path.join(repo, 'public'), filename).split(path.sep).join('/'));
  }
}
await discoverPublic(path.join(repo, 'public'));
async function inspect(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const filename = path.join(folder, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Export contains a symlink');
    if (entry.isDirectory()) await inspect(filename);
    else {
      const relative = path.relative(source, filename).split(path.sep).join('/');
      if (!isAllowedWebAsset(relative, publicFiles)) continue;
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
const index = await readFile(path.join(source, 'index.html'));
await writeFile(path.join(destination, 'native-build.json'), `${JSON.stringify({
  source: path.relative(repo, source), preparedAt: new Date().toISOString(),
  sourceIndexSha256: createHash('sha256').update(index).digest('hex'),
  htmlPages: pending.filter(entry => entry.html !== null).length, webFiles: pending.length,
  ui: 'existing-root-app', healthDataUpload: false,
}, null, 2)}\n`);
console.log(`Prepared ${pending.length} allowlisted original app files in the local native bundle.`);
