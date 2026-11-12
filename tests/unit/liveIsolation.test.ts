import { beforeEach, expect, it, vi } from "vitest";
const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: () => ({ rpc, from }) }));
import { clearLive, readLiveForUser, refreshLive, setLiveUser } from "@/lib/data/live";

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
