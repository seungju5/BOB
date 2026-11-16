"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertThresholdFields, Choice, Field, MealWindowsEditor, RelationPicker, Slider, TextInput, Toggle, windowsValid } from "@/components/forms";
import { IconArrowRight, IconLock, IconPlug, IconSuitcase } from "@/components/icons";
import { PlugForm } from "@/components/PlugForm";
import { SmartThingsPanel } from "@/components/SmartThingsPanel";
import { SeniorConsentField } from "@/components/privacy/SeniorConsentField";
import { PrivacyNotice } from "@/components/privacy/PrivacyNotice";
import { deviceReadingLabel, seniorDetailsProblems } from "@/components/onboarding/settings-validation";
import { ConnectionGuide } from "@/components/onboarding/ConnectionGuide";
import { Button, PageHeader, Skeleton } from "@/components/ui";
import { addDays, kstDate, MINUTE_MS } from "@/lib/judge/time";
import { setMode } from "@/lib/data/mode";
import { useApp, type App } from "@/lib/data/useApp";
import { FOUR_MEAL_WINDOWS, careDataAvailable, mealSlotsForCount, type AppActions, type AppView } from "@/lib/data/view";
import { MEAL_PALETTES, setMealPalette, useMealPalette } from "@/lib/data/appearance";
import type { MealSlotName, MealWindow } from "@/lib/judge/types";
import { resetDemo, updateDemo } from "@/lib/demo/store";


export default function SettingsPage() {
  const app = useApp();
  return (
    <main className="flex flex-col pb-10">
      <PageHeader title="설정" back="/home" />
      {!app.view || !app.now ? (
        <div className="px-6">
          {app.error ? <><p role="alert" className="mb-4 text-[16px] text-blush-deep">설정을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.</p><Button onClick={() => location.reload()}>다시 불러오기</Button></> : <Skeleton className="h-64" />}
        </div>
      ) : <Settings app={app} view={app.view} now={app.now} />}
    </main>
  );
}

/** 접은 뒤에도 자식 폼을 유지해 저장 전 초안을 잃지 않는다. */
function SettingsGroup({ id, title, summary, children }: { id: string; title: string; summary: string; children: ReactNode }) {
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const openTarget = () => {
      if (location.hash !== "#" + id || !details.current) return;
      details.current.open = true;
      details.current.querySelector("summary")?.focus({ preventScroll: true });
      details.current.scrollIntoView({ block: "start" });
    };
    openTarget();
    window.addEventListener("hashchange", openTarget);
    return () => window.removeEventListener("hashchange", openTarget);
  }, [id]);
  return (
    <details ref={details} id={id} className="group scroll-mt-4 rounded-[1.5rem] border border-line bg-paper">
      <summary className="flex min-h-24 cursor-pointer list-none items-center gap-3 rounded-[1.5rem] px-5 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cocoa [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1"><span className="block text-[19px] font-bold text-cocoa">{title}</span><span className="mt-1 block text-[16px] leading-relaxed text-muted">{summary}</span></span>
        <IconArrowRight className="h-5 w-5 shrink-0 text-cocoa transition-transform group-open:rotate-90 motion-reduce:transition-none" />
      </summary>
      <div className="border-t border-line px-4 py-5">{children}</div>
    </details>
  );
}

function useSaveFeedback() {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const clear = () => { setError(""); setSaved(""); };
  const run = async (action: () => Promise<void>, message: string) => {
    if (inFlight.current) return false;
    inFlight.current = true; setBusy(true); clear();
    try { await action(); setSaved(message); return true; }
    catch { setError("저장하지 못했어요. 입력한 내용은 그대로예요. 인터넷 연결을 확인하고 다시 시도해 주세요."); return false; }
    finally { inFlight.current = false; setBusy(false); }
  };
  return { busy, error, saved, clear, run };
}

