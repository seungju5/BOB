type CallbackAuth = {
  exchangeCodeForSession(code: string): Promise<{ error: Error | null }>;
  getUser(): Promise<{ data: { user: { email?: string } | null }; error: Error | null }>;
};

/** PKCE 교환 뒤 Supabase Auth 서버에서 사용자를 확인한다. */
export async function verifyCallback(code: string, auth: CallbackAuth): Promise<string | null> {
  const { error } = await auth.exchangeCodeForSession(code);
  if (error) throw error;

  const { data, error: userError } = await auth.getUser();
  if (userError || !data.user) throw userError ?? new Error("사용자 정보가 없습니다.");
  return data.user.email ?? null;
}
