"use client";

import { useState } from "react";
import { Field, TextInput } from "./forms";
import { Button } from "./ui";
import type { RegisterPlugResult } from "@/lib/data/view";

/** SmartThings 플러그 등록 (토큰은 서버의 Vault에만 저장) */
export function PlugForm({ onSubmit, onDone, consentConfirmed = false, isDemo = false }: {
  onSubmit: (deviceId: string, token: string) => Promise<RegisterPlugResult>;
  onDone?: (result: RegisterPlugResult) => void;
  consentConfirmed?: boolean;
  isDemo?: boolean;
}) {
  const [token, setToken] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<RegisterPlugResult | null>(null);
  const submit = async () => {
    if (!consentConfirmed) return;
    setBusy(true);
    setError("");
    setReceipt(null);
    try {
      const result = await onSubmit(isDemo ? "demo-plug-01" : deviceId.trim(), isDemo ? "" : token.trim());
      if (result?.connected !== true || !Number.isFinite(Date.parse(result.checkedAt))) throw new Error("연결 확인 결과를 받지 못했어요. 다시 시도해 주세요.");
      setToken("");
      setReceipt(result);
      onDone?.(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "연결하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      {!consentConfirmed ? <p className="rounded-2xl bg-butter-soft p-4 text-[16px] font-semibold text-cocoa">기기를 연결하기 전에 어르신의 동의를 확인해 주세요. 동의 없이도 홈은 이용할 수 있어요.</p> : null}
      {isDemo ? <p className="text-[16px] text-cocoa">예시 기기 연결을 체험해요. 실제 토큰이나 기기 번호는 입력하지 않아요.</p> : <>
      <Field label="SmartThings 테스트 토큰" hint="개발 테스트용 연결이에요. 일반 사용자의 삼성 계정 연결과는 달라요. 토큰은 서버의 비밀 저장소에 보관해요.">
        <TextInput type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="토큰 붙여 넣기" />
      </Field>
      <Field label="플러그 기기 ID">
        <TextInput value={deviceId} onChange={(e) => setDeviceId(e.target.value)} placeholder="예: 3f2a…" />
      </Field>
      </>}
      {error ? <p role="alert" className="text-[16px] font-semibold text-blush-deep">{error}</p> : null}
      {receipt ? <p role="status" className="rounded-2xl bg-sage p-4 text-[16px] text-cocoa">{isDemo ? "예시 기기 연결을 확인했어요." : "기기 접근을 확인했어요."}<br />확인 시각: {new Date(receipt.checkedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}<br />이 결과만으로 식사 여부나 지속적인 신호 수신을 확인할 수는 없어요.</p> : null}
      <Button variant="soft" className="min-h-12 text-[16px]" disabled={busy || !consentConfirmed || (!isDemo && (token.trim().length < 20 || !deviceId.trim()))} onClick={submit}>
        {busy ? "확인하는 중…" : isDemo ? "예시 기기 연결하기" : "테스트 플러그 연결하기"}
      </Button>
    </div>
  );
}
