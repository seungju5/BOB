"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AlertThresholdFields, Choice, Field, MealWindowsEditor, RelationPicker, Slider, TextInput, windowsValid } from "@/components/forms";
import { IconBell, IconCheck, IconInfo, IconLock, IconPlug, IconUtensils, IconWifi } from "@/components/icons";
import { Mascot } from "@/components/Mascot";
import { PlugForm } from "@/components/PlugForm";
import { Button, ProgressBar, Skeleton } from "@/components/ui";
import { refreshLive } from "@/lib/data/live";
import { useApp } from "@/lib/data/useApp";
import { DEFAULT_WINDOWS, type AppActions, type AppView, type OnboardingPatch } from "@/lib/data/view";
import type { MealSlotName, MealWindow } from "@/lib/judge/types";

const TOTAL = 7;
const TITLES = [
  "스마트플러그를\n연결해 주세요",
  "전력 신호를\n확인했어요",
  "어떤 댁인지\n알려 주세요",
  "평소 식사 습관을\n알려 주세요",
  "밥솥은 어떻게\n쓰고 계세요?",
  "언제 알려 드릴까요?",
  "어르신 휴대폰을\n연결해 주세요",
];

export default function OnboardingPage() {
  const { view, actions, needsLogin, mode } = useApp();
  const router = useRouter();
  const [watts, setWatts] = useState<number | null>(null);
  // 가구 정보를 막 저장했을 때만 환영 화면을 한 번 보여 준다 (이어하기로 들어오면 건너뜀)
  const [welcome, setWelcome] = useState(false);
  useEffect(() => {
    if (needsLogin) router.replace("/login");
    else if (view && view.onboardingStep > TOTAL) router.replace("/home");
  }, [view, needsLogin, router]);

  if (!view || view.onboardingStep > TOTAL) {
    return (
      <main className="flex flex-1 flex-col gap-4 p-6">
        <Skeleton className="h-2" />
        <Skeleton className="h-24 w-56" />
        <Skeleton className="h-48" />
      </main>
    );
  }
  if (welcome && view.onboardingStep === 4) return <WelcomeLanding state={view} onContinue={() => setWelcome(false)} />;
  return (
    <Onboarding
      key={view.onboardingStep}
      state={view}
      actions={actions}
      live={mode === "live"}
      watts={watts}
      setWatts={setWatts}
      onHouseholdSaved={() => setWelcome(true)}
    />
  );
}

