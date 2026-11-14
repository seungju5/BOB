import { afterEach, describe, expect, it, vi } from "vitest";
import type { PhoneStepsPlugin, PhoneStepsSnapshot } from "@bapmunna/phone-steps";
import { emptySteps, localStepDate, stepsMessage, validateSteps } from "@/lib/steps/state";
import { createStepsSession, type StepsView } from "@/lib/steps/session";
import { createStepsConsentBoundary } from "@/lib/steps/consent";

const NOW = new Date("2026-11-14T13:00:00Z");
const ZONE = "Asia/Seoul";
const ready = (patch: Partial<PhoneStepsSnapshot> = {}): PhoneStepsSnapshot => ({
  ...emptySteps("ready", NOW, ZONE), count: 1234, updatedAt: NOW.toISOString(), source: "ios-healthkit", ...patch,
});
const pending = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
};
function fixture() {
  const records: StepsView[] = [];
  let clock = NOW;
  const driver: PhoneStepsPlugin = {
    status: vi.fn().mockResolvedValue(emptySteps("not-connected", NOW, ZONE)),
    connect: vi.fn().mockResolvedValue(ready()),
    readToday: vi.fn().mockResolvedValue(ready()),
    disconnect: vi.fn().mockResolvedValue(emptySteps("not-connected", NOW, ZONE)),
    openSettings: vi.fn().mockResolvedValue(undefined),
    openWebApp: vi.fn().mockResolvedValue(undefined),
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn().mockResolvedValue(undefined) }),
  };
  const session = createStepsSession(driver, (view) => records.push(view), { now: () => clock, timeZone: () => ZONE, timeoutMs: 100 });
  return { records, driver, session, setClock: (value: Date) => { clock = value; } };
}
afterEach(() => vi.useRealTimers());

describe("health consent and family changes", () => {
  it("waits for consent reset before a newly paired screen can read", async () => {
    const { driver } = fixture();
    const reset = pending<PhoneStepsSnapshot>();
    vi.mocked(driver.disconnect).mockReturnValueOnce(reset.promise);
    const boundary = createStepsConsentBoundary(driver);
    boundary.reset();
    const read = boundary.driver.status();
    await Promise.resolve();
    expect(driver.status).not.toHaveBeenCalled();
    reset.resolve(emptySteps("not-connected", NOW, ZONE));
    await read;
    expect(driver.disconnect).toHaveBeenCalledTimes(1);
    expect(driver.status).toHaveBeenCalledTimes(1);
  });

  it("discards reads from before a pairing change", async () => {
    const { driver } = fixture();
    const old = pending<PhoneStepsSnapshot>();
    vi.mocked(driver.readToday).mockReturnValueOnce(old.promise);
    const boundary = createStepsConsentBoundary(driver);
    const read = boundary.driver.readToday();
    await Promise.resolve();
    boundary.reset();
    old.resolve(ready());
    await expect(read).rejects.toThrow("health_consent_changed");
  });

  it("fails closed after reset failure, and an explicit disconnect can recover", async () => {
    const { driver } = fixture();
    vi.mocked(driver.disconnect).mockRejectedValueOnce(new Error("native_failed"));
    const boundary = createStepsConsentBoundary(driver);
    boundary.reset();
    await expect(boundary.driver.status()).rejects.toThrow("health_consent_reset_required");
    expect(driver.status).not.toHaveBeenCalled();
    await expect(boundary.driver.disconnect()).resolves.toMatchObject({ status: "not-connected", count: null });
  });

  it("resumes an unfinished consent reset after restarting the app", async () => {
    const { driver } = fixture();
    let pendingReset = false;
    const marker = { pending: () => pendingReset, setPending: (value: boolean) => { pendingReset = value; } };
    vi.mocked(driver.disconnect).mockRejectedValueOnce(new Error("app_closed"));
    const before = createStepsConsentBoundary(driver, () => true, marker);
    before.reset();
    expect(pendingReset).toBe(true);
    await expect(before.driver.status()).rejects.toThrow("health_consent_reset_required");
    const restarted = createStepsConsentBoundary(driver, () => true, marker);
    await expect(restarted.driver.status()).resolves.toMatchObject({ status: "not-connected" });
    expect(driver.disconnect).toHaveBeenCalledTimes(2);
    expect(pendingReset).toBe(false);
  });
});

