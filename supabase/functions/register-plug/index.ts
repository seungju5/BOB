// 보호자가 SmartThings 토큰과 플러그 기기 ID를 등록한다. 토큰은 Vault에만 저장한다.
//   POST { deviceId, token }  (Authorization: 보호자 세션 JWT) → { connected, checkedAt }
// 원시 전력값은 연결 확인에만 사용하며 브라우저 응답에 포함하지 않는다.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { cors, db, json, must, readPower } from "@/_shared/core.ts";

async function hasSeniorConsent(householdId: string): Promise<boolean> {
  const house = must(await db.from("households").select("senior_consent_at").eq("id", householdId).maybeSingle()) as { senior_consent_at: string | null } | null;
  return typeof house?.senior_consent_at === "string" && Number.isFinite(Date.parse(house.senior_consent_at));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const { data: auth } = await db.auth.getUser(jwt);
    if (!auth.user) return json({ error: "로그인이 필요해요." }, 401);

    const links = must(await db.from("household_guardians").select("household_id").eq("user_id", auth.user.id).limit(1)) as { household_id: string }[];
    const h = links[0]?.household_id;
    if (!h) return json({ error: "가구 정보가 없어요." }, 400);

    if (!await hasSeniorConsent(h)) return json({ error: "기기를 연결하려면 어르신의 안부 정보 이용 동의가 필요해요.", code: "senior_consent_required" }, 403);

    const { deviceId, token } = (await req.json()) as { deviceId?: string; token?: string };
    if (typeof deviceId !== "string" || typeof token !== "string" || !deviceId.trim() || !token.trim()) return json({ error: "토큰과 기기 ID를 모두 넣어 주세요." }, 400);

    try {
      await readPower(deviceId.trim(), token.trim());
    } catch {
      return json({ error: "기기 응답을 확인하지 못했어요. 토큰·기기 ID를 확인해 주세요." }, 400);
    }

    // 기기 응답을 기다리는 동안 동의를 철회했다면 토큰을 저장하지 않는다.
    if (!await hasSeniorConsent(h)) return json({ error: "안부 정보 이용 동의가 중단되어 연결을 멈췄어요.", code: "senior_consent_required" }, 403);
    const plug = must(await db.rpc("store_plug_token", { h, device_id: deviceId.trim(), token: token.trim() })) as string;
    const now = new Date();
    must(await db.from("smart_plugs").update({ status: "online", last_reading_at: now.toISOString() }).eq("id", plug));
    return json({ connected: true, checkedAt: now.toISOString() });
  } catch {
    console.error("register-plug failed");
    return json({ error: "잠시 후 다시 시도해 주세요." }, 500);
  }
});
