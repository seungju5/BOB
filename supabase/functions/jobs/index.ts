// 주기 작업 (pg_cron이 호출). design.md 6장의 ingest-power / judge-events / check-alerts / create-daily-slots를 한 함수에 모았다.
//   ?job=ingest  1분: SmartThings 전력값 수집
//   ?job=judge   5분: 이벤트 판정, 원시값 삭제, 오늘 끼니 상태 갱신
//   ?job=alerts 10분: 알림 판단
//   ?job=daily  00:00 KST: 어제 확정, 지난 이벤트 삭제
//   ?job=weekly 월 09:00 KST: 주간 리포트 소식
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { DETECTION, RAW_RETENTION_HOURS } from "@/config/detection.ts";
import { detectEvents } from "@/lib/judge/detectEvents.ts";
import { evaluateAlerts } from "@/lib/judge/evaluateAlerts.ts";
import { addDays, HOUR_MS, kstDate, MINUTE_MS } from "@/lib/judge/time.ts";
import type { AlertType, MealSlot } from "@/lib/judge/types.ts";
import { dayRange, db, getAbsences, json, must, readPower, recomputeDay, refreshActivity } from "@/_shared/core.ts";
import { pushAlerts, type SentAlert } from "@/_shared/push.ts";

/** 판단 로직이 만들지 않는 '소식' 알림. 열려 있어도 판단에 넣지 않는다. */
const NEWS_ALERTS: AlertType[] = ["help_request", "eat_out", "away", "weekly_report"];

/** 판정에 쓰는 원시값 창. 이보다 오래된 값은 판정이 끝난 것으로 보고 지운다. */
const JUDGE_WINDOW_MIN = 90;

type Plug = { id: string; household_id: string; st_device_id: string };

async function activeHouseholds(): Promise<string[]> {
  const rows = must(await db.from("households").select("id").gt("onboarding_step", 7).not("senior_consent_at", "is", null)) as { id: string }[];
  return rows.map((r) => r.id);
}

async function monitoringPlugs(): Promise<Plug[]> {
  return must(await db.from("smart_plugs")
    .select("id, household_id, st_device_id, households!inner(senior_consent_at, onboarding_step)")
    .gt("households.onboarding_step", 7)
    .not("households.senior_consent_at", "is", null)) as Plug[];
}

async function ingest() {
  const plugs = await monitoringPlugs();
  const now = new Date();
  const minute = new Date(Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS).toISOString();
  let ok = 0;
  for (const p of plugs) {
    try {
      const token = must(await db.rpc("get_plug_token", { plug: p.id })) as string | null;
      if (!token) throw new Error("no token");
      const watts = await readPower(p.st_device_id, token);
      must(await db.from("power_readings_raw").upsert({ plug_id: p.id, measured_at: minute, watts }, { onConflict: "plug_id,measured_at" }));
      must(await db.from("smart_plugs").update({ status: "online", last_reading_at: now.toISOString() }).eq("id", p.id));
      ok++;
    } catch (e) {
      console.error("ingest", p.id, e instanceof Error ? e.message : e);
      must(await db.from("smart_plugs").update({ status: "offline" }).eq("id", p.id));
    }
  }
  return { plugs: plugs.length, ok };
}

async function judge() {
  const now = new Date();
  const plugs = await monitoringPlugs();
  for (const p of plugs) {
    const rows = must(
      await db.from("power_readings_raw").select("measured_at, watts").eq("plug_id", p.id).order("measured_at"),
    ) as { measured_at: string; watts: number }[];
    if (rows.length === 0) continue;
    const readings = rows.map((r) => ({ measuredAt: new Date(r.measured_at), watts: Number(r.watts) }));
    const first = readings[0].measuredAt.getTime();
    const last = readings[readings.length - 1].measuredAt.getTime();
    // 창 양 끝에서 잘린 구간은 다음 회차에 온전히 판정되도록 건너뛴다.
    const closed = detectEvents(readings).filter(
      (e) =>
        e.startedAt.getTime() > first + DETECTION.READING_INTERVAL_MIN * MINUTE_MS &&
        e.endedAt.getTime() <= last - DETECTION.COOK_MERGE_GAP_MIN * MINUTE_MS,
    );
    if (closed.length) {
      must(
        await db.from("cooker_events").upsert(
          closed.map((e) => ({ household_id: p.household_id, type: e.type, started_at: e.startedAt.toISOString(), ended_at: e.endedAt.toISOString() })),
          { onConflict: "household_id,type,started_at", ignoreDuplicates: true },
        ),
      );
      await refreshActivity(p.household_id, new Date(Math.max(...closed.map((e) => e.startedAt.getTime()))));
    }
    // 판정 창이 지난 원시값 삭제 (판정 후 삭제 원칙)
    must(await db.from("power_readings_raw").delete().eq("plug_id", p.id).lt("measured_at", new Date(now.getTime() - JUDGE_WINDOW_MIN * MINUTE_MS).toISOString()));
  }
  const households = await activeHouseholds();
  for (const h of households) await recomputeDay(h, kstDate(now), now);
  return { plugs: plugs.length, households: households.length };
}

