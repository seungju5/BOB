"use client";

import { useMemo } from "react";
import { demoActions } from "@/lib/demo/actions";
import { toView } from "@/lib/demo/derive";
import { useAlertSync, useDemo, useNow } from "@/lib/demo/store";
import { liveActions, useLive } from "./live";
import { useMode, useSession } from "./mode";
import { usesImpactFirebase, ACCOUNT_CONSENT_VERSION } from "@/lib/firebase/bridge";
import { firebaseActions, firebaseView, signOutFirebase, useFirebaseAccount } from "./firebase";
import { supabase } from "@/lib/supabase";
import type { AppActions, AppView } from "./view";

export type App = {
  /** null이면 아직 불러오는 중 */
  view: AppView | null;
  actions: AppActions;
  now: Date | null;
  mode: "demo" | "live" | null;
  /** 실서비스 모드인데 로그인이 안 됨 */
  needsLogin: boolean;
  error: string | null;
  provider: "supabase" | "firebase" | "demo";
  accountLabel?: string;
  accountKey?: string;
  signOut?: () => Promise<void>;
};

/** 보호자 화면용 데이터. 모드에 따라 데모 저장소 또는 Supabase를 쓴다. */
export function useApp(): App {
  const mode = useMode();
  const session = useSession(!usesImpactFirebase);
  const firebase = useFirebaseAccount(usesImpactFirebase);
  const now = useNow();
  const live = !usesImpactFirebase && mode === "live" && !!session;
  const liveState = useLive(live ? session.user.id : null);
  const demo = useDemo(mode === "demo");
  useAlertSync(mode === "demo" ? now : null);

  // 분 단위로만 다시 계산
  const minute = now ? Math.floor(now.getTime() / 60_000) : 0;
  const demoView = useMemo(() => (demo && now ? toView(demo, now) : null), [demo, minute]); // eslint-disable-line react-hooks/exhaustive-deps

  if (mode === "demo") return { provider: "demo", accountKey: "demo", view: demoView, actions: demoActions, now, mode, needsLogin: false, error: null };
  if (mode === "live" && usesImpactFirebase) return {
    view: firebase.view && firebase.saved ? firebaseView(firebase.saved, firebase.connection, now?.getTime()) : firebase.view, actions: firebaseActions, now, mode, provider: "firebase",
    accountLabel: firebase.user?.email, accountKey: `${firebase.user?.uid ?? "signed-out"}:${firebase.revision}`, signOut: signOutFirebase,
    needsLogin: !firebase.loading && (!!firebase.user ? !firebase.user.verified || !firebase.profile || firebase.profile.consentVersion !== ACCOUNT_CONSENT_VERSION : firebase.user === null),
    error: firebase.error,
  };
  if (mode === "live") {
    return {
      view: session ? liveState.view : null,
      actions: liveActions,
      provider: "supabase", accountLabel: session?.user.email, accountKey: session?.user.id,
      signOut: async () => { const { error } = await supabase().auth.signOut(); if (error) throw error; },
      now,
      mode,
      needsLogin: session === null,
      error: liveState.error,
    };
  }
  return { provider: usesImpactFirebase ? "firebase" : "supabase", view: null, actions: demoActions, now, mode: null, needsLogin: mode === null, error: null };
}