function SaveFeedback({ error, saved }: { error: string; saved: string }) {
  return <>{error ? <p role="alert" className="text-[16px] leading-relaxed font-semibold text-blush-deep">{error}</p> : null}{saved ? <p role="status" className="rounded-2xl bg-sage p-3 text-[16px] leading-relaxed font-semibold text-cocoa">{saved}</p> : null}</>;
}

function Settings({ app, view, now }: { app: App; view: AppView; now: Date }) {
  return (
    <div className="px-6">
      <p className="mb-5 text-[16px] leading-relaxed text-muted">바꾸고 싶은 항목만 펼쳐 주세요.</p>
      {!view.seniorConsent ? <p className="mb-4 rounded-2xl border border-line p-4 text-[16px] leading-relaxed text-cocoa">어르신 정보를 저장하기 전에 동의 확인이 필요해요. <a href="#device" className="font-bold underline">기기 메뉴에서 안내 읽기</a></p> : null}
      {app.mode === "demo" ? <p className="mb-4 rounded-2xl bg-butter-soft p-4 text-[16px] leading-relaxed text-cocoa">예시 체험 설정이에요. 이 브라우저에만 저장되고 실제 가족이나 기기에 연결되지 않아요.</p> : null}
      <div className="flex flex-col gap-3">
        <SettingsGroup id="alerts" title="알림 기준" summary={"연속 " + view.alertSettings.missedMealsThreshold + "끼 · " + view.alertSettings.fastingHours + "시간 · " + view.alertSettings.emergencyHours + "시간"}>
          <AlertSettings view={view} actions={app.actions} />
        </SettingsGroup>
        <SettingsGroup id="life" title="생활 기준" summary="가족·가구 정보, 식사 시간과 밥솥 사용">
          <LifestyleSettings view={view} actions={app.actions} />
          {careDataAvailable(view) ? <AbsenceSettings view={view} actions={app.actions} now={now} /> : <p className="mt-5 border-t border-line pt-4 text-[16px] leading-relaxed text-muted">부재 일정은 가족 연결이 준비된 뒤 사용할 수 있어요.</p>}
          <AppearanceSettings />
        </SettingsGroup>
        <SettingsGroup id="device" title="기기" summary={view.plug.deviceId ? "연결 상태·마지막 수신·어르신 휴대폰" : "기기 연결·어르신 동의·휴대폰 연결"}>
          <DeviceSettings app={app} view={view} />
          {app.mode === "demo" ? <DemoTools view={view} /> : null}
        </SettingsGroup>
      </div>
      <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5">
        <Link href="/tutorial" className="flex min-h-12 items-center justify-between gap-3 rounded-2xl px-2 text-[16px] font-bold text-cocoa hover:bg-butter-soft">소개 다시 보기<IconArrowRight className="h-5 w-5" /></Link>
        <PrivacyNotice className="px-2" />
        <section id="account" className="scroll-mt-4"><h2 className="mb-3 text-[18px] font-bold text-cocoa">계정</h2><AccountSettings app={app} /></section>
      </div>
    </div>
  );
}

function AlertSettings({ view, actions }: { view: AppView; actions: AppActions }) {
  const [draft, setDraft] = useState(view.alertSettings);
  const feedback = useSaveFeedback();
  return (
    <form onSubmit={(event) => { event.preventDefault(); if (view.seniorConsent) void feedback.run(() => actions.saveAlertSettings(draft), "알림 기준을 저장했어요."); }}>
      <fieldset disabled={feedback.busy} aria-busy={feedback.busy} className="flex min-w-0 flex-col gap-5">
        <AlertThresholdFields value={draft} onChange={(value) => { setDraft(value); feedback.clear(); }} hints={{ missed: "연속으로 이만큼 끼니 소식이 없으면 알려 드려요.", fasting: "마지막 밥솥 사용 후 이 시간이 지나면 알려 드려요.", emergency: "안부를 직접 확인할 기준이에요. 지정 연락처나 기관에 자동으로 연락하지는 않아요." }} />
        <SaveFeedback {...feedback} />
        <Button type="submit" disabled={feedback.busy || !view.seniorConsent}>{feedback.busy ? "저장하고 있어요…" : "알림 기준 저장"}</Button>
      </fieldset>
    </form>
  );
}

