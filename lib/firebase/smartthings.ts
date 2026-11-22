import { TEAM_PROJECT_ID, TEAM_SITE_URL, TEAM_SMARTTHINGS_APP_ID } from "@/config/team";
import cookerCriteria from "@/server/smartthings/power-criteria.json";
import { isCookingPower } from "@/server/smartthings/cooking-signal.mjs";
import { connectFirebase } from "./bridge";
import { attemptIsPending, forgetAttempt, pendingForAccount, rememberAttempt } from "@/lib/smartthings/pending";

const prefix = "/api/smartthings";
const callback = `${TEAM_SITE_URL}${prefix}/callback`;
export const SMARTTHINGS_CONSENT_VERSION = "smartthings-read-2026-11-22";
const POWER_NOTICE_CONSENT = cookerCriteria.noticeConsentVersion;
const stages = ["disconnected", "choose_device", "subscribing", "connected", "reconnect_required"] as const;
type ServerStage = (typeof stages)[number];
export type SmartThingsDevice = { id: string; label: string; isVirtual?: boolean };
export type SmartThingsConnection = {
  stage: ServerStage | "setup_required" | "read_error";
  device?: SmartThingsDevice | null;
  lastSignalAt?: number | null;
  lastEventAt?: number | null;
  lastReceivedAt?: number | null;
  lastCheckedAt?: number | null;
  powerNotice?: { enabled: true; lastObservedAt: number | null };
};
export type SmartThingsReading = { cooking: boolean; measuredAt: number };
export type SmartThingsEnergy = { measuredAt: number };
export type CheckedConnection = { connection: SmartThingsConnection; reading: SmartThingsReading | null; energy: SmartThingsEnergy | null };
type Config = { enabled: boolean; connectionReady: boolean; consentVersion: string };

export class SmartThingsError extends Error {
  constructor(readonly code: string) { super(code); }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SmartThingsError("invalid_response");
  return value as Record<string, unknown>;
}

function parseConfig(body: Record<string, unknown>): Config {
  const { projectId, enabled, connectionReady, consentVersion } = body;
  if (projectId !== TEAM_PROJECT_ID || (enabled && body.appId !== TEAM_SMARTTHINGS_APP_ID) ||
      typeof enabled !== "boolean" || typeof connectionReady !== "boolean" ||
      typeof consentVersion !== "string" || !consentVersion.trim() || (connectionReady && !enabled)) {
    throw new SmartThingsError("invalid_config");
  }
  return { enabled, connectionReady, consentVersion };
}

function device(value: unknown): SmartThingsDevice {
  const item = object(value);
  if (typeof item.id !== "string" || !item.id.trim() || typeof item.label !== "string" || !item.label.trim()) {
    throw new SmartThingsError("invalid_response");
  }
  return { id: item.id, label: item.label, ...(typeof item.isVirtual === "boolean" ? { isVirtual: item.isVirtual } : {}) };
}

function observedTime(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= Date.now() ? value : null;
}

function connection(body: Record<string, unknown>): SmartThingsConnection {
  if (!stages.includes(body.stage as ServerStage)) throw new SmartThingsError("invalid_response");
  const stage = body.stage as ServerStage;
  if (stage === "disconnected") return { stage };
  const selected = body.device == null ? null : device(body.device);
  if ((stage === "connected" || stage === "subscribing") && !selected) throw new SmartThingsError("invalid_response");
  const notice = stage === "connected" && selected?.isVirtual === false && body.powerNotice != null ? object(body.powerNotice) : null;
  return {
    stage, device: selected, lastSignalAt: observedTime(body.lastSignalAt),
    lastEventAt: observedTime(body.lastEventAt), lastReceivedAt: observedTime(body.lastReceivedAt),
    lastCheckedAt: observedTime(body.lastCheckedAt),
    ...(notice?.enabled === true && {powerNotice: {enabled: true as const, lastObservedAt: observedTime(notice.lastObservedAt)}}),
  };
}

