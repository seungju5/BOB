"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button, PageHeader, buttonClass } from "@/components/ui";
import { useMode, useSession } from "@/lib/data/mode";
import { readOwnAccount, saveOwnName, type OwnAccount } from "@/lib/supabase/account";
import { operatorAllowed, studioError } from "@/lib/supabase/studio";

const dateFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "long", timeStyle: "short" });
function SavedTime({ at }: { at: string | null }) {
  return at && Number.isFinite(Date.parse(at))
    ? <p className="mt-2 text-sm text-muted">마지막 저장 · <time dateTime={at}>{dateFormat.format(new Date(at))} (한국시간)</time></p>
    : null;
}
function Card({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-3xl border border-line bg-paper p-5"><h2 className="mb-3 text-lg font-bold text-cocoa">{title}</h2>{children}</section>;
}
const textLink = "mt-2 inline-flex min-h-11 items-center font-bold text-cocoa underline underline-offset-4";

function SavedAccount({ uid, email, verified }: { uid: string; email?: string; verified: boolean }) {
  const [account, setAccount] = useState<OwnAccount | null>(null);
  const [operator, setOperator] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const writing = useRef(false);

  const load = useCallback((active: () => boolean) => readOwnAccount(uid)
    .then(data => { if (active()) setAccount(data); })
    .catch(e => { if (active()) { setAccount(null); setFailure(studioError(e)); } })
    .finally(() => { if (active()) setBusy(false); }), [uid]);
  useEffect(() => {
    let here = true;
    void load(() => here);
    void operatorAllowed().then(value => { if (here) setOperator(value); }).catch(() => {});
    return () => { here = false; };
  }, [load]);
  function read() {
    setBusy(true); setFailure(""); setNotice(""); setDraft(null);
    void load(() => true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft === null || !account || writing.current) return;
    writing.current = true;
    setBusy(true); setFailure(""); setNotice("");
    try {
      const confirmed = await saveOwnName(uid, account, draft);
      setAccount(confirmed); setDraft(null); setNotice("서버에서 저장한 이름을 확인했어요.");
    } catch (error) {
      setFailure(studioError(error));
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }

  return <>
    {operator && <Link className={buttonClass("outline")} href="/admin">팀 운영 스튜디오 열기</Link>}
    <p className="text-base text-muted">지금 로그인한 계정으로 서버에 저장한 정보예요.</p>
    {failure && <p role="alert" className="rounded-2xl bg-butter-soft p-4 text-cocoa">{failure}</p>}
    {notice && <p role="status" className="text-cocoa">{notice}</p>}
    {busy && !account && <p role="status" className="p-4 text-cocoa">저장한 정보를 확인하고 있어요…</p>}
    {account && <>
      <Card title="보호자 정보">
        <p className="break-all text-sm text-muted">{email ?? "로그인한 계정"}{verified && " · 이메일 인증 완료"}</p>
        <p className="mt-2 text-xl font-bold text-cocoa">{account.profile?.name || "아직 이름을 입력하지 않았어요."}</p>
        <SavedTime at={account.profile?.savedAt ?? null} />
        {draft === null ? <button type="button" className={textLink} disabled={busy} onClick={() => { setDraft(account.profile?.name ?? ""); setNotice(""); }}>보호자 이름 {account.profile?.name ? "수정" : "등록"}</button>
          : <form onSubmit={save} className="mt-4 space-y-3">
            <label htmlFor="guardian-name" className="block font-bold text-cocoa">보호자 이름</label>
            <input id="guardian-name" className="w-full rounded-xl border border-line bg-paper p-3 text-cocoa" required minLength={2} maxLength={30} value={draft} disabled={busy} onChange={e => setDraft(e.target.value)} />
            <div className="flex gap-2"><Button type="submit" disabled={busy}>{busy ? "확인 중…" : "이름 저장"}</Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setDraft(null)}>취소</Button></div>
          </form>}
      </Card>
      {account.households.length === 0 ? <Card title="우리 집 정보"><p>아직 연결된 가구가 없어요.</p><Link href="/onboarding" className={textLink}>우리 집 정보 입력</Link></Card> : account.households.map(home =>
        <Card key={home.id} title={home.alias || "우리 집 정보"}>
          <p className="text-cocoa">{home.relation} · 가구원 {home.residents}명 · 반려동물 {home.pet ? "있음" : "없음"}</p>
          <SavedTime at={home.householdAt}/>
          <h3 className="mt-4 font-bold text-cocoa">생활·알림 설정</h3>
          <p className="mt-1 text-cocoa">{home.windows === null ? "끼니 시간대 미등록" : `끼니 시간대 ${home.windows}개`} · {home.threshold === null ? "알림 기준 미등록" : `연속 미확인 ${home.threshold}끼`}</p>
          <p className="text-cocoa">대표 연락처 {home.contact ? "등록됨" : "미등록"}</p>
          <SavedTime at={home.settingsAt}/>
        </Card>)}
      {account.households.length > 0 && <Link href={account.households.some(h => h.step >= 8) ? "/settings" : "/onboarding"} className={textLink}>현재 가구의 설정 열기</Link>}
    </>}
    <Button type="button" variant="outline" disabled={busy} onClick={read}>서버에서 다시 확인</Button>
    <Link href="/login?next=account&switch=1" className={textLink}>계정 전환</Link>
  </>;
}

export default function AccountPage() {
  const mode = useMode();
  const session = useSession(mode !== "demo");
  const demo = mode === "demo";
  const loading = mode === undefined || (!demo && session === undefined);
  return <main className="flex flex-col pb-8">
    <PageHeader title="내 정보 센터" back="/more" />
    <div className="flex flex-col gap-4 px-5 pt-2">
      {loading ? <p role="status">로그인을 확인하고 있어요…</p>
        : !demo && session ? <SavedAccount key={session.user.id} uid={session.user.id} email={session.user.email} verified={!!session.user.email_confirmed_at} />
        : <Card title={demo ? "예시 체험 중" : "내 계정으로 로그인"}>
          <p className="text-cocoa">{demo ? "체험 기록은 이 브라우저에 저장돼요. 온라인 기록은 로그인한 계정에서 확인할 수 있어요." : "로그인하면 내 보호자 이름과 우리 집 설정을 확인할 수 있어요."}</p>
          <Link href="/login?next=account" className={buttonClass("dark", "mt-4")}>로그인하고 내 정보 보기</Link>
        </Card>}
    </div>
  </main>;
}
