// 밥뭇나 서비스 워커: 푸시 알림 표시와 알림을 눌렀을 때 앱 열기.
// 서버(Edge Function)는 { title, body, tag, url } JSON을 보낸다. tag는 알림 id라 같은 알림이 두 번 뜨지 않는다.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const appScope = new URL(self.registration.scope);
function appNotificationURL(value) {
  const fallback = new URL("alerts/", appScope);
  if (typeof value !== "string" || value.includes("\\")) return fallback.href;
  let candidate;
  try { candidate = new URL(value, appScope); } catch { return fallback.href; }
  if (candidate.origin !== appScope.origin) return fallback.href;
  if (candidate.pathname.startsWith(appScope.pathname)) return candidate.href;
  // Existing server payloads use /alerts or /report, independent of the hosting mount.
  if (["/alerts", "/report"].includes(candidate.pathname)) {
    return new URL(candidate.pathname.slice(1) + "/" + candidate.search + candidate.hash, appScope).href;
  }
  return fallback.href;
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    // A legacy or non-JSON payload still receives a private lock-screen message.
  }
  event.waitUntil(
    self.registration.showNotification("밥뭇나", {
      body: "워밍이가 새 소식을 가져왔어요. 앱에서 확인해 주세요.",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      icon: new URL("icon.svg", appScope).href,
      badge: new URL("icon.svg", appScope).href,
      data: { url: appNotificationURL(data.url) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = appNotificationURL(event.notification.data?.url);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (list) => {
      for (const c of list) {
        if (c.url.startsWith(appScope.href) && typeof c.navigate === "function" && "focus" in c) {
          const destination = await c.navigate(url).catch(() => null);
          if (destination) return destination.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
