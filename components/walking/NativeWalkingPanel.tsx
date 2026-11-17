"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PhoneSteps, type RankingLinkStatus, type WalkingBoard, type WalkReminderStatus } from "@bapmunna/phone-steps";
import { Button } from "@/components/ui";

const emptyLink: RankingLinkStatus = { linked: false, confirmed: false, revokePending: false };
const emptyReminders: WalkReminderStatus = { enabled: false, times: [], bloodSugarReminder: false, permission: "unknown" };
const number = (value: number) => value.toLocaleString("ko-KR");
function message(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (/invalid_code|expired_code|pairing|invalid_pair/.test(code)) return "연결 숫자를 다시 확인해 주세요. 시간이 지났다면 웹앱에서 새 숫자를 받아 주세요.";
  if (/confirmation_required/.test(code)) return "연결할 별명을 확인하고 공유에 동의해 주세요.";
  if (/expired|revoked|unauthorized|consent_required/.test(code)) return "연결이 끝났어요. 웹앱에서 새 연결 숫자를 받아 주세요.";
  if (/revocation_pending|network/.test(code)) return "인터넷 연결을 확인해 주세요. 해제 중인 기기는 걸음수를 보내지 않아요.";
  if (/secure_storage/.test(code)) return "휴대폰의 보안 저장소를 열지 못했어요. 휴대폰 잠금을 푼 뒤 다시 확인해 주세요.";
  if (/reminder_times/.test(code)) return "알림 시각을 겹치지 않게 1~4개 골라 주세요.";
  if (/rate|busy|stale/.test(code)) return "잠시 후 다시 확인해 주세요.";
  return "연결을 마치지 못했어요. 최신 밥뭇나 앱과 인터넷 연결을 확인해 주세요.";
}

