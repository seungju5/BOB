"use client";

// 실서비스 데이터: Supabase에서 읽어 AppView로 바꾸고, 동작은 RLS가 허용하는 테이블 쓰기·RPC·Edge Function으로 처리한다.

import { useEffect, useSyncExternalStore } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { addDays, kstDate } from "@/lib/judge/time";
import type { AlertPayload, AlertType, MealSlot, MealWindow } from "@/lib/judge/types";
import { supabase } from "@/lib/supabase";
import type { AppActions, AppView } from "./view";

type LiveState = { view: AppView | null; householdId: string | null; error: string | null };

const EMPTY_STATE: LiveState = { view: null, householdId: null, error: null };
let state: LiveState = EMPTY_STATE;
let liveUserId: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (patch: Partial<LiveState>) => {
  state = { ...state, ...patch };
  emit();
};

function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

let inflight: Promise<void> | null = null;
let epoch = 0;
let readGeneration = 0;
let mutationQueue: Promise<unknown> = Promise.resolve();

function invalidateReads() {
  readGeneration += 1;
  inflight = null;
}

export function refreshLive({ force = false }: { force?: boolean } = {}): Promise<void> {
  if (!liveUserId) return Promise.resolve();
  if (force) invalidateReads();
  if (inflight) return inflight;
  const startedAt = epoch;
  const generation = readGeneration;
  const request = load(startedAt, generation)
    .catch((e) => {
      if (epoch === startedAt && readGeneration === generation) set({ error: e instanceof Error ? e.message : String(e) });
    })
    .finally(() => {
      if (inflight === request) inflight = null;
    });
  inflight = request;
  return request;
}

async function load(startedAt: number, generation: number) {
  const db = supabase();
  const h = must(await db.rpc("ensure_household")) as string;
  const today = kstDate(new Date());
  const from = addDays(today, -34);
  const [house, profile, settings, plug, devices, slots, stats, absences, alerts] = await Promise.all([
    db.from("households").select("*").eq("id", h).single().then(must),
    db.from("meal_profiles").select("*").eq("household_id", h).single().then(must),
    db.from("alert_settings").select("*").eq("household_id", h).single().then(must),
    db.from("smart_plugs").select("st_device_id, status, last_reading_at").eq("household_id", h).maybeSingle().then(must),
    db.from("senior_devices").select("pairing_code, pairing_expires_at, paired_at").eq("household_id", h).then(must),
    db.from("meal_slots").select("date, slot, status, source").eq("household_id", h).gte("date", from).then(must),
    db.from("daily_cooker_stats").select("date, cook_count, lid_open_count").eq("household_id", h).gte("date", from).then(must),
    db.from("absences").select("start_date, end_date").eq("household_id", h).then(must),
    db.from("alerts").select("id, type, triggered_at, acknowledged_at, resolved_at, payload").eq("household_id", h).order("triggered_at", { ascending: false }).limit(50).then(must),
  ]);
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const H = house as any;
  const P = profile as any;
  const S = settings as any;
  const plugRow = plug as any;
  const devs = (devices ?? []) as Array<{ pairing_code: string | null; pairing_expires_at: string | null; paired_at: string | null }>;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const now = Date.now();
  const code = devs.find((d) => !d.paired_at && d.pairing_code && d.pairing_expires_at && Date.parse(d.pairing_expires_at) > now);

  const view: AppView = {
    mode: "live",
    dataSource: "supabase",
    onboardingStep: H.onboarding_step,
    plug: {
      deviceId: plugRow?.st_device_id ?? "",
      online: plugRow?.status === "online",
      lastReadingAt: plugRow?.last_reading_at ?? null,
    },
    senior: { name: H.senior_name, relation: H.senior_relation, phone: H.senior_phone },
    household: { residentCount: H.resident_count, hasPet: H.has_pet },
    mealProfile: {
      windows: P.meal_windows as MealWindow[],
      eatOutPerWeek: P.eat_out_per_week,
      usesKeepWarm: P.uses_keep_warm,
      cooksPerWeek: P.cooks_per_week,
    },
    alertSettings: {
      missedMealsThreshold: S.missed_meals_threshold,
      fastingHours: S.fasting_hours,
      emergencyHours: S.emergency_hours,
    },
    seniorConsent: Boolean(H.senior_consent_at),
    pairingCode: code?.pairing_code ?? null,
    seniorPaired: devs.some((d) => d.paired_at),
    slots: (slots ?? []) as MealSlot[],
    stats: Object.fromEntries(
      ((stats ?? []) as Array<{ date: string; cook_count: number; lid_open_count: number }>).map((r) => [r.date, { cook: r.cook_count, lid: r.lid_open_count }]),
    ),
    lastCookerAt: H.last_cooker_at,
    lastActivityAt: H.last_activity_at,
    absences: ((absences ?? []) as Array<{ start_date: string; end_date: string }>).map((a) => ({ startDate: a.start_date, endDate: a.end_date })),
    alerts: ((alerts ?? []) as Array<{ id: string; type: AlertType; triggered_at: string; acknowledged_at: string | null; resolved_at: string | null; payload: AlertPayload | null }>).map((a) => ({
      id: a.id,
      type: a.type,
      triggeredAt: a.triggered_at,
      acknowledgedAt: a.acknowledged_at,
      resolvedAt: a.resolved_at,
      payload: a.payload ?? undefined,
    })),
  };
  if (epoch === startedAt && readGeneration === generation) set({ view, householdId: h, error: null });
}

