import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const execute = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '../..');

test('Swift response boundary preserves absence and never returns private response fields', async t => {
  const compiler = '/usr/bin/swiftc';
  const types = path.join(process.env.CAPACITOR_IOS_ROOT ?? path.join(repo,'node_modules/@capacitor/ios'),'Capacitor/Capacitor/JSTypes.swift');
  if (process.platform !== 'darwin' || !await access(types).then(() => true, () => false)) {
    t.skip('macOS Swift and the installed Capacitor JS type source are needed; this is not an iOS build.'); return;
  }
  await mkdir(path.join(root, '.local'), {recursive:true});
  const output = await mkdtemp(path.join(root, '.local/swift-payload-'));
  try {
    // The production helper compiles against the actual Capacitor JSValue/coercion
    // source, not a test-created approximation of its Foundation bridging rules.
    const common = ['-swift-version','5','-module-cache-path',path.join(output,'cache')];
    await execute(compiler, [...common,'-emit-library','-emit-module','-module-name','Capacitor',types,
      path.join(path.dirname(types),'Codable/JSValueDecoder.swift'),
      '-emit-module-path',path.join(output,'Capacitor.swiftmodule'),'-o',path.join(output,'libCapacitor.dylib')]);
    await execute(compiler, [...common,'-I',output,'-L',output,'-lCapacitor',
      path.join(root,'ios/Sources/PhoneStepsPlugin/WalkingPayload.swift'),path.join(root,'tests/WalkingPayloadCheck.swift'),
      '-o',path.join(output,'check')]);
    const result = await execute(path.join(output,'check'), [], {env:{...process.env,DYLD_LIBRARY_PATH:output}});
    assert.match(result.stdout,/passed/);
  } finally { await rm(output,{recursive:true,force:true}); }
});
