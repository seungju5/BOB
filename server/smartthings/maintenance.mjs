import { deleteApp, getApps } from 'firebase-admin/app';
import { createRuntime } from './index.mjs';

// A private Cloud Run Job entry point. No HTTP route starts a maintenance run.
try {
  const runtime = createRuntime();
  if (!runtime.ready) throw Error();
  const refresh = await runtime.handle.maintain({ limit: 20, budgetMs: 120000 });
  const cleanup = await runtime.store.cleanupExpired({ limit: 500 });
  console.log(JSON.stringify({ refresh, cleanup }));
  if (refresh.deferred > 0) process.exitCode = 1;
} catch {
  console.error('SmartThings maintenance did not complete.');
  process.exitCode = 1;
} finally {
  await Promise.all(getApps().map((app) => deleteApp(app)));
}
