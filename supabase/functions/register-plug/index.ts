// 보호자가 SmartThings 토큰과 플러그 기기 ID를 등록한다. 토큰은 Vault에만 저장한다.
//   POST { deviceId, token }  (Authorization: 보호자 세션 JWT) → { watts }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { cors, db, json, must, readPower } from "@/_shared/core.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const { data: auth } = await db.auth.getUser(jwt);
    if (!auth.user) return json({ error: "로그인이 필요해요." }, 401);

    const links = must(await db.from("household_guardians").select("household_id").eq("user_id", auth.user.id).limit(1)) as { household_id: string }[];
    const h = links[0]?.household_id;
    if (!h) return json({ error: "가구 정보가 없어요." }, 400);

    const { deviceId, token } = (await req.json()) as { deviceId?: string; token?: string };
    if (!deviceId?.trim() || !token?.trim()) return json({ error: "토큰과 기기 ID를 모두 넣어 주세요." }, 400);

    let watts: number;
    try {
      watts = await readPower(deviceId.trim(), token.trim());
    } catch (e) {
      return json({ error: `플러그 값을 읽지 못했어요. 토큰·기기 ID를 확인해 주세요. (${e instanceof Error ? e.message : e})` }, 400);
    }

    const plug = must(await db.rpc("store_plug_token", { h, device_id: deviceId.trim(), token: token.trim() })) as string;
    const now = new Date();
    must(await db.from("smart_plugs").update({ status: "online", last_reading_at: now.toISOString() }).eq("id", plug));
    return json({ watts });
  } catch (e) {
    console.error(e);
    return json({ error: "잠시 후 다시 시도해 주세요." }, 500);
  }
});
