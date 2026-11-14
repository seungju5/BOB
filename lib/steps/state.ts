import type { PhoneStepsReason, PhoneStepsSnapshot, PhoneStepsStatus } from "@bapmunna/phone-steps";

const statuses: PhoneStepsStatus[] = ["unsupported", "not-connected", "permission-required", "permission-denied", "ready", "no-data", "error"];
const sources = ["android-health-connect", "ios-healthkit"];
const reasons: PhoneStepsReason[] = ["native-unavailable", "health-data-unavailable", "health-connect-unavailable", "health-connect-update-required", "permission-revoked", "permission-restricted", "provider-error"];

export function deviceTimeZone() { return Intl.DateTimeFormat().resolvedOptions().timeZone; }

export function localStepDate(now: Date, timeZone = deviceTimeZone()) {
  const parts = new Intl.DateTimeFormat("en", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (key: string) => parts.find((part) => part.type === key)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function emptySteps(status: PhoneStepsStatus = "unsupported", now = new Date(), timeZone = deviceTimeZone()): PhoneStepsSnapshot {
  return { schemaVersion: 1, status, count: null, localDate: localStepDate(now, timeZone), timeZone, updatedAt: null, source: null, partialDay: false, trackingSince: null };
}

/** A stale day, missing permission or malformed provider value can never become 0 steps. */
export function validateSteps(value: unknown, now = new Date(), timeZone = deviceTimeZone()): PhoneStepsSnapshot {
  const failed = () => ({ ...emptySteps("error", now, timeZone), reason: "provider-error" as const });
  if (!value || typeof value !== "object") return failed();
  const data = value as PhoneStepsSnapshot;
  if (data.schemaVersion !== 1 || !statuses.includes(data.status)) return failed();
  try {
    const canonical = (zone: string) => new Intl.DateTimeFormat("en", { timeZone: zone }).resolvedOptions().timeZone;
    if (typeof data.timeZone !== "string" || canonical(data.timeZone) !== canonical(timeZone) || data.localDate !== localStepDate(now, timeZone)) return failed();
  } catch { return failed(); }
  if (data.source !== null && !sources.includes(data.source)) return failed();
  if (data.reason !== undefined && !reasons.includes(data.reason)) return failed();
  if (typeof data.partialDay !== "boolean") return failed();
  if (data.updatedAt !== null && (typeof data.updatedAt !== "string" || !Number.isFinite(Date.parse(data.updatedAt)) || Date.parse(data.updatedAt) > now.getTime())) return failed();
  if (data.trackingSince !== null && (typeof data.trackingSince !== "string" || !Number.isFinite(Date.parse(data.trackingSince)) || Date.parse(data.trackingSince) > now.getTime())) return failed();
  if (data.status === "ready" && (!Number.isSafeInteger(data.count) || (data.count ?? -1) < 0 || !data.updatedAt || !data.source)) return failed();
  return {
    schemaVersion: 1, status: data.status, count: data.status === "ready" ? data.count : null,
    localDate: data.localDate, timeZone, updatedAt: data.updatedAt,
    source: data.source, partialDay: data.partialDay, trackingSince: data.trackingSince,
    ...(data.reason ? { reason: data.reason } : {}),
  };
}

export function stepsMessage(snapshot: PhoneStepsSnapshot): string {
  switch (snapshot.status) {
    case "unsupported":
      if (snapshot.reason === "health-connect-update-required") return "걸음수를 연결하려면 Health Connect를 설치하거나 업데이트해 주세요.";
      if (snapshot.reason === "health-connect-unavailable") return "이 휴대폰에서는 Health Connect를 사용할 수 없어요.";
      if (snapshot.reason === "health-data-unavailable") return "이 기기에서는 Apple 건강 기록을 읽을 수 없어요.";
      if (snapshot.reason === "permission-restricted") return "이 기기 설정에서는 건강 기록 접근이 제한되어 있어요.";
      return "자동 걸음수는 설치형 앱에서 연결할 수 있어요.";
    case "not-connected":
    case "permission-required": return "휴대폰으로 오늘의 걸음을 확인해 보세요.";
    case "permission-denied": return "걸음수 읽기 권한이 꺼져 있어요. 건강 앱 설정에서 바꿀 수 있어요.";
    case "no-data": return "아직 확인할 걸음 기록이 없어요. 건강 앱의 기록과 공유 권한을 확인해 주세요.";
    case "ready": return snapshot.partialDay ? "오늘 확인할 수 있는 구간의 걸음이에요." : "건강 앱에 기록된 오늘의 걸음이에요.";
    default: return "걸음수를 확인하지 못했어요. 잠시 후 다시 확인해 주세요.";
  }
}
