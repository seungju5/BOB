import { afterEach, describe, expect, it, vi } from "vitest";
import { BOB_PROJECT_REF, readPublicSupabaseConfig } from "@/lib/supabase/public-config";
import { callbackReturn, loginCallbackUrl, loginReturn, retryLoginPath } from "@/lib/supabase/login-return";

const url = `https://${BOB_PROJECT_REF}.supabase.co`;
const publicKey = "sb_publishable_local_fixture_key";
const jwt = (role: string, ref = BOB_PROJECT_REF) =>
  ["header", Buffer.from(JSON.stringify({ role, ref })).toString("base64url"), "fixture"].join(".");

describe("BOB public client configuration", () => {
  it("uses the team publishable key or a legacy anon JWT bound to BOB", () => {
    expect(readPublicSupabaseConfig(url + "/", publicKey, jwt("anon"))).toEqual({ url, key: publicKey });
    expect(readPublicSupabaseConfig(url, undefined, jwt("anon"))?.key).toBe(jwt("anon"));
    expect(readPublicSupabaseConfig(url, jwt("anon"))?.key).toBe(jwt("anon"));
    expect(readPublicSupabaseConfig(url)).toBeNull();
  });
  it.each([
    [url, "sb_secret_synthetic_private", undefined], [url, jwt("service_role"), undefined],
    [url, publicKey, jwt("service_role")], [url, undefined, jwt("anon", "other")],
    [url, "not.a-valid-payload.fixture", undefined], ["https://other.supabase.co", publicKey, undefined],
    [url + ".test", publicKey, undefined], ["http://localhost:54321", publicKey, undefined],
  ])("rejects private credentials and foreign hosts without printing credentials", (input, key, anon) => {
    expect(() => readPublicSupabaseConfig(input, key, anon)).toThrow();
    try { readPublicSupabaseConfig(input, key, anon); } catch (error) {
      expect(String(error)).not.toContain(key ?? anon ?? "fixture");
    }
  });
  it("permits an explicitly opted-in local emulator with a public key", () => {
    expect(readPublicSupabaseConfig("http://127.0.0.1:54321", undefined, jwt("anon", "local"), true)?.key).toBeTruthy();
    expect(() => readPublicSupabaseConfig("http://127.0.0.1.test:54321", publicKey, undefined, true)).toThrow();
  });
});

describe("login and callback destinations", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
  function mockBrowser() {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      setItem: (k: string, v: string) => values.set(k,v), getItem: (k: string) => values.get(k) ?? null,
      removeItem: (k: string) => values.delete(k),
    });
    return values;
  }
  it("keeps the registered callback exact and reads a destination once in the returning tab", () => {
    mockBrowser();
    expect(loginCallbackUrl("https://team.example", "?next=studio")).toBe("https://team.example/auth/callback");
    expect(callbackReturn("?code=fixture")).toBe("/admin");
    expect(callbackReturn("")).toBe("/start");
    expect(loginReturn("?next=account")).toBe("/account");
    expect(loginReturn("?next=connect")).toBe("/connect");
  });
  it("recognizes only allowlisted local paths and expires stale choices", () => {
    mockBrowser();
    vi.useFakeTimers();
    for (const value of ["https://example.net", "//evil.test", "__proto__", "constructor", "/account/../../admin"]) {
      loginCallbackUrl("https://team.example", "?next=" + encodeURIComponent(value));
      expect(callbackReturn("")).toBe("/start");
      expect(loginReturn("?next=" + encodeURIComponent(value))).toBe("/start");
    }
    loginCallbackUrl("https://team.example","?next=account");
    vi.advanceTimersByTime(61 * 60 * 1000);
    expect(callbackReturn("")).toBe("/start");
  });
  it("preserves approved destinations when retrying cancelled logins", () => {
    mockBrowser();
    loginCallbackUrl("https://team.example","?next=connect");
    expect(retryLoginPath("cancelled","")).toBe("/login?auth_error=cancelled&next=connect");
  });
});
