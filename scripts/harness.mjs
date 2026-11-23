#!/usr/bin/env node
import {readFile, access} from 'node:fs/promises';
import path from 'node:path';
import {buildPlan, validateTask, MEMBER_IDS, PROFILE_NAMES, CHECKS} from './harness/core.mjs';
import {ROOT, changedFiles, readRepoJson, runProcess, localEnv, runChecks} from './harness/runner.mjs';

const help = `밥뭇나 Super Members · local development harness

  npm run harness -- team
  npm run harness:doctor
  npm run harness:plan -- --task harness/tasks/smartthings-pilot.json
  npm run harness:check
  npm run harness:check -- --profile full --base <commit-or-branch>

Profiles: ${PROFILE_NAMES.join(', ')}
Selected profiles add to changed-file checks; they never suppress them.
Reports: .harness/runs/<timestamp>/report.json and report.md
Exit codes: 0 local checks passed; 1 failed/config error; 2 blocked/incomplete.
No deployment, billing, dependency installation or model API call is performed.
`;

function options(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (!['--task', '--profile', '--base'].includes(flag) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Unknown or incomplete option: ' + flag);
    if (result[flag.slice(2)]) throw new Error('Duplicate option: ' + flag);
    result[flag.slice(2)] = args[++i];
  }
  return result;
}

async function loadTeam() {
  const team = await readRepoJson('harness/team.json');
  if (team.schemaVersion !== 1 || team.maxConcurrentSpecialists !== 3 || team.members?.length !== MEMBER_IDS.length
    || MEMBER_IDS.some(id => !team.members.some(member => member.id === id))) throw new Error('Invalid team configuration.');
  for (const member of team.members) {
    if (typeof member.agentFile !== 'string' || member.agentFile !== `.codex/agents/${member.id}.toml`) throw new Error('Invalid agent path: ' + member.id);
    const source = await readFile(path.join(ROOT, member.agentFile), 'utf8');
    if (!source.includes(`name = "${member.id}"`) || !/description\s*=\s*"/.test(source) || !/developer_instructions\s*=\s*"""/.test(source)) throw new Error('Incomplete agent configuration: ' + member.id);
  }
  return team;
}

async function doctor() {
  const team = await loadTeam();
  const major = Number(process.versions.node.split('.')[0]);
  const dependencies = [];
  for (const relative of ['node_modules/vitest/vitest.mjs', 'node_modules/typescript/bin/tsc', 'node_modules/next/dist/bin/next',
    'integrations/bapmunna-firebase/node_modules/esbuild/package.json', 'integrations/bapmunna-firebase/server/node_modules/firebase-admin/package.json']) {
    let installed = true; try { await access(path.join(ROOT, relative)); } catch { installed = false; }
    dependencies.push({path: relative, installed});
  }
  const java = await runProcess('java', ['-version'], {cwd: ROOT, timeoutMs: 10000, env: localEnv()});
  const codex = await runProcess('codex', ['--version'], {cwd: ROOT, timeoutMs: 10000, env: localEnv()});
  const evidence = await readRepoJson('apps/warming-up/public/service-status/smartthings.json');
  const aliases = await readRepoJson('apps/warming-up/.firebaserc');
  const ready = major >= 22 && major < 27 && dependencies.every(item => item.installed) && evidence.projectId === aliases.projects.default;
  console.log(JSON.stringify({localChecksReady: ready, node: process.versions.node, recommendedNode: '24 LTS', members: team.members.length,
    dependencies, emulatorPrerequisite: {javaAvailable: java.exitCode === 0, note: 'Emulators and integration coverage are not run by doctor.'},
    codexCli: {available: codex.exitCode === 0, requiredForLocalHarness: false,
      note: 'The npm harness works independently. Custom-agent loading depends on the client; pass role instructions through the desktop agent tools if needed.'},
    smartthingsEvidence: {source: 'team_site_configuration', project: evidence.projectId,
      enabled: evidence.enabled, connectionReady: evidence.connectionReady, reason: evidence.reason},
    ci: '.github/workflows/ci.yml',
    note: 'Roles are prepared files; this command does not prove that the current Codex session loaded them.'}, null, 2));
  if (!ready) process.exitCode = 2;
}

try {
  const [command = 'help', ...args] = process.argv.slice(2);
  if (command === 'help' || command === '--help') console.log(help);
  else if (command === 'team') { if (args.length) throw new Error('team takes no options.'); console.log(JSON.stringify(await loadTeam(), null, 2)); }
  else if (command === 'doctor') { if (args.length) throw new Error('doctor takes no options.'); await doctor(); }
  else if (command === 'plan' || command === 'check') {
    const selected = options(args);
    await loadTeam();
    const task = selected.task ? validateTask(await readRepoJson(selected.task)) : null;
    const plan = buildPlan({files: changedFiles(ROOT, selected.base), task, profile: selected.profile});
    if (command === 'plan') console.log(JSON.stringify({...plan, commands: plan.checks.map(id => ({id, command: ['node', ...CHECKS[id].args]}))}, null, 2));
    else {
      const {dir, report} = await runChecks(plan, {progress: message => console.log(message)});
      console.log(`\nLocal checks: ${report.automatedStatus}\nLive integration/deployment: not verified\nEvidence: ${dir}/report.md`);
      process.exitCode = report.automatedStatus === 'passed' ? 0 : report.automatedStatus === 'failed' ? 1 : 2;
    }
  } else throw new Error('Unknown command. Use npm run harness -- help.');
} catch (error) {
  console.error('Harness: ' + error.message);
  process.exitCode = 1;
}
