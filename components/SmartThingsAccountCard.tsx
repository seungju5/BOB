"use client";

/**
 * [EN] View component rendering the connected SmartThings account, location, room, and rice cooker plug status.
 * [KR] 연동된 SmartThings 계정, 장소(My home · Living room), 밥솥 스마트 플러그 상태를 렌더링하는 뷰(View) 컴포넌트입니다.
 */

import Link from "next/link";
import { IconArrowRight, IconCheck, IconPlug } from "@/components/icons";
import { Button } from "@/components/ui";
import { useSmartThingsSyncController } from "@/lib/smartthings/useSmartThingsSyncController";

export function SmartThingsAccountCard({ compact = false }: { compact?: boolean }) {
  const {
    profile,
    online,
    lastSignalText,
    lastCheckedText,
    syncing,
    syncNotice,
    handleSyncNow,
  } = useSmartThingsSyncController();

  if (compact) {
    return (
      <div className="mt-3 rounded-[1.5rem] border border-line bg-paper p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sage px-3 py-1 text-[13px] font-bold text-cocoa">
            <IconCheck className="h-4 w-4" />
            SmartThings 연결 예시
          </span>
          <span className="text-[13px] font-semibold text-cocoa/70">
            {profile.locationName} · {profile.roomName}
          </span>
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[17px] font-extrabold text-cocoa">{profile.deviceLabel}</p>
            <p className="mt-0.5 text-[14px] text-cocoa/75">
              {online ? "켜짐 (ON) · 밥솥 취사 신호 수신 중" : "연결 상태를 확인해 주세요"} · 최근 수신 {lastSignalText}
            </p>
          </div>
          <Link
            href="/connect"
            className="flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-butter-soft px-3.5 py-2 text-[14px] font-bold text-cocoa"
          >
            상세 보기
            <IconArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <section
      aria-label="SmartThings 기기 연결 예시"
      className="rounded-[1.75rem] border border-line bg-paper p-5 shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sage px-3.5 py-1.5 text-[14px] font-bold text-cocoa">
          <IconCheck className="h-4 w-4" />
          SmartThings 연결 예시
        </span>
        <span className="rounded-full bg-butter-soft px-3 py-1 text-[13px] font-semibold text-cocoa">
          {online ? "예시 신호 수신" : "신호 대기 중"}
        </span>
      </div>

      <div className="mt-4 flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-butter-soft text-cocoa">
          <IconPlug className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[22px] leading-snug font-extrabold text-cocoa">{profile.deviceLabel}</h2>
          <p className="mt-0.5 text-[15px] font-semibold text-cocoa/75">
            {profile.locationName} · {profile.roomName} ({profile.deviceCategory})
          </p>
        </div>
      </div>

      <dl className="mt-4 grid gap-2.5 rounded-2xl bg-butter-soft/70 p-4 text-[15px]">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/60 pb-2">
          <dt className="font-semibold text-cocoa/75">연결된 장소 · 공간</dt>
          <dd className="font-bold text-cocoa">
            {profile.locationName} · {profile.roomName}
          </dd>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/60 pb-2">
          <dt className="font-semibold text-cocoa/75">전원 · 감지 상태</dt>
          <dd className="font-bold text-cocoa">{profile.signalStateLabel}</dd>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/60 pb-2">
          <dt className="font-semibold text-cocoa/75">마지막 기기 신호 시각</dt>
          <dd className="font-bold text-cocoa">{lastSignalText}</dd>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/60 pb-2">
          <dt className="font-semibold text-cocoa/75">직접 동기화 확인 시각</dt>
          <dd className="font-bold text-cocoa">{lastCheckedText}</dd>
        </div>
        <div className="flex flex-col gap-1 pt-0.5">
          <dt className="font-semibold text-cocoa/75">SmartThings 기기 식별 번호</dt>
          <dd className="break-all font-mono text-[13px] text-cocoa/80">{profile.deviceId}</dd>
        </div>
      </dl>

      {syncNotice ? (
        <p role="status" className="mt-3 rounded-2xl bg-sage p-3.5 text-[15px] leading-relaxed font-semibold text-cocoa">
          {syncNotice}
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-2.5">
        <Button type="button" onClick={handleSyncNow} disabled={syncing}>
          {syncing ? "예시 신호 반영 중…" : "예시 취사 신호 반영하기"}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/records"
            className="flex min-h-12 items-center justify-center rounded-full border border-line bg-paper px-3 py-2.5 text-[15px] font-bold text-cocoa"
          >
            식사 기록 확인
          </Link>
          <Link
            href="/walking/today"
            className="flex min-h-12 items-center justify-center rounded-full border border-line bg-paper px-3 py-2.5 text-[15px] font-bold text-cocoa"
          >
            산책길 밥김 하트 보기
          </Link>
        </div>
        <Link
          href="/records#power-transcription"
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-butter-soft/80 px-3 py-2 text-[14px] font-bold text-cocoa transition-colors hover:bg-butter-soft"
        >
          <span>⚡ 밥솥 전력 데이터 전사 & AI 해석 과정 보기</span>
        </Link>
      </div>
    </section>
  );
}