function LifestyleSettings({ view, actions }: { view: AppView; actions: AppActions }) {
  const router = useRouter();
  const [senior, setSenior] = useState(view.senior);
  const [household, setHousehold] = useState(view.household);
  const [meals, setMeals] = useState(Math.max(1, Math.min(4, view.mealProfile.windows.length)));
  const [times, setTimes] = useState(() => Object.fromEntries(FOUR_MEAL_WINDOWS.map((window) => [window.slot, view.mealProfile.windows.find((item) => item.slot === window.slot) ?? window])) as Record<MealSlotName, MealWindow>);
  const windows = mealSlotsForCount(meals).map((slot) => times[slot]);
  const [eatOut, setEatOut] = useState(Math.max(0, Math.min(20, view.mealProfile.eatOutPerWeek)));
  const [keepWarm, setKeepWarm] = useState(view.mealProfile.usesKeepWarm);
  const [cooks, setCooks] = useState(Math.max(1, Math.min(21, view.mealProfile.cooksPerWeek)));
  const feedback = useSaveFeedback();
  const problems = seniorDetailsProblems(senior);
  const valid = view.seniorConsent && Object.values(problems).every((problem) => problem === null) && windowsValid(windows);
  const save = () => feedback.run(() => actions.saveOnboarding(view.onboardingStep, {
    senior: { name: senior.name.trim(), relation: senior.relation.trim(), phone: senior.phone.trim() }, household,
    mealProfile: { windows, eatOutPerWeek: eatOut, usesKeepWarm: keepWarm, cooksPerWeek: cooks },
  }), "생활 기준을 저장했어요. 홈에도 같은 내용이 반영돼요.");
  return (
    <form onSubmit={(event) => { event.preventDefault(); if (valid) void save(); }}>
      <fieldset disabled={feedback.busy} aria-busy={feedback.busy} className="flex min-w-0 flex-col gap-5">
        <h2 className="text-[17px] font-bold text-cocoa">우리 집 정보</h2>
        <Field label="부르는 호칭" hint="네 가지 중 한 가지만 골라 주세요.">
          <RelationPicker value={senior.relation} onChange={(relation) => { setSenior({ ...senior, relation }); feedback.clear(); }} />
          {problems.relation ? <p role="status" className="text-[16px] text-blush-deep">{problems.relation}</p> : null}
        </Field>
        <Field label="대표자 성함" htmlFor="settings-senior-name">
          <TextInput id="settings-senior-name" autoComplete="off" value={senior.name} maxLength={30} aria-invalid={!!problems.name || undefined} aria-describedby={problems.name ? "settings-name-error" : undefined} onChange={(event) => { setSenior({ ...senior, name: event.target.value }); feedback.clear(); }} placeholder="예: 정숙" />
          {problems.name ? <p id="settings-name-error" role="status" className="text-[16px] text-blush-deep">{problems.name}</p> : null}
        </Field>
        <Field label="대표자 연락처 (선택)" htmlFor="settings-senior-phone" hint="부모님 두 분이어도 전화는 대표자 한 분에게 연결돼요.">
          <TextInput id="settings-senior-phone" type="tel" inputMode="tel" autoComplete="off" value={senior.phone} maxLength={24} aria-invalid={!!problems.phone || undefined} aria-describedby={problems.phone ? "settings-phone-error" : undefined} onChange={(event) => { setSenior({ ...senior, phone: event.target.value }); feedback.clear(); }} placeholder="010-0000-0000" />
          {problems.phone ? <p id="settings-phone-error" role="status" className="text-[16px] text-blush-deep">{problems.phone}</p> : null}
        </Field>
        <Field label="함께 사는 분 (본인 포함)" hint="기록은 가구 단위로 보여요. 각자의 실제 식사 여부를 뜻하지 않아요.">
          <Choice value={household.residentCount} options={[1, 2, 3].map((value) => ({ value, label: value === 3 ? "3명 이상" : value + "명" }))} onChange={(residentCount) => { setHousehold({ ...household, residentCount }); feedback.clear(); }} />
        </Field>
        <Field label="반려견이 있나요?">
          <Choice cols={2} value={household.hasPet} options={[{ value: false, label: "없어요" }, { value: true, label: "있어요" }]} onChange={(hasPet) => { setHousehold({ ...household, hasPet }); feedback.clear(); }} />
        </Field>
        <h2 className="border-t border-line pt-5 text-[17px] font-bold text-cocoa">식사 시간과 밥솥 사용</h2>
        <Field label="하루 식사 시간대 수" hint="최대 네 시간대까지 각각 정해요. 줄였다가 늘려도 입력 중인 시간은 남아 있어요.">
          <Slider value={meals} min={1} max={4} unit="끼" label="하루 식사 시간대 수" onChange={(value) => { setMeals(value); feedback.clear(); }} />
        </Field>
        <MealWindowsEditor windows={windows} onChange={(next) => { setTimes({ ...times, ...Object.fromEntries(next.map((window) => [window.slot, window])) }); feedback.clear(); }} />
        {!windowsValid(windows) ? <p className="text-[16px] font-semibold text-blush-deep">표시된 시간을 확인해 주세요. 겹침이 없어야 저장할 수 있어요.</p> : null}
        <Field label="일주일에 외식은 몇 번쯤?">
          <Slider value={eatOut} min={0} max={20} unit="번" label="일주일에 외식 횟수" marks={[0, 7, 14, 20]} onChange={(value) => { setEatOut(value); feedback.clear(); }} />
        </Field>
        <Field label="보온 기능을 쓰시나요?">
          <Choice cols={2} value={keepWarm} options={[{ value: true, label: "켜 둬요" }, { value: false, label: "안 써요" }]} onChange={(value) => { setKeepWarm(value); feedback.clear(); }} />
        </Field>
        <Field label="일주일에 밥은 몇 번 지으세요?">
          <Slider value={cooks} min={1} max={21} unit="번" label="일주일에 밥 짓는 횟수" marks={[1, 7, 14, 21]} onChange={(value) => { setCooks(value); feedback.clear(); }} />
        </Field>
        <SaveFeedback {...feedback} />
        <Button type="submit" disabled={feedback.busy || !valid}>{feedback.busy ? "저장하고 있어요…" : "생활 기준 저장"}</Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/home")}>{feedback.saved ? "홈으로 돌아가기" : "저장하지 않고 홈으로"}</Button>
      </fieldset>
    </form>
  );
}

