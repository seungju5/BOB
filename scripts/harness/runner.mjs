import {spawn, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile, writeFile, mkdir, lstat, realpath, readlink, access} from 'node:fs/promises';
import path from 'node:path';
import {CHECKS, sensitivePath, fingerprint, changedEntries, parseTestCounts, checkStatus, aggregateStatus, redact} from './core.mjs';

export const ROOT = path.resolve(import.meta.dirname, '../..');
const git = (root, args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']});
const split = value => value.split('\0').filter(Boolean);

export function changedFiles(root = ROOT, base = null) {
  const ref = base ? git(root, ['rev-parse', '--verify', '--end-of-options', base + '^{commit}']).trim() : 'HEAD';
  return [...new Set([...split(git(root, ['diff', '--name-only', '--no-renames', '-z', ref, '--'])),
    ...split(git(root, ['ls-files', '--others', '--exclude-standard', '-z']))])].sort();
}

export async function snapshot(root = ROOT) {
  root = await realpath(root);
  const names = [...new Set(split(git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])))].sort();
  const entries = [];
  for (const file of names) {
    if (sensitivePath(file) || file.startsWith('.harness/')) continue;
    const full = path.join(root, file);
    let info;
    try { info = await lstat(full); } catch (error) { if (error.code === 'ENOENT') { entries.push({path: file, hash: 'deleted'}); continue; } throw error; }
    if (info.isSymbolicLink()) { entries.push({path: file, hash: 'symlink:' + createHash('sha256').update(await readlink(full)).digest('hex')}); continue; }
    if (!info.isFile()) continue;
    const canonical = await realpath(full);
    if (!canonical.startsWith(root + path.sep) || sensitivePath(path.relative(root, canonical))) { entries.push({path: file, hash: 'excluded-target'}); continue; }
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(full)) hash.update(chunk);
    entries.push({path: file, hash: hash.digest('hex')});
  }
  return {head: git(root, ['rev-parse', 'HEAD']).trim(), fingerprint: fingerprint(entries), entries};
}

export async function readRepoJson(relative, root = ROOT) {
  root = await realpath(root);
  const absolute = path.resolve(root, relative);
  const canonical = await realpath(absolute);
  if (!canonical.startsWith(root + path.sep) || sensitivePath(path.relative(root, canonical))) throw new Error('Use a non-secret JSON file inside this repository.');
  const info = await lstat(canonical);
  if (info.size > 128 * 1024) throw new Error('JSON input exceeds 128 KiB.');
  return JSON.parse(await readFile(canonical, 'utf8'));
}

