/** Public routes carry navigation only, never account or health data. */
export const HEALTH_WEB_URL = "https://impact-series.web.app/bapmunna/app/health/";
export const HEALTH_APP_URL = "bapmunna://health";
export const HEALTH_ANDROID_APK_URL = "https://github.com/jooji13/bapmunna-downloads/releases/download/android-0.1.0-test.1/bapmunna-health-0.1.0-test.1.apk";
export const HEALTH_ANDROID_RELEASE_URL = "https://impact-series.web.app/bapmunna/app/downloads/20261115/release.json";

/** A deliberate tap opens the installed app; absence never means connected. */
export function healthAppLink(platform: "ios" | "android"): string {
  if (platform === "ios") return HEALTH_APP_URL;
  return `intent://health#Intent;scheme=bapmunna;package=com.bapmunna.senior;S.browser_fallback_url=${encodeURIComponent(HEALTH_WEB_URL)};end`;
}

/** Same native allowlist: no tokens, redirects, arbitrary routes or fragments. */
export function isHealthLaunchUrl(value: string): boolean {
  if (value !== value.trim() || value.includes("\\")) return false;
  return [HEALTH_APP_URL, `${HEALTH_APP_URL}/`, HEALTH_WEB_URL, HEALTH_WEB_URL.slice(0, -1)].includes(value);
}
