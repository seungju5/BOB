// The default check uses only public endpoints. --registration additionally
// uses the operator's existing official CLI session to read app metadata.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { parseArgs, promisify } from 'node:util';
import { TEAM_PROJECT_ID, TEAM_SITE_URL, TEAM_SMARTTHINGS_APP_ID } from '../config/team.ts';

const execute = promisify(execFile);

async function checkRegistration(profile) {
  async function appMetadata(command) {
    const args = [command, TEAM_SMARTTHINGS_APP_ID, '--json'];
    if (profile) args.push('--profile', profile);
    try {
      const { stdout } = await execute('smartthings', args, { timeout: 30000, maxBuffer: 256 * 1024 });
      return JSON.parse(stdout);
    } catch {
      throw new Error('삼성 공식 CLI에서 등록된 밥뭇나 앱을 읽지 못했습니다. 앱 소유자 계정과 CLI 설치를 확인해 주세요.');
    }
  }
  const [app, oauth] = await Promise.all([appMetadata('smartapps'), appMetadata('smartapps:oauth')]);
  const hook = app.apiOnly?.subscription;
  const checks = [
    ['등록된 API Access App', app.appId === TEAM_SMARTTHINGS_APP_ID && app.appType === 'API_ONLY'],
    ['기기 읽기 권한', oauth.scope?.length === 1 && oauth.scope[0] === 'r:devices:*'],
    ['운영 콜백 주소', oauth.redirectUris?.includes(TEAM_SITE_URL + '/api/smartthings/callback')],
    ['운영 웹훅 주소', hook?.targetUrl === TEAM_SITE_URL + '/api/smartthings/events'],
    ['삼성 웹훅 확인', hook?.targetStatus === 'CONFIRMED'],
  ];
  for (const [label, ready] of checks) console.log(label + ' · ' + (ready ? '확인' : '준비 필요'));
  return checks.every(([, ready]) => ready);
}

async function read(path) {
  const res = await fetch(TEAM_SITE_URL + path, {
    headers: { accept: 'application/json', 'cache-control': 'no-cache' },
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000),
  });
  assert.match(res.headers.get('content-type') ?? '', /application\/json/i, path + '에서 JSON 응답을 받지 못했습니다.');
  return { res, value: await res.json() };
}

try {
  const { values } = parseArgs({ options: { registration: { type: 'boolean' }, profile: { type: 'string' } } });
  if (values.profile && !values.registration) throw new Error('--profile은 --registration과 함께 사용해 주세요.');
  const init = await read('/__/firebase/init.json');
  assert.equal(init.res.status, 200);
  assert.equal(init.value.projectId, TEAM_PROJECT_ID);
  const { res, value } = await read('/api/smartthings/config');
  assert.equal(res.status, 200);
  assert.equal(value.projectId, TEAM_PROJECT_ID);
  assert.equal(typeof value.enabled, 'boolean');
  assert.equal(typeof value.connectionReady, 'boolean');
  assert.equal(value.consentVersion, 'smartthings-read-2026-11-22');
  assert.match(res.headers.get('cache-control') ?? '', /\bno-store\b/i);
  assert(!value.connectionReady || value.enabled);

  if (value.enabled) {
    assert.equal(value.appId, TEAM_SMARTTHINGS_APP_ID, '등록된 밥뭇나 삼성 앱을 확인해 주세요.');
    const status = await read('/api/smartthings/status');
    assert.equal(status.res.status, 401);
    assert.equal(status.value.error, 'login_required');
  }
  if (!value.connectionReady) {
    console.log(value.mode === 'hosting-only'
      ? '팀 Firebase가 응답했습니다. 삼성 기기 연결 서버는 운영 사이트에 배포되지 않았습니다.'
      : '팀 Firebase가 응답했습니다. 운영 서버가 새 삼성 계정 연결을 받을 준비가 되지 않았습니다.');
    process.exitCode = 2;
  } else {
    console.log('팀 서버가 새 연결을 받고, 로그인하지 않은 요청을 차단합니다. 실제 수신은 앱에서 기기를 선택한 뒤 마지막 자동 수신 시각으로 확인하세요.');
  }
  if (values.registration && !await checkRegistration(values.profile)) process.exitCode = 2;
} catch (error) {
  console.error('운영 연결 점검 실패.', error.message);
  process.exitCode = 1;
}
