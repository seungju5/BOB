"use client";

import { useMemo } from "react";
import { demoActions } from "@/lib/demo/actions";
import { toView } from "@/lib/demo/derive";
import { useAlertSync, useDemo, useNow } from "@/lib/demo/store";
import { liveActions, useLive } from "./live";
import { useMode, useSession } from "./mode";
import type { AppActions, AppView } from "./view";

export type App = {
  /** null이면 아직 불러오는 중 */
  view: AppView | null;
  actions: AppActions;
  now: Date | null;
  mode: "demo" | "live" | null;
  ownerId: string | null;
  /** 실서비스 모드인데 로그인이 안 됨 */
  needsLogin: boolean;
  error: string | null;
};

/** 보호자 화면용 데이터. 모드에 따라 데모 저장소 또는 Supabase를 쓴다. */
export function useApp(): App {
  const mode = useMode();
  const session = useSession();
  const now = useNow();
  const ownerId = mode === "live" ? session?.user.id ?? null : null;
  const liveState = useLive(ownerId);
  const demo = useDemo();
  useAlertSync(mode === "demo" ? now : null);

  // 분 단위로만 다시 계산
  const minute = now ? Math.floor(now.getTime() / 60_000) : 0;
  const demoView = useMemo(() => (demo && now ? toView(demo, now) : null), [demo, minute]); // eslint-disable-line react-hooks/exhaustive-deps

  if (mode === "demo") return { view: demoView, actions: demoActions, now, mode, ownerId: null, needsLogin: false, error: null };
  if (mode === "live") {
    return {
      view: session ? liveState.view : null,
      actions: liveActions,
      now,
      mode,
      ownerId,
      needsLogin: session === null,
      error: liveState.error,
    };
  }
  return { view: null, actions: demoActions, now, mode: null, ownerId: null, needsLogin: mode === null, error: null };
}
