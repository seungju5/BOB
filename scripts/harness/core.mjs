import {createHash} from 'node:crypto';

export const PROFILE_NAMES = ['baseline', 'domain', 'experience', 'data', 'smartthings', 'harness', 'full'];
export const MEMBER_IDS = ['wm_lead', 'wm_experience', 'wm_domain', 'wm_data', 'wm_iot', 'wm_verifier', 'wm_release'];

// Local commands only. Task files and CLI arguments cannot supply executable code.
export const CHECKS = {
  'harness-tests': {title: 'Harness behavior', args: ['--test', '--test-reporter=tap', 'tests/harness/core.test.mjs', 'tests/harness/runner.test.mjs'], format: 'tap'},
  'domain-sync': {title: 'Canonical domain matches Firebase', args: ['scripts/sync-firebase.mjs', '--check'], prerequisites: ['node_modules/typescript/package.json']},
  'design-sync': {title: 'Approved bunny and design match', args: ['scripts/sync-design.mjs', '--check']},
  'root-tests': {title: 'Root unit tests', args: ['node_modules/vitest/vitest.mjs', 'run', '--reporter=json', '--outputFile', '{reportFile}'], format: 'vitest', prerequisites: ['node_modules/vitest/vitest.mjs']},
  'backend-privacy-tests': {title: 'Server consent and private response boundaries', args: ['--test', '--test-reporter=tap', 'tests/privacy-consent-boundary.test.mjs'], format: 'tap', prerequisites: ['node_modules/typescript/package.json']},
  'types': {title: 'TypeScript', args: ['node_modules/typescript/bin/tsc', '--noEmit'], prerequisites: ['node_modules/typescript/bin/tsc']},
  'firebase-contracts': {title: 'Firebase scenarios and worksheet', args: ['tests/check.mjs'], cwd: 'integrations/bapmunna-firebase'},
  'firebase-tests': {title: 'Firebase roles, management, parity, experience and Kakao client', args: ['--test', '--test-reporter=tap', 'tests/editions.test.mjs', 'tests/manage.test.mjs', 'tests/parity.test.mjs', 'tests/experience.test.mjs', 'tests/kakao-client.test.mjs'], cwd: 'integrations/bapmunna-firebase', format: 'tap'},
  'smartthings-tests': {title: 'SmartThings and Kakao server; store tests need emulator', args: ['--test', '--test-reporter=tap', 'test/service.test.mjs', 'test/store.test.mjs', 'test/deployment.test.mjs', 'test/http-adapter.test.mjs', 'test/retention.test.mjs', 'test/cors.test.mjs', 'test/vercel-runtime.test.mjs', 'test/state-lifecycle.test.mjs', 'test/kakao-service.test.mjs', 'test/kakao-runtime.test.mjs', 'test/kakao-store.test.mjs'], cwd: 'integrations/bapmunna-firebase/server', format: 'tap', emulator: true, prerequisites: ['integrations/bapmunna-firebase/server/node_modules/firebase-admin/package.json']},
  'firebase-editions': {title: 'Build Firebase editions', args: ['scripts/build-editions.mjs'], cwd: 'integrations/bapmunna-firebase', requires: ['domain-sync', 'design-sync']},
  'firebase-portable': {title: 'Build Firebase portable artifact', args: ['scripts/build-portable.mjs'], cwd: 'integrations/bapmunna-firebase', requires: ['firebase-editions']},
  'next-build': {title: 'Build Next.js with Webpack', args: ['node_modules/next/dist/bin/next', 'build', '--webpack'], requires: ['domain-sync', 'design-sync'], prerequisites: ['node_modules/next/dist/bin/next'], timeoutMs: 600000},
};

const BASE = ['domain-sync', 'design-sync', 'root-tests', 'types'];
const FIREBASE = ['firebase-contracts', 'firebase-tests', 'firebase-editions', 'firebase-portable'];
export const PROFILES = {
  baseline: BASE,
  domain: [...BASE, ...FIREBASE],
  experience: [...BASE, ...FIREBASE, 'next-build'],
  data: [...BASE, ...FIREBASE, 'backend-privacy-tests'],
  smartthings: [...BASE, ...FIREBASE, 'backend-privacy-tests', 'smartthings-tests'],
  harness: ['harness-tests'],
  full: [...BASE, ...FIREBASE, 'backend-privacy-tests', 'smartthings-tests', 'next-build', 'harness-tests'],
};

const PROFILE_MEMBERS = {
  baseline: ['wm_verifier'], domain: ['wm_domain', 'wm_verifier'],
  experience: ['wm_experience', 'wm_verifier'], data: ['wm_data', 'wm_verifier'],
  smartthings: ['wm_iot', 'wm_data', 'wm_verifier'], harness: ['wm_verifier', 'wm_release'],
  full: MEMBER_IDS,
};

