// Private operator entry point. This is not an HTTP upload route or a Samsung sign-in client.
import {open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {applicationDefault, initializeApp, deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {TEAM_PROJECT_ID} from '../../../config/team.ts';
import {readCapture} from './read-capture.mjs';
import {saveHouseholdReading, saveHouseholdObservations, verifyRecipient} from './household-record.mjs';
import {analyzePowerHistory} from './peak-history.mjs';

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
  return importBuffer({auth,db,grant,bytes:await privateFile(image,10*1024*1024),now});
}

export async function importBuffer({auth,db,grant,bytes,now=Date.now()}) {
  if (grant.projectId !== TEAM_PROJECT_ID || db.projectId !== TEAM_PROJECT_ID || typeof grant.uid !== 'string' ||
      !grant.uid || grant.uid.includes('/') || typeof grant.recipientEmail !== 'string')
    throw Error('Project or recipient binding missing');
  const user = await auth.getUserByEmail(grant.recipientEmail);
  verifyRecipient(user,grant);
  if (grant.format === 'power-history') {
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 2*1024*1024 ||
        createHash('sha256').update(bytes).digest('hex') !== grant.sourceSha256) throw Error('Source does not match the approved history');
    const {observations,peaks} = analyzePowerHistory(JSON.parse(bytes.toString('utf8')),now);
    return saveHouseholdObservations(db,await auth.getUser(user.uid),grant,observations,peaks,now);
  }
  const reading = await readCapture(bytes,grant,now);
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
