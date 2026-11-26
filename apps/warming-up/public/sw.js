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
      return new URL(recordNoticePath(day, url.searchParams.get("slot")).slice(1), appScope).href;
    }
    case "settings": return new URL("settings/#device", appScope).href;
    case "report": return new URL("report/", appScope).href;
    case "alerts": return new URL("alerts/" + (/^#notice-[a-zA-Z0-9_-]{1,100}$/.test(url.hash) ? url.hash : ""), appScope).href;
    default: return fallback;
  }
}

async function showIncoming(data) {
  if (data.kind === "cooker_signal" && Number.isFinite(data.expiresAt) && Date.now() >= data.expiresAt) return;
  const serverTest = data.kind === "delivery_test" && data.tag === "bapmunna-delivery-test" && validNoticeScope(data.scope);
  if (data.kind === "cooker_signal" || serverTest) {
    try {
      const saved = await self.caches.match(noticeDeliveryKey(appScope), {cacheName:noticePreferenceCache});
      if (saved) {
        const policy = await saved.json();
        if (serverTest) {
          if (!policy.enabled || !await matchesNoticeOwner(policy.owner, data.scope)) return;
        } else if (!await acceptsCookerDelivery(policy, data.scope, data.at, Date.now())) return;
      }
    } catch { return; }
  }
  let showFeature = false;
  try {
    const preference = await self.caches.match(noticePreferenceKey(appScope), {cacheName: noticePreferenceCache});
    showFeature = Boolean(preference && await matchesNoticeOwner(await preference.text(), data.scope));
  } catch { /* Private copy is the default, including during a storage failure. */ }
  const scope = validNoticeScope(data.scope) ? data.scope : null;
  // An older sender cannot bind a record to the account on this phone.
  const path = noticePath(data);
  const ticket = data.kind === "cooker_signal" && validCookerTicket(data.ticket) ? data.ticket : null;
  const text = noticeText(data.kind, showFeature, Boolean(ticket));
  const relative = ((!scope || data.kind === "cooker_signal" && !ticket) && path.startsWith("/records/") ? "/alerts/" : path).slice(1);
  await self.registration.showNotification(text.title, {
    body: text.body, ...(typeof data.tag === "string" && data.tag.length <= 160 && {tag: data.tag}),
    icon: new URL("brand/rice-mark.png", appScope).href,
    badge: new URL("brand/notification-badge.png", appScope).href,
    lang: "ko", data: {url: new URL(relative, appScope).href, ...(scope && {scope}), ...(ticket && {ticket})},
  });
  if (serverTest) await rememberRemoteDelivery(data.scope);
  else if (ticket && scope && data.tag === "cooker-" + data.at) {
    const observedAt = Date.parse(data.at), receivedAt = Date.now();
    if (Number.isSafeInteger(observedAt) && observedAt <= receivedAt && receivedAt - observedAt < 3600000 &&
        Number.isSafeInteger(data.expiresAt) && receivedAt < data.expiresAt)
      await rememberRemoteDelivery(scope, observedAt);
  }
}

// Keep one local receipt for a real push after the device accepts its notification.
// Reading it in the app still requires the matching account and an active subscription.
async function rememberRemoteDelivery(scope, observedAt) {
  const key = noticeDeliveryKey(appScope);
  const save = async () => {
    const cache = await self.caches.open(noticePreferenceCache);
    const policy = await (await cache.match(key))?.json();
    if (!policy?.enabled || !await matchesNoticeOwner(policy.owner, scope)) return;
    const cooker = observedAt !== undefined;
    const target = cooker ? noticeCookerReceiptKey(appScope) : noticeTestReceiptKey(appScope);
    if (cooker) {
      const previous = await (await cache.match(target))?.json();
      if (previous?.observedAt >= observedAt && await matchesNoticeOwner(policy.owner, previous.scope)) {
        if (previous.observedAt === observedAt && previous.scope !== scope)
          await cache.put(target, Response.json({...previous, scope}));
        return;
      }
    }
    await cache.put(target, Response.json({scope, receivedAt:Date.now(), ...(cooker && {observedAt})}));
    const windows = await self.clients.matchAll({type:"window"});
    for (const client of windows) client.postMessage({type:cooker ? "bapmunna:cooker-received" : "bapmunna:server-test-received"});
  };
  try {
    if (self.navigator?.locks) await self.navigator.locks.request(key, save);
    else await save();
  } catch { /* The system notification remains usable if device storage is unavailable. */ }
}

async function rememberCookerOpen(scope) {
  const key = noticeDeliveryKey(appScope);
  const save = async () => {
    const cache = await self.caches.open(noticePreferenceCache);
    const policy = await (await cache.match(key))?.json();
    const target = noticeCookerReceiptKey(appScope);
    const receipt = await (await cache.match(target))?.json();
    if (!policy?.enabled || receipt?.scope !== scope || receipt.openedAt || !await matchesNoticeOwner(policy.owner, scope)) return;
    const openedAt = Date.now();
    if (openedAt >= receipt.receivedAt && openedAt - receipt.receivedAt < 86400000)
      await cache.put(target, Response.json({...receipt, openedAt}));
  };
  try {
    if (self.navigator?.locks) await self.navigator.locks.request(key, save);
    else await save();
  } catch { /* Opening the record is also possible without a local receipt. */ }
}

self.addEventListener("push", event => {
  let data;
  try { data = event.data?.json(); } catch { /* Legacy text payload. */ }
  event.waitUntil(showIncoming(data && typeof data === "object" ? data : {}));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  let clicked = new URL(safeClickURL(event.notification.data?.url));
  const scope = event.notification.data?.scope;
  const ticket = event.notification.data?.ticket;
  if (validCookerTicket(ticket)) {
    clicked = new URL("alerts/", appScope);
    clicked.searchParams.set("cookTicket", ticket);
  }
  if (validNoticeScope(scope)) clicked.searchParams.set("noticeFor", scope);
  else if (clicked.pathname.endsWith("/records/")) clicked = new URL("alerts/", appScope);
  clicked.searchParams.set("from", "notice");
  const url = clicked.href;
  const receipt = validCookerTicket(ticket) && validNoticeScope(scope) ? rememberCookerOpen(scope) : Promise.resolve();
  event.waitUntil(Promise.all([receipt, (async () => {
    const list = await self.clients.matchAll({type: "window", includeUncontrolled: true});
    for (const client of list) {
      if (!client.url.startsWith(appScope.href) || typeof client.navigate !== "function") continue;
      const target = await client.navigate(url).catch(() => null);
      if (target) { await target.focus(); return; }
    }
    await self.clients.openWindow(url);
  })()]));
});
