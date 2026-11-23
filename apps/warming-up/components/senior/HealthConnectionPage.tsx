"use client";

import Link from "next/link";
import { useCallback, useState, useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";
import { PhoneSteps, type RankingLinkStatus } from "@bapmunna/phone-steps";
import { Logo, Mascot } from "@/components/Mascot";
import { Button } from "@/components/ui";
import { PhoneStepsCard } from "./PhoneStepsCard";
import { HealthPrivacyContent } from "./HealthPrivacyContent";
import { HealthInstallGuide } from "./HealthInstallGuide";
import { NativeWalkingPanel } from '@/components/walking/NativeWalkingPanel';
import { HeartsNative } from '@/components/walking/HeartsEntry';
import "./senior-home.css";
import "./health-guide.css";

const subscribe = () => () => {};
const browser = () => false;
const nativePlatform = () => Capacitor.isNativePlatform();
const browserPhone = (): "ios" | "android" => /Android/i.test(navigator.userAgent) ? "android" : "ios";
const serverPhone = () => "ios" as const;

export function HealthConnectionPage() {
  const native = useSyncExternalStore(subscribe, nativePlatform, browser);
  const preferredPhone = useSyncExternalStore(subscribe, browserPhone, serverPhone);
  const [selectedPhone, setPhone] = useState<"ios" | "android" | null>(null);
  const phone = selectedPhone ?? preferredPhone;
  const [walkingSession,setWalkingSession]=useState("disconnected");
  const onWalkingLink=useCallback((link:RankingLinkStatus)=>setWalkingSession(link.linked&&link.confirmed&&!link.revokePending?`${link.publicId}:${link.expiresAt}:${link.sharingScope}`:"disconnected"),[]);
  const [webError, setWebError] = useState(false);
  return <main className="bapmunna-senior-home bapmunna-health-guide flex flex-1 flex-col px-[24px] py-[24px]">
    <Logo />
    <div className="mt-6 flex items-center justify-between gap-[12px]">
      <h1 className="text-[30px] leading-snug font-extrabold text-cocoa">오늘의 걸음도<br />함께 챙겨요</h1>
      <Mascot className="h-[96px] w-[96px] shrink-0" />
    </div>
    <p className="mt-4 text-2xl leading-relaxed text-muted">{native ? "내 휴대폰의 오늘 걸음을 확인해요. 랭킹 공유는 따로 선택할 수 있어요." : "웹에서는 예시 걸음으로 산책을 체험해요. 휴대폰의 건강 기록은 읽지 않아요."}</p>
    {native ? <div className="mt-6"><PhoneStepsCard demo={false} localOnly /></div> : <>
      <fieldset className="mt-6">
        <legend className="text-2xl font-bold text-cocoa">어떤 휴대폰을 쓰시나요?</legend>
        <div className="mt-3 flex flex-wrap gap-3">
          {([{value:"ios",label:"아이폰"},{value:"android",label:"갤럭시"}] as const).map(item => <label key={item.value} className={`flex min-h-16 min-w-[7rem] flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 p-3 text-2xl font-bold ${phone===item.value ? "border-cocoa bg-butter text-cocoa" : "border-line bg-paper text-muted"}`}>
            <input type="radio" name="health-phone" value={item.value} checked={phone===item.value} onChange={() => setPhone(item.value)} className="h-5 w-5 accent-[var(--color-cocoa)]" />{item.label}
          </label>)}
        </div>
      </fieldset>
      <HealthInstallGuide phone={phone} />
    </>}
    {native ? <><HeartsNative key={walkingSession}/><NativeWalkingPanel onLinkChange={onWalkingLink}/></> : null}
    {native ? <details className="mt-5 text-2xl leading-relaxed text-muted">
      <summary className="min-h-12 cursor-pointer py-2 font-bold text-cocoa">기록이 보이지 않을 때</summary>
      <p className="mt-3">{native && Capacitor.getPlatform() === "ios" ? "건강 앱에서 밥뭇나의 걸음수 읽기를 허용해 주세요." : "삼성 헬스의 걸음수 공유와 밥뭇나의 읽기 권한을 모두 확인해 주세요."}</p>
      <p className="mt-3">워치 기록은 휴대폰 건강 앱에 동기화된 뒤 표시돼요. 건강 앱을 연 다음 밥뭇나에서 다시 확인해 주세요.</p>
      <p className="mt-3">권한이 없거나 기록이 아직 없으면 0걸음으로 표시하지 않아요.</p>
    </details> : null}
    {native ? <details className="mt-4 text-2xl leading-relaxed text-cocoa">
      <summary className="min-h-12 cursor-pointer py-3 underline underline-offset-4">걸음수 개인정보 안내</summary>
      <HealthPrivacyContent />
    </details> : <Link href="/health/privacy" className="mt-4 min-h-12 py-3 text-2xl text-cocoa underline underline-offset-4">걸음수 개인정보 안내</Link>}
    {native ? <>
      <Button variant="outline" className="mt-4 min-h-16 text-2xl" onClick={() => {setWebError(false);void PhoneSteps.openWebApp().catch(() => setWebError(true));}}>밥뭇나 웹앱으로 돌아가기</Button>
      {webError ? <p role="alert" className="mt-3 text-2xl text-muted">브라우저를 열지 못했어요. 사용하던 밥뭇나 웹앱으로 돌아가 주세요.</p> : null}
    </> : <Link href="/s" className="mt-4 flex min-h-16 items-center justify-center rounded-full border-2 border-line px-4 py-3 text-2xl font-bold text-cocoa">어르신 화면으로 돌아가기</Link>}
  </main>;
}
