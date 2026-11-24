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

/** @param {unknown} kind @param {boolean} showFeature */
function noticeText(kind, showFeature) {
  if (kind === "delivery_test") return {title: "밥뭇나 · 시험 알림", body: "이 기기에 알림이 도착했어요. 누르면 밥뭇나 알림함이 열려요."};
  return showFeature && typeof kind === "string" && Object.hasOwn(featureNotices, kind)
    ? featureNotices[/** @type {keyof typeof featureNotices} */ (kind)] : privateNotice;
}

/** All current payloads supply a kind. Only the previous worker's two routes are accepted for legacy pushes. */
function noticePath(data) {
  if (data.kind === "weekly_report") return "/report/";
  if (data.kind === "device_offline") return "/settings/#device";
  if (data.kind === "cooker_signal" || data.kind === "eat_out") {
    let day = noticeDay(data.date);
    if (!day && typeof data.at === "string" && /^\d{4}-\d{2}-\d{2}T/.test(data.at)) {
      const event = Date.parse(data.at);
      if (Number.isFinite(event)) day = new Date(event + 9 * 3600000).toISOString().slice(0, 10);
    }
    if (day) return "/records/?day=" + day;
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

if (typeof module !== "undefined") module.exports = {noticeText, noticePath, noticeDay, noticePreferenceCache, noticePreferenceKey};
