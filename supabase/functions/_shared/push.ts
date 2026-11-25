// 보호자 휴대폰으로 알림 보내기 (Web Push).
// 필요한 비밀값(Supabase > Edge Functions > Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT(mailto: 또는 https: 주소)
// 비밀값이 없으면 보내지 않고 넘어간다 (앱 안 알림은 그대로 생긴다). 발송 실패가 원래 작업을 막지 않는다.
// 앱의 NEXT_PUBLIC_VAPID_PUBLIC_KEY는 VAPID_PUBLIC_KEY와 같은 값이어야 한다.

import webpush from "npm:web-push@3.6.7";
import { alertUrl } from "@/lib/alerts/copy.ts";
import type { AlertPayload, AlertType } from "@/lib/judge/types.ts";
import { db, must } from "./core.ts";

const PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY");
const PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY");
const SUBJECT = Deno.env.get("VAPID_SUBJECT");
const ready = Boolean(PUBLIC && PRIVATE && SUBJECT);
if (ready) webpush.setVapidDetails(SUBJECT!, PUBLIC!, PRIVATE!);

export type SentAlert = { id: string; type: AlertType; payload: AlertPayload | null; triggered_at: string };

function consentRecorded(house: { senior_consent_at: string | null } | null): boolean {
  return typeof house?.senior_consent_at === "string" && Number.isFinite(Date.parse(house.senior_consent_at));
}

/** 한 가구의 보호자 전원에게 새 알림들을 보낸다. 알림 id를 tag로 써서 앱 안 알림과 겹쳐 뜨지 않는다. */
export async function pushAlerts(householdId: string, alerts: SentAlert[]) {
  if (!ready || alerts.length === 0) return;
  try {
    const house = must(await db.from("households").select("senior_consent_at").eq("id", householdId).maybeSingle()) as { senior_consent_at: string | null } | null;
    if (!consentRecorded(house)) return;
    const guardians = must(await db.from("household_guardians").select("user_id").eq("household_id", householdId));
    const users = (guardians as { user_id: string }[]).map((g) => g.user_id);
    if (!users.length) return;
    const subs = must(await db.from("push_subscriptions").select("id, user_id, endpoint, keys").in("user_id", users)) as {
      id: string;
      user_id: string;
      endpoint: string;
      keys: { p256dh: string; auth: string };
    }[];
    for (const a of alerts) {
      // Keep raw readings, names, alert thresholds, dates away from home and
      // other private contents on the authenticated screen. Old workers can
      // still open their original destination from url.
      const timestamp = Date.parse(a.triggered_at);
      const mealDay = a.type === "eat_out" ? a.payload?.meal?.date : undefined;
      const message = JSON.stringify({ kind: a.type, tag: a.id, url: alertUrl(a.type),
        ...(Number.isFinite(timestamp) && {at: new Date(timestamp).toISOString()}),
        ...(mealDay && /^\d{4}-\d{2}-\d{2}$/.test(mealDay) && {date: mealDay}) });
      for (const sub of subs) {
        // Check again after database/previous network waits, immediately before sending.
        let host;
        try {
          const address = new URL(sub.endpoint);
          if (address.protocol !== "https:" || address.port || address.username || address.password || address.hash) continue;
          host = address.hostname;
        } catch { continue; }
        if (!(host === "fcm.googleapis.com" || host.endsWith(".push.apple.com") ||
            host === "updates.push.services.mozilla.com" || host.endsWith(".notify.windows.com"))) continue;
        const [houseResult, guardianResult, subscriptionResult] = await Promise.all([
          db.from("households").select("senior_consent_at").eq("id", householdId).maybeSingle(),
          db.from("household_guardians").select("user_id").eq("household_id", householdId).eq("user_id", sub.user_id).limit(1),
          db.from("push_subscriptions").select("id").eq("user_id", sub.user_id).eq("id", sub.id).limit(1),
        ]);
        const current = must(houseResult) as { senior_consent_at: string | null } | null;
        if (!consentRecorded(current)) return;
        if (!must(guardianResult)?.length || !must(subscriptionResult)?.length) continue;
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, message, { TTL: 60 * 60 * 12 });
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          // 구독이 만료·해지됐으면 지운다
          if (status === 404 || status === 410) await db.from("push_subscriptions").delete().eq("id", sub.id);
          else console.error("push", status ?? "delivery_failed");
        }
      }
    }
  } catch {
    console.error("pushAlerts stopped");
  }
}
