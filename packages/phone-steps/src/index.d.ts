export type PhoneStepsStatus =
  | "unsupported" | "not-connected" | "permission-required"
  | "permission-denied" | "ready" | "no-data" | "error";

export type PhoneStepsReason =
  | "native-unavailable" | "health-data-unavailable"
  | "health-connect-unavailable" | "health-connect-update-required"
  | "permission-revoked" | "permission-restricted" | "provider-error";

export interface PhoneStepsSnapshot {
  schemaVersion: 1;
  status: PhoneStepsStatus;
  /** Nonnegative integer only when status is ready. Empty records are never zero. */
  count: number | null;
  /** YYYY-MM-DD in the device's current time zone. */
  localDate: string;
  timeZone: string;
  /** Query completion time, NOT the time the sensor last observed movement. */
  updatedAt: string | null;
  source: "android-health-connect" | "ios-healthkit" | null;
  partialDay: boolean;
  /** Null for health-store totals; connection time is not a measurement start. */
  trackingSince: string | null;
  reason?: PhoneStepsReason;
}

export interface PhoneStepsPlugin {
  /** Never prompts. Reads today's total if already connected and permitted. */
  status(): Promise<PhoneStepsSnapshot>;
  /** Call only after a deliberate user action; may show the OS permission prompt. */
  connect(): Promise<PhoneStepsSnapshot>;
  /** Never prompts. Rejects stale results after disconnect or superseding connect. */
  readToday(): Promise<PhoneStepsSnapshot>;
  /** Disable this app's reads. OS health permissions remain managed in Settings. */
  disconnect(): Promise<PhoneStepsSnapshot>;
  openSettings(): Promise<void>;
}

export declare const PhoneSteps: PhoneStepsPlugin;
/** Browser/SSR-safe; a native platform and installed plugin are both required. */
export declare function isPhoneStepsNativeAvailable(): boolean;
