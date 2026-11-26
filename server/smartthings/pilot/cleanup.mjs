import {applicationDefault, deleteApp, initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {TEAM_PROJECT_ID} from '../../../config/team.ts';
import {sweepPilotBuckets} from './retention.mjs';

const args = process.argv.slice(2);
if (args.length > 1 || args.length === 1 && !['--check', '--apply'].includes(args[0])) {
  console.error('Usage: npm run pilot:cleanup -- [--check|--apply]');
  process.exitCode = 2;
} else {
  const app = initializeApp({projectId:TEAM_PROJECT_ID, credential:applicationDefault()});
  try {
    const result = await sweepPilotBuckets(getFirestore(app), {apply:args[0] === '--apply'});
    console.log(JSON.stringify(result));
    if (result.more || result.skipped) process.exitCode = 1;
  } catch {
    console.error('Pilot retention check did not complete. Check the project credentials and day indexes.');
    process.exitCode = 1;
  } finally { await deleteApp(app); }
}
