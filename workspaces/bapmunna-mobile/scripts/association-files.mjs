import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fingerprint = process.env.BAPMUNNA_ANDROID_SHA256;
const prefix = process.env.BAPMUNNA_APPLE_APP_ID_PREFIX;
if (!fingerprint && !prefix) throw new Error('Provide the real release signing SHA256 and/or Apple App Identifier Prefix. No placeholders are generated.');
const target = path.join(workspace, '.local/association/.well-known');
await mkdir(target, { recursive: true });
if (fingerprint) {
  if (!/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(fingerprint)) throw new Error('Expected an uppercase colon-delimited release certificate SHA256.');
  await writeFile(path.join(target, 'assetlinks.json'), JSON.stringify([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: 'com.bapmunna.senior', sha256_cert_fingerprints: [fingerprint] },
  }], null, 2) + '\n');
}
if (prefix) {
  if (!/^[A-Z0-9]{10}$/.test(prefix)) throw new Error('Expected the real 10-character Apple App Identifier Prefix.');
  await writeFile(path.join(target, 'apple-app-site-association'), JSON.stringify({
    applinks: { details: [{ appIDs: [`${prefix}.com.bapmunna.senior`], components: [
      { '/': '/bapmunna/app/health' }, { '/': '/bapmunna/app/health/' },
    ] }] },
  }, null, 2) + '\n');
}
console.log(`Prepared local files in ${target}; no deployment was performed.`);
