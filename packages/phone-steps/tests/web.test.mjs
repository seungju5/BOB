import assert from 'node:assert/strict';
import test from 'node:test';
import { PhoneSteps, isPhoneStepsNativeAvailable } from '../src/index.js';

test('web/SSR never claims native availability or invents today steps', async () => {
  assert.equal(isPhoneStepsNativeAvailable(), false);
  for (const method of ['status', 'connect', 'readToday', 'disconnect']) {
    const result = await PhoneSteps[method]();
    assert.equal(result.schemaVersion, 1);
    assert.equal(result.status, 'unsupported');
    assert.equal(result.reason, 'native-unavailable');
    assert.equal(result.count, null);
    assert.equal(result.updatedAt, null);
    assert.equal(result.trackingSince, null);
    assert.equal(result.source, null);
    assert.match(result.localDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(result.timeZone);
  }
});

test('web does not pretend it opened native settings', async () => {
  await assert.rejects(PhoneSteps.openSettings(), /휴대폰 앱/);
  await assert.rejects(PhoneSteps.openWebApp(), /휴대폰 앱/);
});

test('browser ranking/reminder fallbacks neither request permission nor send or store health data', async () => {
  let networkCalls = 0, storageCalls = 0;
  const originalFetch = globalThis.fetch;
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  globalThis.fetch = async () => { networkCalls++; throw new Error('Network forbidden in native fallback'); };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { storageCalls++; throw new Error('Storage forbidden in native fallback'); } });
  try {
    assert.deepEqual(await PhoneSteps.rankingStatus(), {linked:false,confirmed:false,revokePending:false});
    assert.deepEqual(await PhoneSteps.rankingSync(), {ok:false,reason:'native-unavailable'});
    assert.equal((await PhoneSteps.readRankingToday()).count, null);
    assert.equal((await PhoneSteps.walkReminderStatus()).enabled, false);
    for (const operation of [
      () => PhoneSteps.rankingLink({code:'12345678'}),
      () => PhoneSteps.rankingConfirm({consentVersion:'2026-11-17',shareTodaySteps:true}),
      () => PhoneSteps.rankingBoard(),
      () => PhoneSteps.configureWalkReminders({enabled:true,times:['13:00'],bloodSugarReminder:true}),
      () => PhoneSteps.openWalkingWebApp(),
    ]) await assert.rejects(operation(), /휴대폰 앱/);
    await PhoneSteps.rankingDisconnect();
    assert.equal(networkCalls, 0);
    assert.equal(storageCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else delete globalThis.localStorage;
  }
});
