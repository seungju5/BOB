// 밥뭇나 서비스 워커: 푸시 알림 표시와 알림을 눌렀을 때 앱 열기.
// 서버(Edge Function)는 { title, body, tag, url } JSON을 보낸다. tag는 알림 id라 같은 알림이 두 번 뜨지 않는다.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "밥뭇나", {
      body: data.body || "새 소식이 있어요.",
      tag: data.tag,
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: data.url || "/alerts" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/alerts";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
