// Edge Functions 공통 모듈. 판단 로직은 앱과 같은 lib/judge를 쓴다 (배포 시 함께 업로드).
import { createClient } from "npm:@supabase/supabase-js@2";
import { ALERT_DEFAULTS, DETECTION } from "@/config/detection.ts";
import { isCookingPower } from "@/lib/judge/detectEvents.ts";
import { classifyMeter, parseMeterStatus, type MeterKind, type MeterObservation } from "@/lib/smartthings/meter.ts";
import { mealWindowsOn, resolveMealSlots } from "@/lib/judge/resolveMealSlots.ts";
import { addDays, kstDate, kstDateTime } from "@/lib/judge/time.ts";
import type { Absence, MealScheduleChange, MealWindow } from "@/lib/judge/types.ts";

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
  const [profile, events, actions, absences, meter] = await Promise.all([
    db.from("meal_profiles").select("*").eq("household_id", householdId).single().then(must),
    db.from("cooker_events").select("type, started_at, ended_at, source_device").eq("household_id", householdId).gte("started_at", from).lt("started_at", to).then(must),
    db.from("senior_actions").select("at").eq("household_id", householdId).eq("type", "eat_out").gte("at", from).lt("at", to).then(must),
    getAbsences(householdId),
    db.from("smart_plugs").select("observing_since, last_reading_at, meter_kind").eq("household_id", householdId).maybeSingle().then(must),
  ]);
  type Ev = { type: "cook" | "lid_open"; started_at: string; ended_at: string };
  // Canonical timestamps and a verified source are populated for new cook and lid records.
  const evs = ((events ?? []) as (Ev & { source_device: string | null })[]).filter(e => e.source_device);
  const meterRow = meter as { observing_since: string | null; last_reading_at: string | null; meter_kind: MeterKind | null } | null;
  const since = meterRow?.meter_kind === "recognized" && meterRow.observing_since ? Date.parse(meterRow.observing_since) : Infinity;
  const last = meterRow?.meter_kind === "recognized" && meterRow.last_reading_at ? Date.parse(meterRow.last_reading_at) : -Infinity;
  const schedule = profile as { meal_windows: MealWindow[]; window_history?: MealScheduleChange[] };
  const windows = mealWindowsOn(date, schedule.meal_windows, schedule.window_history);
  const slots = resolveMealSlots({
    date,
    windows,
    events: evs.map((e) => ({ type: e.type, startedAt: new Date(e.started_at), endedAt: new Date(e.ended_at) })),
    eatOutChecks: ((actions ?? []) as { at: string }[]).map((a) => new Date(a.at)),
    absences,
    now,
  });
  // A missing signal is meaningful only across a fully observed meal window.
  const rows = slots.flatMap(slot => {
    const window = windows.find(w => w.slot === slot.slot)!;
    const covered = since <= kstDateTime(date, window.start).getTime() && last >= kstDateTime(date, window.end).getTime();
    if (!covered && slot.source === null) return [];
    return [{ slot: slot.slot, status: slot.status, source: slot.source, meter_observed: slot.source === "cooker" || covered }];
  });
  const observedDay = evs.length > 0 || (since < Date.parse(to) && last >= Date.parse(from));
  if (rows.length || observedDay) must(await db.rpc("save_meter_day_summary", {
    h: householdId, for_day: date, slot_rows: rows,
    cook_n: observedDay ? evs.filter(e => e.type === "cook").length : null,
    lid_n: observedDay ? evs.filter(e => e.type === "lid_open").length : null,
  }));
}

/** Serialize activity updates with ingestion and retain a newer reading from another invocation. */
export async function refreshActivity(householdId: string, latestCooker?: Date | null) {
  must(await db.rpc("refresh_meter_activity", { h: householdId, cooker_at: latestCooker?.toISOString() ?? null }));
}

export const today = (now: Date) => kstDate(now);

export async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function readSmartThings(path: string, token: string) {
  const response = await fetch("https://api.smartthings.com/v1/devices/" + path, {
    headers: { Authorization: "Bearer " + token },
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error("SmartThings " + response.status);
  return response.json();
}

export async function readMeterKind(deviceId: string, token: string): Promise<MeterKind> {
  return classifyMeter(await readSmartThings(encodeURIComponent(deviceId), token));
}

export async function readPower(deviceId: string, token: string): Promise<MeterObservation> {
  const status = await readSmartThings(encodeURIComponent(deviceId) + "/components/main/capabilities/powerMeter/status", token);
  const observation = parseMeterStatus(status);
  if (!observation) throw new Error("측정 시각이 있는 전력값이 필요해요.");
  return observation;
}

export async function recordObservation(household: string, device: string, kind: MeterKind, reading: MeterObservation,
  registration: { token: string; guardian: string } | { plug: string }) {
  // Only this service-role RPC can write a sample, link a token and extend a cooking signal.
  return must(await db.rpc("record_plug_observation", {
    h: household, device_id: device, kind, sample_watts: reading.watts, sample_at: reading.measuredAt,
    high: isCookingPower(reading.watts), merge_minutes: DETECTION.COOK_MERGE_GAP_MIN,
    stale_hours: ALERT_DEFAULTS.DEVICE_OFFLINE_HOURS,
    ...("token" in registration ? { registration_token: registration.token, guardian: registration.guardian } : { expected_plug: registration.plug }),
  })) as boolean;
}
