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
});
