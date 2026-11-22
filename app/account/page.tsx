"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button, PageHeader, buttonClass } from "@/components/ui";
import { useMode } from "@/lib/data/mode";
import { refreshFirebaseAccount, renameFirebaseProfile, useFirebaseAccount } from "@/lib/data/firebase";
import { ACCOUNT_CONSENT_VERSION, accountError, type AccountProfile, type FirebaseUser, type SavedPreferences } from "@/lib/firebase/bridge";

const dateFormat = new Intl.DateTimeFormat("ko-KR", {timeZone:"Asia/Seoul", dateStyle:"long", timeStyle:"short"});
function SavedTime({value}: {value?:string|null}) {
  if (!value || !Number.isFinite(Date.parse(value))) return <p className="mt-2 text-sm text-muted">저장 시각을 확인할 수 없어요.</p>;
  return <p className="mt-2 text-sm text-muted">마지막 저장 · <time dateTime={value}>{dateFormat.format(new Date(value))} (한국시간)</time></p>;
}
function Card({title, children}: {title:string; children:ReactNode}) {
  return <section className="rounded-3xl border border-line bg-paper p-5">
    <h2 className="mb-3 text-lg font-bold text-cocoa">{title}</h2>{children}
  </section>;
}

function ProfileCard({user,profile,revision}: {user:FirebaseUser;profile:AccountProfile;revision:number}) {
  const [draft,setDraft] = useState("");
  const [editing,setEditing] = useState<string|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const locked = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || !editing) return;
    const name = draft.trim();
    if (name.length < 2 || name.length > 30) { setError("이름을 2~30자로 입력해 주세요."); return; }
    locked.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await renameFirebaseProfile(name, user.uid, revision, editing);
      setEditing(null); setNotice("서버에서 저장한 이름을 확인했어요.");
    } catch (cause) { setError(accountError(cause)); }
    finally { locked.current = false; setBusy(false); }
  }
  return <Card title="보호자 정보">
    <p className="break-all text-sm text-muted">{user.email} · 이메일 인증 완료</p>
    <p className="mt-2 break-words text-xl font-bold text-cocoa">{profile.displayName}</p>
    <SavedTime value={profile.savedAt}/>
    {editing ? <form onSubmit={submit} className="mt-4 space-y-3">
      <label className="block font-semibold text-cocoa" htmlFor="guardian-display-name">보호자 이름</label>
      <input id="guardian-display-name" className="w-full rounded-xl border border-line bg-paper px-3 py-3 text-base text-cocoa" required minLength={2} maxLength={30} value={draft} disabled={busy} onChange={event=>{setDraft(event.target.value);setError("");}} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>{busy ? "저장 확인 중…" : "이름 저장"}</Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={()=>{setEditing(null);setError("");}}>취소</Button>
      </div>
    </form> : profile.revision ? <button type="button" className="mt-2 min-h-11 font-bold text-cocoa underline underline-offset-4" onClick={()=>{
      setDraft(profile.displayName);setEditing(profile.revision ?? null);setError("");setNotice("");
    }}>보호자 이름 수정</button> : null}
    {error && <p role="alert" className="mt-2 text-sm text-blush-deep">{error}</p>}
    {notice && <p role="status" className="mt-2 text-sm font-semibold text-cocoa">{notice}</p>}
  </Card>;
}

