import { Capacitor, registerPlugin } from '@capacitor/core';

/** @type {import('./index').PhoneStepsPlugin} */
export const PhoneSteps = registerPlugin('PhoneSteps', {
  web: () => import('./web.js').then(({ PhoneStepsWeb }) => new PhoneStepsWeb()),
});

export function isPhoneStepsNativeAvailable() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('PhoneSteps');
  } catch {
    return false;
  }
}
