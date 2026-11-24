"use client";

import { supabase } from "@/lib/supabase";
import { setMode } from "@/lib/data/mode";
import { signOutWithNotifications } from "@/lib/push";
import type { Cursor, Member, Overview, Profile, Studio, StudioDetail } from "./studio-types";

export function studioError(cause: unknown) {
  const code = (cause as { code?: string } | null)?.code;
  if (code === "42501") return "운영 권한을 확인할 수 없어요. 등록한 팀 계정으로 다시 로그인해 주세요.";
  if (code === "40001" || code === "23505") return "다른 곳에서 먼저 수정했어요. 최신 내용을 다시 불러와 주세요.";
  if (code === "22023") return "입력한 이름이나 메모의 길이를 확인해 주세요.";
  if (code === "P0002") return "이 회원의 기록을 찾을 수 없어요.";
  if (code === "42883" || code === "PGRST202") return "팀 데이터베이스에 운영 스튜디오 설정을 적용한 뒤 사용할 수 있어요.";
  return "서버에서 확인하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.";
}

export async function signOutOnThisDevice() {
  await signOutWithNotifications("local");
  setMode(null);
}

async function rpc<T>(name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await supabase().rpc(name, args);
  if (error) throw error;
  return data as T;
}

export const operatorAllowed = () => rpc<boolean>("warming_studio_allowed");

export const studio: Studio = {
  overview: actor => rpc<Overview>("warming_studio_overview", { actor }),
  page: (actor, kind, search, cursor) =>
    rpc<{ rows: (Member | Profile)[]; next: Cursor | null }>("warming_studio_page", {
      actor, kind, search_text: search, after_at: cursor?.at ?? null, after_id: cursor?.id ?? null,
    }),
  detail: (actor, id) => rpc<StudioDetail>("warming_studio_detail", { actor, member_id: id }),
  save: (actor, subject, change) =>
    change.type === "name"
      ? rpc<void>("warming_save_name", { actor, subject, next_name: change.name.trim(), expected_at: change.version })
      : rpc<void>("warming_studio_save_case", {
          actor, subject, next_stage: change.stage, next_note: change.note.trim(), expected_at: change.version,
        }),
};
