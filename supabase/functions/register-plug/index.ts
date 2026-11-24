// 보호자가 SmartThings 토큰과 플러그 기기 ID를 등록한다. 토큰은 Vault에만 저장한다.
//   POST { deviceId, token }  (Authorization: 보호자 세션 JWT) → { connected, checkedAt }
// 연결 확인과 첫 측정은 서버에서 처리하고, 브라우저에는 확인 결과와 조회 시각만 돌려준다.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { cors, db, json, must, readMeterKind, readPower, recordObservation } from "@/_shared/core.ts";

async function hasSeniorConsent(householdId: string): Promise<boolean> {
  const house = must(await db.from("households").select("senior_consent_at").eq("id", householdId).maybeSingle()) as { senior_consent_at: string | null } | null;
  return typeof house?.senior_consent_at === "string" && Number.isFinite(Date.parse(house.senior_consent_at));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST 요청이 필요해요." }, 405);
  try {
    const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const { data: auth } = await db.auth.getUser(jwt);
    if (!auth.user) return json({ error: "로그인이 필요해요." }, 401);

    const { deviceId, token, householdId } = (await req.json()) as { deviceId?: string; token?: string; householdId?: string };
    if (householdId !== undefined && (typeof householdId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(householdId))) {
      return json({ error: "가구 정보를 다시 확인해 주세요." }, 400);
    }
    let membership = db.from("household_guardians").select("household_id, households!inner(created_at)").eq("user_id", auth.user.id);
    if (householdId) membership = membership.eq("household_id", householdId);
    // Older clients did not send householdId. Match ensure_household()'s stable selection.
    const links = must(await membership.order("households(created_at)").order("household_id").limit(1)) as { household_id: string }[];
    const h = links[0]?.household_id;
    if (!h) return json({ error: "가구 정보가 없어요." }, 400);

    if (!await hasSeniorConsent(h)) return json({ error: "기기를 연결하려면 어르신의 안부 정보 이용 동의가 필요해요.", code: "senior_consent_required" }, 403);

    if (typeof deviceId !== "string" || typeof token !== "string" || !deviceId.trim() || !token.trim()) return json({ error: "토큰과 기기 ID를 모두 넣어 주세요." }, 400);

    let kind: Awaited<ReturnType<typeof readMeterKind>>;
    let reading: Awaited<ReturnType<typeof readPower>>;
    try {
      [kind, reading] = await Promise.all([readMeterKind(deviceId.trim(), token.trim()), readPower(deviceId.trim(), token.trim())]);
    } catch {
      return json({ error: "기기 응답을 확인하지 못했어요. 토큰·기기 ID를 확인해 주세요." }, 400);
    }

    // 기기 응답을 기다리는 동안 동의를 철회했다면 토큰을 저장하지 않는다.
    if (!await hasSeniorConsent(h)) return json({ error: "안부 정보 이용 동의가 중단되어 연결을 멈췄어요.", code: "senior_consent_required" }, 403);
    const saved = await recordObservation(h, deviceId.trim(), kind, reading, { token: token.trim(), guardian: auth.user.id });
    if (!saved) return json({ error: "기기 연결 권한과 어르신의 동의를 다시 확인해 주세요." }, 403);
    return json({ connected: true, checkedAt: new Date().toISOString() });
  } catch {
    console.error("register-plug failed");
    return json({ error: "잠시 후 다시 시도해 주세요." }, 500);
  }
});
