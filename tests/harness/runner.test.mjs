import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, symlink, rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {changedFiles, snapshot, runProcess, readRepoJson, createRunDir, localEnv, runChecks} from '../../scripts/harness/runner.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'bapmunna-harness-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const git = args => execFileSync('git', args, {cwd: root, stdio: 'pipe'}).toString().trim();
  git(['init', '-q']);
  await writeFile(path.join(root, '.gitignore'), '.harness/\n.env*\ntmp/\n');
  await writeFile(path.join(root, 'source.txt'), 'original');
  git(['add', '.']);
  git(['-c', 'user.name=Harness Test', '-c', 'user.email=harness@example.test', 'commit', '-qm', 'fixture']);
  return {root, git};
}

test('change discovery includes staged, unstaged, untracked, deletes and both rename paths', async t => {
  const {root, git} = await fixture(t);
  await writeFile(path.join(root, 'new file.txt'), 'new');
  git(['mv', 'source.txt', 'renamed file.txt']);
  await writeFile(path.join(root, 'renamed file.txt'), 'edited');
  assert.deepEqual(changedFiles(root), ['new file.txt', 'renamed file.txt', 'source.txt']);
  assert.throws(() => changedFiles(root, '--help'));
});

test('base revision includes already committed work', async t => {
  const {root, git} = await fixture(t);
  const base = git(['rev-parse', 'HEAD']);
  await writeFile(path.join(root, 'source.txt'), 'new');
  git(['add', '.']); git(['-c', 'user.name=Harness Test', '-c', 'user.email=harness@example.test', 'commit', '-qm', 'second']);
  assert.deepEqual(changedFiles(root), []);
  assert.deepEqual(changedFiles(root, base), ['source.txt']);
});

test('snapshot excludes local reports and secret paths and hashes existing edits', async t => {
  const {root} = await fixture(t);
  await writeFile(path.join(root, 'source.txt'), 'dirty before checks');
  const before = await snapshot(root);
  await writeFile(path.join(root, '.env.local'), 'SECRET');
  const dir = await createRunDir(root);
  await writeFile(path.join(dir, 'report.json'), '{}');
  assert.deepEqual(await snapshot(root), before);
  await writeFile(path.join(root, 'source.txt'), 'changed during checks');
  assert.notEqual((await snapshot(root)).fingerprint, before.fingerprint);
});

test('task loading rejects outside repository, secret files and symlink escapes', async t => {
  const {root} = await fixture(t);
  await writeFile(path.join(root, 'task.json'), '{"ok":true}');
  await writeFile(path.join(root, '.env.json'), '{"secret":true}');
  assert.deepEqual(await readRepoJson('task.json', root), {ok: true});
  await assert.rejects(readRepoJson('.env.json', root), /non-secret/);
  await symlink(os.tmpdir(), path.join(root, 'escape'));
  await assert.rejects(readRepoJson('escape', root), /inside this repository/);
});

test('report directory refuses symlink redirection', async t => {
  const {root} = await fixture(t);
  await symlink(os.tmpdir(), path.join(root, '.harness'));
  await assert.rejects(createRunDir(root), /inside this repository/);
});

test('subprocess keeps shell metacharacters literal and reports missing tools', async () => {
  const literal = '$(touch /tmp/bapmunna-harness-should-not-exist); `whoami`';
  const result = await runProcess(process.execPath, ['-e', 'console.log(process.argv[1])', literal]);
  assert.equal(result.exitCode, 0); assert.equal(result.stdout.trim(), literal);
  const missing = await runProcess('/no/such/harness-tool', []);
  assert.equal(missing.exitCode, null); assert.match(missing.stderr, /ENOENT/);
});

test('subprocess timeout and output bound terminate runaway checks', async () => {
  const slow = await runProcess(process.execPath, ['-e', 'setInterval(()=>{}, 1000)'], {timeoutMs: 80});
  assert.equal(slow.timedOut, true); assert.notEqual(slow.exitCode, 0);
  const noisy = await runProcess(process.execPath, ['-e', "process.stdout.write('x'.repeat(100000))"], {maxBytes: 1024});
  assert.equal(noisy.truncated, true);
});

test('timeout also kills a grandchild that ignores SIGTERM', {skip: process.platform === 'win32'}, async t => {
  const {root} = await fixture(t);
  const ready = path.join(root, 'grandchild.pid');
  const grandchild = `process.on('SIGTERM',()=>{});require('fs').writeFileSync(process.argv[1],String(process.pid));setInterval(()=>require('fs').writeFileSync(process.argv[1]+'.pulse',String(Date.now())),25);`;
  const parent = `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)},process.argv[1]],{stdio:'ignore'});setInterval(()=>{},1000);`;
  const result = await runProcess(process.execPath, ['-e', parent, ready], {timeoutMs: 800});
  assert.equal(result.timedOut, true);
  const pid = Number(await readFile(ready, 'utf8'));
  t.after(() => { try { process.kill(pid, 'SIGKILL'); } catch { /* Already cleaned up. */ } });
  const pulse = await readFile(ready + '.pulse', 'utf8');
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(await readFile(ready + '.pulse', 'utf8'), pulse);
});