export function runProcess(command, args, {cwd, timeoutMs = 180000, maxBytes = 8 * 1024 * 1024, env = process.env} = {}) {
  return new Promise(resolve => {
    const start = Date.now();
    let child;
    try { child = spawn(command, args, {cwd, env, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe']}); }
    catch (error) { resolve({exitCode: null, timedOut: false, truncated: false, stdout: '', stderr: error.code || 'spawn_failed', durationMs: Date.now() - start}); return; }
    let stdout = '', stderr = '', bytes = 0, timedOut = false, truncated = false, finished = false, killTimer;
    const kill = signal => { try { if (process.platform === 'win32') child.kill(signal); else process.kill(-child.pid, signal); } catch { /* Already exited. */ } };
    const stop = () => { kill('SIGTERM'); killTimer ||= setTimeout(() => kill('SIGKILL'), 1000); };
    const append = stream => chunk => {
      bytes += chunk.length;
      if (bytes > maxBytes) { truncated = true; stop(); return; }
      if (stream === 'out') stdout += chunk.toString(); else stderr += chunk.toString();
    };
    child.stdout.on('data', append('out')); child.stderr.on('data', append('err'));
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
    const done = (code, error) => {
      if (finished) return; finished = true;
      // A direct child can exit before its detached grandchildren. Finish group cleanup.
      if (timedOut || truncated) kill('SIGKILL');
      clearTimeout(timer); clearTimeout(killTimer);
      resolve({exitCode: code, timedOut, truncated, stdout: redact(stdout), stderr: redact(stderr + (error ? '\n' + error.code : '')), durationMs: Date.now() - start});
    };
    child.on('error', error => done(null, error)); child.on('close', code => done(code));
  });
}

export function localEnv({allowEmulator = false} = {}) {
  const env = {...process.env, CI: '1', NO_COLOR: '1', NEXT_TELEMETRY_DISABLED: '1'};
  // A local unit run must not attach itself to an ambient emulator or cloud credential.
  for (const key of Object.keys(env)) if (/^(?:FIREBASE|FIRESTORE|GOOGLE_APPLICATION_CREDENTIALS|GCLOUD_PROJECT|GOOGLE_CLOUD_PROJECT|SMARTTHINGS|SUPABASE_SERVICE_ROLE|VAPID_PRIVATE)/.test(key)) delete env[key];
  // Opt in only for an allowlisted integration check; never forward cloud credentials.
  if (allowEmulator && process.env.BAPMUNNA_HARNESS_EMULATOR === '1') {
    const host = process.env.FIRESTORE_EMULATOR_HOST || '';
    const match = /^(?:127\.0\.0\.1|localhost):(\d{1,5})$/.exec(host);
    if (!match || Number(match[1]) < 1 || Number(match[1]) > 65535) throw new Error('Harness emulator checks require a loopback Firestore host and valid port.');
    env.FIRESTORE_EMULATOR_HOST = host;
  }
  delete env.FORCE_COLOR;
  return env;
}

export async function createRunDir(root = ROOT) {
  root = await realpath(root);
  const local = path.join(root, '.harness');
  for (const dir of [local, path.join(local, 'runs')]) {
    await mkdir(dir, {recursive: true, mode: 0o700});
    if ((await lstat(dir)).isSymbolicLink() || !((await realpath(dir)).startsWith(root + path.sep))) throw new Error('Harness output must remain inside this repository.');
  }
  const id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid;
  const dir = path.join(local, 'runs', id); await mkdir(dir, {mode: 0o700});
  return dir;
}

export function markdownReport(report) {
  const resultRows = report.results.map(item => `| ${item.id} | ${item.status} | ${item.counts ? `${item.counts.passed} passed / ${item.counts.skipped} skipped / ${item.counts.failed} failed` : item.reason || 'exit ' + item.exitCode} |`);
  return `# 밥뭇나 개발 검증 기록\n\n- 생성: ${report.finishedAt}\n- 소스 커밋: ${report.sourceBefore.head}\n- 시작 소스 지문: ${report.sourceBefore.fingerprint}\n- 종료 소스 지문: ${report.sourceAfter.fingerprint}\n- 자동 검사: **${report.automatedStatus}**\n- 실제 연동·배포: **이 실행에서 검증하지 않음**\n- 작업: ${report.plan.task?.title || '변경 파일 검사'}\n\n| 검사 | 결과 | 근거 |\n| --- | --- | --- |\n${resultRows.join('\n')}\n\n## 별도로 확인할 증거\n\n${report.plan.evidence.map(item => `- [ ] ${item.label} (${item.owner}, ${item.kind}, not_run)`).join('\n')}\n\n## 해석\n\n${report.plan.notices.map(item => '- ' + item).join('\n')}\n- 이 보고서는 위 소스 지문에만 해당합니다. 코드가 바뀌면 다시 검사합니다.\n- skipped는 성공 횟수에 포함하지 않습니다. 로그는 같은 폴더에 있습니다.\n- 자동 과금·배포·새 AI API 호출을 실행하지 않았습니다.\n`;
}

export async function runChecks(plan, {root = ROOT, progress = () => {}} = {}) {
  const dir = await createRunDir(root);
  const sourceBefore = await snapshot(root);
  const results = [];
  for (const id of plan.checks) {
    const check = CHECKS[id];
    if (!check) throw new Error('Check is not allowlisted: ' + id);
    const missing = [];
    for (const file of check.prerequisites || []) { try { await access(path.join(root, file)); } catch { missing.push(file); } }
    if (missing.length) { results.push({id, status: 'blocked', reason: 'Install existing locked dependencies first: ' + missing.join(', ')}); continue; }
    const unmet = check.requires?.filter(required => results.find(item => item.id === required)?.status !== 'passed') || [];
    if (unmet.length) { results.push({id, status: 'blocked', reason: 'Required checks did not pass: ' + unmet.join(', ')}); continue; }
    progress('Running ' + id);
    const startedAt = new Date().toISOString();
    const reportFile = path.join(dir, id + '.json');
    const args = check.args.map(arg => arg === '{reportFile}' ? reportFile : arg);
    const result = await runProcess(process.execPath, args, {cwd: path.join(root, check.cwd || ''), timeoutMs: check.timeoutMs, env: localEnv({allowEmulator: check.emulator === true})});
    let summary = result.stdout;
    if (check.format === 'vitest') {
      summary = await readFile(reportFile, 'utf8').catch(() => '');
      if (summary) await writeFile(reportFile, redact(summary), {mode: 0o600});
    }
    const counts = parseTestCounts(summary, check.format);
    const status = checkStatus({...result, counts, needsCounts: Boolean(check.format)});
    const logFile = id + '.log';
    await writeFile(path.join(dir, logFile), result.stdout + '\n' + result.stderr, {mode: 0o600});
    results.push({id, status, startedAt, finishedAt: new Date().toISOString(), command: ['node', ...args], cwd: check.cwd || '.',
      exitCode: result.exitCode, durationMs: result.durationMs, timedOut: result.timedOut, truncated: result.truncated, counts, logFile});
    progress(id + ': ' + status + (counts ? ` (${counts.passed} passed, ${counts.skipped} skipped)` : ''));
  }
  const sourceAfter = await snapshot(root);
  const drift = changedEntries(sourceBefore.entries, sourceAfter.entries);
  if (drift.length || sourceBefore.head !== sourceAfter.head) results.push({id: 'source-stability', status: 'failed', reason: 'Source changed during checks; review and rerun.', files: drift});
  else results.push({id: 'source-stability', status: 'passed', reason: 'Source fingerprint unchanged, including pre-existing edits.'});
  const report = {schemaVersion: 1, finishedAt: new Date().toISOString(), plan, sourceBefore, sourceAfter, results,
    automatedStatus: aggregateStatus(results), releaseReadiness: 'not_assessed', liveIntegrationVerified: false,
    deploymentPerformed: false, billingChanged: false};
  await writeFile(path.join(dir, 'report.json'), JSON.stringify(report, null, 2) + '\n', {mode: 0o600});
  await writeFile(path.join(dir, 'report.md'), markdownReport(report), {mode: 0o600});
  return {dir, report};
}
