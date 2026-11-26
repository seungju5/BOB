import { describe, expect, it } from 'vitest';
import { firebaseLoginDestination } from '@/lib/firebase/login-destination';

const family = {user: {verified: true}, operator: false, view: {onboardingStep: 8, seniorConsent: true}};
const day = '2026-01-21';

describe.each([false, true])('family sign-in with operator access %s', operator => {
  const account = {...family, operator};

  it('opens the guardian home, saved onboarding or device setup according to family progress', () => {
    expect(firebaseLoginDestination(account, null, null, null)).toBe('/home');
    for (const [step, path] of [[4, '/onboarding'], [1, '/connect/']] as const) {
      const view = {...account.view, onboardingStep: step};
      expect(firebaseLoginDestination({...account, view}, null, null, null)).toBe(path);
    }
  });

  it('keeps the requested family screen, date and meal', () => {
    expect(firebaseLoginDestination(account, 'connect', null, null)).toBe('/connect/');
    expect(firebaseLoginDestination(account, 'account', null, null)).toBe('/account/');
    expect(firebaseLoginDestination(account, 'household-notice', null, null)).toBe('/alerts/');
    expect(firebaseLoginDestination(account, 'record', day, 'lunch')).toBe('/records/?day=' + day + '&slot=lunch');
    expect(firebaseLoginDestination(account, 'record', day, 'unknown')).toBe('/records/?day=' + day);
  });

  it('requires household consent for its records and ignores malformed destinations', () => {
    const beforeConsent = {...account, view: {onboardingStep: 1, seniorConsent: false}};
    expect(firebaseLoginDestination(beforeConsent, 'record', day, 'lunch')).toBe('/connect/');
    expect(firebaseLoginDestination(beforeConsent, 'household-notice', null, null)).toBe('/connect/');
    expect(firebaseLoginDestination(account, 'record', '2026-02-31', null)).toBe('/home');
    expect(firebaseLoginDestination(account, '/admin/', null, null)).toBe('/home');
  });
});

describe('explicit studio entry', () => {
  it('requires both a verified account and an operator grant', () => {
    const operator = {...family, operator: true};
    expect(firebaseLoginDestination(operator, 'studio', null, null)).toBe('/admin/');
    expect(firebaseLoginDestination(family, 'studio', null, null)).toBeNull();
    for (const user of [null, undefined, {verified: false}]) {
      expect(firebaseLoginDestination({...operator, user}, 'studio', null, null)).toBeNull();
      expect(firebaseLoginDestination({...operator, user}, null, null, null)).toBeNull();
    }
  });

  it('keeps family profile setup reachable for an operator who has not created a family profile', () => {
    const noProfile = {...family, view: null, operator: true};
    expect(firebaseLoginDestination(noProfile, null, null, null)).toBeNull();
    expect(firebaseLoginDestination(noProfile, 'studio', null, null)).toBe('/admin/');
  });
});