export function clearLive() {
  epoch += 1;
  invalidateReads();
  mutationQueue = Promise.resolve();
  set({ view: null, householdId: null, error: null });
}

/** Auth events, including other tabs, invalidate the previous household before rendering. */
export function setLiveUser(userId: string | null) {
  if (liveUserId === userId) return;
  liveUserId = userId;
  clearLive();
}

export function readLiveForUser(userId: string | null): LiveState {
  return userId && userId === liveUserId ? state : EMPTY_STATE;
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/** 실서비스 데이터 구독. 사용자별로 구독하고 1분마다 새로 고친다. */
export function useLive(userId: string | null) {
  const s = useSyncExternalStore(subscribe, () => readLiveForUser(userId), () => EMPTY_STATE);
  useEffect(() => {
    if (!userId) return;
    void refreshLive();
    const id = setInterval(() => void refreshLive(), 60_000);
    return () => clearInterval(id);
  }, [userId]);
  return s;
}

/** 같은 계정의 저장을 순서대로 처리하고, 저장 전 조회가 결과를 덮지 못하게 한다. */
function mutate<T>(fn: (h: string) => Promise<T>, requireConsent = false): Promise<T> {
  const startedAt = epoch;
  const userId = liveUserId;
  const assertOwner = () => {
    if (!userId || liveUserId !== userId || epoch !== startedAt) throw new Error("로그인 상태가 바뀌었어요. 다시 확인해 주세요.");
  };
  const run = async () => {
    assertOwner();
    if (!state.householdId || requireConsent || state.error) await refreshLive({ force: true });
    assertOwner();
    if (state.error) throw new Error("최신 정보를 확인하지 못했어요. 다시 시도해 주세요.");
    const h = state.householdId;
    if (!h) throw new Error("가구 정보를 불러오지 못했어요.");
    if (requireConsent && !state.view?.seniorConsent) throw new Error("연결하기 전에 어르신의 동의를 확인해 주세요.");
    invalidateReads();
    const result = await fn(h);
    assertOwner();
    // 진행 중이던 polling Promise를 재사용하지 않고 저장 이후의 새 조회를 기다린다.
    await refreshLive({ force: true });
    assertOwner();
    if (state.error) throw new Error("저장 결과를 다시 확인하지 못했어요. 잠시 후 다시 확인해 주세요.");
    return result;
  };
  const request = mutationQueue.then(run, run);
  mutationQueue = request.catch(() => undefined);
  return request;
}

async function act(fn: (h: string) => Promise<unknown>, requireConsent = false) {
  await mutate(fn, requireConsent);
}

const db = () => supabase();

export const liveActions: AppActions = {
  saveOnboarding: (step, patch = {}) =>
    act(async (h) => {
      // 설정 편집이나 늦게 도착한 이전 버튼이 완료 상태를 다시 미완료로 바꾸지 않는다.
      const house: Record<string, unknown> = { onboarding_step: (state.view?.onboardingStep ?? 0) >= 8 ? 8 : step };
      if (patch.senior) Object.assign(house, { senior_name: patch.senior.name, senior_relation: patch.senior.relation, senior_phone: patch.senior.phone });
      if (patch.household) Object.assign(house, { resident_count: patch.household.residentCount, has_pet: patch.household.hasPet });
      if (patch.seniorConsent !== undefined) house.senior_consent_at = patch.seniorConsent ? new Date().toISOString() : null;
      const jobs: Array<PromiseLike<unknown>> = [];
      if (patch.mealProfile)
        jobs.push(
          db()
            .from("meal_profiles")
            .update({
              meal_windows: patch.mealProfile.windows,
              meals_per_day: patch.mealProfile.windows.length,
              eat_out_per_week: patch.mealProfile.eatOutPerWeek,
              uses_keep_warm: patch.mealProfile.usesKeepWarm,
              cooks_per_week: patch.mealProfile.cooksPerWeek,
            })
            .eq("household_id", h)
            .then(must),
        );
      if (patch.alertSettings)
        jobs.push(
          db()
            .from("alert_settings")
            .update({
              missed_meals_threshold: patch.alertSettings.missedMealsThreshold,
              fasting_hours: patch.alertSettings.fastingHours,
              emergency_hours: patch.alertSettings.emergencyHours,
            })
            .eq("household_id", h)
            .then(must),
        );
      await Promise.all(jobs);
      // 선택 설정 저장이 실패했을 때 완료 단계만 먼저 저장하지 않는다.
      must(await db().from("households").update(house).eq("id", h));
    }),

  registerPlug: (deviceId, token) => mutate(async () => {
    const { data, error } = await db().functions.invoke("register-plug", { body: { deviceId, token } });
    if (error) {
      const msg = error instanceof FunctionsHttpError ? ((await error.context.json().catch(() => null)) as { error?: string } | null)?.error : null;
      throw new Error(msg ?? "플러그를 연결하지 못했어요.");
    }
    if (data?.connected !== true || typeof data.checkedAt !== "string" || !Number.isFinite(Date.parse(data.checkedAt))) {
      throw new Error("연결 확인 결과를 받지 못했어요. 다시 시도해 주세요.");
    }
    return { connected: true as const, checkedAt: data.checkedAt as string };
  }, true),

  skipPlug: async () => {},

  issuePairingCode: () => act(async (h) => must(await db().rpc("issue_pairing_code", { h })), true),

  ackAlert: (id) => act(async () => must(await db().from("alerts").update({ acknowledged_at: new Date().toISOString() }).eq("id", id))),

  ackAll: () =>
    act(async (h) => must(await db().from("alerts").update({ acknowledged_at: new Date().toISOString() }).eq("household_id", h).is("acknowledged_at", null))),

  saveAlertSettings: (s) =>
    act(async (h) =>
      must(
        await db()
          .from("alert_settings")
          .update({ missed_meals_threshold: s.missedMealsThreshold, fasting_hours: s.fastingHours, emergency_hours: s.emergencyHours })
          .eq("household_id", h),
      ),
    ),

  saveWindows: (w) => act(async (h) => must(await db().from("meal_profiles").update({ meal_windows: w, meals_per_day: w.length }).eq("household_id", h))),

  saveSenior: (s) =>
    act(async (h) => {
      const patch: Record<string, string> = {};
      if (s.name !== undefined) patch.senior_name = s.name;
      if (s.relation !== undefined) patch.senior_relation = s.relation;
      if (s.phone !== undefined) patch.senior_phone = s.phone;
      must(await db().from("households").update(patch).eq("id", h));
    }),

  addAbsence: (a) =>
    act(async (h) => must(await db().from("absences").insert({ household_id: h, start_date: a.startDate, end_date: a.endDate, created_by: "guardian" }))),

  removeAbsence: (a) =>
    act(async (h) => must(await db().from("absences").delete().eq("household_id", h).eq("start_date", a.startDate).eq("end_date", a.endDate))),
};
