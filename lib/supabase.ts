"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;

/** 브라우저 전용 Supabase 클라이언트. PKCE 코드는 /auth/callback에서만 교환한다. */
export function supabase(): SupabaseClient {
  if (!url || !key) throw new Error("Supabase 환경변수가 없어요 (.env.local)");
  client ??= createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: "pkce" },
  });
  return client;
}
