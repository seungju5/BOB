"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readPublicSupabaseConfig } from "./supabase/public-config";

const config = readPublicSupabaseConfig(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  process.env.NODE_ENV !== "production",
);
export const supabaseConfigured = !!config;

let client: SupabaseClient | null = null;

/** 브라우저 전용 Supabase 클라이언트. PKCE 코드는 /auth/callback에서만 교환한다. */
export function supabase(): SupabaseClient {
  if (!config) throw new Error("팀 Supabase 로그인 설정을 확인해 주세요.");
  client ??= createClient(config.url, config.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: "pkce" },
  });
  return client;
}
