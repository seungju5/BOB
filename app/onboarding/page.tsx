"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertThresholdFields, Choice, Field, MealWindowsEditor, RelationPicker, Slider, TextInput, windowsValid } from "@/components/forms";
import { IconCheck, IconInfo } from "@/components/icons";
import { SeniorConsentField } from "@/components/privacy/SeniorConsentField";
import { Mascot } from "@/components/Mascot";
import { FlowProgress } from "@/components/onboarding/FlowProgress";
import { HouseholdSummary } from "@/components/onboarding/HouseholdSummary";
import { seniorDetailsProblems } from "@/components/onboarding/settings-validation";
import { Button, ProgressBar, Skeleton } from "@/components/ui";
import { refreshLive } from "@/lib/data/live";
import { useApp } from "@/lib/data/useApp";
import { FOUR_MEAL_WINDOWS, HOUSEHOLD_STEP, ONBOARDING_COMPLETE, careDataAvailable, mealSlotsForCount, visibleOnboardingStep, type AppActions, type AppView, type OnboardingPatch } from "@/lib/data/view";
import type { MealSlotName, MealWindow } from "@/lib/judge/types";

const TITLES: Record<number, string> = {
  3: "누구의 안부가\n듣고 싶으세요?",
  4: "평소 식사 습관을\n알려 주세요",
  5: "밥솥은 어떻게\n쓰고 계세요?",
  6: "언제 알려 드릴까요?",
  7: "어르신 휴대폰을\n연결해 주세요",
};

export default function OnboardingPage() {
  const { view, actions, needsLogin, mode, error, accountKey } = useApp();
  const router = useRouter();
  useEffect(() => {
    if (needsLogin) router.replace("/login");
    else if (view && view.onboardingStep >= ONBOARDING_COMPLETE) router.replace("/home");
  }, [view, needsLogin, router]);

  if (!view || needsLogin || view.onboardingStep >= ONBOARDING_COMPLETE) return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      {error ? <><p role="alert" className="text-[18px] text-blush-deep">설정을 불러오지 못했어요.</p><Button onClick={() => location.reload()}>다시 시도</Button></> : <><Skeleton className="h-2" /><Skeleton className="h-24 w-56" /><Skeleton className="h-48" /></>}
    </main>
  );
  // 저장된 1·2번을 바로 갱신하지 않는다. 사용자가 저장할 때만 서버 단계가 바뀐다.
  return <Onboarding key={`${accountKey ?? mode}:${view.onboardingStep}`} state={view} actions={actions} live={mode === "live"} />;
}

function Onboarding({ state, actions, live }: { state: AppView; actions: AppActions; live: boolean }) {
  const step = state.seniorConsent ? visibleOnboardingStep(state.onboardingStep) : HOUSEHOLD_STEP;
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState("");
  const [summaryDone, setSummaryDone] = useState(false);
  const go = async (nextStep: number, patch: OnboardingPatch = {}) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await actions.saveOnboarding(nextStep, patch);
    } catch {
      setError("저장 결과를 확인하지 못했어요. 입력한 내용을 확인하고 다시 눌러 주세요.");
    } finally {
      setBusy(false);
      saving.current = false;
    }
  };
  const next = (patch: OnboardingPatch = {}) => void go(step + 1, patch);

  if (step === 4 && !summaryDone) return <HouseholdSummary state={state} busy={busy} error={error} onContinue={() => setSummaryDone(true)} onHome={() => void go(ONBOARDING_COMPLETE)} onEdit={() => void go(HOUSEHOLD_STEP)} />;

  return (
    <main className={`flex flex-1 flex-col px-6 pt-4 pb-8 ${busy ? "pointer-events-none opacity-70" : ""}`} aria-busy={busy}>
      <FlowProgress current="household" isDemo={!live} />
      {!live ? <p className="rounded-2xl bg-butter-soft px-4 py-3 text-[16px] font-semibold text-cocoa">예시 체험 중이에요. 실제 가족 정보나 기기에 연결되지 않아요.</p> : null}
      {step > HOUSEHOLD_STEP ? <div className="flex h-12 items-center gap-3"><div className="flex-1"><ProgressBar value={step - HOUSEHOLD_STEP} max={4} /></div><span className="text-[16px] text-muted">선택 설정 {step - HOUSEHOLD_STEP}/4</span></div> : <p className="mt-4 text-[16px] font-semibold text-muted">우리 집 기본 정보</p>}
      <h1 className="mt-6 text-[28px] leading-snug font-extrabold whitespace-pre-line text-cocoa">{TITLES[step]}</h1>
      {error ? <p role="alert" className="mt-4 text-[16px] font-semibold text-blush-deep">{error}</p> : null}
      <fieldset disabled={busy} className="animate-rise mt-6 flex min-w-0 flex-1 flex-col motion-reduce:animate-none">
        {step === HOUSEHOLD_STEP && <HouseholdStep state={state} next={next} />}
        {step === 4 && <MealStep state={state} next={next} />}
        {step === 5 && <CookerStep state={state} next={next} />}
        {step === 6 && <AlertStep state={state} next={next} />}
        {step === 7 && <PairStep state={state} actions={actions} live={live} next={next} />}
      </fieldset>
      {step > HOUSEHOLD_STEP ? <Button disabled={busy} variant="ghost" className="mt-1 text-cocoa/70" onClick={() => void go(step - 1)}>이전</Button> : <Link href="/tutorial" className="mt-4 text-center text-[16px] text-cocoa underline">소개 다시 보기</Link>}
    </main>
  );
}