/** 가구 정보 입력 직후 랜딩: 입력한 내용을 확인하고 남은 단계를 안내한다 */
function WelcomeLanding({ state, onContinue }: { state: AppView; onContinue: () => void }) {
  const { senior, household } = state;
  const rows = [
    { label: "부르는 이름", value: `${senior.name} ${senior.relation}` },
    { label: "함께 사는 분", value: household.residentCount >= 3 ? "3명 이상" : `${household.residentCount}명` },
    { label: "반려견", value: household.hasPet ? "있어요" : "없어요" },
  ];
  const steps = [
    { icon: IconUtensils, text: "평소 식사 시간을 알려 주시면" },
    { icon: IconPlug, text: "밥솥 소식으로 끼니를 살피고" },
    { icon: IconBell, text: "소식이 뜸해지면 바로 알려 드려요" },
  ];
  return (
    <main className="flex flex-1 flex-col bg-butter">
      <div className="relative px-7 pt-12">
        <p className="animate-rise text-[15px] font-bold text-cocoa/70">반가워요!</p>
        <h1 className="animate-rise mt-2 pr-24 text-[34px] leading-[1.2] font-extrabold tracking-[-0.03em] whitespace-pre-line text-cocoa">
          {`${senior.name} ${senior.relation} 댁\n안부를 함께\n챙겨 드릴게요`}
        </h1>
        <Mascot className="animate-bob absolute top-8 right-4 h-24 w-24" mood="happy" />
      </div>

      <div className="mt-8 flex flex-1 flex-col rounded-t-[2.25rem] bg-paper px-6 pt-7 pb-8">
        <p className="text-[15px] font-bold text-cocoa">입력하신 정보</p>
        <dl className="mt-3 divide-y divide-line rounded-2xl border-2 border-line px-4">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between py-3 text-[15px]">
              <dt className="text-muted">{r.label}</dt>
              <dd className="font-bold text-cocoa">{r.value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-7 text-[15px] font-bold text-cocoa">이제 이렇게 지켜봐 드려요</p>
        <ol className="mt-3 flex flex-col gap-3">
          {steps.map(({ icon: Icon, text }, i) => (
            <li key={text} className="flex items-center gap-3 rounded-2xl bg-butter-soft px-4 py-3 text-[15px] text-cocoa">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-paper">
                <Icon className="h-5 w-5" />
              </span>
              <span>
                <span className="mr-1 font-bold text-butter-deep">{i + 1}</span>
                {text}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-4 flex items-center gap-1.5 text-[13px] text-muted">
          <IconLock className="h-4 w-4" /> 밥솥 사용 여부만 확인하고, 원래 기록은 판정 후 지워요.
        </p>

        <div className="mt-auto pt-8">
          <Button onClick={onContinue}>식사 습관 알려 주기</Button>
          <p className="mt-3 text-center text-[13px] text-muted">남은 단계는 {TOTAL - 3}개예요. 2분이면 끝나요.</p>
        </div>
      </div>
    </main>
  );
}

function Onboarding({
  state,
  actions,
  live,
  watts,
  setWatts,
  onHouseholdSaved,
}: {
  state: AppView;
  actions: AppActions;
  live: boolean;
  watts: number | null;
  setWatts: (w: number | null) => void;
  onHouseholdSaved: () => void;
}) {
  const step = state.onboardingStep;
  const [busy, setBusy] = useState(false);
  const go = async (n: number, patch: OnboardingPatch = {}) => {
    setBusy(true);
    try {
      await actions.saveOnboarding(n, patch);
    } finally {
      setBusy(false);
    }
  };
  const next = (patch: OnboardingPatch = {}) => void go(step + 1, patch);
  // 플러그를 건너뛰었으면 수신 확인 단계도 건너뛴다
  const back = () => void go(step === 3 && !state.plug.deviceId ? 1 : step - 1);

  return (
    <main className={`flex flex-1 flex-col px-6 pt-4 pb-8 ${busy ? "pointer-events-none opacity-70" : ""}`}>
      {!live ? <p className="rounded-2xl bg-butter-soft px-4 py-3 text-[15px] font-semibold text-cocoa">데모 체험 중이에요. 기기 신호와 가족 정보는 실제로 연결되지 않아요.</p> : null}
      <div className="flex h-12 items-center gap-3">
        <div className="flex-1">
          <ProgressBar value={step} max={TOTAL} />
        </div>
        <span className="text-[13px] font-bold text-muted">
          {step}/{TOTAL}
        </span>
      </div>
      {step === TOTAL - 1 ? <p className="mt-4 text-[14px] font-bold text-butter-deep">거의 다 왔어요!</p> : null}
      <h1 className={`${step === TOTAL - 1 ? "mt-1" : "mt-6"} text-[26px] leading-snug font-extrabold whitespace-pre-line text-cocoa`}>{TITLES[step - 1]}</h1>

      <div className="animate-rise mt-6 flex flex-1 flex-col">
        {step === 1 && (
          <PlugStep
            live={live}
            actions={actions}
            onConnected={(w) => {
              setWatts(w);
              next();
            }}
            onSkip={async () => {
              setWatts(null);
              await actions.skipPlug();
              void go(live ? 3 : 2);
            }}
          />
        )}
        {step === 2 && <CheckStep watts={watts} next={next} />}
        {step === 3 && (
          <HouseholdStep
            state={state}
            next={(patch) => {
              onHouseholdSaved();
              next(patch);
            }}
          />
        )}
        {step === 4 && <MealStep state={state} next={next} />}
        {step === 5 && <CookerStep state={state} next={next} />}
        {step === 6 && <AlertStep state={state} next={next} />}
        {step === 7 && <PairStep state={state} actions={actions} live={live} next={next} />}
      </div>
      {/* 이전 단계: 각 단계의 다음 버튼 바로 아래 (튜토리얼과 같은 자리) */}
      {step > 1 ? (
        <Button variant="ghost" className="mt-1 text-cocoa/70" onClick={back}>
          이전
        </Button>
      ) : null}
    </main>
  );
}

type StepProps = { state: AppView; next: (patch?: OnboardingPatch) => void };

function Footer({ children }: { children: ReactNode }) {
  return <div className="mt-auto flex flex-col gap-2 pt-8">{children}</div>;
}

function PlugStep({ live, actions, onConnected, onSkip }: { live: boolean; actions: AppActions; onConnected: (watts: number) => void; onSkip: () => void }) {
  return (
    <>
      <div className="flex items-center gap-3 rounded-2xl bg-butter-soft px-4 py-4 text-[14px] leading-relaxed text-cocoa/80">
        <IconPlug className="h-8 w-8 shrink-0 text-cocoa" />
        밥솥 전원 코드를 삼성 스마트플러그에 꽂고, SmartThings 앱에 플러그를 등록해 주세요.
      </div>
      <div className="mt-6">
        <PlugForm onSubmit={actions.registerPlug} onDone={onConnected} />
      </div>
      <Footer>
        <Button variant="ghost" onClick={onSkip}>
          {live ? "나중에 연결하기" : "데모 플러그로 계속하기"}
        </Button>
      </Footer>
    </>
  );
}

function CheckStep({ watts, next }: { watts: number | null; next: StepProps["next"] }) {
  const warm = watts !== null && watts >= 30 && watts <= 60;
  return (
    <>
      <div className="flex flex-col items-center pt-6 text-center">
        <div className="grid h-28 w-28 place-items-center rounded-full bg-sage text-sage-deep">
          {watts === null ? <IconWifi className="h-12 w-12" /> : <IconCheck className="h-14 w-14" />}
        </div>
        <p className="mt-6 text-[20px] font-bold text-cocoa">전력값을 받고 있어요</p>
        <p className="mt-2 text-[15px] text-muted">
          {watts === null
            ? "1분마다 플러그 값을 받아요."
            : `지금 ${Math.round(watts)}W${warm ? " — 밥솥이 보온 중이에요." : watts >= 800 ? " — 밥을 짓고 있어요." : "예요."}`}
        </p>
        <p className="mt-4 text-[13px] text-muted">5분 넘게 신호가 없으면 플러그 전원과 와이파이를 확인해 주세요.</p>
      </div>
      <Footer>
        <Button onClick={() => next()}>다음</Button>
      </Footer>
    </>
  );
}

function HouseholdStep({ state, next }: StepProps) {
  const [senior, setSenior] = useState(state.senior);
  const [household, setHousehold] = useState(state.household);
  return (
    <>
      <div className="flex flex-col gap-5">
        <Field label="어떻게 부르세요?" hint="여러 개 고를 수 있어요.">
          <RelationPicker value={senior.relation} onChange={(relation) => setSenior({ ...senior, relation })} />
        </Field>
        <Field label="어르신 성함">
          <TextInput value={senior.name} onChange={(e) => setSenior({ ...senior, name: e.target.value })} placeholder="예: 정숙" />
        </Field>
        <Field label="어르신 연락처">
          <TextInput type="tel" inputMode="tel" value={senior.phone} onChange={(e) => setSenior({ ...senior, phone: e.target.value })} placeholder="010-0000-0000" />
        </Field>
        <Field label="함께 사는 분 (본인 포함)" hint="알림은 가구 단위로 가요. 두 분이 사시면 한 분만 드셔도 '확인됨'으로 보여요.">
          <Choice value={household.residentCount} options={[1, 2, 3].map((v) => ({ value: v, label: v === 3 ? "3명 이상" : `${v}명` }))} onChange={(residentCount) => setHousehold({ ...household, residentCount })} />
        </Field>
        <Field label="반려견이 있나요?">
          <Choice cols={2} value={household.hasPet} options={[{ value: false, label: "없어요" }, { value: true, label: "있어요" }]} onChange={(hasPet) => setHousehold({ ...household, hasPet })} />
        </Field>
      </div>
      <Footer>
        <Button disabled={!senior.name.trim() || !senior.relation} onClick={() => next({ senior: { ...senior, name: senior.name.trim() }, household })}>다음</Button>
      </Footer>
    </>
  );
}

// 끼니 수에 맞춰 보여 줄 시간대. 시간대 종류(DB meal_slots.slot)는 아침·점심·저녁 세 개뿐이라 4끼도 세 개로 본다.
const SLOTS_FOR_MEALS: Record<number, MealSlotName[]> = {
  1: ["lunch"],
  2: ["breakfast", "dinner"],
  3: ["breakfast", "lunch", "dinner"],
  4: ["breakfast", "lunch", "dinner"],
};

function MealStep({ state, next }: StepProps) {
  const [meals, setMeals] = useState(state.mealProfile.windows.length);
  // 끼니 수를 바꿨다 되돌려도 고친 시간이 남도록 시간대별로 기억한다
  const [times, setTimes] = useState(() =>
    Object.fromEntries(DEFAULT_WINDOWS.map((d) => [d.slot, state.mealProfile.windows.find((w) => w.slot === d.slot) ?? d])) as Record<MealSlotName, MealWindow>,
  );
  const windows = SLOTS_FOR_MEALS[meals].map((s) => times[s]);
  const setWindows = (ws: MealWindow[]) => setTimes({ ...times, ...Object.fromEntries(ws.map((w) => [w.slot, w])) });
  const [eatOut, setEatOut] = useState(state.mealProfile.eatOutPerWeek);
  return (
    <>
      <div className="flex flex-col gap-5">
        <Field label="하루 평균 끼니 수">
          <Slider value={meals} min={1} max={4} unit="끼" label="하루 평균 끼니 수" onChange={setMeals} />
        </Field>
        <Field
          label="주로 드시는 시간대"
          hint={meals === 4 ? "네 번째 끼니는 아직 따로 둘 수 없어, 아침·점심·저녁 세 시간대로 살펴요." : "이 시간 안에 밥솥 소식이 있으면 '확인됨'이 돼요."}
        >
          <MealWindowsEditor windows={windows} onChange={setWindows} />
        </Field>
        {!windowsValid(windows) ? <p className="text-[13px] font-semibold text-blush-deep">시간대가 겹치거나 순서가 맞지 않아요.</p> : null}
        <Field label="일주일에 외식은 몇 번쯤?">
          <Slider
            value={eatOut}
            min={0}
            max={7}
            unit="번"
            label="일주일에 외식 횟수"
            marks={[0, 2, 4, 7]}
            format={(v) => (v === 0 ? "거의 안 함" : v === 7 ? "7번 이상" : null)}
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
              alertSettings: { ...state.alertSettings, missedMealsThreshold: meals <= 2 ? 3 : state.alertSettings.missedMealsThreshold },
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
          <p className="flex gap-2 rounded-2xl bg-sky px-4 py-3 text-[14px] leading-relaxed text-cocoa/80">
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
            emergency: "지정한 연락처에도 알려요. 신고 기관 연동은 준비 중이에요.",
          }}
        />
        <label className="flex items-start gap-3 rounded-2xl border-2 border-line px-4 py-4">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-5 w-5 accent-[var(--color-sage-deep)]" />
          <span className="text-[14px] leading-relaxed text-cocoa">
            <span className="flex items-center gap-1 font-bold"><IconLock className="h-4 w-4" />어르신께 동의를 받았어요</span>
            밥솥 전력 사용 여부만 확인하고, 원래 기록은 판정 후 지운다는 점을 설명드렸어요.
          </span>
        </label>
      </div>
      <Footer>
        <Button disabled={!consent} onClick={() => next({ alertSettings: settings, seniorConsent: true })}>다음</Button>
      </Footer>
    </>
  );
}

function PairStep({ state, actions, live, next }: StepProps & { actions: AppActions; live: boolean }) {
  // 연결 숫자가 없으면 발급하고, 연결될 때까지 5초마다 확인한다 (실서비스)
  useEffect(() => {
    if (!state.pairingCode && !state.seniorPaired) void actions.issuePairingCode();
  }, [state.pairingCode, state.seniorPaired, actions]);
  useEffect(() => {
    if (!live || state.seniorPaired) return;
    const id = setInterval(() => void refreshLive(), 5000);
    return () => clearInterval(id);
  }, [live, state.seniorPaired]);

  return (
    <>
      <div className="flex flex-col items-center text-center">
        <Mascot className="h-24 w-24" mood="wink" />
        <p className="mt-4 text-[15px] text-muted">{state.senior.relation} 휴대폰에서 밥뭇나를 열고</p>
        <p className="text-[15px] text-muted">&lsquo;어르신으로 시작&rsquo;을 누른 뒤 이 숫자를 넣어 주세요.</p>
        <p className="mt-6 min-w-56 rounded-3xl bg-butter-soft px-8 py-5 text-[40px] font-extrabold tracking-[0.3em] text-cocoa">
          {state.seniorPaired ? "연결됨" : (state.pairingCode ?? "······")}
        </p>
        <p className={`mt-4 flex items-center gap-1.5 text-[14px] font-semibold ${state.seniorPaired ? "text-sage-deep" : "text-muted"}`}>
          {state.seniorPaired ? (
            <>
              <IconCheck className="h-4 w-4" /> 연결됐어요
            </>
          ) : (
            "연결을 기다리는 중… (나중에 설정에서도 할 수 있어요)"
          )}
        </p>
      </div>
      <Footer>
        <Button onClick={() => next()}>시작하기</Button>
      </Footer>
    </>
  );
}
