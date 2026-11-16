import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function verifyPublicAndroid(manifest, bytes) {
  if (manifest.schemaVersion !== 1 || manifest.status !== 'public-test' || manifest.debuggable !== false || manifest.realDeviceVerified !== false) throw Error('Unreviewed Android release status');
  verifyDownloadLocation(manifest);
  if (manifest.applicationId !== 'com.bapmunna.senior' || !/^[a-f0-9]{64}$/.test(manifest.certificateSha256)) throw Error('Missing verified app identity');
  if (!Buffer.isBuffer(bytes) || bytes.length !== manifest.bytes || createHash('sha256').update(bytes).digest('hex') !== manifest.sha256) throw Error('Android APK differs from reviewed release');
  if (bytes.readUInt32LE(0) !== 0x04034b50) throw Error('APK container is invalid');
}

function verifyDownloadLocation(manifest) {
  if (!/^\/bapmunna\/app\/downloads\/\d{8}\/release\.json$/.test(manifest.metadataPath)) throw Error('Invalid public receipt path');
  if (!/^https:\/\/github\.com\/jooji13\/bapmunna-downloads\/releases\/download\/android-[\w.-]+\/bapmunna-health-[\w.-]+\.apk$/.test(manifest.downloadUrl) || manifest.downloadUrl.includes('..')) throw Error('Invalid public APK location');
}

/** Spark cannot host APK files. Only its receipt belongs on Firebase Hosting. */
export async function stagePublicAndroid(root, target) {
  const manifest = JSON.parse(await readFile(path.join(root, 'workspaces/bapmunna-final/downloads/android-test.json'), 'utf8'));
  const source = process.env.BAPMUNNA_ANDROID_APK || path.join(root, 'workspaces/bapmunna-mobile/.local/artifacts/android-apk-signed/bapmunna-health-test.apk');
  let bytes;
  try { bytes = await readFile(source); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // After the first publication a clean checkout can reuse the exact approved bytes.
    verifyDownloadLocation(manifest);
    const response = await fetch(manifest.downloadUrl);
    if (!response.ok) throw Error('Provide the reviewed APK with BAPMUNNA_ANDROID_APK before staging');
    bytes = Buffer.from(await response.arrayBuffer());
  }
  verifyPublicAndroid(manifest, bytes);
  const destination = path.join(target, manifest.metadataPath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(manifest, null, 2) + '\n');
}
