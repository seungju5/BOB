'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMode, useSession } from '@/lib/data/mode';
import { appPath } from '@/lib/app-path';
import type { Studio } from '@/lib/supabase/studio-types';
import { operatorAllowed, signOutOnThisDevice, studio, studioError } from '@/lib/supabase/studio';
import {
  IconChart,
  IconFile,
  IconLock,
  IconHome,
  IconChevronLeft,
  IconSettings,
} from '@/components/icons';
import { StudioDashboard, StudioDirectory, StudioDetails } from './StudioViews';

export type StudioTab = 'overview' | 'members' | 'profiles';
const pages = [
  { id: 'overview', label: '개요', title: '운영 개요', Icon: IconChart },
  { id: 'members', label: '가입자', title: '가입자 관리', Icon: IconLock },
  { id: 'profiles', label: '저장 데이터', title: '저장 데이터', Icon: IconFile },
] as const;
function Brand() {
  return (
    <span className="studio-brand">
      <span className="studio-mark">
        <Image src={appPath("/brand/rice-logo.png")} alt="" width={36} height={36} />
      </span>
      <b>밥뭇나</b>
      <span>Studio</span>
    </span>
  );
}
function Gate({
  waiting,
  denied,
  error,
  retry,
}: {
  waiting: boolean;
  denied: boolean;
  error: string;
  retry: () => void;
}) {
  return (
    <main data-operator-studio className="studio-root">
      <header className="studio-top">
        <Brand />
        <Link className="studio-gateReturn" href="/start/">
          밥뭇나로 돌아가기
        </Link>
      </header>
      <div className="studio-gate">
        <section className="studio-gateCard">
          <span className="studio-gateIcon">
            <IconLock />
          </span>
          <h1>
            {waiting
              ? '운영 권한 확인 중'
              : error
                ? '권한을 확인할 수 없습니다'
                : denied
                  ? '운영 권한이 필요합니다'
                  : '팀 운영자 로그인'}
          </h1>
          <p>
            {error ||
              (waiting
                ? '팀 계정의 등록 상태를 확인하고 있습니다.'
                : denied
                  ? '이 계정에는 운영자 권한이 없습니다. 등록된 팀 계정으로 로그인해 주세요.'
                  : '등록된 팀 이메일로 로그인하면 가입 현황과 저장 데이터를 관리할 수 있습니다.')}
          </p>
          {error && (
            <button className="studio-primary" onClick={retry}>
              다시 확인
            </button>
          )}
          {!waiting && (
            <Link className={error ? 'studio-subButton' : 'studio-primary'} href={denied ? '/login/?next=studio&switch=1' : '/login/?next=studio'}>
              {denied ? '계정 전환' : '이메일로 로그인'}
            </Link>
          )}
        </section>
      </div>
    </main>
  );
}
export function OperatorConsole() {
  const mode = useMode();
  const session = useSession(mode !== 'demo');
  const uid = mode === 'demo' ? undefined : session?.user.id;
  const [attempt, setAttempt] = useState(0);
  const [gate, setGate] = useState<{ uid: string; allowed: boolean; error: string } | null>(null);

  useEffect(() => {
    if (!uid) return;
    let live = true;
    let generation = 0;
    const check = async () => {
      const current = ++generation;
      try {
        const allowed = await operatorAllowed();
        if (live && current === generation) setGate({ uid, allowed, error: '' });
      } catch (cause) {
        if (live && current === generation) setGate({ uid, allowed: false, error: studioError(cause) });
      }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    void check();
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(onVisible, 60000);
    return () => {
      live = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [uid, attempt]);

  const checked = uid && gate?.uid === uid ? gate : null;
  if (uid && checked?.allowed) {
    return <StudioWorkspace key={uid} api={studio} uid={uid} email={session?.user.email ?? ''} />;
  }
  return <Gate waiting={mode === undefined || (mode !== 'demo' && session === undefined) || (!!uid && !checked)}
    denied={!!checked && !checked.error} error={checked?.error ?? ''}
    retry={() => { setGate(null); setAttempt(n => n + 1); }} />;
}
function tabFromHash(): StudioTab {
  const id = window.location.hash.slice(1);
  return id === 'members' || id === 'profiles' ? id : 'overview';
}
export function StudioWorkspace({ api, uid, email }: { api: Studio; uid: string; email: string }) {
  const [tab, setTab] = useState<StudioTab>('overview'),
    [selected, setSelected] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0),
    [logoutError, setLogoutError] = useState('');
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const receive = () => {
      setTab(tabFromHash());
      setSelected(null);
    };
    receive();
    window.addEventListener('hashchange', receive);
    return () => window.removeEventListener('hashchange', receive);
  }, []);
  function navigate(next: StudioTab) {
    window.location.hash = next;
    setTab(next);
    setSelected(null);
  }
  function select(id: string) {
    returnFocus.current = document.activeElement as HTMLElement;
    setSelected(id);
  }
  const close = useCallback(() => {
    setSelected(null);
    requestAnimationFrame(() =>
      (returnFocus.current?.isConnected
        ? returnFocus.current
        : document.getElementById('studio-content')
      )?.focus(),
    );
  }, []);
  const section = pages.find((p) => p.id === tab)!;
  return (
    <main data-operator-studio className="studio-root">
      <a
        href="#studio-content"
        className="studio-skip"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('studio-content')?.focus();
        }}
      >
        본문으로 건너뛰기
      </a>
      <header className="studio-top">
        <Brand />
        <div className="studio-topRight">
          <span className="studio-identity" title={email} aria-label={email}>
            <span className="studio-avatar" aria-hidden="true">
              {email.slice(0, 1).toUpperCase()}
            </span>
            <span className="studio-email">{email}</span>
          </span>
          <button
            className="studio-subButton"
            onClick={() => void signOutOnThisDevice().catch((e) => setLogoutError(studioError(e)))}
          >
            로그아웃
          </button>
        </div>
      </header>
      <div className="studio-shell">
        <aside className="studio-side">
          <div className="studio-navLabel">워크스페이스</div>
          <nav aria-label="운영 메뉴">
            {pages.map(({ id, label, Icon }) => (
              <a
                key={id}
                href={'#' + id}
                aria-current={id === tab ? 'page' : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(id);
                }}
              >
                <Icon />
                {label}
              </a>
            ))}
          </nav>
          <Link href="/account/" className="studio-exit">
            <IconChevronLeft />내 정보 센터
          </Link>
        </aside>
        <div className="studio-canvas" id="studio-content" tabIndex={-1}>
          <div className="studio-breadcrumb">
            <IconHome /> Warming Up <span>/</span>
            {section.label}
          </div>
          <div className="studio-heading">
            <div>
              <h1>{section.title}</h1>
              <p>
                {tab === 'overview'
                  ? '가입과 프로필 저장 현황을 확인하세요.'
                  : tab === 'members'
                    ? '가입 이메일과 인증 상태를 확인하고 운영 기록을 관리하세요.'
                    : '보호자 프로필과 가구·설정의 마지막 저장 시각을 확인하세요.'}
              </p>
            </div>
            <button className="studio-subButton" onClick={() => setRefresh((v) => v + 1)}>
              <RefreshIcon />
              새로고침
            </button>
          </div>
          {logoutError && (
            <p className="studio-error" role="alert">
              {logoutError}
            </p>
          )}
          {tab === 'overview' ? (
            <StudioDashboard
              key={refresh}
              api={api}
              uid={uid}
              select={select}
              showMembers={() => navigate('members')}
            />
          ) : (
            <StudioDirectory
              key={tab}
              api={api}
              uid={uid}
              kind={tab}
              refresh={refresh}
              select={select}
            />
          )}
          <footer className="studio-footer">
            <IconSettings />
            밥뭇나 운영 스튜디오 <span>·</span> 시간 기준 한국 표준시
          </footer>
        </div>
      </div>
      {selected && (
        <StudioDetails
          key={selected}
          api={api}
          uid={uid}
          id={selected}
          close={close}
          saved={() => setRefresh((v) => v + 1)}
        />
      )}
    </main>
  );
}
function RefreshIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M6.3 7.3a7.3 7.3 0 0 1 12.3 0L20 10M4 14l1.4 2.7a7.3 7.3 0 0 0 12.3 0" />
    </svg>
  );
}