function checked(body: Record<string, unknown>): CheckedConnection {
  const current = connection(body);
  let reading: SmartThingsReading | null = null, energy: SmartThingsEnergy | null = null;
  if (current.stage === "connected") {
    if (body.reading != null) {
      const {cooking, watts, measuredAt: time} = object(body.reading);
      const measuredAt = observedTime(time);
      if (measuredAt !== null) {
        if (typeof cooking === "boolean") reading = {cooking, measuredAt};
        else if (typeof watts === "number" && Number.isFinite(watts) && watts >= 0)
          reading = {cooking: isCookingPower(watts), measuredAt};
      }
    }
    if (body.energy != null) {
      const {kwh, measuredAt: time} = object(body.energy);
      const measuredAt = observedTime(time);
      if ((kwh === undefined || typeof kwh === "number" && Number.isFinite(kwh) && kwh >= 0) && measuredAt !== null)
        energy = {measuredAt};
    }
  }
  return { connection: current, reading, energy };
}

function samsungAuthorization(value: unknown, attemptId: string): string {
  let target: URL;
  try {
    if (typeof value !== "string") throw new Error();
    target = new URL(value);
  } catch { throw new SmartThingsError("invalid_authorization"); }
  const params = target.searchParams;
  const single = (name: string) => params.getAll(name).length === 1 && !!params.get(name)?.trim();
  if (target.origin !== "https://api.smartthings.com" || target.pathname !== "/v1/oauth/authorize" ||
      target.username || target.password || target.hash || !["client_id", "state", "scope", "redirect_uri", "response_type"].every(single) ||
      params.get("response_type") !== "code" || params.get("scope") !== "r:devices:*" ||
      params.get("redirect_uri") !== callback || params.get("state") !== attemptId) {
    throw new SmartThingsError("invalid_authorization");
  }
  return target.href;
}

async function accountToken(uid: string, forceRefresh: boolean, signal?: AbortSignal) {
  const provider = await connectFirebase();
  signal?.throwIfAborted();
  return provider.getIdToken(uid, forceRefresh);
}

/** The API is fixed to this Hosting origin. A verified Firebase token is obtained for each protected request. */
async function request(path: string, method: "GET" | "POST" | "DELETE", signal?: AbortSignal, uid?: string, body?: object, cancellingToken?: string) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(() => { timedOut = true; cancel(); }, 15000);
  const stopped = new Promise<never>((_, reject) => {
    controller.signal.addEventListener("abort", () => reject(timedOut ? new SmartThingsError("timeout") : new DOMException("Aborted", "AbortError")), { once: true });
  });
  const perform = async (forceRefresh = false): Promise<Record<string, unknown>> => {
    const headers: Record<string,string> = { Accept: "application/json" };
    if (uid !== undefined) {
      if (!uid.trim()) throw new SmartThingsError("login_required");
      const token = path === "cancel-start" && cancellingToken ? cancellingToken : await accountToken(uid, forceRefresh, controller.signal);
      controller.signal.throwIfAborted();
      if (!token) throw new SmartThingsError("login_required");
      headers.Authorization = `Bearer ${token}`;
    }
    if (body) headers["Content-Type"] = "application/json";
    const res = await fetch(`${prefix}/${path}`, {
      method, headers, credentials: "same-origin", redirect: "error", cache: "no-store", signal: controller.signal,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.headers.get("content-type")?.toLowerCase().includes("application/json")) throw new SmartThingsError("unavailable");
    const result = object(await res.json());
    if (method === "GET" && uid && !forceRefresh && res.status === 401 && result.error === "login_required") {
      return perform(true);
    }
    if (!res.ok) throw new SmartThingsError(typeof result.error === "string" ? result.error : "unavailable");
    return result;
  };
  try { return await Promise.race([perform(), stopped]); }
  finally { clearTimeout(timeout); signal?.removeEventListener("abort", cancel); }
}

export async function readSmartThingsConfig(signal?: AbortSignal) {
  return parseConfig(await request("config", "GET", signal));
}

