import type { PhoneStepsPlugin, PhoneStepsSnapshot } from "@bapmunna/phone-steps";
import { deviceTimeZone, emptySteps, validateSteps } from "./state";

export type StepsView = { snapshot: PhoneStepsSnapshot; busy: boolean };
type Action = "status" | "connect" | "readToday" | "disconnect";

/** Device-local data only; no persistence, account identifier, fetch or family API. */
export function createStepsSession(driver: PhoneStepsPlugin, emit: (value: StepsView) => void, options: { now?: () => Date; timeZone?: () => string; timeoutMs?: number } = {}) {
  const now = options.now ?? (() => new Date());
  const zone = options.timeZone ?? deviceTimeZone;
  let revision = 0;
  let disposed = false;
  let active: { request: number; action: Action } | null = null;
  let readAgain = false;
  let current = emptySteps("not-connected", now(), zone());
  const publish = (snapshot: PhoneStepsSnapshot, busy = false) => { current = snapshot; if (!disposed) emit({ snapshot, busy }); };

  async function run(action: Action) {
    if (disposed) return;
    // A focus/visibility event while the OS permission sheet is open must not
    // supersede connect/disconnect. Coalesce passive refreshes until it settles.
    if ((action === "readToday" || action === "status") && active) {
      if (action === "readToday") readAgain = true;
      return;
    }
    const request = ++revision;
    active = { request, action };
    readAgain = false;
    publish(emptySteps(action === "disconnect" ? "not-connected" : current.status, now(), zone()), true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        driver[action](),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("steps_timeout")), options.timeoutMs ?? (action === "connect" ? 300_000 : 15_000)); }),
      ]);
      if (disposed || request !== revision) return;
      publish(validateSteps(response, now(), zone()));
    } catch {
      if (!disposed && request === revision) publish({ ...emptySteps("error", now(), zone()), reason: "provider-error" });
    } finally {
      if (timer) clearTimeout(timer);
      if (active?.request === request) {
        active = null;
        if (readAgain && !disposed) { readAgain = false; void run("readToday"); }
      }
    }
  }

  function invalidateDate() {
    if (disposed) return false;
    const day = emptySteps("not-connected", now(), zone());
    if (day.localDate === current.localDate && day.timeZone === current.timeZone) return false;
    revision += 1;
    if (active) readAgain = true;
    publish(day);
    return true;
  }

  return {
    run, invalidateDate,
    dispose() { disposed = true; revision += 1; active = null; readAgain = false; current = emptySteps("not-connected", now(), zone()); },
  };
}
