"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AlertThresholdFields, Choice, Field, MealWindowsEditor, RelationPicker, Slider, TextInput, Toggle, windowsValid } from "@/components/forms";
import { IconLock, IconSuitcase } from "@/components/icons";
import { DeviceSetup } from "@/components/DeviceSetup";
import { Button, PageHeader, Skeleton } from "@/components/ui";
import { addDays, kstDate, MINUTE_MS } from "@/lib/judge/time";
import { clearLive } from "@/lib/data/live";
import { setMode, useSession } from "@/lib/data/mode";
import { useApp, type App } from "@/lib/data/useApp";
import type { AppView } from "@/lib/data/view";
import { resetDemo, updateDemo } from "@/lib/demo/store";
import { supabase } from "@/lib/supabase";

export default function SettingsPage() {
  const app = useApp();
  return (
    <main className="flex flex-col pb-10">
      <PageHeader title="설정" />
      {!app.view || !app.now ? (
        <div className="px-6">
          <Skeleton className="h-96" />
        </div>
      ) : (
        <Settings app={app} view={app.view} now={app.now} />
      )}
    </main>
  );
}

function Section({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-3 border-b border-line px-6 py-6" aria-label={id ? title : undefined}>
      <h2 className="mb-4 text-[17px] font-extrabold text-cocoa">{title}</h2>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}

function Settings({ app, view, now }: { app: App; view: AppView; now: Date }) {
  const router = useRouter();
  const { actions, mode } = app;
  const session = useSession();
  // 계정 전환은 로그아웃 후 로그인 화면으로 (로그인 화면이 최근 계정을 보여 준다)
  const signOut = async (to: string) => {
    await supabase().auth.signOut();
    clearLive();
    setMode(null);
    router.push(to);
  };
  const relation = view.senior.relation;
  // 기타 입력 중 글자마다 저장하지 않도록, 고친 뒤 '호칭 저장'으로 저장한다
  const [relationDraft, setRelationDraft] = useState(relation);
  const today = kstDate(now);
  const [meal, setMeal] = useState(view.mealProfile);
  const windows = meal.windows;
  const [mealBusy, setMealBusy] = useState(false);
  const [mealFeedback, setMealFeedback] = useState("");
  const [awayStart, setAwayStart] = useState(today);
  const [awayEnd, setAwayEnd] = useState(addDays(today, 2));
  const upcoming = view.absences.filter((a) => a.endDate >= today);
  const [alertDraft, setAlertDraft] = useState(view.alertSettings);
  useEffect(() => {
    const id = location.hash.slice(1) || (new URLSearchParams(location.search).get("section") === "devices" ? "device" : "");
    if (["alert-rules", "life-rules", "device"].includes(id)) document.getElementById(id)?.scrollIntoView();
  }, []);
  async function saveLifeRules() {
    setMealBusy(true);
    setMealFeedback("");
    try {
      await actions.saveMealProfile(meal);
      setMealFeedback("생활 기준을 저장했어요.");
    } catch {
      setMealFeedback("저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setMealBusy(false);
    }
  }

  return (
    <div>
      <nav aria-label="설정 바로가기" className="mx-6 grid grid-cols-3 gap-1 rounded-2xl bg-butter-soft p-1 text-center text-[14px] font-bold">
        {[["alert-rules", "알림 기준"], ["life-rules", "생활 기준"], ["device", "기기"]].map(([id, name]) => (
          <a key={id} href={`#${id}`} className="grid min-h-11 place-items-center rounded-xl px-1 hover:bg-paper">{name}</a>
        ))}
      </nav>
      <Section id="alert-rules" title="알림 기준">
        {/* 끄는 동안은 화면에만 반영하고, 손을 뗄 때 한 번 저장한다 */}
        <AlertThresholdFields
          value={alertDraft}
          onChange={setAlertDraft}
          onCommit={(next) => void actions.saveAlertSettings(next)}
          hints={{
            missed: "연속으로 이만큼 끼니 소식이 없으면 알려 드려요.",
            fasting: "마지막 밥솥 사용 후 이 시간이 지나면 알려 드려요.",
            emergency: "이 시간이 지나면 지정한 연락처에도 알려요. (신고 기관 연동은 준비 중)",
          }}
        />
      </Section>

      <Section id="life-rules" title="생활 기준">
        <Field label="평소 식사 시간">
          <MealWindowsEditor windows={windows} onChange={(windows) => setMeal({ ...meal, windows })} />
        </Field>
        <Field label="보온 기능">
          <Choice cols={2} value={meal.usesKeepWarm} options={[{ value: true, label: "켜 둬요" }, { value: false, label: "안 써요" }]} onChange={(usesKeepWarm) => setMeal({ ...meal, usesKeepWarm })} />
        </Field>
        <Field label="일주일에 밥 짓는 횟수">
          <Slider value={meal.cooksPerWeek} min={1} max={21} unit="번" label="일주일에 밥 짓는 횟수" marks={[1, 7, 14, 21]} onChange={(cooksPerWeek) => setMeal({ ...meal, cooksPerWeek })} />
        </Field>
        <Field label="일주일에 외식하는 횟수">
          <Slider value={meal.eatOutPerWeek} min={0} max={7} unit="번" label="일주일에 외식하는 횟수" marks={[0, 2, 4, 7]} onChange={(eatOutPerWeek) => setMeal({ ...meal, eatOutPerWeek })} />
        </Field>
        {!windowsValid(windows) ? <p className="text-[13px] font-semibold text-blush-deep">시간대가 겹치거나 순서가 맞지 않아요.</p> : null}
        <Button
          variant="soft"
          className="min-h-12 text-[15px]"
          disabled={mealBusy || !windowsValid(windows) || JSON.stringify(meal) === JSON.stringify(view.mealProfile)}
          onClick={() => void saveLifeRules()}
        >
          {mealBusy ? "저장하는 중…" : "생활 기준 저장"}
        </Button>
        {mealFeedback && <p role="status" className="text-[15px]">{mealFeedback}</p>}
      </Section>

      <Section title="부재 일정">
        {upcoming.length ? (
          <ul className="flex flex-col gap-2">
            {upcoming.map((a) => (
              <li key={`${a.startDate}-${a.endDate}`} className="flex items-center gap-3 rounded-2xl bg-sky px-4 py-3">
                <IconSuitcase className="h-5 w-5 text-sky-deep" />
                <span className="flex-1 text-[15px] font-semibold text-cocoa">
                  {a.startDate.slice(5).replace("-", "/")} ~ {a.endDate.slice(5).replace("-", "/")}
                </span>
                <button className="text-[13px] font-semibold text-sky-deep" onClick={() => void actions.removeAbsence(a)}>
                  삭제
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-muted">병원·외출·여행으로 집을 비우시는 날을 미리 넣어 두면 그동안 알림을 쉬어요.</p>
        )}
        <div className="flex items-center gap-2">
          <TextInput type="date" value={awayStart} min={today} onChange={(e) => setAwayStart(e.target.value)} aria-label="부재 시작일" className="min-w-0 flex-1" />
          <span className="text-muted">~</span>
          <TextInput type="date" value={awayEnd} min={awayStart} onChange={(e) => setAwayEnd(e.target.value)} aria-label="부재 종료일" className="min-w-0 flex-1" />
        </div>
        <Button
          variant="soft"
          className="min-h-12 text-[15px]"
          disabled={!awayStart || !awayEnd || awayEnd < awayStart}
          onClick={() => void actions.addAbsence({ startDate: awayStart, endDate: awayEnd })}
        >
          부재 일정 추가
        </Button>
      </Section>

      <Section title={`${relation} 정보`}>
        <Field label="부르는 이름" hint="여러 개 고를 수 있어요.">
          <RelationPicker value={relation} onChange={setRelationDraft} />
          {relationDraft !== relation ? (
            <Button className="min-h-12 text-[15px]" disabled={!relationDraft} onClick={() => void actions.saveSenior({ relation: relationDraft })}>
              {relationDraft ? "호칭 저장" : "하나 이상 골라 주세요"}
            </Button>
          ) : null}
        </Field>
        <Field label="연락처" hint="홈 화면의 전화하기 버튼에 쓰여요.">
          <TextInput type="tel" inputMode="tel" placeholder="010-0000-0000" defaultValue={view.senior.phone} onBlur={(e) => void actions.saveSenior({ phone: e.target.value.trim() })} />
        </Field>
      </Section>

      <Section id="device" title="기기">
        <DeviceSetup view={view} actions={actions} />
        <div className="rounded-2xl bg-butter-soft px-5 py-4">
          <p className="text-[13px] text-cocoa/70">{relation} 휴대폰 연결 숫자</p>
          {view.pairingCode ? (
            <p className="mt-1 text-[30px] font-extrabold tracking-[0.25em] text-cocoa">{view.pairingCode}</p>
          ) : (
            <button className="mt-2 h-10 rounded-full bg-cocoa px-4 text-[14px] font-bold text-paper" onClick={() => void actions.issuePairingCode()}>
              {view.seniorPaired ? "다른 휴대폰 연결하기" : "연결 숫자 받기"}
            </button>
          )}
          <p className="mt-2 text-[13px] text-cocoa/70">
            {view.seniorPaired ? "연결됨" : "밥뭇나 > 어르신으로 시작에서 이 숫자를 넣어 주세요. 숫자는 24시간 동안 쓸 수 있어요."}
          </p>
        </div>
      </Section>

      <Section title="개인정보">
        <p className="flex gap-2 text-[14px] leading-relaxed text-cocoa/80">
          <IconLock className="mt-0.5 h-4 w-4 shrink-0" />
          밥솥 전력값은 판정 직후 지우고, 가족에게는 끼니별 &lsquo;확인됨·미확인&rsquo; 요약만 보여 드려요. 카메라나 마이크는 쓰지 않아요.
        </p>
      </Section>

      {mode === "demo" ? (
        <Section title="데모 도구">
          <p className="text-[13px] text-muted">브라우저 안에서만 도는 데모 데이터예요.</p>
          <Button
            variant="soft"
            className="min-h-12 text-[15px]"
            onClick={() => {
              const start = new Date();
              updateDemo((d) => ({
                ...d,
                events: [...d.events, { type: "cook", startedAt: start.toISOString(), endedAt: new Date(start.getTime() + 30 * MINUTE_MS).toISOString() }],
              }));
            }}
          >
            지금 취사 신호 보내기
          </Button>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-semibold text-cocoa">플러그 수신</span>
            <Toggle
              label="플러그 수신"
              checked={view.plug.online}
              onChange={(on) =>
                updateDemo((d) => ({ ...d, plug: { ...d.plug, online: on, offlineSince: on ? null : new Date(Date.now() - 3 * 60 * MINUTE_MS).toISOString() } }))
              }
            />
          </div>
          <Button
            variant="ghost"
            className="min-h-12 text-[15px]"
            onClick={() => {
              if (confirm("데모 데이터를 처음 상태로 되돌릴까요?")) {
                resetDemo();
                router.push("/");
              }
            }}
          >
            데모 초기화
          </Button>
          <Button variant="outline" className="min-h-12 text-[15px]" onClick={() => { setMode(null); router.push("/login"); }}>
            데모 끝내고 로그인하기
          </Button>
        </Section>
      ) : (
        <Section title="계정">
          {session?.user.email ? (
            <p className="flex items-center justify-between rounded-2xl bg-butter-soft px-4 py-3 text-[15px]">
              <span className="text-cocoa/70">로그인한 계정</span>
              <span className="truncate pl-3 font-bold text-cocoa">{session.user.email}</span>
            </p>
          ) : null}
          <Button variant="soft" className="min-h-12 text-[15px]" onClick={() => void signOut("/login")}>
            다른 계정으로 전환
          </Button>
          <Button variant="outline" className="min-h-12 text-[15px]" onClick={() => void signOut("/")}>
            로그아웃
          </Button>
        </Section>
      )}
    </div>
  );
}
