"use client";

import { useMemo } from "react";
import { demoActions } from "@/lib/demo/actions";
import { toView } from "@/lib/demo/derive";
import { useAlertSync, useDemo, useNow } from "@/lib/demo/store";
import { useMode } from "./mode";
import { ACCOUNT_CONSENT_VERSION } from "@/lib/firebase/bridge";
import { firebaseActions, firebaseView, signOutFirebase, useFirebaseAccount } from "./firebase";
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
  provider: "firebase" | "demo";
  operator?: boolean;
  accountLabel?: string;
  accountKey?: string;
  signOut?: () => Promise<void>;
};

const requireMode = async (): Promise<never> => { throw new Error("먼저 로그인하거나 예시 체험을 선택해 주세요."); };
const inactiveActions: AppActions = {
  saveOnboarding: requireMode, registerPlug: requireMode, skipPlug: requireMode, issuePairingCode: requireMode,
  ackAlert: requireMode, ackAll: requireMode, saveAlertSettings: requireMode, saveWindows: requireMode,
  saveSenior: requireMode, addAbsence: requireMode, removeAbsence: requireMode,
};

/** 보호자 화면용 데이터. 모드에 따라 데모 저장소 또는 본인의 Firebase 가구 정보를 쓴다. */
export function useApp(): App {
  const mode = useMode();
  const firebase = useFirebaseAccount(mode === "live");
  const now = useNow();
  const demo = useDemo(mode === "demo");
  useAlertSync(mode === "demo" ? now : null);

  // 분 단위로만 다시 계산
  const minute = now ? Math.floor(now.getTime() / 60_000) : 0;
  const demoView = useMemo(() => (demo && now ? toView(demo, now) : null), [demo, minute]); // eslint-disable-line react-hooks/exhaustive-deps

  if (mode === "demo") return { provider: "demo", accountKey: "demo", view: demoView, actions: demoActions, now, mode, needsLogin: false, error: null };
  if (mode === "live") return {
    view: firebase.view && firebase.saved ? firebaseView(firebase.saved, firebase.connection, now?.getTime()) : firebase.view, actions: firebaseActions, now, mode, provider: "firebase",
    operator: firebase.operator && !!firebase.user?.verified, accountLabel: firebase.user?.email, accountKey: `${firebase.user?.uid ?? "signed-out"}:${firebase.revision}`, signOut: signOutFirebase,
    needsLogin: !firebase.loading && (!!firebase.user ? !firebase.user.verified || !firebase.profile || firebase.profile.consentVersion !== ACCOUNT_CONSENT_VERSION : firebase.user === null),
    error: firebase.error,
  };
  return { provider: "firebase", view: null, actions: inactiveActions, now, mode: null, needsLogin: mode === null, error: null };
}
