"use client";

import { useState, type ReactNode } from "react";
import { AlertThresholdFields, Choice, Field, MealWindowsEditor, RelationPicker, Slider, TextInput, windowsValid } from "@/components/forms";
import { Button } from "@/components/ui";
import { DEFAULT_WINDOWS, type AppActions, type AppView } from "@/lib/data/view";
import type { MealSlotName, MealWindow } from "@/lib/judge/types";

const SLOTS: Record<number, MealSlotName[]> = {
  1: ["lunch"], 2: ["breakfast", "dinner"], 3: ["breakfast", "lunch", "dinner"],
};
const BINARY = [{ value: false, label: "없어요" }, { value: true, label: "있어요" }];

export function Consent({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <strong>안부 알림·생활 리포트 (선택)</strong>
      <p className="mt-1 text-[15px] leading-relaxed text-cocoa/80">밥솥 사용 소식만 살펴요. 동의 없이도 가입하고 홈을 이용할 수 있어요.</p>
      <a href="https://app.notion.com/p/4163d756e70080399649fedbb690842f?source=copy_link" target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center text-[14px] text-cocoa/75 underline underline-offset-4">개인정보 처리방침 보기</a>
      <label className="flex min-h-10 items-center gap-3 text-[15px]">
        <input className="size-5 shrink-0 accent-sage-deep" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        어르신이 안부 알림과 생활 리포트에 별도로 동의했어요.
      </label>
    </div>
  );
}

export function Fold({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <details className="group rounded-2xl border border-line bg-paper">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-2 p-4 [&::-webkit-details-marker]:hidden">
        <span><strong>{label}</strong>{hint && <span className="mt-1 block text-[15px] text-cocoa/75">{hint}</span>}</span>
        <span className="shrink-0 text-xl transition-transform group-open:rotate-45" aria-hidden>+</span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-line p-4">{children}</div>
    </details>
  );
}