type StepProps = { state: AppView; next: (patch?: OnboardingPatch) => void };
function Footer({ children }: { children: ReactNode }) { return <div className="mt-auto flex flex-col gap-2 pt-8">{children}</div>; }

function HouseholdStep({ state, next }: StepProps) {
  const [senior, setSenior] = useState(state.senior);
  const [household, setHousehold] = useState(state.household);
  const [consent, setConsent] = useState(state.seniorConsent);
  const problems = seniorDetailsProblems(senior);
  const valid = Object.values(problems).every((problem) => problem === null);
  const patch = (): OnboardingPatch => ({ senior: { name: senior.name.trim(), relation: senior.relation.trim(), phone: senior.phone.trim() }, household, seniorConsent: consent });
  return <>
    <div className="flex flex-col gap-5">
      <Field label="어떻게 부르세요?" hint="한 가지를 골라 주세요."><RelationPicker value={senior.relation} onChange={(relation) => setSenior({ ...senior, relation })} /></Field>
      <Field label="대표자 성함" htmlFor="onboarding-senior-name"><TextInput id="onboarding-senior-name" autoComplete="off" maxLength={30} value={senior.name} onChange={(e) => setSenior({ ...senior, name: e.target.value })} placeholder="예: 정숙" /></Field>
      <Field label="대표자 연락처 (선택)" htmlFor="onboarding-senior-phone" hint="전화는 대표자 한 분에게 연결돼요."><TextInput id="onboarding-senior-phone" type="tel" inputMode="tel" autoComplete="off" maxLength={24} value={senior.phone} aria-invalid={!!problems.phone || undefined} aria-describedby={problems.phone ? "onboarding-phone-error" : undefined} onChange={(e) => setSenior({ ...senior, phone: e.target.value })} placeholder="010-0000-0000" />{problems.phone ? <p id="onboarding-phone-error" role="status" className="text-[16px] text-blush-deep">{problems.phone}</p> : null}</Field>
      <Field label="함께 사는 분 (본인 포함)" hint="기록은 가구 단위로 보여요. 한 분 한 분의 실제 식사 여부를 뜻하지는 않아요."><Choice value={household.residentCount} options={[1, 2, 3].map((v) => ({ value: v, label: v === 3 ? "3명 이상" : `${v}명` }))} onChange={(residentCount) => setHousehold({ ...household, residentCount })} /></Field>
      <Field label="반려견이 있나요?"><Choice cols={2} value={household.hasPet} options={[{ value: false, label: "없어요" }, { value: true, label: "있어요" }]} onChange={(hasPet) => setHousehold({ ...household, hasPet })} /></Field>
      <SeniorConsentField checked={consent} onChange={setConsent} />
    </div>
    <Footer>
      <p className="text-[16px] leading-relaxed text-muted">기기 연결과 생활 기준은 홈의 설정에서 이어갈 수 있어요.</p>
      <Button disabled={!valid || !consent} onClick={() => { if (valid && consent) next(patch()); }}>저장하고 내용 확인</Button>
    </Footer>
  </>;
}