/** The bridge performs requests and protects credentials. This UI never sees a token. */
export function NativeWalkingPanel() {
  const [link, setLink] = useState<RankingLinkStatus>(emptyLink);
  const [board, setBoard] = useState<WalkingBoard | null>(null);
  const [reminders, setReminders] = useState<WalkReminderStatus>(emptyReminders);
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [times, setTimes] = useState(["08:30", "13:00", "19:00"]);
  const [glucose, setGlucose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const alive = useRef(false), locked = useRef(false), revision = useRef(0), reminderLoaded = useRef(false);

  const refresh = useCallback(async (sync: boolean) => {
    const id = revision.current;
    const currentReminders = await PhoneSteps.walkReminderStatus();
    if (!alive.current || id !== revision.current) return;
    setReminders(currentReminders);
    let current = await PhoneSteps.rankingStatus();
    if (current.revokePending) {
      try { await PhoneSteps.rankingDisconnect(); current = await PhoneSteps.rankingStatus(); }
      catch { if (alive.current && id === revision.current) setNotice("서버에 연결 해제를 요청하고 있어요. 끝날 때까지 걸음수는 보내지 않아요."); }
    }
    if (!alive.current || id !== revision.current) return;
    setLink(current);
    if (!current.linked || !current.confirmed || current.revokePending) { setBoard(null); return; }
    if (sync) {
      const result = await PhoneSteps.rankingSync();
      if (!alive.current || id !== revision.current) return;
      if (!result.ok) setNotice("걸음 기록을 아직 보내지 못했어요. 위의 건강 앱 연결과 권한을 확인해 주세요. 기록 없음은 0걸음으로 보내지 않아요.");
      else setNotice("오늘의 걸음을 보내고 순위를 다시 확인했어요.");
    }
    const next = await PhoneSteps.rankingBoard();
    if (alive.current && id === revision.current) setBoard(next);
  }, []);

  const run = useCallback(async (operation: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError("");
    try { await operation(); }
    catch (reason) {
      if (alive.current) { setError(message(reason)); setBoard(null); }
      try { const current = await PhoneSteps.rankingStatus(); if (alive.current) setLink(current); } catch { /* Keep the error visible. */ }
    } finally { locked.current = false; if (alive.current) setBusy(false); }
  }, []);

  useEffect(() => {
    alive.current = true;
    const update = () => { if (document.visibilityState === "visible") void run(() => refresh(true)); };
    const initial = setTimeout(() => { void run(async () => {
      const settings = await PhoneSteps.walkReminderStatus();
      if (!alive.current) return;
      setReminders(settings);
      if (!reminderLoaded.current && settings.times.length) { setTimes(settings.times); setGlucose(settings.bloodSugarReminder); }
      reminderLoaded.current = true;
      await refresh(true);
    }); }, 0);
    let removed = false, removeResume: (() => Promise<void>) | undefined;
    void PhoneSteps.addListener("appResumed", update).then(handle => { if (removed) void handle.remove(); else removeResume = () => handle.remove(); }).catch(() => {});
    document.addEventListener("visibilitychange", update); window.addEventListener("focus", update);
    const timer = setInterval(update, 60_000);
    return () => { alive.current = false; revision.current++; removed = true; void removeResume?.(); clearTimeout(initial); clearInterval(timer); document.removeEventListener("visibilitychange", update); window.removeEventListener("focus", update); };
  }, [refresh, run]);

  return <div className="mt-6 space-y-6 text-2xl leading-relaxed text-cocoa">
    <section aria-labelledby="native-ranking-title" className="rounded-3xl border border-line bg-paper p-5">
      <h2 id="native-ranking-title" className="text-[28px] font-extrabold">함께 걷는 오늘의 순위</h2>
      <p className="mt-3 text-muted">원하는 분만 참여해요. 별명과 한국 시간 기준 오늘 걸음수만 전체 참여자에게 보여요.</p>
      {error ? <p role="alert" className="mt-4 rounded-2xl bg-blush p-4">{error}</p> : null}
      {notice ? <p role="status" className="mt-4 rounded-2xl bg-butter-soft p-4">{notice}</p> : null}
      {link.revokePending ? <div className="mt-4"><p>연결 해제를 마치는 중이에요. 지금은 걸음수를 보내지 않아요.</p><Button disabled={busy} variant="outline" className="mt-3 min-h-16 text-2xl" onClick={() => void run(async () => { await PhoneSteps.rankingDisconnect(); await refresh(false); setNotice("이 휴대폰 연결을 해제했어요."); })}>연결 해제 다시 확인</Button></div>
      : !link.linked ? <>
        <Button variant="outline" className="mt-4 min-h-16 text-2xl" disabled={busy} onClick={() => void run(async () => { await PhoneSteps.openWalkingWebApp(); })}>웹앱에서 랭킹 참여하기</Button>
        <p className="mt-4 text-muted">가입한 웹앱에서 랭킹 참여를 선택하고, 받은 연결 숫자 8개를 아래에 적어 주세요.</p>
        <form className="mt-4" onSubmit={event => { event.preventDefault(); void run(async () => { setConsent(false); setNotice(""); const next = await PhoneSteps.rankingLink({code}); if (alive.current) { setLink(next); setCode(""); } }); }}>
          <label htmlFor="rank-device-code" className="block font-bold">연결 숫자 8개</label>
          <input id="rank-device-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" autoComplete="off" pattern="[0-9]{8}" minLength={8} maxLength={8} required className="mt-2 min-h-16 w-full rounded-2xl border-2 border-line bg-cream px-4 text-[28px] tracking-widest outline-offset-4" placeholder="00000000" />
          <Button disabled={busy || code.length !== 8} className="mt-4 min-h-16 text-2xl" type="submit">연결할 별명 확인</Button>
        </form>
      </> : !link.confirmed ? <div className="mt-4 rounded-2xl bg-butter-soft p-4">
        <h3 className="font-bold">이 별명으로 연결할까요?</h3>
        <p className="mt-2 break-words text-[30px] font-extrabold">{link.nickname}</p>
        <p className="mt-3">이 휴대폰의 오늘 걸음수를 위 별명으로 보내요. 아직 걸음수는 보내지 않았어요. 다른 분의 별명이면 연결하지 마세요.</p>
        <p className="mt-3">연결된 동안 앱을 열면 매일 그날의 걸음수를 보내요. 연결은 최대 30일이며, 언제든 끊을 수 있어요.</p>
        <label className="mt-4 flex items-start gap-3"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-2 h-6 w-6 shrink-0" /><span>이 휴대폰 소유자로서, 오늘 걸음수와 별명이 전체 랭킹 참여자에게 공개되는 데 동의해요.</span></label>
        <Button className="mt-4 min-h-16 text-2xl" disabled={busy || !consent} onClick={() => void run(async () => { const next = await PhoneSteps.rankingConfirm({consentVersion:"2026-11-17",shareTodaySteps:true}); if (!alive.current) return; setLink(next); setConsent(false); await refresh(true); })}>동의하고 랭킹 연결</Button>
        <Button variant="outline" className="mt-3 min-h-16 text-2xl" disabled={busy} onClick={() => void run(async () => { await PhoneSteps.rankingDisconnect(); await refresh(false); setNotice("연결을 취소했어요."); })}>다른 별명이에요</Button>
      </div> : <>
        <p className="mt-4 break-words font-bold">{link.nickname} 님으로 연결했어요.</p>
        <p className="mt-2 text-muted">앱을 열거나 보고 계실 때 1분마다 자동으로 순위를 갱신해요. 앱을 닫으면 걸음수를 보내지 않아요.</p>
        {board ? <div className="mt-4">
          <p className="font-bold">{board.date} · 한국 시간</p>
          <p className="mt-2 rounded-2xl bg-butter-soft p-4">내 순위 {board.me.rank == null ? "— 기록을 기다려요" : `${number(board.me.rank)}등`}<br />{board.me.count == null ? "아직 오늘 기록이 없어요." : `${number(board.me.count)}걸음`}</p>
          {board.entries.length ? <ol aria-label="오늘 상위 세 순위" className="mt-4 space-y-3">{board.entries.filter(entry => entry.rank <= 3).map(entry => <li key={entry.publicId} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line p-3"><strong>{entry.rank}등 · {entry.nickname}</strong><span>{number(entry.count)}걸음</span></li>)}</ol> : <p className="mt-4">아직 오늘 걸음 기록이 없어요. 숫자가 도착하면 순위가 생겨요.</p>}
          <p className="mt-3 text-muted">같은 걸음수는 공동 순위예요. 많이 걷는 날도, 쉬어가는 날도 괜찮아요.</p>
          {board.me.lastSyncedAt ? <p className="mt-3 text-[20px] text-muted">마지막 전송: {new Date(board.me.lastSyncedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} · 한국 시간</p> : null}
        </div> : null}
        <Button disabled={busy} className="mt-4 min-h-16 text-2xl" onClick={() => void run(() => refresh(true))}>걸음수·순위 다시 확인</Button>
        <Button variant="outline" disabled={busy} className="mt-3 min-h-16 text-2xl" onClick={() => void run(async () => { revision.current++; setBoard(null); await PhoneSteps.rankingDisconnect(); await refresh(false); setNotice("이 휴대폰 연결을 해제했어요. 랭킹 참여 자체는 웹앱에서 그만할 수 있어요."); })}>이 휴대폰 연결 끊기</Button>
        <p className="mt-3 text-muted">참여를 완전히 그만하고 별명·걸음수를 지우려면 웹앱의 ‘랭킹 참여 그만하기’를 눌러 주세요.</p>
      </>}
    </section>

    <section aria-labelledby="native-reminder-title" className="rounded-3xl border border-line bg-paper p-5">
      <h2 id="native-reminder-title" className="text-[28px] font-extrabold">식사 뒤, 가벼운 산책</h2>
      <p className="mt-3 text-muted">식사 후 편한 시각에 알려드려요. 식사를 마치셨다면 몸이 편할 때 가볍게 걸어보세요. 불편한 날은 쉬어도 괜찮아요.</p>
      <p className="mt-3 font-bold">현재 알림: {reminders.enabled ? (reminders.permission === "granted" ? "켜짐" : "휴대폰 알림 권한을 확인해 주세요") : "꺼짐"}</p>
      <fieldset className="mt-4 space-y-3"><legend className="font-bold">알림 받을 시각 · 휴대폰 시간</legend>
        {times.map((time, index) => <div key={index} className="flex flex-wrap gap-2"><label className="flex min-w-0 flex-1 items-center gap-2"><span>{index + 1}번째</span><input aria-label={`${index + 1}번째 산책 알림 시각`} type="time" required value={time} onChange={event => setTimes(values => values.map((value, i) => i === index ? event.target.value : value))} className="min-h-16 min-w-0 flex-1 rounded-2xl border-2 border-line bg-cream px-3" /></label>{times.length > 1 ? <button type="button" disabled={busy} className="min-h-16 px-3 underline" aria-label={`${index + 1}번째 알림 시각 빼기`} onClick={() => setTimes(values => values.filter((_, i) => i !== index))}>빼기</button> : null}</div>)}
        {times.length < 4 ? <Button variant="outline" disabled={busy} className="min-h-16 text-2xl" onClick={() => setTimes(values => [...values, "20:00"])}>시각 하나 더</Button> : null}
      </fieldset>
      <label className="mt-4 flex items-start gap-3"><input type="checkbox" checked={glucose} onChange={event => setGlucose(event.target.checked)} className="mt-2 h-6 w-6 shrink-0" /><span>혈당 측정 시각 확인도 함께 안내받기 <small className="mt-2 block text-[20px] text-muted">평소 혈당을 재는 분만 선택해 주세요. 걸음수로 혈당을 재지는 않아요.</small></span></label>
      <Button disabled={busy} className="mt-4 min-h-16 text-2xl" onClick={() => void run(async () => { const next = await PhoneSteps.configureWalkReminders({enabled:true,times,bloodSugarReminder:glucose}); if (!alive.current) return; setReminders(next); setNotice(next.enabled ? "선택한 시각의 산책 알림을 켰어요." : "알림 권한이 꺼져 있어요. 휴대폰 설정 → 알림 → 밥뭇나에서 확인해 주세요."); })}>{reminders.enabled ? "알림 시각 저장" : "이 시각에 알림 받기"}</Button>
      {reminders.enabled ? <Button disabled={busy} variant="outline" className="mt-3 min-h-16 text-2xl" onClick={() => void run(async () => { const next = await PhoneSteps.configureWalkReminders({enabled:false,times:[],bloodSugarReminder:false}); if (alive.current) { setReminders(next); setNotice("산책 알림을 껐어요."); } })}>산책 알림 끄기</Button> : null}
      <p className="mt-4 text-[20px] text-muted">실제 식사 감지 알림이 아니라, 정한 시각의 안내예요. 절전·집중 모드에서는 알림이 늦거나 보이지 않을 수 있어요. 혈당 측정과 운동은 평소 안내받은 계획을 따라 주세요.</p>
    </section>
  </div>;
}