export function LifeSettings({
  view, actions, consent, onConsent, onSave,
}: {
  view: AppView; actions: AppActions; consent: boolean; onConsent: (value: boolean) => void;
  onSave: () => void;
}) {
  const [senior, setSenior] = useState(view.senior);
  const [household, setHousehold] = useState(view.household);
  const [meal, setMeal] = useState(view.mealProfile);
  const [meals, setMeals] = useState(Math.min(3, Math.max(1, meal.windows.length || 3)));
  const [times, setTimes] = useState(() => Object.fromEntries(
    DEFAULT_WINDOWS.map((item) => [item.slot, meal.windows.find((w) => w.slot === item.slot) ?? item]),
  ) as Record<MealSlotName, MealWindow>);
  const [alerts, setAlerts] = useState(view.alertSettings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const windows = SLOTS[meals].map((slot) => times[slot]);
  const live = view.mode === "live";
  const agreed = view.seniorConsent || consent;
  const validWindows = windowsValid(windows);
  const valid = senior.name.trim() && senior.relation.trim() && validWindows;

  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      await actions.saveOnboarding(8, {
        senior: { name: senior.name.trim(), relation: senior.relation.trim(), phone: senior.phone.trim() },
        household,
        mealProfile: { ...meal, windows },
        alertSettings: alerts,
        ...((live && agreed && !view.seniorConsent) ? { seniorConsent: true } : {}),
      });
      onSave();
    } catch {
      setError("설정을 저장하지 못했어요. 잠시 후 다시 눌러 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-4 rounded-2xl bg-butter-soft p-4">
        <fieldset className="min-w-0">
          <legend className="mb-2 font-bold">어르신을 어떻게 불러요?</legend>
          <RelationPicker value={senior.relation} onChange={(relation) => setSenior({ ...senior, relation })} />
        </fieldset>
        <label className="flex flex-col gap-2">
          <strong>어르신 성함</strong>
          <TextInput value={senior.name} placeholder="예: 정숙" onChange={(e) => setSenior({ ...senior, name: e.target.value })} />
        </label>
      </div>
      <Fold label="평소 끼니와 시간" hint={`하루 ${meals}끼 · ${windows.map((w) => w.start).join(" / ")}`}>
        <Field label="하루 평균 끼니 수">
          <Choice value={meals} options={[1, 2, 3].map((value) => ({ value, label: `${value}끼` }))} onChange={setMeals} />
        </Field>
        <MealWindowsEditor windows={windows} onChange={(values) => setTimes({ ...times, ...Object.fromEntries(values.map((w) => [w.slot, w])) })} />
        <Field label="일주일에 외식은 몇 번쯤?">
          <Slider value={meal.eatOutPerWeek} min={0} max={7} unit="번" label="일주일에 외식 횟수" marks={[0, 2, 4, 7]} onChange={(eatOutPerWeek) => setMeal({ ...meal, eatOutPerWeek })} />
        </Field>
      </Fold>
      <Fold label="생활·밥솥 자세히" hint="가구, 반려견, 연락처, 보온과 취사">
        <Field label="함께 사는 분 (본인 포함)" hint="밥솥은 가구 단위로 살펴요. 어느 분이 드셨는지는 알 수 없어요.">
          <Choice value={household.residentCount} options={[1, 2, 3].map((value) => ({ value, label: value === 3 ? "3명 이상" : `${value}명` }))} onChange={(residentCount) => setHousehold({ ...household, residentCount })} />
        </Field>
        <Field label="반려견이 있나요?">
          <Choice cols={2} value={household.hasPet} options={BINARY} onChange={(hasPet) => setHousehold({ ...household, hasPet })} />
        </Field>
        <label className="flex flex-col gap-2">
          <strong>어르신 연락처 (선택)</strong>
          <TextInput type="tel" inputMode="tel" value={senior.phone} placeholder="010-0000-0000" onChange={(e) => setSenior({ ...senior, phone: e.target.value })} />
        </label>
        <Field label="보온 기능을 쓰시나요?" hint={!meal.usesKeepWarm ? "보온을 쓰지 않으면 뚜껑 열림은 알 수 없어요." : undefined}>
          <Choice cols={2} value={meal.usesKeepWarm} options={[{ value: true, label: "켜 둬요" }, { value: false, label: "안 써요" }]} onChange={(usesKeepWarm) => setMeal({ ...meal, usesKeepWarm })} />
        </Field>
        <Field label="일주일에 밥은 몇 번 지으세요?">
          <Slider value={meal.cooksPerWeek} min={1} max={21} unit="번" label="일주일에 밥 짓는 횟수" marks={[1, 7, 14, 21]} onChange={(cooksPerWeek) => setMeal({ ...meal, cooksPerWeek })} />
        </Field>
      </Fold>
      <Fold label="언제 알려 드릴까요?" hint={`끼니 ${alerts.missedMealsThreshold}회 · 공복 ${alerts.fastingHours}시간 · 위험 ${alerts.emergencyHours}시간`}>
        <AlertThresholdFields value={alerts} onChange={setAlerts} hints={{ missed: "끼니 소식이 연속으로 없을 때", fasting: "마지막 밥솥 사용 뒤", emergency: "위험 안내 기준이에요. 신고 기관 연동은 준비 중이에요." }} />
      </Fold>
      {!view.seniorConsent && <Consent checked={consent} onChange={onConsent} />}
      {!live && <p className="text-[14px] text-cocoa/75">체험에서는 실제 동의를 저장하지 않아요.</p>}
      {live && view.seniorConsent && <p className="rounded-2xl bg-sage px-4 py-3 text-[15px] text-sage-deep">어르신 동의가 기록되어 있어요.</p>}
      {!validWindows && <p role="alert" className="text-[15px] font-bold text-blush-deep">끼니 시간이 겹치지 않게 바꿔 주세요.</p>}
      {error && <p role="alert" className="text-[15px] font-bold text-blush-deep">{error}</p>}
      <Button className="mt-2" onClick={() => void save()} disabled={!valid || busy}>{busy ? "저장하는 중…" : "저장하고 홈으로"}</Button>
    </div>
  );
}
