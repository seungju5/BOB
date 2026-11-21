import { ANDROID_APK_URL, ANDROID_RELEASE_URL, publicUrl } from "@/lib/deployment";

/** Public routes carry navigation only, never account or health data. */
export const HEALTH_WEB_URL = publicUrl("/app/health/");
export const HEALTH_APP_URL = "bapmunna://health";
export const HEALTH_ANDROID_APK_URL = ANDROID_APK_URL;
export const HEALTH_ANDROID_RELEASE_URL = ANDROID_RELEASE_URL;

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
