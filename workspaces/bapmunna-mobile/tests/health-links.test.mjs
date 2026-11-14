import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const execute = promisify(execFile);
const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(workspace, '../..');
const allowed = ['bapmunna://health', 'bapmunna://health/',
  'https://impact-series.web.app/bapmunna/app/health', 'https://impact-series.web.app/bapmunna/app/health/'];
const denied = ['', 'BAPMUNNA://health', 'bapmunna://HEALTH', ' bapmunna://health',
  'bapmunna://health ', 'bapmunna://health?token=example', 'bapmunna://health#account',
  'bapmunna://health?url=https://example.org', 'bapmunna://user@health', 'bapmunna://health:443',
  'bapmunna://health/../login', 'bapmunna://health/%2e%2e', 'bapmunna://health//',
  'javascript:alert(1)', 'https://impact-series.web.app/bapmunna/health/',
  'https://impact-series.web.app/bapmunna/app/health/?account=example',
  'https://impact-series.web.app/bapmunna/app/health/#example',
  'https://impact-series.web.app:443/bapmunna/app/health/',
  'https://impact-series.web.app.evil.example/bapmunna/app/health/',
  'https://evil.example@impact-series.web.app/bapmunna/app/health/',
  'http://impact-series.web.app/bapmunna/app/health/',
  'https://impact-series.web.app/bapmunna/app/%68ealth/'];

test('Android native deep-link validator accepts only four exact entry URLs', async t => {
  const java = process.env.BAPMUNNA_JAVA_HOME ?? path.join(repo, 'tmp/java21/jdk-21.0.13+9/Contents/Home');
  if (!await access(path.join(java, 'bin/javac')).then(() => true, () => false)) {
    t.skip('JDK unavailable; native link validation is not verified.'); return;
  }
  await mkdir(path.join(workspace, '.local'), { recursive: true });
  const temporary = await mkdtemp(path.join(workspace, '.local/links-java-'));
  try {
    const checks = [
      ...allowed.map(url => `if (!HealthLaunchLink.accepts(${JSON.stringify(url)})) throw new AssertionError("allowed");`),
      ...denied.map(url => `if (HealthLaunchLink.accepts(${JSON.stringify(url)})) throw new AssertionError("rejected");`),
      'if (HealthLaunchLink.accepts(null)) throw new AssertionError("null");',
    ].join('\n');
    const harness = path.join(temporary, 'HealthLaunchCheck.java');
    await writeFile(harness, `package com.bapmunna.senior; public class HealthLaunchCheck { public static void main(String[] args) { ${checks} System.out.println("passed"); } }`);
    await execute(path.join(java, 'bin/javac'), ['-d', temporary,
      path.join(workspace, 'android/app/src/main/java/com/bapmunna/senior/HealthLaunchLink.java'), harness]);
    const result = await execute(path.join(java, 'bin/java'), ['-cp', temporary, 'com.bapmunna.senior.HealthLaunchCheck']);
    assert.match(result.stdout, /passed/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('the actual iOS URL predicate rejects payloads and normalization tricks on host Swift', async t => {
  if (!await execute('/usr/bin/xcrun', ['--find', 'swiftc']).then(() => true, () => false)) {
    t.skip('Host Swift unavailable; this does not validate an iOS build.'); return;
  }
  const source = await readFile(path.join(workspace, 'ios/App/App/SceneDelegate.swift'), 'utf8');
  const predicate = source.slice(source.indexOf('enum HealthLaunchLink'), source.indexOf('class SceneDelegate'));
  assert.ok(predicate.includes('static func accepts'));
  await mkdir(path.join(workspace, '.local'), { recursive: true });
  const temporary = await mkdtemp(path.join(workspace, '.local/links-swift-'));
  try {
    const data = Buffer.from(JSON.stringify({ allowed, denied })).toString('base64');
    const harness = `import Foundation\n${predicate}\nlet fixtures = try! JSONDecoder().decode([String:[String]].self, from: Data(base64Encoded:"${data}")!)\nfor url in fixtures["allowed"]! { precondition(HealthLaunchLink.accepts(url)) }\nfor url in fixtures["denied"]! { precondition(!HealthLaunchLink.accepts(url)) }\nprint("passed")\n`;
    const file = path.join(temporary, 'Links.swift');
    await writeFile(file, harness);
    await execute('/usr/bin/xcrun', ['swiftc', '-module-cache-path', path.join(workspace, '.local/swift-module-cache'), file, '-o', path.join(temporary, 'links')]);
    const result = await execute(path.join(temporary, 'links'));
    assert.match(result.stdout, /passed/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
