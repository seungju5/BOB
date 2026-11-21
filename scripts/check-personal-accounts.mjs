// 개인 계정(Peter의 Firebase·Vercel·GitHub·Gmail 등)에 묶인 값이 코드에 새로 들어오는 것을 막는다.
// - 배포 대상 값은 config/deployment.json 한 곳에만 둔다 (생성 파일 제외).
// - 이전 전부터 있던 파일은 config/personal-account-allowlist.txt에 있다. 이전 작업으로 고치면 목록에서 지운다.
// 사용: npm run check:accounts            (새로 들어온 개인 계정 값이 있으면 실패)
//       npm run check:accounts -- --update (현재 상태로 허용 목록을 다시 쓴다. 줄이는 용도로만 쓴다)
import {execFileSync} from 'node:child_process';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const listFile = path.join(root, 'config/personal-account-allowlist.txt');
const PATTERN = 'peterjang|jooji13|ku-gpa|impact-series|bapmunna-smartthings\\.vercel\\.app|dakozsbqltciqihazzel|54fac45c';
// 기록·영수증·생성물은 과거 사실이라 검사하지 않는다.
const EXCLUDE = [
  ':!*.md', ':!**/releases/**', ':!documentation/**', ':!**/documentation/**', ':!**/evidence/**',
  ':!package-lock.json', ':!**/package-lock.json',
  ':!config/deployment.json', ':!config/personal-account-allowlist.txt', ':!scripts/check-personal-accounts.mjs',
  ':!**/deployment-config.mjs', ':!**/firebase-config.mjs', ':!**/smartthings-config.mjs', ':!**/kakao-config.mjs', ':!**/supabase-config.mjs',
  ':!integrations/bapmunna-firebase/docs/cloud/**', ':!integrations/bapmunna-firebase/workshop/**',
];

let found = [];
try {
  found = execFileSync('git', ['grep', '-l', '-E', PATTERN, '--', '.', ...EXCLUDE], {cwd: root, encoding: 'utf8'})
    .split('\n').filter(Boolean).sort();
} catch (error) { if (error.status !== 1) throw error; } // 1 = no match

if (process.argv.includes('--update')) {
  await writeFile(listFile, '# 이전 전부터 개인 계정 값이 남아 있는 파일 (docs/team-migration.md). 고치면 이 목록에서 지운다.\n' + found.join('\n') + '\n');
  console.log(`Allowlist rewritten with ${found.length} files.`);
} else {
  const allowed = new Set((await readFile(listFile, 'utf8')).split(/\r?\n/).filter(l => l && !l.startsWith('#')));
  const added = found.filter(f => !allowed.has(f));
  const fixed = [...allowed].filter(f => !found.includes(f));
  if (fixed.length) console.log(`정리된 파일 ${fixed.length}개 — 허용 목록에서 지워 주세요:\n  ${fixed.join('\n  ')}`);
  if (added.length) {
    console.error(`개인 계정 값이 새 파일에 들어왔어요. config/deployment.json(lib/deployment.ts)을 쓰도록 바꿔 주세요:\n  ${added.join('\n  ')}`);
    process.exitCode = 1;
  } else console.log(`No new personal-account values (${found.length} legacy files remain).`);
}
