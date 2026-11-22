import type { SmartThingsEnergy, SmartThingsReading } from "../firebase/smartthings";

export const PERSONAL_METER_FORMAT = "bapmunna.personal-meter.v1";
export const MAX_PERSONAL_METER_BYTES = 4096;

export type PersonalMeter = {
  format: typeof PERSONAL_METER_FORMAT;
  deviceKind: "virtual" | "recognized" | "unknown";
  checkedAt: number;
  reading: SmartThingsReading | null;
  energy: SmartThingsEnergy | null;
};

function hasOnly(value: unknown, keys: string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function validTime(value: unknown, upperBound: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= upperBound;
}

function validValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** A user-selected, unverified local file. Never use it as an account connection or event. */
export function parsePersonalMeter(input: unknown, now = Date.now()): PersonalMeter | null {
  if (!hasOnly(input, ["format", "deviceKind", "checkedAt", "reading", "energy"])) return null;
  const { format, deviceKind, checkedAt, reading, energy } = input;
  if (format !== PERSONAL_METER_FORMAT || !validTime(checkedAt, now) ||
      (deviceKind !== "virtual" && deviceKind !== "recognized" && deviceKind !== "unknown") ||
      (reading === null && energy === null)) return null;
  let watts: SmartThingsReading | null = null;
  let total: SmartThingsEnergy | null = null;
  if (reading !== null) {
    if (!hasOnly(reading, ["watts", "measuredAt"]) || !validValue(reading.watts) || !validTime(reading.measuredAt, checkedAt)) return null;
    watts = { watts: reading.watts, measuredAt: reading.measuredAt };
  }
  if (energy !== null) {
    if (!hasOnly(energy, ["kwh", "measuredAt"]) || !validValue(energy.kwh) || !validTime(energy.measuredAt, checkedAt)) return null;
    total = { kwh: energy.kwh, measuredAt: energy.measuredAt };
  }
  return { format, deviceKind, checkedAt, reading: watts, energy: total };
}