function MealStep({ state, next }: StepProps) {
  const [meals, setMeals] = useState(Math.max(1, Math.min(4, state.mealProfile.windows.length)));
  // 끼니 수를 바꿨다 되돌려도 고친 시간이 남도록 시간대별로 기억한다
  const [times, setTimes] = useState(() =>
    Object.fromEntries(FOUR_MEAL_WINDOWS.map((d) => [d.slot, state.mealProfile.windows.find((w) => w.slot === d.slot) ?? d])) as Record<MealSlotName, MealWindow>,
  );
  const windows = mealSlotsForCount(meals).map((s) => times[s]);
  const setWindows = (ws: MealWindow[]) => setTimes({ ...times, ...Object.fromEntries(ws.map((w) => [w.slot, w])) });
  const [eatOut, setEatOut] = useState(Math.max(0, Math.min(20, state.mealProfile.eatOutPerWeek)));
  return (
    <>
      <div className="flex flex-col gap-5">
        <Field label="하루 평균 끼니 수" hint="하루 1~4개의 시간대를 각각 설정할 수 있어요.">
          <Slider value={meals} min={1} max={4} unit="끼" label="하루 평균 끼니 수" onChange={setMeals} />
        </Field>
        <Field
          label="주로 드시는 시간대"
          hint="이 시간 안에 받은 밥솥 소식을 살펴요. 실제 식사 여부와는 달라요."
        >
          <MealWindowsEditor windows={windows} onChange={setWindows} />
        </Field>
        {!windowsValid(windows) ? <p className="text-[16px] font-semibold text-blush-deep">표시된 시간을 확인해 주세요. 겹침이 없어야 다음으로 갈 수 있어요.</p> : null}
        <Field label="일주일에 외식은 몇 번쯤?">
          <Slider
            value={eatOut}
            min={0}
            max={20}
            unit="번"
            label="일주일에 외식 횟수"
            marks={[0, 7, 14, 20]}
            format={(v) => (v === 0 ? "거의 안 함" : null)}
            onChange={setEatOut}
          />
        </Field>
      </div>
      <Footer>
        <Button
          disabled={!windowsValid(windows)}
          onClick={() =>
            next({
              mealProfile: { ...state.mealProfile, windows, eatOutPerWeek: eatOut },
            })
          }
        >
          다음
        </Button>
      </Footer>
    </>
  );
}

function CookerStep({ state, next }: StepProps) {
  const [keepWarm, setKeepWarm] = useState(state.mealProfile.usesKeepWarm);
  const [cooks, setCooks] = useState(state.mealProfile.cooksPerWeek);
  return (
    <>
      <div className="flex flex-col gap-5">
        <Field label="보온 기능을 쓰시나요?">
          <Choice cols={2} value={keepWarm} options={[{ value: true, label: "켜 둬요" }, { value: false, label: "안 써요" }]} onChange={setKeepWarm} />
        </Field>
        {!keepWarm ? (
          <p className="flex gap-2 rounded-2xl bg-sky px-4 py-3 text-[16px] leading-relaxed text-cocoa/80">
            <IconInfo className="mt-0.5 h-4 w-4 shrink-0 text-sky-deep" />
            보온을 쓰지 않으면 뚜껑 열림은 알 수 없어요. 취사할 때만 소식이 전해져요.
          </p>
        ) : null}
        <Field label="일주일에 밥은 몇 번 지으세요?">
          <Slider value={cooks} min={1} max={21} unit="번" label="일주일에 밥 짓는 횟수" marks={[1, 7, 14, 21]} onChange={setCooks} />
        </Field>
      </div>
      <Footer>
        <Button onClick={() => next({ mealProfile: { ...state.mealProfile, usesKeepWarm: keepWarm, cooksPerWeek: cooks } })}>다음</Button>
      </Footer>
    </>
  );
}

function AlertStep({ state, next }: StepProps) {
  const [settings, setSettings] = useState(state.alertSettings);
  const [consent, setConsent] = useState(state.seniorConsent);
  return (
    <>
      <div className="flex flex-col gap-5">
        <AlertThresholdFields
          value={settings}
          onChange={setSettings}
          hints={{
            missed: "연속으로 이만큼 끼니 소식이 없으면 알려 드려요.",
            fasting: "마지막 밥솥 사용 후",
            emergency: "안부를 직접 확인할 기준이에요. 지정 연락처·신고 기관에 자동으로 연락하지는 않아요.",
          }}
        />
        <SeniorConsentField checked={consent} onChange={setConsent} />
      </div>
      <Footer>
        <Button disabled={!consent} onClick={() => { if (consent) next({ alertSettings: settings, seniorConsent: consent }); }}>다음</Button>
      </Footer>
    </>
  );
}

