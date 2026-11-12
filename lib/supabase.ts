"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;

/** GoTrue's public settings tell the UI which providers this project has enabled. */
export async function getSocialLoginAvailability(signal: AbortSignal) {
  if (!url || !key) return { kakao: false, google: false };
  const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/settings`, { headers: { apikey: key }, signal });
  if (!response.ok) throw new Error("로그인 설정을 불러오지 못했어요.");
  const { external } = await response.json() as { external?: { kakao?: boolean; google?: boolean } };
  return { kakao: external?.kakao === true, google: external?.google === true };
}

/** 브라우저 전용 Supabase 클라이언트. 로그인 메일 링크의 ?code= 는 생성 시 자동으로 교환된다. */
export function supabase(): SupabaseClient {
  if (!url || !key) throw new Error("Supabase 환경변수가 없어요 (.env.local)");
  client ??= createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
  });
  return client;
}
