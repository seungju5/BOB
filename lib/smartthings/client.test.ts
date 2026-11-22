import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TEAM_PROJECT_ID, TEAM_SITE_URL } from "@/config/team";
import { cancelPendingSmartThings, openSmartThings, readSmartThingsConnection, SMARTTHINGS_CONSENT_VERSION } from "@/lib/firebase/smartthings";
import { callbackMessage, smartThingsErrorMessage } from "./presentation";
import { pendingForAccount, rememberAttempt, returnedToAccount } from "./pending";

const sdk = vi.hoisted(() => ({ token: vi.fn() }));
vi.mock("@/lib/firebase/bridge", () => ({ connectFirebase: async () => ({ getIdToken: sdk.token }) }));
const transport = vi.fn<typeof fetch>();
const uid = "test-household";
const config = { projectId: TEAM_PROJECT_ID, enabled: true, connectionReady: true, consentVersion: SMARTTHINGS_CONSENT_VERSION };
const sampleTime = Date.UTC(2020, 0, 1);
const plug = { id: "test-plug", label: "연습용 플러그", isVirtual: true };
const active = { stage: "connected", device: plug, lastCheckedAt: sampleTime };
const json = (data: unknown, status = 200) => Response.json(data, { status });
const ready = () => transport.mockResolvedValueOnce(json(config));
const callback = `${TEAM_SITE_URL}/api/smartthings/callback`;
function authorization(redirect = callback, state = "test-state") {
  const url = new URL("https://api.smartthings.com/v1/oauth/authorize");
  url.search = new URLSearchParams({ client_id: "test-app", response_type: "code", state, scope: "r:devices:*", redirect_uri: redirect }).toString();
  return url;
}

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; }, clear: () => data.clear(),
    getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); },
    key: index => Array.from(data.keys())[index] ?? null, removeItem: key => { data.delete(key); },
  };
}
beforeEach(() => {
  transport.mockReset();
  sdk.token.mockReset().mockResolvedValue("test-id-token");
  vi.stubGlobal("fetch", transport);
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());
});
afterEach(() => vi.unstubAllGlobals());

