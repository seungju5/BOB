import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { assertCopiedWebMatches } from '../scripts/copied-bundle.mjs';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('stale copied native assets block release evidence instead of claiming the new web bundle was built', async () => {
  await mkdir(path.join(workspace, '.local'), { recursive: true });
  const temporary = await mkdtemp(path.join(workspace, '.local/copied-bundle-'));
  const source = path.join(temporary, 'www'), copied = path.join(temporary, 'copied');
  try {
    for (const folder of [source, copied]) {
      await mkdir(folder); await writeFile(path.join(folder, 'index.html'), 'health v1');
    }
    await writeFile(path.join(copied, 'cordova.js'), '');
    const first = await assertCopiedWebMatches(source, copied);
    await writeFile(path.join(source, 'index.html'), 'health v2');
    await assert.rejects(assertCopiedWebMatches(source, copied), /Native copy differs/);
    await writeFile(path.join(copied, 'index.html'), 'health v2');
    assert.notEqual((await assertCopiedWebMatches(source, copied)).sha256, first.sha256);
    await writeFile(path.join(copied, 'login.html'), 'stale login');
    await assert.rejects(assertCopiedWebMatches(source, copied), /Unexpected native file/);
    await rm(path.join(copied, 'login.html'));
    await writeFile(path.join(copied, 'cordova.js'), 'unexpected executable content');
    await assert.rejects(assertCopiedWebMatches(source, copied), /Unexpected native file/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