function AbsenceSettings({ view, actions, now }: { view: AppView; actions: AppActions; now: Date }) {
  const today = kstDate(now);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDays(today, 2));
  const feedback = useSaveFeedback();
  const upcoming = view.absences.filter((absence) => absence.endDate >= today);
  return (
    <details className="mt-5 border-t border-line pt-4">
      <summary className="min-h-12 cursor-pointer py-3 text-[17px] font-bold text-cocoa">부재 일정</summary>
      <div className="mt-2 flex flex-col gap-4">
        <p className="text-[16px] leading-relaxed text-muted">병원·외출·여행으로 집을 비우는 동안은 알림을 쉬어요.</p>
        {upcoming.length ? <ul className="flex flex-col gap-2">{upcoming.map((absence) => <li key={absence.startDate + "-" + absence.endDate} className="flex flex-wrap items-center gap-2 rounded-2xl bg-sky px-3 py-2"><IconSuitcase className="h-5 w-5 text-sky-deep" /><span className="flex-1 text-[16px] font-semibold text-cocoa">{absence.startDate.slice(5).replace("-", "/")} ~ {absence.endDate.slice(5).replace("-", "/")}</span><button type="button" disabled={feedback.busy} className="min-h-12 px-2 text-[16px] font-semibold text-sky-deep" onClick={() => void feedback.run(() => actions.removeAbsence(absence), "부재 일정을 삭제했어요.")}>삭제</button></li>)}</ul> : null}
        <fieldset disabled={feedback.busy} className="grid min-w-0 gap-3">
          <Field label="부재 시작일" htmlFor="settings-away-start"><TextInput id="settings-away-start" type="date" value={startDate} min={today} onChange={(event) => { setStartDate(event.target.value); feedback.clear(); }} className="min-w-0 w-full" /></Field>
          <Field label="부재 종료일" htmlFor="settings-away-end"><TextInput id="settings-away-end" type="date" value={endDate} min={startDate} onChange={(event) => { setEndDate(event.target.value); feedback.clear(); }} className="min-w-0 w-full" /></Field>
        </fieldset>
        <SaveFeedback {...feedback} />
        <Button variant="soft" disabled={feedback.busy || !startDate || !endDate || startDate < today || endDate < startDate} onClick={() => void feedback.run(() => actions.addAbsence({ startDate, endDate }), "부재 일정을 저장했어요.")}>{feedback.busy ? "저장하고 있어요…" : "부재 일정 추가"}</Button>
      </div>
    </details>
  );
}

