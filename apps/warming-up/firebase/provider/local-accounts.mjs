import { connectAuthEmulator } from 'firebase/auth';
import { connectFirestoreEmulator } from 'firebase/firestore';
import { createProvider } from './firebase-provider.src.mjs';
import emulatorConfig from '../emulators.json';

export function createLocalAccountProvider() {
  const config = {projectId:'demo-warming-up', apiKey:'local-account-testing', appId:'1:123:web:abc', authDomain:'localhost'};
  return createProvider(config, {configureClients(auth, db) {
    if (auth.emulatorConfig) return;
    const {firestore, auth: localAuth} = emulatorConfig.emulators;
    connectFirestoreEmulator(db, '127.0.0.1', firestore.port);
    connectAuthEmulator(auth, 'http://127.0.0.1:' + localAuth.port);
  }});
}
