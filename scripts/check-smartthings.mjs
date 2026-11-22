// Read the public, first-party configuration and check the account boundary.
// No Samsung or Firebase credentials or household identifiers are needed here.
import assert from 'node:assert/strict';
import { TEAM_PROJECT_ID, TEAM_SITE_URL, TEAM_SMARTTHINGS_APP_ID } from '../config/team.ts';

async function read(path) {
  const res = await fetch(TEAM_SITE_URL + path, {
    headers: { accept: 'application/json', 'cache-control': 'no-cache' },
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000),
  });
  assert.match(res.headers.get('content-type') ?? '', /application\/json/i, path + '에서 JSON 응답을 받지 못했습니다.');
  return { res, value: await res.json() };
}

try {
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
} catch (error) {
  console.error('운영 연결 점검 실패.', error.message);
  process.exitCode = 1;
}
