// 팀원 누구의 개인 정보든 저장소에 새로 들어오지 않게 막는다 (특정인을 지정하지 않는다).
// 잡는 것: 개인 메일 주소, 휴대폰 번호, 주민등록번호 형태, 내 컴퓨터 경로·호스트 이름,
//          개인 Vercel 배포 주소, 비밀 키.
// - 팀이 공개해도 되는 값(공용 메일 등)은 config/personal-info.json의 allowed에 적는다.
// - 이 검사를 만들 때 이미 있던 파일은 config/personal-info.json의 legacyFiles에 있다. 정리하면 목록에서 지운다.
// 사용: npm run check:personal-info               (새 파일에 개인 정보가 있으면 실패)
//       npm run check:personal-info -- --update   (legacyFiles를 현재 상태로 다시 쓴다. 줄이는 용도로만)
import {execFileSync} from 'node:child_process';
import {readFile, writeFile, stat} from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const configFile = path.join(root, 'config/personal-info.json');
const config = JSON.parse(await readFile(configFile, 'utf8'));
const allowed = new Set((config.allowed || []).map(v => v.toLowerCase()));

const RULES = [
  ['개인 메일', /[A-Za-z0-9._%+-]+@(?:gmail|naver|daum|hanmail|kakao|nate|hotmail|outlook|live|icloud|me|yahoo|korea\.ac)\.(?:com|net|kr)/gi],
  ['내 컴퓨터 주소', /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.local\b/g],
  ['휴대폰 번호', /\b01[016789][- .]?\d{3,4}[- .]?\d{4}\b/g],
  ['주민등록번호 형태', /\b\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])-[1-4]\d{6}\b/g],
  ['내 컴퓨터 경로', /(?:\/Users\/(?!Shared\b)[A-Za-z0-9._-]+\/|[A-Za-z]:\\\\?Users\\\\?(?!Public\b)[A-Za-z0-9._-]+|\/home\/(?!runner\b)[A-Za-z0-9._-]+\/)/g],
  ['개인 Vercel 배포 주소', /[a-z0-9-]+-[a-z0-9]+-\d{4}\.vercel\.app|vercel\.com\/[a-z0-9-]+-\d{4}\//gi],
  // 실제 키 내용(긴 base64)이 이어질 때만. 검사 코드·가짜 키(SYNTHETIC)는 통과.
  ['비밀 키', /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----(?:\\n|\s)*[A-Za-z0-9+/]{60}/g],
];
// 테스트용 가짜 번호(…1234-5678, 같은 숫자 4개 반복)는 통과.
const fakePhone = v => { const d = v.replace(/\D/g, ''); return /12345678$/.test(d) || /(\d)\1{3}/.test(d.slice(3)); };
// 예시·자리표시 값은 개인 정보가 아니다.
const harmless = (v, label) => (label === '휴대폰 번호' && fakePhone(v)) || /example\.(?:com|org)|noreply|users\.noreply\.github\.com|^name@|^user@|^you@|^test@|010-?0000-?0000/i.test(v) || allowed.has(v.toLowerCase());
const SKIP = /(?:^|\/)(?:package-lock\.json|.*\.(?:png|jpe?g|webp|gif|ico|pdf|woff2?|ttf|otf|mp4|webm|mp3|wav|apk|aab|jar|keystore|jks|zip|gz))$/i;

const files = execFileSync('git', ['ls-files', '-z'], {cwd: root, encoding: 'utf8'}).split('\0').filter(f => f && !SKIP.test(f));
const found = new Map();
for (const file of files) {
  if (file === 'config/personal-info.json' || file === 'scripts/check-personal-info.mjs') continue;
  const full = path.join(root, file);
  const info = await stat(full).catch(() => null);
  if (!info?.isFile() || info.size > 4 * 1024 * 1024) continue;
  const text = await readFile(full, 'utf8');
  if (text.includes('\0')) continue;
  const hits = [];
  for (const [label, re] of RULES) for (const m of text.matchAll(re)) if (!harmless(m[0], label)) hits.push(`${label}: ${m[0]}`);
  if (hits.length) found.set(file, [...new Set(hits)]);
}

if (process.argv.includes('--update')) {
  config.legacyFiles = [...found.keys()].sort();
  await writeFile(configFile, JSON.stringify(config, null, 2) + '\n');
  console.log(`legacyFiles rewritten with ${config.legacyFiles.length} files.`);
} else {
  const legacy = new Set(config.legacyFiles || []);
  const added = [...found].filter(([f]) => !legacy.has(f));
  const cleaned = [...legacy].filter(f => !found.has(f));
  if (cleaned.length) console.log(`정리된 파일 ${cleaned.length}개 — config/personal-info.json legacyFiles에서 지워 주세요:\n  ${cleaned.join('\n  ')}`);
  if (added.length) {
    console.error('개인 정보가 들어 있어요. 지우거나, 팀이 공개해도 되는 값이면 config/personal-info.json의 allowed에 추가해 주세요.');
    for (const [f, hits] of added) console.error(`  ${f}\n    - ${hits.slice(0, 5).join('\n    - ')}`);
    process.exitCode = 1;
  } else console.log(`No new personal information (${legacy.size} legacy files to clean up).`);
}
