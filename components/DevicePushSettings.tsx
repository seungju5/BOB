"use client";

import { useEffect, useState } from "react";
import { Mascot } from "@/components/Mascot";
import { kstDate, kstTime } from "@/lib/judge/time";
import type { AppView } from "@/lib/data/view";
import { disablePush, enablePush, useDelivery } from "@/lib/push";
import { lastServerTest, pushOwner, testDeviceNotice, useEnabledSince, usePushState } from "@/lib/push-device";
import { NoticeQuietHours } from "@/components/NoticeQuietHours";
import { NoticePreview } from "@/components/NoticePreview";
import { testBackgroundPush } from "@/lib/notification-transport";

function ServerTestReceipt({owner}: {owner:string}) {
  const [received, setReceived] = useState<Date | null>(null);
  useEffect(() => {
    let revision = 0;
    async function refresh() {
      const request = ++revision;
      const latest = await lastServerTest(owner);
      if (request === revision) setReceived(latest);
    }
    function onMessage(event:MessageEvent) {
      if (event.data?.type === "bapmunna:server-test-received") void refresh();
    }
    void refresh();
    navigator.serviceWorker.addEventListener("message", onMessage);
    window.addEventListener("focus", refresh);
    return () => {
      revision++;
      navigator.serviceWorker.removeEventListener("message", onMessage);
      window.removeEventListener("focus", refresh);
    };
  }, [owner]);
  return received && <p role="status" className="mt-2 text-sm font-semibold">이 기기의 마지막 서버 시험 알림 수신 · <time dateTime={received.toISOString()}>{kstDate(received).replaceAll("-", ".")} {kstTime(received)}</time></p>;
}

export function DevicePushSettings({ view, accountKey }: { view: AppView; accountKey?: string }) {
  const owner = pushOwner(accountKey);
  const permission = usePushState();
  const enabled = Boolean(useEnabledSince(owner));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tested, setTested] = useState("");
  const delivery = useDelivery(owner, view.mode === "live" && view.seniorConsent);
  const eligible = view.mode === "live" && !!owner && view.seniorConsent;
  const canAsk = permission === "default" || permission === "granted";
  const remote = delivery === "off" || delivery === "background";
  let detail: string;
  if (view.mode === "demo") detail = "소식이 오면 어떻게 보일지 골라 보세요. 이 체험에서는 휴대폰으로 발송하지 않아요.";
  else if (permission === "install") detail = "아이폰에서는 공유 → ‘홈 화면에 추가’를 누른 뒤 밥뭇나 아이콘으로 열어 주세요.";
  else if (permission === "denied") detail = "기기 설정에서 밥뭇나 알림을 허용하면 여기서 켤 수 있어요.";
  else if (permission === "unsupported") detail = "이 브라우저에서는 아래 알림함에서 소식을 볼 수 있어요.";
  else if (!eligible) detail = "가구 정보 이용에 동의하고 밥솥을 연결하면 소식을 받을 수 있어요. 지금은 알림이 어떻게 보일지 미리 볼 수 있어요.";
  else if (delivery === "background") detail = "앱을 닫아도 연결한 밥솥에서 취사 신호가 오면 이 기기로 알려 드려요.";
  else if (delivery === "off") detail = "홈 화면 알림을 켜면 앱을 닫아도 밥솥 소식을 받을 수 있어요.";
  else if (delivery === "unknown") detail = "알림 서버 상태를 확인하지 못했어요. 잠시 후 다시 확인해 주세요.";
  else detail = "밥솥을 연결하고 취사 신호 알림을 켜면 앱을 열어 둔 동안 새 소식을 받아요. 현재 팀 서버의 닫힌 앱 발송은 준비 중이에요.";

  async function change(enable: boolean) {
    if (!owner) return;
    setBusy(true);
    setError("");
    try {
      if (enable) {
        const state = await enablePush(view.mode, owner);
        if (state !== "granted") setError("기기에서 알림 권한을 허용해 주세요.");
      } else await disablePush(owner);
    } catch {
      setError(enable ? "알림을 연결하지 못했어요. 잠시 후 다시 눌러 주세요." : "알림 끄기를 마치지 못했어요. 다시 눌러 주세요.");
    } finally { setBusy(false); }
  }

  async function test() {
    if (!owner || busy) return;
    setBusy(true); setTested(""); setError("");
    try {
      if (delivery === "background") {
        await testBackgroundPush(owner);
        setTested("발송 서비스가 접수했어요. 이 기기가 알림을 받으면 아래에 수신 시각이 표시돼요.");
      } else if (await testDeviceNotice()) {
        setTested("이 기기에 미리보기를 띄웠어요. 알림을 누르면 밥뭇나로 돌아와요.");
      } else setError("기기 알림을 허용한 뒤 다시 눌러 주세요.");
    } catch (e) {
      setError(e instanceof Error && delivery === "background" ? e.message : "시험 알림을 표시하지 못했어요. 기기의 알림 설정을 확인해 주세요.");
    } finally { setBusy(false); }
  }

  return <section aria-label="기기 알림 설정" className="rounded-[1.5rem] border border-line bg-butter-soft p-4 text-cocoa">
    <div className="flex items-start gap-3">
      <span aria-hidden="true" className="shrink-0"><Mascot variant="bunny" className="h-12 w-12" /></span>
      <div><h2 className="text-[17px] font-bold">워밍이의 안부 알림</h2>
        <p className="mt-1 text-[15px] leading-relaxed">{detail}</p></div>
    </div>
    {view.mode === "live" && owner && <div className="mt-3 flex flex-wrap gap-2">
      {canAsk && eligible && (!enabled || (remote && delivery !== "background")) &&
        <button type="button" disabled={busy} onClick={() => void change(true)} className="min-h-11 rounded-full bg-cocoa px-5 text-[15px] font-bold text-paper disabled:opacity-50">
          {remote ? "홈 화면 알림 연결" : "앱 사용 중 알림 켜기"}</button>}
      {(enabled || delivery === "background" || delivery === "unknown") && <button type="button" disabled={busy} onClick={() => void change(false)} className="min-h-11 rounded-full border border-cocoa/35 px-4 text-[15px] font-semibold">이 기기 알림 끄기</button>}
      {canAsk && <button type="button" disabled={busy} onClick={() => void test()} className="min-h-11 rounded-full border border-cocoa/35 bg-paper px-4 text-[15px] font-semibold">{delivery === "background" ? "서버에서 시험 알림 받기" : "이 기기에서 알림 미리보기"}</button>}
    </div>}
    {error && <p role="alert" className="mt-2 text-sm font-semibold">{error}</p>}
    {tested && <p role="status" className="mt-2 text-sm">{tested}</p>}
    {eligible && owner && delivery === "background" && <ServerTestReceipt owner={owner}/>}
    {eligible && owner && (delivery === "background" || enabled && (delivery === "off" || delivery === "unavailable")) &&
      <NoticeQuietHours key={owner + delivery} owner={owner} background={delivery === "background"}/>}
    <NoticePreview key={owner ?? "demo"} owner={owner} enabled={enabled || delivery === "background"} demo={view.mode === "demo"}/>
  </section>;
}
