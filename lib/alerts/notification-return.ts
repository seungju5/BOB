import { APP_BASE_PATH } from "@/lib/app-path";
import {matchesNoticeOwner, recordNoticePath, validCookerTicket, validNoticeScope} from "@/public/notification-content";
import {resolveCookerTicket} from "@/lib/notification-transport";

const storageKey = "bapmunna.notice-return";

function destination(url: URL) {
  if (url.origin !== location.origin || !url.pathname.startsWith(APP_BASE_PATH + "/")) return null;
  const path = url.pathname.slice(APP_BASE_PATH.length).replace(/\/$/, "");
  if (path === "/records") return recordNoticePath(url.searchParams.get("day"), url.searchParams.get("slot"));
  if (path === "/settings") return "/settings/#device";
  if (path === "/report") return "/report/";
  if (path === "/alerts") return "/alerts/" + (/^#notice-[\w-]{1,100}$/.test(url.hash) ? url.hash : "");
  return null;
}

/** Returns a relative, allow-listed destination after checking the current Firebase identity. */
export async function resolveNoticeReturn(url: URL, owner: string | null) {
  const target = destination(url);
  const scope = url.searchParams.get("noticeFor");
  if (!target || !owner) return "/alerts/";
  const ticket = url.searchParams.get("cookTicket");
  if (ticket !== null) {
    if (!validCookerTicket(ticket) || !await matchesNoticeOwner(owner, scope)) return "/alerts/";
    return resolveCookerTicket(owner, ticket);
  }
  if (scope) return await matchesNoticeOwner(owner, scope) ? target : "/alerts/";
  // Legacy notifications can open general pages, but carry no account proof for a dated record.
  return target.startsWith("/records/") || target.includes("#notice-") ? "/alerts/" : target;
}

export function rememberNoticeReturn() {
  const current = new URL(location.href);
  if (current.searchParams.get("from") !== "notice") return;
  const target = destination(current);
  if (!target) return;
  const ticket = current.searchParams.get("cookTicket");
  const path = new URL(APP_BASE_PATH + (ticket !== null ? "/alerts/" : target), location.origin);
  const scope = current.searchParams.get("noticeFor");
  if (scope && validNoticeScope(scope)) path.searchParams.set("noticeFor", scope);
  if (ticket && validCookerTicket(ticket)) path.searchParams.set("cookTicket",ticket);
  try { sessionStorage.setItem(storageKey, JSON.stringify({path: path.pathname + path.search + path.hash, at: Date.now()})); }
  catch { /* Private tab. */ }
}

export function readNoticeReturn() {
  try {
    const saved = sessionStorage.getItem(storageKey);
    if (!saved) return null;
    const {path, at} = JSON.parse(saved);
    if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") ||
        !Number.isFinite(at) || at > Date.now() || Date.now() - at > 15 * 60000) return null;
    const url = new URL(path, location.origin);
    return destination(url) ? url : null;
  } catch { return null; }
}

export function clearNoticeReturn() {
  try { sessionStorage.removeItem(storageKey); } catch { /* Private tab. */ }
}
