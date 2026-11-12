import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPlan, classifyPath, validateTask, parseTestCounts, checkStatus, aggregateStatus, redact, changedEntries, fingerprint} from '../../scripts/harness/core.mjs';

const task = () => ({schemaVersion: 1, id: 'test-task', title: 'Test', goal: 'Verify a bounded task', owners: ['wm_iot'], profiles: ['smartthings'], acceptance: ['Observed result'], manualEvidence: [{id: 'device-proof', label: 'Real device proof'}], constraints: ['Keep free plan']});

test('domain and approved visuals route in their actual source directions', () => {
  const domain = buildPlan({files: ['config/detection.ts', 'lib/judge/time.ts']});
  assert.ok(domain.members.includes('wm_domain'));
  assert.ok(domain.checks.includes('domain-sync'));
  assert.ok(domain.checks.includes('firebase-tests'));
  assert.ok(domain.evidence.some(item => item.id === 'care-semantics'));
  const visual = buildPlan({files: ['integrations/bapmunna-firebase/docs/assets/bunny.png']});
  assert.ok(visual.members.includes('wm_experience'));
  assert.ok(visual.checks.includes('design-sync'));
  assert.ok(visual.checks.includes('next-build'));
  assert.ok(visual.checks.indexOf('design-sync') < visual.checks.indexOf('next-build'));
});

test('auth and IoT changes require integration evidence beyond unit tests', () => {
  assert.deepEqual(classifyPath('lib/data/live.ts'), ['data']);
  assert.deepEqual(classifyPath('supabase/migrations/new.sql'), ['data']);
  const plan = buildPlan({files: ['integrations/bapmunna-firebase/server/service.mjs']});
  assert.ok(plan.checks.includes('smartthings-tests'));
  assert.ok(plan.checks.includes('firebase-tests'));
  assert.ok(plan.evidence.some(item => item.id === 'smartthings-store' && item.status === 'not_run'));
  assert.ok(plan.evidence.some(item => item.kind === 'live' && item.status === 'not_run'));
});

test('explicit narrow profile cannot hide broader changed-file requirements', () => {
  const plan = buildPlan({files: ['integrations/bapmunna-firebase/server/service.mjs'], profile: 'harness'});
  assert.ok(plan.checks.includes('smartthings-tests'));
  assert.ok(plan.checks.includes('harness-tests'));
  assert.equal(plan.checks.length, new Set(plan.checks).size);
  assert.deepEqual(classifyPath('unrecognized.config'), ['full']);
  assert.deepEqual(classifyPath('package-lock.json'), ['full']);
});

test('clean tree gets baseline checks and task plans still select their area', () => {
  assert.deepEqual(buildPlan().profiles, ['baseline']);
  const plan = buildPlan({task: task()});
  assert.ok(plan.checks.includes('smartthings-tests'));
  assert.ok(plan.evidence.some(item => item.id === 'device-proof'));
  assert.ok(plan.evidence.every(item => item.status === 'not_run'));
});

test('task cannot introduce an executable or unknown member/profile', () => {
  assert.throws(() => validateTask({...task(), profiles: ['deploy']}), /Invalid task/);
  assert.throws(() => validateTask({...task(), owners: ['admin']}), /Invalid task/);
  assert.throws(() => buildPlan({profile: 'deploy'}), /Unknown profile/);
  const plan = buildPlan({task: {...task(), command: 'touch /tmp/should-not-run'}});
  assert.ok(plan.checks.every(id => !id.includes('touch')));
});

test('TAP counts preserve skips, failures and multiple suites', () => {
  const summary = '# tests 15\n# pass 14\n# fail 0\n# cancelled 0\n# skipped 1\n# todo 0\n';
  const counts = parseTestCounts(summary, 'tap');
  assert.equal(counts.total, 15); assert.equal(counts.passed, 14); assert.equal(counts.skipped, 1);
  assert.equal(checkStatus({exitCode: 0, counts, needsCounts: true}), 'incomplete');
  assert.equal(parseTestCounts(summary + summary, 'tap').skipped, 2);
  assert.equal(checkStatus({exitCode: 0, counts: {...counts, failed: 1}}), 'failed');
});

test('Vitest structured summary and missing/zero evidence fail closed', () => {
  const counts = parseTestCounts('startup\n' + JSON.stringify({numTotalTests: 56, numPassedTests: 56, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0}), 'vitest');
  assert.equal(checkStatus({exitCode: 0, counts, needsCounts: true}), 'passed');
  assert.equal(checkStatus({exitCode: 0, needsCounts: true}), 'failed');
  assert.equal(checkStatus({exitCode: 0, counts: {...counts, total: 0}, needsCounts: true}), 'failed');
  assert.equal(checkStatus({exitCode: 0, timedOut: true}), 'failed');
  assert.equal(checkStatus({exitCode: 0, truncated: true}), 'failed');
});

test('partial and inconsistent test summaries cannot create a false pass', () => {
  assert.equal(parseTestCounts('# tests 3\n', 'tap'), null);
  const incomplete = parseTestCounts('# tests 3\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n', 'tap');
  assert.equal(checkStatus({exitCode: 0, counts: incomplete, needsCounts: true}), 'failed');
  assert.equal(parseTestCounts('{"numTotalTests":3}', 'vitest'), null);
  assert.equal(checkStatus({exitCode: 0, counts: {total: 2, passed: 1, failed: 0, cancelled: 0, skipped: -1, todo: 2}, needsCounts: true}), 'failed');
});

test('aggregate never turns blocked or incomplete evidence into pass', () => {
  assert.equal(aggregateStatus([{status: 'passed'}, {status: 'blocked'}]), 'blocked');
  assert.equal(aggregateStatus([{status: 'passed'}, {status: 'incomplete'}]), 'incomplete');
  assert.equal(aggregateStatus([{status: 'failed'}, {status: 'blocked'}]), 'failed');
  assert.equal(aggregateStatus([]), 'not_run');
});

test('source evidence compares contents rather than merely dirty status', () => {
  const before = [{path: 'dirty.ts', hash: 'old'}, {path: 'stable.ts', hash: 'same'}];
  assert.deepEqual(changedEntries(before, [...before].reverse()), []);
  assert.equal(fingerprint(before), fingerprint([...before].reverse()));
  assert.deepEqual(changedEntries(before, [{path: 'dirty.ts', hash: 'new'}, {path: 'fresh.ts', hash: 'add'}]), ['dirty.ts', 'fresh.ts', 'stable.ts']);
});

test('logs redact common token and OAuth query forms', () => {
  const safe = redact('Bearer abc123 client_secret="SECRET" access_token=TOKEN refresh_token:REF https://local/callback?code=CODE&state=STATE');
  for (const value of ['abc123', 'SECRET', '=TOKEN', ':REF', '=CODE', '=STATE']) assert.equal(safe.includes(value), false);
  assert.ok(safe.includes('[REDACTED]'));
});
