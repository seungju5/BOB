// Keep service worker registration compatible with already installed web apps.
importScripts("./notification-content.js");
const appScope = new URL(self.registration.scope);
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

function safeClickURL(value) {
  const fallback = new URL("alerts/", appScope).href;
  if (typeof value !== "string" || value.includes("\\")) return fallback;
  let url;
  try { url = new URL(value, appScope); } catch { return fallback; }
  if (url.origin !== appScope.origin) return fallback;
  const path = url.pathname.startsWith(appScope.pathname) ? url.pathname.slice(appScope.pathname.length) : url.pathname.slice(1);
  switch (path.replace(/\/$/, "")) {
    case "records": {
      const day = noticeDay(url.searchParams.get("day"));
      return new URL(day ? "records/?day=" + day : "records/", appScope).href;
    }
    case "settings": return new URL("settings/#device", appScope).href;
    case "report": return new URL("report/", appScope).href;
    case "alerts": return new URL("alerts/" + (/^#notice-[a-zA-Z0-9_-]{1,100}$/.test(url.hash) ? url.hash : ""), appScope).href;
    default: return fallback;
  }
}

async function showIncoming(data) {
  let showFeature = false;
  try {
    const preference = await self.caches.match(noticePreferenceKey(appScope), {cacheName: noticePreferenceCache});
    showFeature = Boolean(preference && await preference.text());
  } catch { /* Private copy is the default, including during a storage failure. */ }
  const text = noticeText(data.kind, showFeature);
  const relative = noticePath(data).slice(1);
  return self.registration.showNotification(text.title, {
    body: text.body, ...(typeof data.tag === "string" && data.tag.length <= 160 && {tag: data.tag}),
    icon: new URL("brand/rice-logo.png", appScope).href,
    badge: new URL("brand/notification-badge.png", appScope).href,
    lang: "ko", data: {url: new URL(relative, appScope).href},
  });
}

self.addEventListener("push", event => {
  let data;
  try { data = event.data?.json(); } catch { /* Legacy text payload. */ }
  event.waitUntil(showIncoming(data && typeof data === "object" ? data : {}));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const clicked = new URL(safeClickURL(event.notification.data?.url));
  clicked.searchParams.set("from", "notice");
  const url = clicked.href;
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({type: "window", includeUncontrolled: true});
    for (const client of list) {
      if (!client.url.startsWith(appScope.href) || typeof client.navigate !== "function") continue;
      const target = await client.navigate(url).catch(() => null);
      if (target) { await target.focus(); return; }
    }
    await self.clients.openWindow(url);
  })());
});