function PairStep({ state, actions, live, next }: StepProps & { actions: AppActions; live: boolean }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const requesting = useRef(false);
  const available = careDataAvailable(state);
  const requestCode = async () => {
    if (!live || !available || !state.seniorConsent || requesting.current) return;
    requesting.current = true; setBusy(true); setError("");
    try { await actions.issuePairingCode(); }
    catch { setError("연결 숫자를 받지 못했어요. 나중에 설정에서 다시 연결할 수 있어요."); }
    finally { requesting.current = false; setBusy(false); }
  };
  // 사용자가 연결 숫자를 받은 뒤에만 기존 Supabase 연결 상태를 확인한다.
  useEffect(() => {
    if (!live || !available || state.dataSource === "firebase" || !state.seniorConsent || !state.pairingCode || state.seniorPaired) return;
    const id = setInterval(() => void refreshLive(), 5000);
    return () => clearInterval(id);
  }, [live, available, state.dataSource, state.pairingCode, state.seniorPaired, state.seniorConsent]);

  if (!available) return <>
    <Mascot className="mx-auto h-28 w-28" />
    <p className="mt-5 text-[18px] leading-relaxed text-cocoa">가족 휴대폰 연결을 준비하고 있어요. 지금 저장한 우리 집 정보와 생활 기준은 홈에서 확인할 수 있어요.</p>
    <p className="mt-3 text-[16px] leading-relaxed text-muted">준비가 끝나면 설정의 기기 메뉴에서 연결할 수 있어요.</p>
    <Footer><Button onClick={() => next()}>홈으로 가기</Button></Footer>
  </>;

  if (!state.seniorConsent) return <>
    <p className="text-[18px] leading-relaxed text-cocoa">어르신의 동의를 확인한 뒤 휴대폰을 연결할 수 있어요. 지금은 홈부터 둘러보세요.</p>
    <Footer><Button onClick={() => next()}>홈으로 가기</Button></Footer>
  </>;

  return (
    <>
      <div className="flex flex-col items-center text-center">
        <Mascot className="h-24 w-24" mood="wink" />
        {!live ? <p className="mt-4 text-[16px] font-bold text-cocoa">예시 연결 안내예요. 실제 가족에게 연결되지 않아요.</p> : null}
        <p className="mt-4 text-[16px] text-muted">{state.senior.relation} 휴대폰에서 밥뭇나를 열고</p>
        <p className="text-[16px] text-muted">{live ? "‘어르신으로 시작’을 누른 뒤 이 숫자를 넣어 주세요." : "‘어르신으로 시작’에서 ‘예시로 체험하기’를 누르면 볼 수 있어요."}</p>
        <p className="mt-6 min-w-56 rounded-3xl bg-butter-soft px-8 py-5 text-[40px] font-extrabold tracking-[0.3em] text-cocoa">
          {!live ? "예시 체험" : state.seniorPaired ? "연결됨" : (state.pairingCode ?? "연결 준비")}
        </p>
        <p className={`mt-4 flex items-center gap-1.5 text-[16px] font-semibold ${state.seniorPaired ? "text-sage-deep" : "text-muted"}`}>
          {!live ? "실제 가족 연결은 하지 않아요." : state.seniorPaired ? (
            <>
              <IconCheck className="h-4 w-4" /> 연결됐어요
            </>
          ) : (
            state.pairingCode ? "연결을 기다리는 중… (나중에 설정에서도 할 수 있어요)" : "연결 숫자를 받은 뒤 어르신 휴대폰에 입력해 주세요."
          )}
        </p>
      </div>
      {live && !state.pairingCode && !state.seniorPaired ? <Button variant="outline" className="mt-5" disabled={busy} onClick={() => void requestCode()}>{busy ? "연결 숫자를 받고 있어요…" : error ? "연결 숫자 다시 받기" : "연결 숫자 받기"}</Button> : null}
      {error ? <p role="alert" className="mt-4 text-[16px] text-blush-deep">{error}</p> : null}
      <Footer>
        <Button onClick={() => next()}>홈으로 가기</Button>
      </Footer>
    </>
  );
}
