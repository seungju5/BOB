import { APP_BASE_PATH } from "@/lib/app-path";
import { noticeDay } from "@/public/notification-content";

const storageKey = "bapmunna.notice-return";

function localDestination(url: URL) {
  if (url.origin !== location.origin || !url.pathname.startsWith(APP_BASE_PATH + "/")) return null;
  const path = url.pathname.slice(APP_BASE_PATH.length).replace(/\/$/, "");
  if (path === "/records") {
    const day = noticeDay(url.searchParams.get("day"));
    return day ? "/records/?day=" + day : "/records/";
  }
  if (path === "/settings") return "/settings/#device";
  if (path === "/report") return "/report/";
  if (path === "/alerts") return "/alerts/" + (/^#notice-[\w-]{1,100}$/.test(url.hash) ? url.hash : "");
  return null;
}

export function rememberNoticeReturn() {
  const current = new URL(location.href);
  if (current.searchParams.get("from") !== "notice") return;
  const path = localDestination(current);
  if (path) {
    try { sessionStorage.setItem(storageKey, JSON.stringify({path, at: Date.now()})); } catch { /* Private tab. */ }
  }
}

export function takeNoticeReturn() {
  try {
    const saved = sessionStorage.getItem(storageKey);
    sessionStorage.removeItem(storageKey);
    if (!saved) return null;
    const {path, at} = JSON.parse(saved);
    if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") ||
        !Number.isFinite(at) || at > Date.now() || Date.now() - at > 15 * 60000) return null;
    return localDestination(new URL(APP_BASE_PATH + path, location.origin));
  } catch { return null; }
}