describe("team SmartThings browser client", () => {
  it("keeps the original times for W and kWh, and validates the opt-in response separately", async () => {
    ready();
    const api=await openSmartThings(uid);
    const energy = { kwh: 2.75, measuredAt: sampleTime - 30000 };
    transport.mockResolvedValueOnce(json({ ...active, reading: { watts: 780, measuredAt: sampleTime }, energy }));
    const result=await api.check();
    expect(result.energy).toEqual(energy);
    expect(result.reading?.measuredAt).toBe(sampleTime);
    expect(result.connection).not.toHaveProperty('energy');
    transport.mockResolvedValueOnce(json({...active,reading:null,energy}));
    expect((await api.check()).energy).toEqual(energy);
    transport.mockResolvedValueOnce(json({enabled:true}));await api.setPowerNotice('p',true);
    expect(JSON.parse(String(transport.mock.lastCall?.[1]?.body))).toEqual({deviceId:'p',enabled:true,consentVersion:'cooker-power-notice-v1'});
    transport.mockResolvedValueOnce(json({enabled:true}));
    await expect(api.setPowerNotice('p',false)).rejects.toMatchObject({code:'invalid_response'});
  });
  it("reports a confirmed unconfigured service without looking up an account or sending a token", async () => {
    transport.mockResolvedValueOnce(json({ ...config, enabled: false, connectionReady: false }));
    const client = await openSmartThings(uid);
    expect(await client.status()).toEqual({ stage: "setup_required" });
    await expect(client.start()).rejects.toMatchObject({ code: "setup_required" });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][1]?.headers).not.toHaveProperty("Authorization");
    expect(sdk.token).not.toHaveBeenCalled();
  });

  it.each([
    ["another project", () => json({ ...config, projectId: "another-team" })],
    ["a Hosting fallback", () => new Response("<html>site</html>")],
    ["a missing endpoint", () => json({ error: "not_found" }, 404)],
    ["malformed flags", () => json({ ...config, enabled: "false" })],
  ] as const)("does not infer an empty account or send a Firebase token from %s", async (_, response) => {
    transport.mockResolvedValueOnce(response());
    await expect(readSmartThingsConnection(uid)).rejects.toThrow();
    expect(sdk.token).not.toHaveBeenCalled();
  });

  it("checks the stored grant for an existing user when new authorizations are paused", async () => {
    transport.mockResolvedValueOnce(json({ ...config, connectionReady: false })).mockResolvedValueOnce(json(active));
    const client = await openSmartThings(uid);
    expect(await client.status()).toMatchObject({ stage: "connected", device: plug, lastReceivedAt: null });
    await expect(client.start()).rejects.toMatchObject({ code: "setup_required" });
    expect(sdk.token).toHaveBeenCalledTimes(1);
  });

  it("cannot accept unfamiliar terms, and still lets the user remove a prior connection", async () => {
    transport.mockResolvedValueOnce(json({ ...config, consentVersion: "future-unreviewed" }));
    const client = await openSmartThings(uid);
    await expect(client.start()).rejects.toMatchObject({ code: "consent_updated" });
    expect(sdk.token).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    transport.mockResolvedValueOnce(json({ stage: "disconnected" }));
    expect((await client.disconnect()).stage).toBe("disconnected");
  });

  it("keeps account authorization, selecting a plug, and a signed signal separate", async () => {
    ready();
    transport.mockResolvedValueOnce(json({ stage: "choose_device" }))
      .mockResolvedValueOnce(json({ stage: "subscribing", device: plug }))
      .mockResolvedValueOnce(json({ ...active, lastSignalAt: sampleTime * 2 }))
      .mockResolvedValueOnce(json({ ...active, lastEventAt: sampleTime - 60000, lastReceivedAt: sampleTime }))
      .mockResolvedValueOnce(json({ stage: "connected", device: null }));
    const client = await openSmartThings(uid);
    expect((await client.status()).stage).toBe("choose_device");
    expect((await client.status()).stage).toBe("subscribing");
    expect(await client.status()).toMatchObject({ lastCheckedAt: sampleTime, lastEventAt: null, lastReceivedAt: null });
    expect(await client.status()).toMatchObject({ lastEventAt: sampleTime - 60000, lastReceivedAt: sampleTime });
    await expect(client.status()).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("only starts a read-only authorization with the exact team callback", async () => {
    ready();
    const client = await openSmartThings(uid);
    for (const change of [
      (url: URL) => url.searchParams.set("scope", "w:devices:*"),
      (url: URL) => url.searchParams.set("redirect_uri", "https://other.example/callback"),
      (url: URL) => url.searchParams.append("redirect_uri", callback),
      (url: URL) => { url.hostname = "other.example"; },
      (url: URL) => url.searchParams.set("state", "other-attempt"),
    ]) {
      transport.mockImplementationOnce(async (_, init) => {
        const target = authorization(callback, JSON.parse(String(init?.body)).attemptId); change(target);
        return json({ url: target.href });
      });
      await expect(client.start()).rejects.toMatchObject({ code: "invalid_authorization" });
    }
    transport.mockImplementationOnce(async (_, init) => json({ url: authorization(callback, JSON.parse(String(init?.body)).attemptId).href }));
    const result = new URL(await client.start());
    const attemptId = result.searchParams.get("state")!;
    expect(attemptId).toMatch(/^[\da-f-]{36}$/);
    expect(transport.mock.lastCall).toEqual(["/api/smartthings/start", expect.objectContaining({
      method: "POST", body: JSON.stringify({ consentVersion: SMARTTHINGS_CONSENT_VERSION, attemptId }), credentials: "same-origin", redirect: "error",
    })]);
  });

  it("requests only permitted meters, sends only the chosen ID, and preserves measured zero and its time", async () => {
    ready();
    transport.mockResolvedValueOnce(json({ devices: [{ ...plug, power: true, energy: true }, { id: "light", label: "전등", power: false }] }))
      .mockResolvedValueOnce(json({ ...active, reading: { watts: 0, measuredAt: sampleTime } }));
    const client = await openSmartThings(uid);
    expect(await client.devices()).toEqual([plug]);
    const result = await client.select(plug.id);
    expect(result.reading).toEqual({ watts: 0, measuredAt: sampleTime });
    expect(result.connection).not.toHaveProperty("reading");
    expect(result.connection.lastReceivedAt).toBeNull();
    expect(transport.mock.lastCall).toEqual(["/api/smartthings/device", expect.objectContaining({ method: "POST", body: JSON.stringify({ deviceId: plug.id }) })]);
    expect(sdk.token.mock.calls).toEqual([[uid, false], [uid, false]]);
  });

  it.each([null, { watts: 0, measuredAt: null }, { watts: "0", measuredAt: sampleTime }, { watts: -1, measuredAt: sampleTime }, { watts: 3, measuredAt: Number.MAX_SAFE_INTEGER }])("does not substitute a fictitious reading for %j", async reading => {
    ready(); transport.mockResolvedValueOnce(json({ ...active, reading }));
    expect((await (await openSmartThings(uid)).check()).reading).toBeNull();
    expect(transport.mock.lastCall).toEqual(["/api/smartthings/check", expect.objectContaining({ method: "POST", body: "{}" })]);
  });

  it("rejects another selected device and unknown server stages", async () => {
    ready(); transport.mockResolvedValueOnce(json(active)).mockResolvedValueOnce(json({ stage: "ok" }));
    const client = await openSmartThings(uid);
    await expect(client.select("different-plug")).rejects.toMatchObject({ code: "invalid_response" });
    await expect(client.status()).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("verifies the current UID every time and abandons token acquisition after cancellation", async () => {
    ready();
    const client = await openSmartThings(uid);
    let finish!: (token: string) => void;
    sdk.token.mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve; }));
    const controller = new AbortController();
    const pending = client.status(controller.signal);
    await vi.waitFor(() => expect(sdk.token).toHaveBeenCalledWith(uid, false));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    finish("discarded-token");
    await Promise.resolve();
    expect(transport).toHaveBeenCalledTimes(1);
    sdk.token.mockRejectedValueOnce(new Error("account changed"));
    await expect(client.check()).rejects.toThrow("account changed");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("refreshes Firebase once after a rejected authenticated read, without replaying a mutation", async () => {
    ready();
    const client = await openSmartThings(uid);
    transport.mockResolvedValueOnce(json({ error: "login_required" }, 401)).mockResolvedValueOnce(json({ stage: "disconnected" }));
    expect((await client.status()).stage).toBe("disconnected");
    expect(sdk.token.mock.calls).toEqual([[uid, false], [uid, true]]);
    transport.mockResolvedValueOnce(json({ error: "login_required" }, 401));
    await expect(client.start()).rejects.toMatchObject({ code: "login_required" });
    expect(sdk.token).toHaveBeenCalledTimes(3);
  });

  it("requires a separate action to remove an expired grant after the server requests Samsung revocation", async () => {
    ready(); transport.mockResolvedValueOnce(json({ error: "revoke_in_smartthings" }, 409)).mockResolvedValueOnce(json({ stage: "disconnected" }));
    const client = await openSmartThings(uid);
    await expect(client.disconnect()).rejects.toMatchObject({ code: "revoke_in_smartthings" });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.lastCall).toEqual(["/api/smartthings/connection", expect.objectContaining({ method: "DELETE", body: '{"confirm":true}' })]);
    expect((await client.disconnect(true)).stage).toBe("disconnected");
    expect(transport.mock.lastCall?.[1]?.body).toBe('{"confirm":true,"forgetExpired":true}');
  });

  it("never turns a callback query or an API error into a connected status", () => {
    expect(callbackMessage("connected")).toContain("연결 상태를 확인");
    expect(callbackMessage("other")).toBe("");
    expect(typeof smartThingsErrorMessage("constructor")).toBe("string");
  });

  it("cancels only current, same-account attempts before sign-out and stores no token or device details", async () => {
    const pending = await rememberAttempt(uid);
    expect(localStorage.length).toBe(1);
    expect(localStorage.key(0)).not.toContain(uid);
    expect(localStorage.getItem(localStorage.key(0)!)).toMatch(/^\d+$/);
    await cancelPendingSmartThings("other-account");
    expect(transport).not.toHaveBeenCalled();
    ready(); transport.mockResolvedValueOnce(json({ ok: true }));
    await cancelPendingSmartThings(uid);
    expect(transport.mock.lastCall).toEqual(["/api/smartthings/cancel-start", expect.objectContaining({ method: "POST", body: JSON.stringify({ attemptId: pending.id }) })]);
    expect(sdk.token).toHaveBeenCalledWith(uid, false);
    await cancelPendingSmartThings(uid);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(localStorage.length).toBe(0);
  });

  it("a Samsung return clears only its originating tab; expired markers cause no account or API access", async () => {
    const first = await rememberAttempt(uid);
    const firstTab = sessionStorage;
    vi.stubGlobal("sessionStorage", memoryStorage());
    const second = await rememberAttempt(uid);
    vi.stubGlobal("sessionStorage", firstTab);
    await returnedToAccount(uid);
    expect(await pendingForAccount(uid)).toEqual([second]);
    expect(localStorage.getItem(first.bucket + first.id)).toBeNull();
    localStorage.setItem(second.bucket + second.id, "1");
    await cancelPendingSmartThings(uid);
    expect(sdk.token).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });

  it("never authorizes when the browser cannot remember its ongoing attempt", async () => {
    ready(); const client = await openSmartThings(uid);
    vi.spyOn(localStorage, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    await expect(client.start()).rejects.toMatchObject({ code: "storage_unavailable" });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(sdk.token).not.toHaveBeenCalled();
  });
});
