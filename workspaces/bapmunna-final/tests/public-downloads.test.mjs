import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyPublicAndroid } from '../scripts/public-downloads.mjs';

const bytes = Buffer.from('504b030400000000', 'hex');
const manifest = { schemaVersion: 1, status: 'public-test', debuggable: false, realDeviceVerified: false,
  metadataPath: '/bapmunna/app/downloads/20261115/release.json',
  downloadUrl: 'https://github.com/jooji13/bapmunna-downloads/releases/download/android-0.1.0-test.1/bapmunna-health-0.1.0-test.1.apk',
  applicationId: 'com.bapmunna.senior', certificateSha256: 'a'.repeat(64),
  bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };

test('staging refuses modified or substituted APK bytes', () => {
  assert.doesNotThrow(() => verifyPublicAndroid(manifest, bytes));
  assert.throws(() => verifyPublicAndroid(manifest, Buffer.concat([bytes, Buffer.from('x')])));
  const corrupt = Buffer.from(bytes); corrupt[7] = 1;
  assert.throws(() => verifyPublicAndroid(manifest, corrupt));
});
test('staging cannot publish debug/private/out-of-scope artifacts or claim device success', () => {
  for (const change of [
    { metadataPath: '/bapmunna/app/downloads/20261115/private.p12' },
    { downloadUrl: 'https://github.com/another/repo/releases/download/v1/app.apk' },
    { downloadUrl: 'https://evil.example/bapmunna.apk' },
    { metadataPath: '/other/app.apk' }, { debuggable: true }, { realDeviceVerified: true },
    { certificateSha256: '' }, { applicationId: 'another.app' },
  ]) assert.throws(() => verifyPublicAndroid({ ...manifest, ...change }, bytes));
});
