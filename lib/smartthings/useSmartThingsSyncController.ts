"use client";

/**
 * [EN] Controller hook that synchronizes SmartThings plug status with Bapmunna meal & walking stores.
 * [KR] SmartThings 플러그 상태를 밥뭇나 안부·식사 기록 및 산책 하트 저장소와 동기화하는 컨트롤러(Controller) 훅입니다.
 */

import { useCallback, useState } from "react";
import { MINUTE_MS } from "@/lib/judge/time";
import { updateDemo } from "@/lib/demo/store";
import { useApp } from "@/lib/data/useApp";
import {
  DEFAULT_SMARTTHINGS_PROFILE,
  formatSmartThingsKst,
  type SmartThingsLinkedProfile,
} from "./account-model";

export interface SmartThingsSyncControllerState {
  profile: SmartThingsLinkedProfile;
  online: boolean;
  lastSignalText: string;
  lastCheckedText: string;
  syncing: boolean;
  syncNotice: string;
  handleSyncNow: () => void;
}

/**
 * [EN] Provides reactive SmartThings device state and manual synchronization handler.
 * [KR] 연동된 SmartThings 기기 상태 조회 및 즉시 동기화 이벤트 핸들러를 제공합니다.
 */
export function useSmartThingsSyncController(): SmartThingsSyncControllerState {
  const { view } = useApp();
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState("");
  const [lastCheckedIso, setLastCheckedIso] = useState(DEFAULT_SMARTTHINGS_PROFILE.lastCheckedIso);
  const [lastSignalIso, setLastSignalIso] = useState(
    view?.plug.lastReadingAt ?? DEFAULT_SMARTTHINGS_PROFILE.lastSignalIso,
  );

  const activeDeviceId = view?.plug.deviceId || DEFAULT_SMARTTHINGS_PROFILE.deviceId;
  const online = view?.plug.deviceId ? view.plug.online : true;

  const profile: SmartThingsLinkedProfile = {
    ...DEFAULT_SMARTTHINGS_PROFILE,
    deviceId: activeDeviceId,
    lastSignalIso: view?.plug.lastReadingAt ?? lastSignalIso,
    lastCheckedIso,
  };

  const handleSyncNow = useCallback(() => {
    setSyncing(true);
    setSyncNotice("");
    const now = new Date();
    const nowIso = now.toISOString();

    updateDemo((draft) => {
      const recentCookExists = draft.events.some(
        (event) => event.type === "cook" && Math.abs(now.getTime() - Date.parse(event.startedAt)) < 45 * MINUTE_MS,
      );
      const nextEvents = recentCookExists
        ? draft.events
        : [
            ...draft.events,
            {
              type: "cook" as const,
              startedAt: new Date(now.getTime() - 12 * MINUTE_MS).toISOString(),
              endedAt: new Date(now.getTime() + 22 * MINUTE_MS).toISOString(),
            },
          ];
      return {
        ...draft,
        onboardingStep: 8,
        seniorConsent: true,
        plug: {
          deviceId: DEFAULT_SMARTTHINGS_PROFILE.deviceId,
          online: true,
          offlineSince: null,
        },
        events: nextEvents,
      };
    });

    setLastCheckedIso(nowIso);
    setLastSignalIso(nowIso);
    setSyncing(false);
    setSyncNotice("SmartThings ‘우리 집 밥솥 플러그’의 최신 취사 신호를 밥뭇나 홈·식사 기록·산책 하트에 반영했어요.");
  }, []);

  return {
    profile,
    online,
    lastSignalText: formatSmartThingsKst(profile.lastSignalIso),
    lastCheckedText: formatSmartThingsKst(profile.lastCheckedIso),
    syncing,
    syncNotice,
    handleSyncNow,
  };
}
