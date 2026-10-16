// Edge Functions 공통 모듈. 판단 로직은 앱과 같은 lib/judge를 쓴다 (배포 시 함께 업로드).
import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveMealSlots } from "@/lib/judge/resolveMealSlots.ts";
import { addDays, kstDate, kstDateTime } from "@/lib/judge/time.ts";
import type { Absence, MealWindow } from "@/lib/judge/types.ts";

export const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

export function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** KST 날짜의 [시작, 끝) ISO 범위 */
export function dayRange(date: string) {
  return { from: kstDateTime(date, "00:00").toISOString(), to: kstDateTime(addDays(date, 1), "00:00").toISOString() };
}

export async function getAbsences(householdId: string): Promise<Absence[]> {
  const rows = must(await db.from("absences").select("start_date, end_date").eq("household_id", householdId));
  return (rows ?? []).map((a: { start_date: string; end_date: string }) => ({ startDate: a.start_date, endDate: a.end_date }));
}

/** 하루치 끼니 상태와 취사·열림 횟수를 다시 계산해 저장한다. */
export async function recomputeDay(householdId: string, date: string, now: Date) {
  const { from, to } = dayRange(date);
  const [profile, events, actions, absences] = await Promise.all([
    db.from("meal_profiles").select("meal_windows").eq("household_id", householdId).single().then(must),
    db.from("cooker_events").select("type, started_at, ended_at").eq("household_id", householdId).gte("started_at", from).lt("started_at", to).then(must),
    db.from("senior_actions").select("at").eq("household_id", householdId).eq("type", "eat_out").gte("at", from).lt("at", to).then(must),
    getAbsences(householdId),
  ]);
  type Ev = { type: "cook" | "lid_open"; started_at: string; ended_at: string };
  const evs = (events ?? []) as Ev[];
  const slots = resolveMealSlots({
    date,
    windows: (profile as { meal_windows: MealWindow[] }).meal_windows,
    events: evs.map((e) => ({ type: e.type, startedAt: new Date(e.started_at), endedAt: new Date(e.ended_at) })),
    eatOutChecks: ((actions ?? []) as { at: string }[]).map((a) => new Date(a.at)),
    absences,
    now,
  });
  must(
    await db.from("meal_slots").upsert(
      slots.map((s) => ({ household_id: householdId, date: s.date, slot: s.slot, status: s.status, source: s.source })),
    ),
  );
  must(
    await db.from("daily_cooker_stats").upsert({
      household_id: householdId,
      date,
      cook_count: evs.filter((e) => e.type === "cook").length,
      lid_open_count: evs.filter((e) => e.type === "lid_open").length,
    }),
  );
}

/** last_cooker_at·last_activity_at 갱신 */
export async function refreshActivity(householdId: string, latestCooker?: Date | null) {
  const h = must(await db.from("households").select("last_cooker_at").eq("id", householdId).single()) as { last_cooker_at: string | null };
  const action = must(
    await db.from("senior_actions").select("at").eq("household_id", householdId).order("at", { ascending: false }).limit(1),
  ) as { at: string }[];
  let cooker = h.last_cooker_at ? new Date(h.last_cooker_at) : null;
  if (latestCooker && (!cooker || latestCooker > cooker)) cooker = latestCooker;
  const candidates = [cooker, action[0] ? new Date(action[0].at) : null].filter(Boolean) as Date[];
  const activity = candidates.length ? new Date(Math.max(...candidates.map((d) => d.getTime()))) : null;
  must(
    await db
      .from("households")
      .update({ last_cooker_at: cooker?.toISOString() ?? null, last_activity_at: activity?.toISOString() ?? null })
      .eq("id", householdId),
  );
}

export const today = (now: Date) => kstDate(now);

export async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** SmartThings 플러그의 현재 전력값(W) */
export async function readPower(deviceId: string, token: string): Promise<number> {
  const res = await fetch(
    `https://api.smartthings.com/v1/devices/${encodeURIComponent(deviceId)}/components/main/capabilities/powerMeter/status`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`SmartThings ${res.status}`);
  const body = (await res.json()) as { power?: { value?: number } };
  const value = body.power?.value;
  if (typeof value !== "number") throw new Error("powerMeter 값이 없어요");
  return value;
}
