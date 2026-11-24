"use client";

import { supabase } from "@/lib/supabase";

export type Profile = { name: string | null; savedAt: string | null; version: string };
type Household = {
  id: string; alias: string; relation: string; residents: number; pet: boolean; contact: boolean;
  step: number; householdAt: string | null; windows: number | null; threshold: number | null; settingsAt: string | null;
};
export type OwnAccount = { profile: Profile | null; households: Household[]; legacy: boolean };

function missingRpc(error: { code: string }) {
  return error.code === "PGRST202" || error.code === "42883";
}

// Old deployments can keep their existing members and profile edits while adding migration 0006.
async function readOriginalAccount(uid: string): Promise<OwnAccount> {
  const db = supabase();
  const [profile, memberships] = await Promise.all([
    db.from("profiles").select("name,created_at").eq("id", uid).maybeSingle(),
    db.from("household_guardians").select("household_id").eq("user_id", uid),
  ]);
  if (profile.error) throw profile.error;
  if (memberships.error) throw memberships.error;
  const ownProfile = profile.data ? { name: profile.data.name, version: profile.data.created_at, savedAt: null } : null;
  const ids = memberships.data.map(membership => membership.household_id);
  if (!ids.length) return { profile: ownProfile, households: [], legacy: true };
  const [homes, meals, alerts] = await Promise.all([
    db.from("households").select("id,name,senior_name,senior_relation,senior_phone,resident_count,has_pet,onboarding_step").in("id", ids).order("created_at").order("id"),
    db.from("meal_profiles").select("household_id,meal_windows").in("household_id", ids),
    db.from("alert_settings").select("household_id,missed_meals_threshold").in("household_id", ids),
  ]);
  if (homes.error) throw homes.error;
  if (meals.error) throw meals.error;
  if (alerts.error) throw alerts.error;
  const households = homes.data.map(h => {
    const windows = meals.data.find(m => m.household_id === h.id)?.meal_windows;
    return {
      id: h.id, alias: h.senior_name || h.name, relation: h.senior_relation, residents: h.resident_count,
      pet: h.has_pet, contact: !!h.senior_phone?.trim(), step: h.onboarding_step, householdAt: null, settingsAt: null,
      windows: Array.isArray(windows) ? windows.length : null,
      threshold: alerts.data.find(a => a.household_id === h.id)?.missed_meals_threshold ?? null,
    };
  });
  return { profile: ownProfile, households, legacy: true };
}

export async function readOwnAccount(uid: string): Promise<OwnAccount> {
  const { data, error } = await supabase().rpc("warming_account_summary", { actor: uid });
  if (error && missingRpc(error)) return readOriginalAccount(uid);
  if (error) throw error;
  return { ...data, legacy: false };
}

export async function saveOwnName(uid: string, account: OwnAccount, nextName: string) {
  const name = nextName.trim();
  if (Array.from(name).length < 2 || Array.from(name).length > 30) throw { code: "22023" };
  const db = supabase();
  if (!account.legacy) {
    const { error } = await db.rpc("warming_save_name", {
      actor: uid, subject: uid, next_name: name, expected_at: account.profile?.version ?? null,
    });
    if (error) throw error;
  } else {
    const current = account.profile;
    const update = db.from("profiles").update({ name }).eq("id", uid);
    const write = current
      ? current.name === null ? update.is("name", null) : update.eq("name", current.name)
      : db.from("profiles").insert({ id: uid, name });
    const { data, error } = await write.select("name").maybeSingle();
    if (error) throw error;
    if (data?.name !== name) throw { code: "40001" };
  }
  const confirmed = await readOwnAccount(uid);
  if (confirmed.profile?.name !== name) throw { code: "40001" };
  return confirmed;
}