function AppearanceSettings() {
  const value = useMealPalette();
  const [message, setMessage] = useState("");
  return <details className="mt-5 border-t border-line pt-4"><summary className="min-h-12 cursor-pointer py-3 text-[17px] font-bold text-cocoa">기록 색상</summary><div className="mt-2 flex flex-col gap-3"><p className="text-[16px] leading-relaxed text-muted">이 기기의 기록과 리포트에 적용돼요. 색과 함께 상태 글자도 보여요.</p><Choice cols={1} value={value} options={MEAL_PALETTES.map((palette) => ({ value: palette.id, label: palette.label }))} onChange={(palette) => { const saved = setMealPalette(palette); setMessage(saved ? "이 기기에 기록 색상을 저장했어요." : "이번 화면에 적용했어요. 브라우저가 저장을 허용하지 않아 다시 접속하면 초기화될 수 있어요."); }} />{message ? <p role="status" className="text-[16px] leading-relaxed text-cocoa">{message}</p> : null}</div></details>;
}

function DeviceSettings({ app, view }: { app: App; view: AppView }) {
  const [consentChecked, setConsentChecked] = useState(false);
  const consent = useSaveFeedback();
  const pairing = useSaveFeedback();
  const { actions, mode } = app;
  const firebase = app.provider === "firebase" || view.dataSource === "firebase";
  const careAvailable = careDataAvailable(view);
  const hasReading = Boolean(view.plug.lastReadingAt && Number.isFinite(Date.parse(view.plug.lastReadingAt)));
  return <div className="flex flex-col gap-5">
    <div className="rounded-2xl bg-butter-soft p-4">
      <p className="text-[16px] font-bold text-cocoa">{mode === "demo" ? "예시 기기 상태" : "기기 상태"}</p>
      <p className="mt-2 text-[16px] text-cocoa">{view.plug.deviceId ? view.plug.online && hasReading ? "신호를 받고 있어요." : "기기 수신을 확인해 주세요." : "아직 연결된 기기가 없어요."}</p>
      <p className="mt-4 text-[16px] font-semibold text-cocoa">{mode === "demo" ? "예시 마지막 기기 수신" : "마지막 기기 수신"}</p>
      <p className="mt-1 break-words text-[16px] leading-relaxed text-muted">{deviceReadingLabel(view.plug.lastReadingAt)}</p>
      <p className="mt-3 text-[16px] leading-relaxed text-muted">기기 신호가 없는 것만으로 식사나 건강 상태를 판단하지 않아요.</p>
    </div>
    {!view.seniorConsent ? <fieldset disabled={consent.busy} className="min-w-0">
      <SeniorConsentField checked={consentChecked} onChange={checked => { setConsentChecked(checked); consent.clear(); }} />
      <Button variant="soft" className="mt-3" disabled={!consentChecked || consent.busy} onClick={() => { if (consentChecked) void consent.run(() => actions.saveOnboarding(view.onboardingStep, { seniorConsent: true }), "동의 확인을 저장했어요."); }}>{consent.busy ? "저장하고 있어요…" : "동의 확인 저장하기"}</Button>
    </fieldset> : <div className="rounded-2xl border border-line p-4">
      <p className="text-[16px] font-bold text-cocoa">어르신 정보 이용 동의 확인을 저장했어요.</p>
      <PrivacyNotice />
      {firebase || mode === "demo" ? <><p className="text-[16px] leading-relaxed text-muted">확인을 취소하면 새 어르신 정보 저장과 삼성 기기 소식 읽기를 멈춰요. 암호화된 연결 열쇠까지 지우려면 아래에서 기기 연결도 해제해 주세요. 건강 앱 권한 해제는 별도예요.</p><Button variant="outline" className="mt-3 text-[16px]" disabled={consent.busy} onClick={() => {
        if (!confirm("내 계정의 어르신 정보 이용 동의 확인을 취소할까요? 새 기기 소식 읽기를 멈추지만, 기존 정보와 암호화된 연결 열쇠를 지우려면 연결도 해제해야 해요.")) return;
        void consent.run(() => actions.saveOnboarding(view.onboardingStep, { seniorConsent: false }), "동의 확인을 취소했어요.").then(saved => { if (saved) setConsentChecked(false); });
      }}>동의 확인 취소</Button></> : null}
    </div>}
    <SaveFeedback {...consent} />
    {firebase ? <SmartThingsPanel key={String(view.seniorConsent)} accountKey={app.accountKey} /> : view.plug.deviceId ? <div className="flex items-center gap-3 rounded-2xl border border-line p-4"><IconPlug className="h-6 w-6 shrink-0 text-cocoa" /><div className="min-w-0"><p className="text-[16px] font-bold text-cocoa">스마트플러그</p><p className="mt-1 break-all text-[16px] text-muted">{view.plug.deviceId}</p></div></div> : <PlugForm onSubmit={actions.registerPlug} consentConfirmed={view.seniorConsent} isDemo={mode === "demo"} />}
    <ConnectionGuide />
    <div className="rounded-2xl bg-butter-soft p-4">
      <p className="text-[16px] font-bold text-cocoa">{view.senior.relation} 휴대폰 연결</p>
      {!view.seniorConsent ? <p className="mt-2 text-[16px] leading-relaxed text-cocoa">어르신의 동의를 확인한 뒤 연결할 수 있어요.</p> : mode === "demo" ? <><p className="mt-2 text-[16px] text-cocoa">예시 체험은 실제 가족과 연결하지 않아요.</p><Link href="/s" className="mt-2 block min-h-12 py-3 text-[16px] font-bold text-cocoa underline">어르신 예시 화면 보기</Link></> : !careAvailable ? <p className="mt-2 text-[16px] leading-relaxed text-cocoa">가족 휴대폰 연결을 준비하고 있어요. 준비가 끝나면 여기서 연결 숫자를 받을 수 있어요.</p> : view.pairingCode ? <p className="mt-2 break-all text-[28px] font-bold tracking-[0.2em] text-cocoa">{view.pairingCode}</p> : <Button variant="dark" className="mt-3 text-[16px]" disabled={pairing.busy} onClick={() => void pairing.run(() => actions.issuePairingCode(), "연결 숫자를 요청했어요.")}>{pairing.busy ? "연결 숫자를 받고 있어요…" : view.seniorPaired ? "다른 휴대폰 연결하기" : "연결 숫자 받기"}</Button>}
      <SaveFeedback {...pairing} />
      {view.seniorConsent && mode === "live" && careAvailable ? <p className="mt-2 text-[16px] leading-relaxed text-cocoa/70">{view.seniorPaired ? "어르신 휴대폰이 연결돼 있어요." : "밥뭇나의 ‘어르신으로 시작’에서 숫자를 넣어 주세요. 숫자는 24시간 동안 쓸 수 있어요."}</p> : null}
    </div>
    <p className="flex gap-2 text-[16px] leading-relaxed text-cocoa/80"><IconLock className="mt-0.5 h-5 w-5 shrink-0" />가족 화면에는 끼니별 요약만 보여요. 카메라나 마이크는 쓰지 않아요.</p>
  </div>;
}