export function sensitivePath(file) {
  return /(^|\/)(?:\.env(?!\.example$)[^/]*|smartthings-private|\.aws|\.vercel|node_modules|tmp)(\/|$)/i.test(file)
    || /\.(?:pem|key|p12|pfx)$/i.test(file);
}

export function classifyPath(file) {
  if (sensitivePath(file)) return ['full'];
  if (/^(harness\/|\.codex\/|scripts\/harness(?:\/|\.mjs$)|tests\/harness\/)/.test(file)) return ['harness'];
  if (/^(lib\/judge\/|config\/detection\.ts$|lib\/data\/view\.ts$|scripts\/sync-firebase\.mjs$|tests\/unit\/(?:detectEvents|resolveMealSlots|evaluateAlerts|firebaseParity)|integrations\/bapmunna-firebase\/docs\/shared\/)/.test(file)) return ['domain'];
  if (/^integrations\/bapmunna-firebase\/(?:server\/|scripts\/check-smartthings-readiness\.mjs$|docs\/smartthings)/.test(file)) return ['smartthings'];
  if (/^(lib\/(?:data|demo)\/|lib\/supabase\.ts$|supabase\/|app\/(?:auth|api)\/|proxy\.|integrations\/bapmunna-firebase\/(?:cloud\/|firebase\/|supabase\/|tests\/cloud\.test\.mjs$))/.test(file)) return ['data'];
  if (/^(app\/|components\/|public\/|design\/|scripts\/sync-design\.mjs$|integrations\/bapmunna-firebase\/(?:docs\/|workshop\/|scripts\/build))/.test(file)) return ['experience'];
  if (/^integrations\/bapmunna-firebase\/tests\//.test(file)) return ['domain', 'experience'];
  if (/^tests\/unit\//.test(file)) return ['baseline'];
  if (/\.md$/i.test(file) || file === '.gitignore' || file === '.gitattributes') return ['harness'];
  // Lockfiles, configs, tooling and unknown files get conservative full coverage.
  return ['full'];
}

const unique = values => [...new Set(values)];
const textArray = value => Array.isArray(value) && value.every(item => typeof item === 'string' && item.trim() && item.length <= 2000);
export function validateTask(task) {
  if (!task || task.schemaVersion !== 1 || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(task.id || '')
    || typeof task.title !== 'string' || !task.title.trim() || typeof task.goal !== 'string' || !task.goal.trim()
    || !textArray(task.owners) || !task.owners.length || task.owners.some(id => !MEMBER_IDS.includes(id))
    || !textArray(task.profiles) || !task.profiles.length || task.profiles.some(id => !PROFILE_NAMES.includes(id))
    || !textArray(task.acceptance) || !task.acceptance.length || !textArray(task.constraints)
    || !Array.isArray(task.manualEvidence) || task.manualEvidence.some(item => !item || !/^[a-z0-9][a-z0-9-]*$/.test(item.id || '') || typeof item.label !== 'string' || !item.label.trim())) {
    throw new Error('Invalid task. Use the schema in harness/tasks; only known profiles and members are allowed.');
  }
  return task;
}

export function buildPlan({files = [], task = null, profile = null} = {}) {
  if (task) validateTask(task);
  if (profile && !PROFILE_NAMES.includes(profile)) throw new Error('Unknown profile: ' + profile);
  const profiles = unique([...files.flatMap(classifyPath), ...(task?.profiles || []), ...(profile ? [profile] : [])]);
  if (!profiles.length) profiles.push('baseline');
  const checks = unique(profiles.flatMap(name => PROFILES[name]));
  // Run source-drift checks before anything capable of regenerating artifacts.
  const order = Object.keys(CHECKS);
  checks.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const expanded = profiles.includes('full') ? PROFILE_NAMES : profiles;
  const members = unique(['wm_lead', ...profiles.flatMap(name => PROFILE_MEMBERS[name]), ...(task?.owners || []), 'wm_release']);
  const evidence = [];
  const add = (id, label, owner, kind = 'manual') => evidence.push({id, label, owner, kind, status: 'not_run'});
  add('independent-review', '독립 검토자가 변경 내용·테스트 증거·남은 문제를 확인', 'wm_verifier');
  if (expanded.includes('experience')) add('mobile-experience', '320/390px 역할 전환·시니어 세 행동·큰 글씨·키보드·원본 토끼·모션 줄이기를 실제 브라우저에서 확인', 'wm_experience', 'browser');
  if (expanded.includes('domain')) add('care-semantics', '오프라인과 식사 미확인을 구분하고 KST·외출·중복·판단 기준 근거를 검토', 'wm_domain');
  if (expanded.includes('data') || expanded.includes('smartthings')) {
    add('firebase-isolation', 'demo-bapmunna 로컬 Auth/Firestore emulator에서 가구 격리·동의 철회·서버 전용 데이터 차단 검증', 'wm_data', 'integration');
    add('supabase-isolation', 'Supabase 변경이 있으면 BOB와 Firebase를 분리해 RLS·페어링을 검증; 무관하면 검토 근거 기록', 'wm_data', 'integration');
  }
  if (expanded.includes('smartthings')) {
    add('smartthings-store', '로컬 Firestore emulator에서 state 일회 사용·소유자·갱신 잠금·중복/역순 수신 검증', 'wm_iot', 'integration');
    add('live-oauth-events', '공개 서버·소유자 계정·삼성 이용 조건 확인 뒤 실제 OAuth 동의·구독·웹훅 수신·갱신·해제·2–3가구 격리를 각각 확인', 'wm_iot', 'live');
  }
  for (const item of task?.manualEvidence || []) {
    if (!evidence.some(existing => existing.id === item.id)) add(item.id, item.label, 'wm_verifier');
  }
  const notices = ['이 계획은 배포·결제·기기 제어·DB 변경·AI API 호출을 실행하지 않습니다.',
    '자동 검사 통과는 실제 로그인·실기기 연결·운영 배포의 증거가 아닙니다.'];
  if (files.some(sensitivePath)) notices.push('비밀 파일/로컬 생성 경로가 변경 목록에 있습니다. 내용은 읽지 않으며 커밋 대상에서 제외해야 합니다.');
  if (files.some(file => /^(config\/detection\.ts|lib\/judge\/|supabase\/migrations\/)/.test(file))) notices.push('판단 기준·알림·DB 정책은 기존 사용자 승인 범위를 확인하고 변경 근거를 기록하세요.');
  if (files.some(file => /docs\/shared\/|public\/brand\/|brand\.generated\.css/.test(file))) notices.push('생성 파일을 직접 고치지 말고 원본과 sync 명령을 확인하세요. 검사는 자동으로 동기화하지 않습니다.');
  return {schemaVersion: 1, task, files: unique(files).sort(), profiles, members, checks, evidence, notices};
}

export function parseTestCounts(output, format) {
  if (!format) return null;
  if (format === 'vitest') {
    const start = output.indexOf('{');
    let data;
    try { data = JSON.parse(output.slice(start).trim()); } catch { return null; }
    if (!['numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests', 'numTodoTests'].every(key => Number.isInteger(data[key]) && data[key] >= 0)) return null;
    return {total: data.numTotalTests, passed: data.numPassedTests, failed: data.numFailedTests,
      skipped: data.numPendingTests || 0, todo: data.numTodoTests || 0, cancelled: 0};
  }
  const matches = label => [...output.matchAll(new RegExp('^# ' + label + ' (\\d+)\\s*$', 'gm'))];
  const blocks = matches('tests').length;
  if (!blocks || ['pass', 'fail', 'cancelled', 'skipped', 'todo'].some(label => matches(label).length !== blocks)) return null;
  const count = label => matches(label).reduce((sum, match) => sum + Number(match[1]), 0);
  return {total: count('tests'), passed: count('pass'), failed: count('fail'), skipped: count('skipped'), todo: count('todo'), cancelled: count('cancelled')};
}

export function checkStatus({exitCode, timedOut = false, truncated = false, counts = null, needsCounts = false}) {
  if (timedOut || truncated || exitCode !== 0 || counts?.failed || counts?.cancelled) return 'failed';
  if (needsCounts && (!counts || counts.total < 1)) return 'failed';
  if (counts && (!['total', 'passed', 'failed', 'skipped', 'todo', 'cancelled'].every(key => Number.isInteger(counts[key]) && counts[key] >= 0)
    || counts.total !== counts.passed + counts.failed + counts.skipped + counts.todo + counts.cancelled)) return 'failed';
  if (counts?.skipped || counts?.todo) return 'incomplete';
  return 'passed';
}

export function aggregateStatus(results) {
  if (results.some(item => item.status === 'failed')) return 'failed';
  if (results.some(item => item.status === 'blocked')) return 'blocked';
  if (results.some(item => item.status !== 'passed')) return 'incomplete';
  return results.length ? 'passed' : 'not_run';
}

export function redact(text) {
  return text.replace(/\b(Bearer\s+)[^\s"']+/gi, '$1[REDACTED]')
    .replace(/\b(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g, '[REDACTED_JWT]')
    .replace(/((?:client_secret|access_token|refresh_token|SMARTTHINGS_CLIENT_SECRET|SMARTTHINGS_ENCRYPTION_KEY)["']?\s*[:=]\s*["']?)[^\s,"'&}]+/gi, '$1[REDACTED]')
    .replace(/([?&](?:code|state)=)[^\s&"']+/gi, '$1[REDACTED]');
}

export function fingerprint(entries) {
  return createHash('sha256').update(JSON.stringify([...entries].sort((a, b) => a.path.localeCompare(b.path)))).digest('hex');
}

export function changedEntries(before, after) {
  const left = new Map(before.map(item => [item.path, item.hash]));
  const right = new Map(after.map(item => [item.path, item.hash]));
  return unique([...left.keys(), ...right.keys()]).filter(file => left.get(file) !== right.get(file)).sort();
}
