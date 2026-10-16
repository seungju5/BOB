"use client";

import { useState } from "react";
import { Field, TextInput } from "./forms";
import { Button } from "./ui";

/** SmartThings 플러그 등록 (토큰은 서버의 Vault에만 저장) */
export function PlugForm({ onSubmit, onDone }: { onSubmit: (deviceId: string, token: string) => Promise<{ watts: number }>; onDone?: (watts: number) => void }) {
  const [token, setToken] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const { watts } = await onSubmit(deviceId.trim(), token.trim());
      setToken("");
      onDone?.(watts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "연결하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <Field label="SmartThings 토큰" hint="SmartThings 개발자 페이지에서 발급한 개인 토큰이에요. 서버의 비밀 저장소에만 보관해요.">
        <TextInput type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="토큰 붙여 넣기" />
      </Field>
      <Field label="플러그 기기 ID">
        <TextInput value={deviceId} onChange={(e) => setDeviceId(e.target.value)} placeholder="예: 3f2a…" />
      </Field>
      {error ? <p className="text-[14px] font-semibold text-blush-deep">{error}</p> : null}
      <Button variant="soft" className="min-h-12 text-[15px]" disabled={busy || token.trim().length < 20 || !deviceId.trim()} onClick={submit}>
        {busy ? "확인하는 중…" : "플러그 연결하기"}
      </Button>
    </div>
  );
}
