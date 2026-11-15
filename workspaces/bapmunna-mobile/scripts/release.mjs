import { access, cp, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { verifyCopiedBundle } from './copied-bundle.mjs';

const execute = promisify(execFile);
const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(workspace, '../..');
const local = path.join(workspace, '.local');
const sdk = path.resolve(process.env.BAPMUNNA_ANDROID_SDK ?? path.join(repo, 'tmp/bapmunna-android-sdk'));
const java = path.resolve(process.env.BAPMUNNA_JAVA_HOME ?? path.join(repo, 'tmp/java21/jdk-21.0.13+9/Contents/Home'));
const mode = process.argv[2] ?? 'doctor';
const exists = filename => access(filename).then(() => true, () => false);

async function doctor() {
  const checks = {
    java21: await exists(path.join(java, 'bin/java')),
    androidSdk36: await exists(path.join(sdk, 'platforms/android-36/android.jar')),
    androidBuildTools36: await exists(path.join(sdk, 'build-tools/36.0.0/aapt2')),
    androidBuildTools35: await exists(path.join(sdk, 'build-tools/35.0.0/aapt2')),
    androidSdkLicense: await exists(path.join(sdk, 'licenses/android-sdk-license')),
    xcode: await exists('/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild'),
    preparedHealthPage: await exists(path.join(workspace, 'www/health/index.html')),
  };
  console.log(JSON.stringify({ checks, sdk, java, deployment: 'not-performed', realDeviceProof: 'not-provided' }, null, 2));
  return checks;
}

async function run(binary, args, options = {}) {
  const child = spawn(binary, args, { cwd: workspace, stdio: 'inherit', ...options });
  const result = await new Promise((resolve, reject) => {
    child.on('error', reject); child.on('close', resolve);
  });
  if (result !== 0) throw new Error(`${path.basename(binary)} failed (${result})`);
}

async function evidence(files, target, copiedBundle, verification = null) {
  const artifacts = [];
  for (const file of files) {
    const bytes = await readFile(file);
    artifacts.push({ name: path.basename(file), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const commit = (await execute('git', ['rev-parse', 'HEAD'], { cwd: repo })).stdout.trim();
  const entries = (await execute('git', ['ls-files', '-co', '--exclude-standard', '--', 'packages/phone-steps', 'workspaces/bapmunna-mobile'], { cwd: repo })).stdout.trim().split('\n').filter(Boolean);
  const source = {};
  for (const relative of [...new Set(entries)].sort()) {
    if (relative.includes('/build/') || relative.includes('/node_modules/') || relative.includes('/.local/')) continue;
    const file = path.join(repo, relative);
    if ((await stat(file).catch(() => null))?.isFile()) source[relative] = createHash('sha256').update(await readFile(file)).digest('hex');
  }
  const sourceSnapshot = createHash('sha256').update(JSON.stringify(source)).digest('hex');
  const web = JSON.parse(await readFile(path.join(workspace, 'www/native-build.json'), 'utf8'));
  await writeFile(path.join(target, 'evidence.json'), JSON.stringify({
    createdAt: new Date().toISOString(), mode, commit, sourceSnapshot, sourceFiles: source,
    web, copiedBundle, artifacts, verification, realHealthDataVerified: false, deployed: false,
    signing: mode === 'android-debug' ? 'disposable-local-debug' : ['android-release-signed', 'android-apk-signed'].includes(mode) ? 'provided-release-key' : 'unsigned',
  }, null, 2) + '\n');
}

if (mode === 'doctor') { await doctor(); }
else if (['android-debug', 'android-release-unsigned', 'android-release-signed', 'android-apk-signed'].includes(mode)) {
  const checks = await doctor();
  if (!checks.java21 || !checks.androidSdk36 || !checks.androidBuildTools36 || !checks.androidBuildTools35 || !checks.androidSdkLicense) {
    throw new Error('Install the approved SDK/JDK locally first. This script never accepts licenses or installs SDK packages.');
  }
  if (!(await realpath(sdk)).startsWith(`${repo}${path.sep}`)) throw new Error('Use an SDK inside this repository.');
  await run(process.execPath, ['scripts/verify-shell.mjs']);
  const copiedBefore = await verifyCopiedBundle(workspace, 'android');
  const env = { ...process.env, JAVA_HOME: java, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk,
    ANDROID_USER_HOME: path.join(sdk, 'user'), GRADLE_USER_HOME: path.join(local, 'gradle') };
  const keys = ['BAPMUNNA_KEYSTORE', 'BAPMUNNA_STORE_PASSWORD', 'BAPMUNNA_KEY_ALIAS', 'BAPMUNNA_KEY_PASSWORD'];
  if (['android-release-signed', 'android-apk-signed'].includes(mode)) {
    if (keys.some(key => !env[key]) || !await exists(env.BAPMUNNA_KEYSTORE)) throw new Error('Provide your release keystore and all four signing environment variables. Values are never printed.');
  } else for (const key of keys) delete env[key];
  const release = mode !== 'android-debug';
  const apk = mode === 'android-apk-signed';
  await mkdir(local, { recursive: true });
  if (!release && !await exists(path.join(local, 'debug.keystore'))) {
    // A disposable development key, never a production signing identity.
    await run(path.join(java, 'bin/keytool'), ['-genkeypair', '-keystore', path.join(local, 'debug.keystore'),
      '-storetype', 'JKS', '-storepass', 'android', '-alias', 'androiddebugkey', '-keypass', 'android',
      '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000', '-dname', 'CN=Android Debug,O=Android,C=US']);
  }
  await run(path.join(workspace, 'android/gradlew'), [...(env.BAPMUNNA_GRADLE_OFFLINE === '1' ? ['--offline'] : []), '--no-daemon', '--console=plain', apk ? ':app:assembleRelease' : release ? ':app:bundleRelease' : ':app:assembleDebug'], { cwd: path.join(workspace, 'android'), env });
  assert.deepEqual(await verifyCopiedBundle(workspace, 'android'), copiedBefore, 'Web bundle changed during compilation. Rebuild.');
  const built = path.join(workspace, apk ? 'android/app/build/outputs/apk/release/app-release.apk' : release ? 'android/app/build/outputs/bundle/release/app-release.aab' : 'android/app/build/outputs/apk/debug/app-debug.apk');
  const target = path.join(local, 'artifacts', mode);
  await mkdir(target, { recursive: true });
  const output = path.join(target, apk ? 'bapmunna-health-test.apk' : release ? 'bapmunna-health-release.aab' : 'bapmunna-health-debug.apk');
  await cp(built, output);
  let verification = null;
  if (apk) {
    const buildTools = path.join(sdk, 'build-tools/36.0.0');
    const signature = (await execute(path.join(buildTools, 'apksigner'), ['verify', '--verbose', '--print-certs', output], { env })).stdout;
    const manifest = (await execute(path.join(buildTools, 'aapt2'), ['dump', 'xmltree', output, '--file', 'AndroidManifest.xml'], { env })).stdout;
    assert.doesNotMatch(manifest, /android:debuggable[^\n]*(?:true|0xffffffff)/i, 'Public test APK must not be debuggable.');
    assert.match(signature, /Verified using v2 scheme[^\n]*true/, 'APK v2 signature must verify.');
    const certificateSha256 = signature.match(/Signer #1 certificate SHA-256 digest: ([a-f0-9]+)/i)?.[1];
    assert.ok(certificateSha256, 'Missing signing certificate fingerprint.');
    verification = { debuggable: false, signatureVerified: true, certificateSha256 };
  }
  await evidence([output], target, copiedBefore, verification);
  console.log(`Prepared ${output}. No upload or installation was performed.`);
} else if (mode === 'ios-source') {
  await run(process.execPath, ['scripts/verify-shell.mjs']);
  const copiedBefore = await verifyCopiedBundle(workspace, 'ios');
  const target = path.join(local, 'artifacts/ios-source');
  await mkdir(target, { recursive: true });
  const output = path.join(target, 'bapmunna-health-ios-source.tgz');
  // Source only; excludes private keys, caches, installed packages and compiled artifacts.
  await run('/usr/bin/tar', ['-czf', output, '--exclude=node_modules', '--exclude=.local', '--exclude=build', '--exclude=DerivedData', '--exclude=xcuserdata', '--exclude=local.properties', '--exclude=.DS_Store',
    'packages/phone-steps', 'workspaces/bapmunna-mobile/ios', 'workspaces/bapmunna-mobile/www',
    'workspaces/bapmunna-mobile/scripts', 'workspaces/bapmunna-mobile/capacitor.config.json',
    'workspaces/bapmunna-mobile/package.json', 'workspaces/bapmunna-mobile/package-lock.json',
    'workspaces/bapmunna-mobile/README.md', 'workspaces/bapmunna-mobile/RELEASE.md'], { cwd: repo });
  assert.deepEqual(await verifyCopiedBundle(workspace, 'ios'), copiedBefore, 'Web bundle changed during packaging. Rebuild.');
  await evidence([output], target, copiedBefore);
  console.log(`Prepared ${output}. This is source, NOT a signed or compiled iPhone app.`);
} else throw new Error('Use doctor, android-debug, android-release-unsigned, android-release-signed, android-apk-signed, or ios-source.');
