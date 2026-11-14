import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

async function inventory(root, prefix = '') {
  const files = new Map();
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Native bundle symlinks are not allowed.');
    if (entry.isDirectory()) {
      for (const [name, value] of await inventory(root, relative)) files.set(name, value);
    } else {
      const bytes = await readFile(path.join(root, relative));
      files.set(relative, { size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
  return files;
}

export async function assertCopiedWebMatches(source, copied) {
  const [expected, actual] = await Promise.all([inventory(source), inventory(copied)]);
  for (const [name, value] of expected) {
    assert.deepEqual(actual.get(name), value, `Native copy differs: ${name}. Run npm run sync before building.`);
  }
  for (const [name, value] of actual) {
    if (!expected.has(name)) assert.ok(['cordova.js', 'cordova_plugins.js'].includes(name) && value.size === 0,
      `Unexpected native file: ${name}. Run npm run sync.`);
  }
  const serialized = JSON.stringify([...expected].sort(([a], [b]) => a.localeCompare(b)));
  return { files: expected.size, sha256: createHash('sha256').update(serialized).digest('hex') };
}

export async function verifyCopiedBundle(workspace, platform) {
  const destination = platform === 'android' ? 'android/app/src/main/assets' : 'ios/App/App';
  const config = JSON.parse(await readFile(path.join(workspace, 'capacitor.config.json'), 'utf8'));
  const copied = JSON.parse(await readFile(path.join(workspace, destination, 'capacitor.config.json'), 'utf8'));
  for (const key of Object.keys(config)) assert.deepEqual(copied[key], config[key],
    `Native ${platform} config differs (${key}). Run npm run sync.`);
  return assertCopiedWebMatches(path.join(workspace, 'www'), path.join(workspace, destination, 'public'));
}
