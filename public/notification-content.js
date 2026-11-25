// Used by the classic service worker and the app. Only these fixed phrases can
// appear on a lock screen. A sender's title, body, household data or URL is never displayed.
const privateNotice = {title: "밥뭇나", body: "워밍이가 새 소식을 가져왔어요. 앱에서 확인해 주세요."};
const familyNotice = {title: "밥뭇나 · 안부가 왔어요", body: "눌러서 받은 안부를 확인하고 마음을 전해 보세요."};
const checkInNotice = {title: "밥뭇나 · 안부를 살펴볼까요?", body: "확인할 소식이 있어요. 눌러서 알림을 열어 보세요."};
const featureNotices = Object.freeze({
  cooker_signal: {title: "밥솥에서 소식이 왔어요", body: "밥뭇나에서 그날의 밥솥 기록을 열어 보세요."},
  weekly_report: {title: "밥뭇나 · 한 주 리포트가 왔어요", body: "눌러서 지난 한 주의 밥솥 소식을 살펴보세요."},
  eat_out: {title: "밥뭇나 · 끼니 소식이 왔어요", body: "눌러서 해당 날짜의 기록을 살펴보세요."},
  away: familyNotice,
  help_request: {title: "밥뭇나 · 확인할 안부가 왔어요", body: "지금 앱을 열어 받은 안부를 확인해 주세요."},
  missed_meals: checkInNotice, fasting: checkInNotice, emergency: checkInNotice,
  device_offline: {title: "밥뭇나 · 기기 연결을 살펴봐요", body: "눌러서 밥솥 플러그의 연결 상태를 확인해 주세요."},
});

/** @param {unknown} value */
function noticeDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? value : null;
}

const mealIds = new Set(["breakfast", "lunch", "dinner", "fourth", "fifth"]);
/** @param {unknown} value */
function noticeSlot(value) { return typeof value === "string" && mealIds.has(value) ? value : null; }
/** @param {unknown} date @param {unknown} slot */
function recordNoticePath(date, slot) {
  const day = noticeDay(date), meal = noticeSlot(slot);
  return day ? "/records/?day=" + day + (meal ? "&slot=" + meal : "") : "/records/";
}
/** @param {unknown} scope */
function validNoticeScope(scope) { return typeof scope === "string" && /^[A-Za-z0-9_-]{32,43}\.[a-f0-9]{64}$/.test(scope); }
/** @param {unknown} ticket */
function validCookerTicket(ticket) { return typeof ticket === "string" && /^n1\.[\w-]{70,120}$/.test(ticket); }
/** @param {string} owner @param {string} nonce */
async function scopedNotice(owner, nonce) {
  const bytes = new TextEncoder().encode("bapmunna-notice-v1/" + nonce + "/" + owner);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return nonce + "." + Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, "0")).join("");
}
/** @param {unknown} owner @param {unknown} scope */
async function matchesNoticeOwner(owner, scope) {
  if (typeof owner !== "string" || !owner || typeof scope !== "string" || !validNoticeScope(scope)) return false;
  try { return await scopedNotice(owner, scope.split(".")[0]) === scope; } catch { return false; }
}
/** @param {unknown} kind @param {boolean} showFeature @param {boolean} [hasRecord] */
function noticeText(kind, showFeature, hasRecord = true) {
  if (kind === "delivery_test") return {title: "밥뭇나 · 시험 알림", body: "이 기기에 알림이 도착했어요. 누르면 밥뭇나 알림함이 열려요."};
  if (showFeature && kind === "cooker_signal" && !hasRecord) return {title:featureNotices.cooker_signal.title,body:"밥뭇나 알림함에서 밥솥 소식을 확인해 보세요."};
  return showFeature && typeof kind === "string" && Object.hasOwn(featureNotices, kind)
    ? featureNotices[/** @type {keyof typeof featureNotices} */ (kind)] : privateNotice;
}

/** All current payloads supply a kind. Only the previous worker's two routes are accepted for legacy pushes. */
function noticePath(data) {
  if (data.kind === "weekly_report") return "/report/";
  if (data.kind === "device_offline") return "/settings/#device";
  if (data.kind === "cooker_signal" || data.kind === "eat_out") {
    const declared = noticeDay(data.date);
    let observed = null;
    if (typeof data.at === "string" && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d\d:\d\d)$/.test(data.at)) {
      const event = Date.parse(data.at);
      if (Number.isFinite(event)) observed = new Date(event + 9 * 3600000).toISOString().slice(0, 10);
    }
    const day = data.kind === "cooker_signal" ? observed ?? declared : declared ?? observed;
    if (day) return recordNoticePath(day, declared === day ? data.slot : null);
  }
  if (typeof data.kind === "string" && Object.hasOwn(featureNotices, data.kind) &&
      typeof data.tag === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(data.tag)) {
    return "/alerts/#notice-" + data.tag;
  }
  if (!data.kind && (data.url === "/report" || data.url === "/report/")) return "/report/";
  return "/alerts/";
}

// A single, scope-local switch is shared with the worker while the app is closed.
// Only the account that set it can see it as enabled in the app.
const noticePreferenceCache = "bapmunna-notice-previews-v1";
function noticePreferenceKey(scope) { return new URL(".notice-preview", scope).href; }
function noticeDeliveryKey(scope) { return new URL(".notice-delivery", scope).href; }

// Apply the most recent device choice even if an encrypted packet was already
// waiting at the push provider when the user signed out or changed their hours.
async function acceptsCookerDelivery(policy, scope, at, now) {
  if (policy?.enabled !== true || !await matchesNoticeOwner(policy.owner, scope)) return false;
  const hours = policy.quiet;
  if (!hours) return true;
  const inside = ms => {
    if (!Number.isFinite(ms)) return false;
    const time = new Date(ms + 9 * 3600_000).toISOString().slice(11,16);
    return hours.start < hours.end ? time >= hours.start && time < hours.end : time >= hours.start || time < hours.end;
  };
  return !inside(Date.parse(at)) && !inside(now);
}

if (typeof module !== "undefined") module.exports = {noticeText, noticePath, noticeDay, noticeSlot, recordNoticePath, validCookerTicket, validNoticeScope, scopedNotice, matchesNoticeOwner, noticePreferenceCache, noticePreferenceKey, noticeDeliveryKey, acceptsCookerDelivery};
