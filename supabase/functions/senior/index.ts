// 어르신 앱 API. 로그인 없이 연결 숫자로 받은 기기 토큰으로 인증한다 (design.md 6장 senior-pair / senior-action).
//   { op: "pair", code }            → { token }
//   { op: "status", token }         → { seniorName, relation, lastCookerAt, absence }
//   { op: "eat_out" | "help", token }
//   { op: "away", token, days }     오늘부터 days일 부재
//   { op: "back", token }           부재를 어제로 끝냄
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { addDays, kstDate } from "@/lib/judge/time.ts";
import { cors, db, json, must, recomputeDay, refreshActivity, sha256 } from "@/_shared/core.ts";
import { pushAlerts, type SentAlert } from "@/_shared/push.ts";

type Device = { id: string; household_id: string };

class SeniorConsentRequired extends Error {}

async function requireSeniorConsent(householdId: string): Promise<void> {
  const house = must(await db.from("households").select("senior_consent_at").eq("id", householdId).maybeSingle()) as {
    senior_consent_at: string | null;
  } | null;
  if (typeof house?.senior_consent_at !== "string" || !Number.isFinite(Date.parse(house.senior_consent_at))) {
    throw new SeniorConsentRequired();
  }
}

// Check each database/network boundary, including the result after a wait.
// This does not cancel a committed write; an atomic withdrawal transaction is
// a separate database concern. A late response must not authorize more work.
async function whileConsented<T>(householdId: string, action: () => PromiseLike<T>): Promise<T> {
  await requireSeniorConsent(householdId);
  const result = await action();
  await requireSeniorConsent(householdId);
  return result;
}

async function deviceFor(token: unknown): Promise<Device | null> {
  if (typeof token !== "string" || token.length < 32) return null;
  const rows = must(await db.from("senior_devices").select("id, household_id").eq("device_token_hash", await sha256(token)).limit(1)) as Device[];
  return rows[0] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = (await req.json()) as { op?: string; code?: string; token?: string; days?: number } | null;
    if (!body || typeof body !== "object" || !["pair", "status", "eat_out", "help", "away", "back"].includes(body.op ?? "")) return json({ error: "unknown op" }, 400);
    const now = new Date();
    const today = kstDate(now);

    if (body.op === "pair") {
      const code = String(body.code ?? "").replace(/\D/g, "");
      if (!/^\d{6}$/.test(code)) return json({ error: "연결 숫자 6자리를 확인해 주세요." }, 400);
      const rows = must(
        await db.from("senior_devices").select("id, household_id, pairing_expires_at").eq("pairing_code", code).is("paired_at", null).limit(1),
      ) as Array<Device & { pairing_expires_at: string }>;
      const d = rows[0];
      if (!d || !Number.isFinite(Date.parse(d.pairing_expires_at)) || new Date(d.pairing_expires_at) <= now) return json({ error: "숫자가 맞지 않거나 만료됐어요." }, 400);
      await requireSeniorConsent(d.household_id);
      const token = crypto.randomUUID() + crypto.randomUUID();
      const tokenHash = await sha256(token);
      const paired = await whileConsented(d.household_id, async () => {
        const pairedAt = new Date().toISOString();
        return must(await db
          .from("senior_devices")
          .update({ device_token_hash: tokenHash, paired_at: pairedAt, pairing_code: null, last_seen_at: pairedAt })
          .eq("id", d.id).eq("pairing_code", code).is("paired_at", null).gt("pairing_expires_at", pairedAt).select("id"));
      }) as Array<{ id: string }>;
      if (paired.length !== 1) return json({ error: "숫자가 맞지 않거나 만료됐어요." }, 400);
      return json({ token });
    }

    const device = await deviceFor(body.token);
    if (!device) return json({ error: "연결이 끊겼어요. 다시 연결해 주세요." }, 401);
    const h = device.household_id;
    const allowed = <T>(action: () => PromiseLike<T>) => whileConsented(h, action);
    await allowed(async () => must(await db.from("senior_devices").update({ last_seen_at: now.toISOString() }).eq("id", device.id)));

    switch (body.op) {
      case "status": {
        const house = await allowed(async () => must(await db.from("households").select("senior_name, senior_relation, last_cooker_at").eq("id", h).single())) as {
          senior_name: string;
          senior_relation: string;
          last_cooker_at: string | null;
        };
        const absence = await allowed(async () => must(
          await db.from("absences").select("start_date, end_date").eq("household_id", h).gte("end_date", today).lte("start_date", today).limit(1),
        )) as { start_date: string; end_date: string }[];
        return json({
          seniorName: house.senior_name,
          relation: house.senior_relation,
          lastCookerAt: house.last_cooker_at,
          absence: absence[0] ? { startDate: absence[0].start_date, endDate: absence[0].end_date } : null,
        });
      }
      case "eat_out":
      case "help": {
        await allowed(async () => must(await db.from("senior_actions").insert({ household_id: h, type: body.op, at: now.toISOString() })));
        // 가족에게 소식: 도움 요청은 긴급, 외식은 안부 전화 권유 (0003 마이그레이션 필요)
        const type = body.op === "help" ? "help_request" : "eat_out";
        const rows = await allowed(async () => must(await db.from("alerts").insert({ household_id: h, type }).select("id, type, payload"))) as SentAlert[];
        await allowed(() => pushAlerts(h, rows));
        break;
      }
      case "away": {
        const days = Math.min(Math.max(Math.floor(Number(body.days) || 1), 1), 30);
        const endDate = addDays(today, days - 1);
        await allowed(async () => must(await db.from("absences").delete().eq("household_id", h).lte("start_date", today).gte("end_date", today)));
        await allowed(async () => must(await db.from("absences").insert({ household_id: h, start_date: today, end_date: endDate, created_by: "senior" })));
        await allowed(async () => must(await db.from("senior_actions").insert({ household_id: h, type: "away", at: now.toISOString() })));
        const rows = await allowed(async () => must(await db.from("alerts").insert({ household_id: h, type: "away", payload: { endDate } }).select("id, type, payload"))) as SentAlert[];
        await allowed(() => pushAlerts(h, rows));
        break;
      }
      case "back": {
        const yesterday = addDays(today, -1);
        await allowed(async () => must(await db.from("absences").delete().eq("household_id", h).eq("start_date", today)));
        await allowed(async () => must(await db.from("absences").update({ end_date: yesterday }).eq("household_id", h).lte("start_date", yesterday).gte("end_date", today)));
        await allowed(async () => must(await db.from("senior_actions").insert({ household_id: h, type: "away", at: now.toISOString() })));
        break;
      }
      default:
        return json({ error: "unknown op" }, 400);
    }
    await allowed(() => refreshActivity(h));
    await allowed(() => recomputeDay(h, today, now));
    return json({ ok: true });
  } catch (e) {
    if (e instanceof SeniorConsentRequired) return json({ error: "어르신 동의가 필요해요. 보호자에게 확인해 주세요.", code: "senior_consent_required" }, 403);
    console.error("senior request stopped");
    return json({ error: "잠시 후 다시 시도해 주세요." }, 500);
  }
});
