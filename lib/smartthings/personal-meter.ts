import { isCookingPower } from "../judge/detectEvents";
export type SmartThingsReading = { cooking: boolean; measuredAt: number };
export type SmartThingsEnergy = { measuredAt: number };


export const PERSONAL_METER_FORMAT = "bapmunna.personal-meter.v2";
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
  const legacy = format === "bapmunna.personal-meter.v1";
  if ((!legacy && format !== PERSONAL_METER_FORMAT) || !validTime(checkedAt, now) ||
      (deviceKind !== "virtual" && deviceKind !== "recognized" && deviceKind !== "unknown") ||
      (reading === null && energy === null)) return null;
  let signal: SmartThingsReading | null = null;
  let total: SmartThingsEnergy | null = null;
  if (reading !== null) {
    if (!hasOnly(reading, [legacy ? "watts" : "cooking", "measuredAt"]) || !validTime(reading.measuredAt, checkedAt)) return null;
    if (legacy && !validValue(reading.watts) || !legacy && typeof reading.cooking !== "boolean") return null;
    signal = { cooking: legacy ? isCookingPower(reading.watts) : reading.cooking === true, measuredAt: reading.measuredAt };
  }
  if (energy !== null) {
    if (!hasOnly(energy, legacy ? ["kwh", "measuredAt"] : ["measuredAt"]) || !validTime(energy.measuredAt, checkedAt) ||
      (legacy && !validValue(energy.kwh))) return null;
    total = { measuredAt: energy.measuredAt };
  }
  return { format: PERSONAL_METER_FORMAT, deviceKind, checkedAt, reading: signal, energy: total };
}