async function alerts() {
  const now = new Date();
  const today = kstDate(now);
  const households = await activeHouseholds();
  let created = 0;
  for (const h of households) {
    const [house, settings, plug, slots, open, absences] = await Promise.all([
      db.from("households").select("last_activity_at").eq("id", h).single().then(must),
      db.from("alert_settings").select("missed_meals_threshold, fasting_hours, emergency_hours").eq("household_id", h).single().then(must),
      db.from("smart_plugs").select("last_reading_at").eq("household_id", h).maybeSingle().then(must),
      db.from("meal_slots").select("date, slot, status, source").eq("household_id", h).gte("date", addDays(today, -2)).lte("date", today).then(must),
      // 판단 대상만 (도움 요청·외식·자리 비움·주간 리포트 같은 '소식' 알림은 빼고)
      db.from("alerts").select("type").eq("household_id", h).is("resolved_at", null).not("type", "in", `(${NEWS_ALERTS.join(",")})`).then(must),
      getAbsences(h),
    ]);
    const order = { breakfast: 0, lunch: 1, dinner: 2 } as const;
    const sorted = ((slots ?? []) as MealSlot[]).sort((a, b) => a.date.localeCompare(b.date) || order[a.slot] - order[b.slot]);
    const s = settings as { missed_meals_threshold: number; fasting_hours: number; emergency_hours: number };
    const last = (house as { last_activity_at: string | null }).last_activity_at;
    const reading = (plug as { last_reading_at: string | null } | null)?.last_reading_at ?? null;
    const result = evaluateAlerts({
      now,
      slots: sorted,
      lastActivityAt: last ? new Date(last) : null,
      settings: { missedMealsThreshold: s.missed_meals_threshold, fastingHours: s.fasting_hours, emergencyHours: s.emergency_hours },
      absences,
      lastReadingAt: reading ? new Date(reading) : null,
      openAlerts: ((open ?? []) as { type: AlertType }[]).map((a) => a.type),
    });
    if (result.create.length) {
      const rows = must(await db.from("alerts").insert(result.create.map((type) => ({ household_id: h, type }))).select("id, type, payload")) as SentAlert[];
      await pushAlerts(h, rows);
      created += result.create.length;
    }
    if (result.resolve.length) {
      must(await db.from("alerts").update({ resolved_at: now.toISOString() }).eq("household_id", h).is("resolved_at", null).in("type", result.resolve));
    }
  }
  return { households: households.length, created };
}

async function daily() {
  const now = new Date();
  const today = kstDate(now);
  const yesterday = addDays(today, -1);
  const households = await activeHouseholds();
  for (const h of households) {
    await recomputeDay(h, yesterday, now); // 어제 확정 (집계 포함)
    await recomputeDay(h, today, now); // 오늘 pending 슬롯 생성
  }
  // 집계가 끝난 이벤트 삭제: 취사·열림 시각은 하루만 둔다
  must(await db.from("cooker_events").delete().lt("started_at", dayRange(today).from));
  // 판정 안 된 원시값도 24시간이 지나면 삭제
  must(await db.from("power_readings_raw").delete().lt("measured_at", new Date(now.getTime() - RAW_RETENTION_HOURS * HOUR_MS).toISOString()));
  return { households: households.length };
}

/**
 * 주간 리포트 소식 (매주 월요일 09:00 KST). 지난 7일(어제까지) 끼니 확인율을 담아 보낸다.
 * 앱의 lib/data/view.ts patternReport와 같은 셈: 부재·대기는 빼고, 외식은 확인으로 본다.
 */
async function weekly() {
  const now = new Date();
  const today = kstDate(now);
  const households = await activeHouseholds();
  let sent = 0;
  for (const h of households) {
    const slots = must(
      await db.from("meal_slots").select("status").eq("household_id", h).gte("date", addDays(today, -7)).lte("date", addDays(today, -1)),
    ) as { status: MealSlot["status"] }[];
    const counted = slots.filter((s) => s.status !== "away" && s.status !== "pending");
    if (!counted.length) continue; // 기록이 없는 주는 보내지 않는다
    const rate = Math.round((counted.filter((s) => s.status === "confirmed" || s.status === "eat_out").length / counted.length) * 100);
    const rows = must(await db.from("alerts").insert({ household_id: h, type: "weekly_report", payload: { rate } }).select("id, type, payload")) as SentAlert[];
    await pushAlerts(h, rows);
    sent++;
  }
  return { households: households.length, sent };
}

const JOBS: Record<string, () => Promise<unknown>> = { ingest, judge, alerts, daily, weekly };

Deno.serve(async (req) => {
  const expected = must(await db.rpc("job_secret")) as string | null;
  if (!expected || req.headers.get("x-job-secret") !== expected) return json({ error: "unauthorized" }, 401);
  const job = new URL(req.url).searchParams.get("job") ?? "";
  const run = JOBS[job];
  if (!run) return json({ error: `unknown job: ${job}` }, 400);
  try {
    return json({ job, ...((await run()) as object) });
  } catch (e) {
    console.error(job, e);
    return json({ job, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
