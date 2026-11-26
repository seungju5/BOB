// Private operator entry point. This is not an HTTP upload route or a Samsung sign-in client.
import {open} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {applicationDefault, initializeApp, deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {TEAM_PROJECT_ID} from '../../../config/team.ts';
import {readCapture} from './read-capture.mjs';
import {saveHouseholdReading, verifyRecipient} from './household-record.mjs';

async function privateFile(path, limit) {
  const file = await open(path,'r');
  try {
    const s = await file.stat();
    if (!s.isFile() || s.size < 1 || s.size > limit || (s.mode & 0o077) !== 0) throw Error('Expected a private bounded source file');
    return await file.readFile();
  } finally { await file.close(); }
}

export async function importFile({auth,db,manifest,image,now=Date.now()}) {
  const grant = JSON.parse((await privateFile(manifest,16384)).toString('utf8'));
  if (grant.projectId !== TEAM_PROJECT_ID || db.projectId !== TEAM_PROJECT_ID || typeof grant.uid !== 'string' ||
      !grant.uid || grant.uid.includes('/') || typeof grant.recipientEmail !== 'string')
    throw Error('Project or recipient binding missing');
  const user = await auth.getUserByEmail(grant.recipientEmail);
  verifyRecipient(user,grant);
  const reading = await readCapture(await privateFile(image,10*1024*1024),grant,now);
  const active = await auth.getUser(user.uid);
  verifyRecipient(active,grant);
  return saveHouseholdReading(db,active,grant,reading,now);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  if (process.argv.length !== 4) {
    console.error('Usage: npm run pilot:import -- <private household grant.json> <authorized meter image or export>');
    process.exitCode = 2;
  } else {
    const app = initializeApp({projectId:TEAM_PROJECT_ID,credential:applicationDefault()});
    try {
      const result = await importFile({auth:getAuth(app),db:getFirestore(app),manifest:process.argv[2],image:process.argv[3]});
      console.log('Private household day record: '+result.status);
    } catch {
      console.error('No import confirmed. Check project, verified recipient, consent, source and date.');
      process.exitCode = 1;
    } finally { await deleteApp(app); }
  }
}