/** 실제 데이터 계층과 분리된, 사용자가 선택한 로컬 예시 도구. */
function DemoTools({ view }: { view: AppView }) {
  const router = useRouter();
  const [sent, setSent] = useState(false);
  return <details className="mt-5 border-t border-line pt-4"><summary className="min-h-12 cursor-pointer py-3 text-[16px] font-bold text-cocoa">예시 체험 도구</summary><div className="mt-2 flex flex-col gap-4">
    <p className="text-[16px] text-muted">이 브라우저의 예시 기록만 바뀌어요.</p>
    <Button variant="soft" className="text-[16px]" onClick={() => { const start = new Date(); updateDemo((draft) => ({ ...draft, events: [...draft.events, { type: "cook", startedAt: start.toISOString(), endedAt: new Date(start.getTime() + 30 * MINUTE_MS).toISOString() }] })); setSent(true); }}>지금 취사 신호 보내기</Button>
    {sent ? <p role="status" className="text-[16px] text-cocoa">예시 취사 신호를 추가했어요.</p> : null}
    <div className="flex items-center justify-between gap-3"><span className="text-[16px] font-semibold text-cocoa">예시 플러그 수신</span><Toggle label="예시 플러그 수신" checked={view.plug.online} onChange={(online) => updateDemo((draft) => ({ ...draft, plug: { ...draft.plug, online, offlineSince: online ? null : new Date(Date.now() - 3 * 60 * MINUTE_MS).toISOString() } }))} /></div>
    <Button variant="ghost" className="text-[16px]" onClick={() => { if (confirm("데모 데이터를 처음 상태로 되돌릴까요?")) { resetDemo(); router.push("/"); } }}>데모 초기화</Button>
  </div></details>;
}

