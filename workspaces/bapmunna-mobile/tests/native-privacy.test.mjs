import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const execute = promisify(execFile);
const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(workspace, '../..');

test('OS health permission explanations disclose family sharing and separate optional public ranking', async () => {
  for (const filename of ['ios/App/App/Info.plist','android/app/src/main/java/com/bapmunna/senior/HealthPermissionsRationaleActivity.java']) {
    const source = await readFile(path.join(workspace,filename),'utf8');
    assert.match(source,/가족 연결과 이 휴대폰의 공유에 동의/);
    assert.match(source,/공개 순위는 따로 선택한 경우에만 별명과 합계를 다른 참여자에게 보여드려요/);
    assert.match(source,/건강 조회만으로 공유되지는 않아요/);
    assert.doesNotMatch(source,/걸음수[는를] 서버[나·]가족에게 보내지 않아요/);
  }
});

test('Apple privacy manifest declares optional account-linked HealthKit fitness collection without tracking', async () => {
  const filename = path.join(repo,'packages/phone-steps/ios/Sources/PhoneStepsPlugin/PrivacyInfo.xcprivacy');
  const result = await execute('python3',['-c','import plistlib,json,sys; print(json.dumps(plistlib.load(open(sys.argv[1],"rb"))))',filename]);
  const privacy = JSON.parse(result.stdout);
  assert.equal(privacy.NSPrivacyTracking,false);
  const fields = new Map(privacy.NSPrivacyCollectedDataTypes.map(entry => [entry.NSPrivacyCollectedDataType,entry]));
  assert.deepEqual([...fields.keys()].sort(),['NSPrivacyCollectedDataTypeFitness','NSPrivacyCollectedDataTypeHealth','NSPrivacyCollectedDataTypeUserID']);
  for (const entry of fields.values()) {
    assert.equal(entry.NSPrivacyCollectedDataTypeLinked,true);
    assert.equal(entry.NSPrivacyCollectedDataTypeTracking,false);
    assert.deepEqual(entry.NSPrivacyCollectedDataTypePurposes,['NSPrivacyCollectedDataTypePurposeAppFunctionality']);
  }
});
