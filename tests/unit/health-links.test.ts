import { describe, expect, it } from "vitest";
import { HEALTH_APP_URL, HEALTH_WEB_URL, healthAppLink, isHealthLaunchUrl } from "@/lib/mobile/links";

describe("public health launch links never transfer identity or health data", () => {
  it("uses a fixed iOS scheme and an Android package with a fixed HTTPS fallback", () => {
    expect(healthAppLink("ios")).toBe(HEALTH_APP_URL);
    const android=healthAppLink("android");
    expect(android).toContain("package=com.bapmunna.senior;");
    expect(android).toContain(`S.browser_fallback_url=${encodeURIComponent(HEALTH_WEB_URL)};end`);
    expect(android).not.toMatch(/token|uid|email|steps=/i);
  });
  it.each([HEALTH_APP_URL, `${HEALTH_APP_URL}/`, HEALTH_WEB_URL, HEALTH_WEB_URL.slice(0,-1)])("accepts only an exact health destination: %s", value => expect(isHealthLaunchUrl(value)).toBe(true));
  it.each([
    "bapmunna://health?token=secret", "bapmunna://health#token", "bapmunna://health/../login",
    "bapmunna://health@evil.test", "bapmunna://health.evil.test", "bapmunna://login",
    "javascript:alert(1)", "file:///health/", "https://warming-up-bapmunna.web.app.evil.test/health/",
    "http://warming-up-bapmunna.web.app/health/", "https://user:pass@warming-up-bapmunna.web.app/health/",
    `${HEALTH_WEB_URL}?redirect=https://evil.test`, `${HEALTH_WEB_URL}#secret`, ` ${HEALTH_APP_URL}`, `${HEALTH_APP_URL}\n`,
    "https://warming-up-bapmunna.web.app/%68ealth/", "https://warming-up-bapmunna.web.app/health\\",
  ])("rejects redirects, credentials and route injection: %s", value => expect(isHealthLaunchUrl(value)).toBe(false));
});
