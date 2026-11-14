import { PhoneSteps, isPhoneStepsNativeAvailable, type PhoneStepsPlugin } from "@bapmunna/phone-steps";

/** A pairing change ends this app's health-read consent, without revoking OS grants.
 * No token, household identifier or health count is persisted here.
 */
type ResetMarker = { pending: () => boolean; setPending: (value: boolean) => void };
export function createStepsConsentBoundary(provider: PhoneStepsPlugin, available = () => true, marker?: ResetMarker) {
  let revision = 0;
  let barrier = Promise.resolve();
  let resetFailed = false;
  let resetting = 0;

  function reset() {
    if (!available()) return;
    const request = ++revision;
    // Persist before the caller writes a new pairing token. If the app closes
    // mid-reset, the next launch must disconnect before making any health read.
    let marked = true;
    try { marker?.setPending(true); } catch { marked = false; }
    resetting += 1;
    // Serialize resets. New readers wait until every queued disconnect completes.
    barrier = barrier.then(async () => {
      try {
        await provider.disconnect();
        if (request === revision) marker?.setPending(false);
        resetFailed = !marked;
      }
      catch { resetFailed = true; }
      finally { resetting -= 1; }
    });
  }

  async function guarded<T>(read: () => Promise<T>) {
    if (available() && resetting === 0 && marker?.pending()) reset();
    let expected: number;
    do { expected = revision; await barrier; } while (expected !== revision);
    if (resetFailed) throw new Error("health_consent_reset_required");
    const result = await read();
    if (revision !== expected) throw new Error("health_consent_changed");
    return result;
  }

  const driver: PhoneStepsPlugin = {
    status: () => guarded(() => provider.status()),
    connect: () => guarded(() => provider.connect()),
    readToday: () => guarded(() => provider.readToday()),
    disconnect: async () => {
      reset();
      return guarded(() => provider.status());
    },
    openSettings: () => provider.openSettings(),
  };
  return { driver, reset };
}

const RESET_KEY = "bapmutna.steps.reset-pending";
const seniorConsent = createStepsConsentBoundary(PhoneSteps, isPhoneStepsNativeAvailable, {
  pending: () => localStorage.getItem(RESET_KEY) === "1",
  setPending: (value) => { if (value) localStorage.setItem(RESET_KEY, "1"); else localStorage.removeItem(RESET_KEY); },
});
export const seniorPhoneSteps = seniorConsent.driver;
export const resetSeniorStepsConsent = seniorConsent.reset;
