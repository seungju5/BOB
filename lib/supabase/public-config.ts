export const BOB_PROJECT_REF = "vqqolzpodmaibnjazxus";

function isAnonKey(key: string, hosted: boolean) {
  const token = key.split(".");
  if (token.length !== 3 || token.some(part => !/^[a-zA-Z0-9_-]+$/.test(part))) return false;
  try {
    const claims = JSON.parse(atob(token[1].replace(/-/g, "+").replace(/_/g, "/")));
    return claims.role === "anon" && (!hosted || claims.ref === BOB_PROJECT_REF);
  } catch {
    return false;
  }
}

/** Called before the Next build as well as before creating the browser client. */
export function readPublicSupabaseConfig(
  urlValue?: string,
  publishableValue?: string,
  legacyValue?: string,
  allowLocal = false,
): { url: string; key: string } | null {
  const url = urlValue?.trim();
  const publishable = publishableValue?.trim();
  const legacy = legacyValue?.trim();
  const expected = `https://${BOB_PROJECT_REF}.supabase.co`;
  const hosted = url === expected || url === `${expected}/`;
  const local = allowLocal && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\/?$/.test(url ?? "");
  if (url && !hosted && !local) throw new Error("Warming Up 팀 Supabase 프로젝트 주소를 확인해 주세요.");
  if ((publishable && !/^sb_publishable_[a-zA-Z0-9_-]{16,}$/.test(publishable) && !isAnonKey(publishable, !!hosted))
      || (legacy && !isAnonKey(legacy, !!hosted))) {
    throw new Error("공개 설정에는 Warming Up의 publishable 키 또는 프로젝트의 anon 키만 사용할 수 있어요.");
  }
  const key = publishable || legacy;
  return url && key ? { url: hosted ? expected : url, key } : null;
}