test('unit environment cannot accidentally use ambient emulator credentials', () => {
  const before = process.env.FIRESTORE_EMULATOR_HOST;
  process.env.FIRESTORE_EMULATOR_HOST = 'example.invalid:8080';
  try { assert.equal(localEnv().FIRESTORE_EMULATOR_HOST, undefined); assert.equal(localEnv().NEXT_TELEMETRY_DISABLED, '1'); }
  finally { if (before === undefined) delete process.env.FIRESTORE_EMULATOR_HOST; else process.env.FIRESTORE_EMULATOR_HOST = before; }
});

test('explicit emulator opt-in is scoped to integration checks and strips credentials', () => {
  const keys = ['BAPMUNNA_HARNESS_EMULATOR', 'FIRESTORE_EMULATOR_HOST', 'GOOGLE_APPLICATION_CREDENTIALS'];
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    process.env.BAPMUNNA_HARNESS_EMULATOR = '1';
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8180';
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/must/not/pass.json';
    assert.equal(localEnv().FIRESTORE_EMULATOR_HOST, undefined);
    const env = localEnv({allowEmulator: true});
    assert.equal(env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8180');
    assert.equal(env.GOOGLE_APPLICATION_CREDENTIALS, undefined);
    for (const host of ['example.invalid:8180', 'localhost:0', 'localhost:65536', 'http://127.0.0.1:8180', '']) {
      process.env.FIRESTORE_EMULATOR_HOST = host;
      assert.throws(() => localEnv({allowEmulator: true}), /loopback/);
    }
  } finally {
    for (const key of keys) if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key];
  }
});

test('failed generation prerequisite blocks artifact build and still writes evidence', async t => {
  const {root} = await fixture(t);
  await mkdir(path.join(root, 'scripts'));
  await mkdir(path.join(root, 'node_modules/typescript'), {recursive: true});
  await writeFile(path.join(root, 'node_modules/typescript/package.json'), '{}');
  await writeFile(path.join(root, 'scripts/sync-firebase.mjs'), "console.error('out of sync');process.exitCode=1;");
  const plan = {checks: ['domain-sync', 'firebase-editions'], evidence: [], notices: [], task: null};
  const {dir, report} = await runChecks(plan, {root});
  assert.equal(report.results[0].status, 'failed');
  assert.equal(report.results[1].status, 'blocked');
  assert.equal(report.automatedStatus, 'failed');
  assert.equal(report.deploymentPerformed, false); assert.equal(report.liveIntegrationVerified, false);
  assert.match(await readFile(path.join(dir, 'report.md'), 'utf8'), /실제 연동·배포/);
});

test('missing tool prerequisites are blocked rather than passed or test failures', async t => {
  const {root} = await fixture(t);
  const {report} = await runChecks({checks: ['types'], evidence: [], notices: [], task: null}, {root});
  assert.equal(report.results[0].status, 'blocked');
  assert.equal(report.automatedStatus, 'blocked');
});

test('file-based Vitest JSON is read from the private run directory', async t => {
  const {root} = await fixture(t);
  await mkdir(path.join(root, 'node_modules/vitest'), {recursive: true});
  const summary = {numTotalTests: 2, numPassedTests: 2, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0};
  await writeFile(path.join(root, 'node_modules/vitest/vitest.mjs'), `import fs from 'node:fs';const target=process.argv[process.argv.indexOf('--outputFile')+1];fs.writeFileSync(target,JSON.stringify(${JSON.stringify(summary)}));console.log('JSON report written to '+target);`);
  const {dir, report} = await runChecks({checks: ['root-tests'], evidence: [], notices: [], task: null}, {root});
  assert.equal(report.results[0].counts.passed, 2);
  assert.equal(report.automatedStatus, 'passed');
  assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'root-tests.json'), 'utf8')), summary);
});

test('a successful command cannot certify source it changed during the run', async t => {
  const {root} = await fixture(t);
  await mkdir(path.join(root, 'scripts'));
  await writeFile(path.join(root, 'scripts/sync-design.mjs'), "import fs from 'node:fs';fs.writeFileSync('source.txt','unexpected regeneration');");
  const {report} = await runChecks({checks: ['design-sync'], evidence: [], notices: [], task: null}, {root});
  assert.equal(report.results[0].status, 'passed');
  assert.equal(report.results.at(-1).status, 'failed');
  assert.deepEqual(report.results.at(-1).files, ['source.txt']);
  assert.equal(report.automatedStatus, 'failed');
});
