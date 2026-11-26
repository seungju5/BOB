import { deleteApp, getApps } from 'firebase-admin/app';
import { createRuntime } from './index.mjs';

// A private Cloud Run Job entry point. No HTTP route starts a maintenance run.
try {
  const runtime = createRuntime();
  if (!runtime.ready) throw Error();
  if (process.argv[2] === '--poll-power') {
    const power = await runtime.handle.pollDuePower();
    console.log(JSON.stringify({power}));
    if (power.deferred > 0) process.exitCode = 1;
  } else if (process.argv.length === 2) {
    const refresh = await runtime.handle.maintain({ limit: 20, budgetMs: 120000 });
    const cleanup = await runtime.store.cleanupExpired({ limit: 500 });
    const mealRecords = await runtime.store.pruneExpiredMealRecords({ limit: 20 });
    const pilotRecords = await runtime.store.pruneExpiredPilotRecords();
    console.log(JSON.stringify({ refresh, cleanup, mealRecords, pilotRecords }));
    if (refresh.deferred > 0 || pilotRecords.more || pilotRecords.skipped) process.exitCode = 1;
  } else throw new Error('Unknown maintenance command.');
} catch {
  console.error('SmartThings maintenance did not complete.');
  process.exitCode = 1;
} finally {
  await Promise.all(getApps().map((app) => deleteApp(app)));
}