function AccountSettings({ app }: { app: App }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(false);
  const signOut = async (destination: string) => {
    if (!app.signOut || active.current) return;
    active.current = true; setBusy(true); setError("");
    try { await app.signOut(); router.push(destination); }
    catch { setError("로그아웃을 확인하지 못했어요. 다시 눌러 주세요."); }
    finally { active.current = false; setBusy(false); }
  };
  if (app.mode === "demo") return <Button variant="outline" className="text-[16px]" onClick={() => { setMode(null); router.push("/login"); }}>데모 끝내고 로그인하기</Button>;
  return <div className="flex flex-col gap-3">
    {app.accountLabel ? <p className="rounded-2xl bg-butter-soft p-4 text-[16px] text-cocoa"><span className="block text-cocoa/70">로그인한 계정</span><strong className="mt-1 block break-all">{app.accountLabel}</strong></p> : null}
    {error ? <p role="alert" className="text-[16px] text-blush-deep">{error}</p> : null}
    <Button variant="soft" className="text-[16px]" disabled={busy || !app.signOut} onClick={() => void signOut("/login")}>{busy ? "계정을 확인하고 있어요…" : "다른 계정으로 전환"}</Button>
    <Button variant="outline" className="text-[16px]" disabled={busy || !app.signOut} onClick={() => void signOut("/")}>로그아웃</Button>
  </div>;
}
