import { SENIOR_CONSENT_REQUIRED } from "@/lib/privacy/notice";
import { HOUSEHOLD_STEP, type OnboardingPatch } from "./view";

/** A client-side write guard, not a substitute for provider-side authorization. */
export function assertOnboardingConsent(current: { onboardingStep: number; seniorConsent: boolean }, step: number, patch: OnboardingPatch) {
  const consent = patch.seniorConsent ?? current.seniorConsent;
  const onlyWithdrawal = step === current.onboardingStep && patch.seniorConsent === false && Object.keys(patch).length === 1;
  if (onlyWithdrawal) return;
  const writesPersonalData = Boolean(patch.senior || patch.household || patch.mealProfile || patch.alertSettings);
  if (!consent && (step > HOUSEHOLD_STEP || writesPersonalData)) throw new Error(SENIOR_CONSENT_REQUIRED);
}
