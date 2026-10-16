"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;

/** 브라우저 전용 Supabase 클라이언트. 로그인 메일 링크의 ?code= 는 생성 시 자동으로 교환된다. */
export function supabase(): SupabaseClient {
  if (!url || !key) throw new Error("Supabase 환경변수가 없어요 (.env.local)");
  client ??= createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
  });
  return client;
}
