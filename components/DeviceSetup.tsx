"use client";

import { useState } from "react";
import { Consent, Fold } from "@/app/guardian-setup/LifeSettings";
import { CookerMascot } from "./Mascot";
import { PlugForm } from "./PlugForm";
import { Button } from "./ui";
import { refreshLive } from "@/lib/data/live";
import type { AppActions, AppView } from "@/lib/data/view";

const formatter = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });
const dateLabel = (value: string) => formatter.format(new Date(value));
const FIREBASE_CONNECTION = "https://impact-series.web.app/bapmunna/carer/#connect";

export function DeviceSetup({ view, actions }: { view: AppView; actions: AppActions }) {
  const [consent, setConsent] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  const live = view.mode === "live";
  const hasPlug = !!view.plug.deviceId;
  const agreed = view.seniorConsent || consent;
  async function register(deviceId: string, token: string) {
    if (!live || !agreed) throw new Error("어르신 동의를 먼저 확인해 주세요.");
    if (!view.seniorConsent) await actions.saveOnboarding(view.onboardingStep, { seniorConsent: true });
    return actions.registerPlug(deviceId, token);
  }
  async function refresh() {
    setRefreshing(true);
    await refreshLive();
    setRefreshing(false);
    setRefreshed(true);
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 rounded-2xl bg-butter-soft p-4">
        <CookerMascot className="size-14 shrink-0" />
        <p className="text-[15px] leading-relaxed">밥솥을 꽂은 전력 측정 플러그를 SmartThings 앱에 등록해 주세요.</p>
      </div>
      {!live ? (
        <Fold label="연결되면 이렇게 보여요" hint="예시 · 실제 기기는 연결하지 않았어요.">
          <p className="rounded-xl bg-sage p-3"><strong>직접 조회:</strong> 예시 플러그 상태 확인</p>
          <p className="rounded-xl bg-butter-soft p-3"><strong>자동 수신:</strong> 예시 신호 대기 중</p>
        </Fold>
      ) : (
        <>
          {hasPlug ? (
            <div className="rounded-2xl border border-line p-4">
              <strong>{view.plug.online ? "스마트플러그가 등록되어 있어요." : "기기 연결을 확인해 주세요."}</strong>
              {checkedAt && <p className="mt-2 rounded-xl bg-sage p-3 text-[15px]" role="status">직접 조회 성공 · {dateLabel(checkedAt)}</p>}
              <p className="mt-2 text-[15px]">{view.plug.lastReadingAt ? `마지막 기록: ${dateLabel(view.plug.lastReadingAt)}` : "아직 남은 전력 기록이 없어요."}</p>
              <p className="mt-2 text-[15px]">직접 조회 성공과 새 신호의 자동 수신은 따로 확인해요.</p>
              <Button variant="outline" className="mt-3" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? "불러오는 중…" : "저장된 상태 새로고침"}</Button>
              {refreshed && <p role="status" className="mt-2 text-[15px]">위의 마지막 기록 시각을 확인해 주세요.</p>}
            </div>
          ) : <p className="text-[15px]">아직 이 가구에 등록된 플러그가 없어요.</p>}
          <Fold label={hasPlug ? "테스트 플러그 다시 등록" : "테스트 플러그 연결"} hint="개발자용 · SmartThings 토큰으로 전력 조회">
            {!view.seniorConsent && <Consent checked={consent} onChange={setConsent} />}
            {agreed && <PlugForm onSubmit={register} onDone={() => setCheckedAt(new Date().toISOString())} />}
          </Fold>
        </>
      )}
      <a href={FIREBASE_CONNECTION} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center rounded-full border border-line px-4 text-center text-[15px] font-bold text-cocoa underline underline-offset-4">
        삼성 계정 연결 준비 상태 보기 ↗
      </a>
      <p className="text-[14px] leading-relaxed text-cocoa/75">연결 준비 화면이 새 탭에 열려요. 거기서 확인한 연결 정보는 이 가구의 설정과 별도로 관리돼요.</p>
    </div>
  );
}
