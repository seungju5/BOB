import test from 'node:test';
import assert from 'node:assert/strict';
import { teamFirebaseConfig } from '../provider/team-config.mjs';

const project = 'demo-warming-up';
const valid = {
  projectId: project,
  authDomain: project + '.firebaseapp.com',
  apiKey: 'AIza' + 'A'.repeat(35),
  appId: '1:1000:web:1234abcd',
};
test('initialization keeps only the approved project settings', () => {
  assert.deepEqual(teamFirebaseConfig({...valid, databaseURL: 'https://unused.example.test'}, project), valid);
});
test('a mismatched project, authorization domain, or incomplete app is rejected', () => {
  for (const changed of [null, {projectId: 'demo-other'}, {authDomain: 'different.example.test'}, {appId: ''}, {apiKey: 'example'}]) {
    assert.throws(() => teamFirebaseConfig(changed && {...valid, ...changed}, project));
  }
});