export async function openSmartThings(uid: string, signal?: AbortSignal) {
  const config = await readSmartThingsConfig(signal);
  function authenticated(path: string, method: "GET" | "POST" | "DELETE", signal?: AbortSignal, body?: object) {
    if (!config.enabled) throw new SmartThingsError("setup_required");
    return request(path, method, signal, uid, body);
  }
  return {
    config,
    async status(signal?: AbortSignal): Promise<SmartThingsConnection> {
      if (!config.enabled) return { stage: "setup_required" };
      const state = connection(await authenticated("status", "GET", signal));
      return state.stage === "disconnected" && !config.connectionReady ? { stage: "setup_required" } : state;
    },
    async start(signal?: AbortSignal) {
      if (!config.connectionReady) throw new SmartThingsError("setup_required");
      if (config.consentVersion !== SMARTTHINGS_CONSENT_VERSION) throw new SmartThingsError("consent_updated");
      signal?.throwIfAborted();
      const attempt = await rememberAttempt(uid).catch(() => { throw new SmartThingsError("storage_unavailable"); });
      if (signal?.aborted) { forgetAttempt(attempt); signal.throwIfAborted(); }
      let result;
      try { result = await authenticated("start", "POST", signal, { consentVersion: SMARTTHINGS_CONSENT_VERSION, attemptId: attempt.id }); }
      catch (cause) {
        // These responses precede creation of an OAuth attempt on the team server.
        if (cause instanceof SmartThingsError && ["already_connected", "login_required", "consent_required", "setup_required", "verified_email_required", "invalid_origin"].includes(cause.code)) forgetAttempt(attempt);
        throw cause;
      }
      const url = samsungAuthorization(result.url, attempt.id);
      if (!attemptIsPending(attempt)) throw new SmartThingsError("attempt_cancelled");
      return url;
    },
    async devices(signal?: AbortSignal) {
      const result = await authenticated("devices", "GET", signal);
      if (!Array.isArray(result.devices)) throw new SmartThingsError("invalid_response");
      return result.devices.filter(item => object(item).power === true).map(device);
    },
    async select(deviceId: string, signal?: AbortSignal) {
      if (!deviceId.trim()) throw new SmartThingsError("invalid_device");
      const result = checked(await authenticated("device", "POST", signal, { deviceId }));
      if (result.connection.device?.id !== deviceId) throw new SmartThingsError("invalid_response");
      return result;
    },
    async check(signal?: AbortSignal) {
      return checked(await authenticated("check", "POST", signal, {}));
    },
    async setPowerNotice(deviceId: string, enabled: boolean, signal?: AbortSignal) {
      const result = await authenticated("power-notice", "POST", signal, {deviceId, enabled, ...(enabled && {consentVersion: POWER_NOTICE_CONSENT})});
      if (result.enabled !== enabled) throw new SmartThingsError("invalid_response");
    },
    async disconnect(forgetExpired = false, signal?: AbortSignal) {
      const current = connection(await authenticated("connection", "DELETE", signal, { confirm: true, ...(forgetExpired ? { forgetExpired: true } : {}) }));
      if (current.stage !== "disconnected") throw new SmartThingsError("invalid_response");
      return current;
    },
  };
}

export async function readSmartThingsConnection(uid: string, signal?: AbortSignal): Promise<SmartThingsConnection> {
  const api = await openSmartThings(uid, signal);
  return api.status(signal);
}

/** Called before signing out or withdrawing consent, even if the Samsung tab is still open. */
export async function cancelPendingSmartThings(uid: string): Promise<void> {
  const attempts = await pendingForAccount(uid);
  if (!attempts.length) return;
  // Obtain the outgoing account's token while its Firebase session still exists.
  // A slow readiness check cannot cause the next account to authorize the cancellation.
  const [config, token] = await Promise.all([
    request("config", "GET").then(parseConfig),
    accountToken(uid, false),
  ]);
  if (!config.enabled) return;
  if (!token) throw new SmartThingsError("login_required");
  await Promise.all(attempts.map(async attempt => {
    const result = await request("cancel-start", "POST", undefined, uid, { attemptId: attempt.id }, token);
    if (result.ok === true) forgetAttempt(attempt);
  }));
}
