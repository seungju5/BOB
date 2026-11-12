// Compile the canonical Supabase domain, never copy its visual design or credentials.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname, relative, sep } from 'node:path';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const target = resolve(root, 'integrations/bapmunna-firebase/docs/shared');
const check = process.argv.includes('--check');
const files = ['config/detection.ts', 'lib/judge/time.ts', 'lib/judge/types.ts',
  'lib/judge/detectEvents.ts', 'lib/judge/resolveMealSlots.ts', 'lib/judge/evaluateAlerts.ts', 'lib/data/view.ts'];
const manifest = { canonical: 'repository root: Next.js/Supabase', files: {} };
let stale = false;
async function output(path, content) {
  if (check) {
    const actual = await readFile(path, 'utf8').catch(() => null);
    if (actual !== content) { console.error('Out of sync:', relative(root, path)); stale = true; }
  } else { await mkdir(dirname(path), { recursive: true }); await writeFile(path, content); }
}
for (const file of files) {
  const source = await readFile(resolve(root, file), 'utf8');
  manifest.files[file] = createHash('sha256').update(source).digest('hex');
  const built = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, newLine: ts.NewLineKind.LineFeed,
  }}).outputText.replace(/(from\s+["'])([^"']+)(["'])/g, (_, before, spec, after) => {
    const resolved = spec.startsWith('@/') ? spec.slice(2) : relative(root, resolve(root, dirname(file), spec)).split(sep).join('/');
    const sourcePath = resolved.endsWith('.ts') ? resolved : `${resolved}.ts`;
    if (!files.includes(sourcePath)) throw Error(`Unreviewed runtime dependency: ${file} → ${spec}`);
    let local = relative(dirname(file), sourcePath).split(sep).join('/').replace(/\.ts$/, '.mjs');
    if (!local.startsWith('.')) local = './' + local;
    return before + local + after;
  });
  await output(resolve(target, file.replace(/\.ts$/, '.mjs')), `// GENERATED from ${file}. Run npm run sync:firebase at repository root.\n${built}`);
}
await output(resolve(target, 'source-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
if (stale) { console.error('Run npm run sync:firebase, review behavior changes, then run npm run test:firebase.'); process.exitCode = 1; }
else console.log(check ? 'Firebase domain matches the Supabase source.' : 'Updated Firebase domain from the canonical Supabase source.');
