import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const execute = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '../..');
const javaRoot = process.env.BAPMUNNA_JAVA_HOME ?? path.join(repo, 'tmp/java21/jdk-21.0.13+9/Contents/Home');

test('native Android time/empty-data rules run on the local JDK without an Android SDK', async t => {
  const compiler = path.join(javaRoot, 'bin/javac');
  if (!await access(compiler).then(() => true, () => false)) {
    t.skip('JDK unavailable; set BAPMUNNA_JAVA_HOME. This does not verify a native Android build.');
    return;
  }
  await mkdir(path.join(root, '.local'), { recursive: true });
  const output = await mkdtemp(path.join(root, '.local/java-check-'));
  try {
    await execute(compiler, ['-d', output,
      path.join(root, 'android/src/main/java/com/bapmunna/phonesteps/StepWindow.java'),
      path.join(root, 'android/src/main/java/com/bapmunna/phonesteps/WalkReminderTime.java'),
      path.join(root, 'android/src/main/java/com/bapmunna/phonesteps/RankingReadDecision.java'),
      path.join(root, 'tests/StepWindowCheck.java'),
      path.join(root, 'tests/WalkReminderCheck.java'),
    ]);
    const result = await execute(path.join(javaRoot, 'bin/java'), ['-cp', output, 'com.bapmunna.phonesteps.StepWindowCheck']);
    assert.match(result.stdout, /passed/);
    const reminders = await execute(path.join(javaRoot, 'bin/java'), ['-cp', output, 'com.bapmunna.phonesteps.WalkReminderCheck']);
    assert.match(reminders.stdout, /passed/);
  } finally { await rm(output, { recursive: true, force: true }); }
});