describe("phone step data boundaries", () => {
  it("keeps confirmed zero separate from missing data and denied permission", () => {
    expect(validateSteps(ready({ count: 0 }), NOW, ZONE).count).toBe(0);
    for (const status of ["no-data", "permission-denied", "unsupported"] as const) {
      const value = validateSteps(ready({ status, count: 1000 }), NOW, ZONE);
      expect(value.count).toBeNull();
      expect(value.status).toBe(status);
      expect(stepsMessage(value)).not.toContain("0걸음");
    }
  });

  it.each([-1, 1.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null])("rejects invalid native counts: %s", (count) => {
    expect(validateSteps(ready({ count }), NOW, ZONE).status).toBe("error");
    expect(validateSteps(ready({ count }), NOW, ZONE).count).toBeNull();
  });

  it("never displays yesterday or a stale time-zone snapshot as today's value", () => {
    expect(validateSteps(ready({ localDate: "2026-11-13" }), NOW, ZONE).count).toBeNull();
    expect(validateSteps(ready({ timeZone: "America/New_York" }), NOW, ZONE).count).toBeNull();
    expect(validateSteps(ready({ timeZone: "not/a-zone" }), NOW, ZONE).status).toBe("error");
    expect(localStepDate(new Date("2026-11-14T15:01:00Z"), ZONE)).toBe("2026-11-15");
  });

  it("rejects future updates, unknown providers and malformed envelopes", () => {
    expect(validateSteps(ready({ updatedAt: "2026-11-15T00:00:00Z" }), NOW, ZONE).count).toBeNull();
    expect(validateSteps({ ...ready(), source: "arbitrary-provider" }, NOW, ZONE).count).toBeNull();
    for (const value of [undefined, null, "123", { count: 100 }, { ...ready(), status: "okay" }]) {
      expect(validateSteps(value, NOW, ZONE).status).toBe("error");
    }
  });

  it("labels partial data without inventing a full daily measurement", () => {
    expect(stepsMessage(ready({ partialDay: true }))).toContain("구간");
  });
});

describe("phone step session lifecycle", () => {
  it("a passive status check never requests health permission", async () => {
    const { session, driver, records } = fixture();
    await session.run("status");
    expect(driver.connect).not.toHaveBeenCalled();
    expect(records.at(-1)?.snapshot.status).toBe("not-connected");
  });

  it("waits for health consent before refreshing after an OS focus event", async () => {
    const { session, driver, records } = fixture();
    const permission = pending<PhoneStepsSnapshot>();
    vi.mocked(driver.connect).mockReturnValueOnce(permission.promise);
    const connection = session.run("connect");
    await session.run("readToday");
    await session.run("status");
    expect(driver.readToday).not.toHaveBeenCalled();
    expect(driver.status).not.toHaveBeenCalled();
    permission.resolve(ready());
    await connection;
    await vi.waitFor(() => expect(records.at(-1)?.snapshot.count).toBe(1234));
    expect(driver.connect).toHaveBeenCalledTimes(1);
    expect(driver.readToday).toHaveBeenCalledTimes(1);
    expect(records.at(-1)?.snapshot.status).toBe("ready");
  });

  it("drops visible data immediately and discards a late read after disconnect", async () => {
    const { session, driver, records } = fixture();
    await session.run("connect");
    const delayed = pending<PhoneStepsSnapshot>();
    vi.mocked(driver.readToday).mockReturnValueOnce(delayed.promise);
    const read = session.run("readToday");
    const off = session.run("disconnect");
    expect(records.at(-1)?.snapshot.count).toBeNull();
    await off;
    delayed.resolve(ready());
    await read;
    expect(records.at(-1)?.snapshot.status).toBe("not-connected");
    expect(records.at(-1)?.snapshot.count).toBeNull();
  });

  it("does not publish an old account screen's asynchronous result after disposal", async () => {
    const { session, driver, records } = fixture();
    const delayed = pending<PhoneStepsSnapshot>();
    vi.mocked(driver.readToday).mockReturnValueOnce(delayed.promise);
    const read = session.run("readToday");
    session.dispose();
    const count = records.length;
    delayed.resolve(ready()); await read;
    expect(records).toHaveLength(count);
  });

  it("clears yesterday at local midnight before another query can finish", async () => {
    const { session, records, setClock } = fixture();
    await session.run("connect");
    setClock(new Date("2026-11-14T15:00:00Z"));
    expect(session.invalidateDate()).toBe(true);
    expect(records.at(-1)?.snapshot.count).toBeNull();
    expect(records.at(-1)?.snapshot.localDate).toBe("2026-11-15");
  });

  it("re-reads the new day after a query spanning midnight finishes", async () => {
    const { session, driver, records, setClock } = fixture();
    const yesterday = pending<PhoneStepsSnapshot>();
    vi.mocked(driver.readToday).mockReturnValueOnce(yesterday.promise);
    const request = session.run("readToday");
    setClock(new Date("2026-11-14T15:00:01Z"));
    session.invalidateDate();
    vi.mocked(driver.readToday).mockResolvedValueOnce(ready({ localDate: "2026-11-15", updatedAt: "2026-11-14T15:00:01Z", count: 0 }));
    yesterday.resolve(ready());
    await request;
    await vi.waitFor(() => expect(records.at(-1)?.snapshot.status).toBe("ready"));
    expect(records.at(-1)?.snapshot.localDate).toBe("2026-11-15");
    expect(records.at(-1)?.snapshot.count).toBe(0);
  });

  it("ends a stalled native request instead of keeping a permanent spinner", async () => {
    vi.useFakeTimers();
    const { session, driver, records } = fixture();
    vi.mocked(driver.readToday).mockReturnValueOnce(new Promise(() => {}));
    const run = session.run("readToday");
    await vi.advanceTimersByTimeAsync(101); await run;
    expect(records.at(-1)?.busy).toBe(false);
    expect(records.at(-1)?.snapshot.status).toBe("error");
    expect(records.at(-1)?.snapshot.count).toBeNull();
  });
});
