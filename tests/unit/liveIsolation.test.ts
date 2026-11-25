import { beforeEach, expect, it, vi } from "vitest";
const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: () => ({ rpc, from }) }));
import { mealWindowsForCount } from "@/lib/data/view";
import { clearLive, liveActions, readLiveForUser, refreshLive, setLiveUser } from "@/lib/data/live";

beforeEach(() => {
  setLiveUser(null);
  clearLive();
  rpc.mockReset().mockResolvedValue({ data: "house-a", error: null });
  from.mockImplementation((table: string) => {
    const rows: Record<string, unknown> = {
      households: { onboarding_step: 8, senior_name: "테스트 어르신", senior_relation: "어머니", senior_phone: "", resident_count: 1, has_pet: false },
      meal_profiles: { meal_windows: [] }, alert_settings: {}, smart_plugs: null,
    };
    const result = Promise.resolve({ data: Object.hasOwn(rows, table) ? rows[table] : [], error: null });
    const builder = { select: () => builder, eq: () => builder, gte: () => builder, order: () => builder, limit: () => builder, single: () => result, maybeSingle: () => result, then: result.then.bind(result) };
    return builder;
  });
});

it("another tab changing accounts immediately hides the previous household", async () => {
  setLiveUser("user-a");
  await refreshLive();
  expect(readLiveForUser("user-a").householdId).toBe("house-a");
  expect(readLiveForUser("user-b").view).toBeNull();
  setLiveUser("user-b");
  expect(readLiveForUser("user-b").view).toBeNull();
  expect(readLiveForUser("user-a").view).toBeNull();
  rpc.mockResolvedValue({ data: "house-b", error: null });
  await refreshLive();
  expect(readLiveForUser("user-b").householdId).toBe("house-b");
});

it("a previous account request cannot refill the cache after an account switch", async () => {
  let finish!: (value: { data: string; error: null }) => void;
  rpc.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  setLiveUser("user-a");
  const oldRequest = refreshLive();
  setLiveUser("user-b");
  rpc.mockResolvedValue({ data: "house-b", error: null });
  await refreshLive();
  finish({ data: "house-a", error: null });
  await oldRequest;
  expect(readLiveForUser("user-b").householdId).toBe("house-b");
});

it("sign-out hides the cache and prevents a pending request from restoring it", async () => {
  let finish!: (value: { data: string; error: null }) => void;
  rpc.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  setLiveUser("user-a");
  const pending = refreshLive();
  setLiveUser(null);
  finish({ data: "house-a", error: null });
  await pending;
  expect(readLiveForUser("user-a").view).toBeNull();
  await refreshLive();
  expect(rpc).toHaveBeenCalledOnce();
});

it("re-reads the saved household and lifestyle settings after discarding the browser cache", async () => {
  const windows = [{ slot: "lunch" as const, start: "11:00", end: "14:00" }];
  const rows = {
    households: { senior_name: "", senior_relation: "어머니", senior_phone: "", has_pet: false, resident_count: 1, onboarding_step: 3, senior_consent_at: null as string | null },
    meal_profiles: { meal_windows: windows, eat_out_per_week: 1, uses_keep_warm: true, cooks_per_week: 7 },
    alert_settings: { missed_meals_threshold: 2, fasting_hours: 48, emergency_hours: 72 }, smart_plugs: null,
  };
  from.mockImplementation((name: keyof typeof rows) => {
    const response = Promise.resolve({ data: Object.hasOwn(rows, name) ? rows[name] : [], error: null });
    const query = { select: () => query, eq: () => query, gte: () => query, order: () => query, limit: () => query, single: () => response, maybeSingle: () => response, then: response.then.bind(response) };
    return query;
  });
  rpc.mockImplementation(async (name, params) => {
    if (name === "ensure_household") return { data: "house-a", error: null };
    if (name !== "save_household_setup" || params.h !== "house-a") throw new Error("unexpected write");
    const p = params.patch;
    Object.assign(rows.households, { senior_name: p.senior.name, resident_count: p.household.residentCount, onboarding_step: params.next_step, senior_consent_at: new Date().toISOString() });
    Object.assign(rows.meal_profiles, { eat_out_per_week: p.mealProfile.eatOutPerWeek });
    return {data: null, error: null};
  });
  setLiveUser("user-a");
  await refreshLive();
  const patch = {
    senior: {name: "테스트", relation: "어머니", phone: ""}, household: {residentCount: 2, hasPet: false},
    seniorConsent: true, mealProfile: { windows, eatOutPerWeek: 4, usesKeepWarm: true, cooksPerWeek: 7 },
  };
  await liveActions.saveOnboarding(8, patch);
  expect(rpc).toHaveBeenCalledWith("save_household_setup", {h: "house-a", next_step: 8, patch});
  clearLive();
  expect(readLiveForUser("user-a").view).toBeNull();
  await refreshLive();
  const fresh = readLiveForUser("user-a").view;
  expect(fresh).toMatchObject({mode: "live", dataSource: "supabase", senior: {name: "테스트"}, household: {residentCount: 2}, onboardingStep: 8, mealProfile: {eatOutPerWeek: 4}, seniorConsent: true, careAvailable: false});
  expect(fresh?.slots).toEqual([]);
});

it("leaves an older database untouched when five stored meal slots are unavailable", async () => {
  setLiveUser("user-a");
  await refreshLive();
  const mealProfile = {windows:mealWindowsForCount(5), eatOutPerWeek:1, usesKeepWarm:true, cooksPerWeek:7};
  await expect(liveActions.saveOnboarding(8,{seniorConsent:true,mealProfile})).rejects.toThrow("서버 업데이트");
  expect(rpc.mock.calls.every(([name]) => name === "ensure_household")).toBe(true);
});

it("does not fall back to direct table writes when the provider denied the transaction", async () => {
  setLiveUser("user-a");
  await refreshLive();
  rpc.mockResolvedValueOnce({data: null, error: {code: "42501", message: "forbidden"}});
  from.mockClear();
  await expect(liveActions.saveOnboarding(8, {seniorConsent: true})).rejects.toThrow("forbidden");
  expect(from).not.toHaveBeenCalled();
});