function StoredPreferences({saved}: {saved:SavedPreferences}) {
  const {household,settings,savedAt} = saved;
  const link = household && settings?.onboardingStep === 8 ? "/settings#life" : "/onboarding";
  return <>
    <Card title="우리 집 정보">
      {household ? <>
        <p className="break-words font-bold text-cocoa">{household.alias}</p>
        <p className="mt-1 text-cocoa">가구원 {household.residentCount}명 · 반려견 {household.hasPet ? "있음" : "없음"}</p>
        <SavedTime value={savedAt?.household}/>
      </> : <p className="text-cocoa">아직 저장한 가구 정보가 없어요.</p>}
      <Link className="mt-2 inline-flex min-h-11 items-center font-bold text-cocoa underline underline-offset-4" href={link}>{household ? "우리 집 정보 수정" : "우리 집 정보 입력"}</Link>
    </Card>
    <Card title="생활·알림 설정">
      {settings ? <>
        <p className="text-cocoa">끼니 시간대 {settings.windows.length}개 · 연속 미확인 {settings.missedMealsThreshold}끼</p>
        <p className="mt-1 text-cocoa">대표 연락처 {settings.phone ? "등록됨" : "미등록"}</p>
        <SavedTime value={savedAt?.settings}/>
      </> : <p className="text-cocoa">아직 저장한 생활·알림 설정이 없어요.</p>}
      {household && settings?.onboardingStep === 8 && <Link href="/settings#alerts" className="mt-2 inline-flex min-h-11 items-center font-bold text-cocoa underline underline-offset-4">설정 열기</Link>}
    </Card>
  </>;
}

export default function AccountPage() {
  const mode = useMode();
  const account = useFirebaseAccount(mode === "live");
  const [reading,setReading] = useState(false);
  const [failure,setFailure] = useState<{uid:string|null;message:string}|null>(null);
  const readingLock = useRef(false);
  async function reread() {
    if (readingLock.current) return;
    const uid = account.user?.uid ?? null;
    readingLock.current = true; setReading(true); setFailure(null);
    try { await refreshFirebaseAccount(); }
    catch (cause) { setFailure({uid,message:accountError(cause)}); }
    finally { readingLock.current = false; setReading(false); }
  }
  const live = mode === "live";
  const {user,profile,saved} = account;
  const ready = live && user?.verified && profile?.ownerUid === user.uid && profile.consentVersion === ACCOUNT_CONSENT_VERSION && saved;
  const waiting = mode === undefined || (live && (account.loading || user === undefined) && !account.error);
  const error = live ? account.error || (failure && failure.uid === (user?.uid ?? null) ? failure.message : null) : null;
  const retry = <Button type="button" variant="outline" disabled={reading} onClick={reread}>{reading ? "확인 중…" : "서버에서 다시 확인"}</Button>;
  return <main className="flex flex-col pb-8">
    <PageHeader title="내 정보 센터" back={ready && account.view?.onboardingStep === 8 ? "/more" : "/start"}/>
    <div className="flex flex-col gap-4 px-5 pt-2">
      {live && account.operator && <Link className={buttonClass("outline")} href="/admin/">팀 운영 스튜디오 열기</Link>}
      {error ? <><p role="alert" className="rounded-2xl bg-butter-soft p-4 text-cocoa">{error}</p>{retry}</>
      : waiting ? <p role="status" className="p-4 text-cocoa">온라인 저장 정보를 확인하고 있어요…</p>
      : ready ? <>
        <p className="text-base text-muted">내 계정으로 서버에 저장한 정보예요. 다른 기기에서도 같은 계정으로 확인할 수 있어요.</p>
        <ProfileCard key={user.uid + ":" + account.revision} user={user} profile={profile} revision={account.revision}/>
        <StoredPreferences saved={saved}/>
        {retry}
        <Link href="/login/?next=account" className="mx-auto inline-flex min-h-11 items-center font-bold text-cocoa underline underline-offset-4">계정 전환</Link>
      </> : <Card title={mode === "demo" ? "예시 체험 중" : "내 계정으로 로그인"}>
        <p className="text-cocoa">{mode === "demo" ? "체험에서 입력한 정보는 이 브라우저에만 저장돼요. 온라인 저장 내역은 본인 계정으로 확인해 주세요." : "이메일을 확인하고 로그인하면 보호자 정보와 가구별 저장 내역을 볼 수 있어요."}</p>
        <Link href="/login/?next=account" className={buttonClass("dark","mt-4")}>로그인하고 내 정보 보기</Link>
      </Card>}
    </div>
  </main>;
}
