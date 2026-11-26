'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Logo } from '@/components/Mascot';
import { IconChevronLeft, IconClock, IconSmartphone } from '@/components/icons';
import { BrowserWalkSession, initialWalkScreen, type WalkPhase } from '@/lib/walking/motion-session';
import type { MotionWalk } from '@/lib/walking/motion-diary';
import styles from './motion-walk.module.css';

const messages: Record<WalkPhase, string> = {
  idle: '휴대폰을 들고 산책을 시작해 보세요.',
  permission: '휴대폰에서 동작 접근을 허용해 주세요.',
  waiting: '휴대폰의 움직임 센서를 확인하고 있어요.',
  measuring: '측정 중이에요. 처음 몇 걸음은 함께 반영돼요.',
  quiet: '다음 움직임을 기다려요. 이 화면에서 다시 걸으면 측정이 이어져요.',
  finishing: '산책 기록을 확인하고 있어요.',
  finished: '산책 측정을 마쳤어요.',
  hidden: '산책 화면을 벗어나 측정을 멈췄어요.',
  'no-signal': '움직임 신호가 오지 않아 멈췄어요. 휴대폰의 동작 센서 접근을 확인하고 다시 시작해 주세요.',
  denied: '동작 접근이 꺼져 있어요. 브라우저의 사이트 권한에서 동작 센서를 허용하고 다시 시작해 주세요.',
  unsupported: '이 환경에서는 움직임 센서를 사용할 수 없어요. 휴대폰의 밥뭇나에서 열어 주세요.',
  occupied: '다른 산책 화면에서 측정 중이에요. 그 화면에서 측정을 마치거나 닫은 뒤 잠시 후 다시 시작해 주세요.',
  'storage-error': '산책을 저장할 수 없어 측정을 멈췄어요. 브라우저 저장 권한과 남은 공간을 확인해 주세요.',
};

function HistoryRow({ walk }: { walk: MotionWalk }) {
  const date = new Date(walk.startedAt);
  return <li>
    <time dateTime={date.toISOString()}>{date.toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric' })} <small>{date.toLocaleTimeString('ko-KR', { hour:'numeric', minute:'2-digit' })} 시작</small></time>
    <strong>{walk.steps.toLocaleString('ko-KR')}걸음</strong>
  </li>;
}

export function MotionWalkPage() {
  const [view, setView] = useState(initialWalkScreen);
  const [showAll, setShowAll] = useState(false);
  const session = useRef<BrowserWalkSession | null>(null);
  useEffect(() => {
    const current = new BrowserWalkSession(setView);
    session.current = current;
    return () => { current.dispose(); session.current = null; };
  }, []);
  const recording = view.phase === 'waiting' || view.phase === 'measuring' || view.phase === 'quiet';
  const busy = view.phase === 'permission' || view.phase === 'finishing';
  const complete = view.phase === 'hidden' || view.phase === 'finished' || view.phase === 'no-signal';
  return <main className={styles.page}>
    <header className={styles.header}><Link href="/" aria-label="밥뭇나 홈"><Logo/></Link><Link href="/walking/"><IconChevronLeft aria-hidden/>워밍이의 산책</Link></header>
    <h1>내 걸음 측정</h1>
    <p className={styles.intro}>산책 화면을 열어 둔 동안 휴대폰의 움직임으로 걸음을 세요. 화면을 잠그거나 다른 앱으로 가면 측정이 멈춰요.</p>
    <section className={styles.counter} aria-labelledby="motion-walk-count-title">
      <div className={styles.source}><IconSmartphone aria-hidden/>내 휴대폰 센서</div>
      <h2 id="motion-walk-count-title">이번 산책</h2>
      <p className={styles.number} aria-label={view.steps === null ? '측정값 없음' : '이번 산책 '+view.steps+'걸음'}>
        <strong>{view.steps === null ? '—' : view.steps.toLocaleString('ko-KR')}</strong> 걸음
      </p>
      <p role="status" className={styles.status}>{messages[view.phase]} {complete && (view.steps ?? 0) > 0 ? '걸은 기록은 이 기기에 저장했어요.' : complete && view.steps === 0 ? '감지된 걸음이 없어요.' : ''}</p>
      {view.pendingSave
        ? <button type="button" className={styles.primary} disabled={busy} onClick={() => void session.current?.retrySave()}>기록 다시 저장</button>
        : recording
          ? <button type="button" className={styles.stop} onClick={() => session.current?.stop()}>산책 마치기</button>
          : <button type="button" className={styles.primary} disabled={busy} onClick={() => void session.current?.start()}>{busy ? '확인 중…' : '산책 측정 시작'}</button>}
    </section>
    <section className={styles.history} aria-labelledby="motion-history-title">
      <h2 id="motion-history-title"><IconClock aria-hidden/>내 산책 기록</h2>
      <p>날짜와 걸음수는 이 기기의 밥뭇나에 저장해요.</p>
      {view.history === 'loading' ? <p>기록을 불러오고 있어요.</p> : view.history === 'error' ? <p>기록을 열 수 없어요. <button type="button" className={styles.textButton} onClick={() => void session.current?.refresh()}>다시 확인</button></p>
        : view.walks.length ? <><ul>{(showAll ? view.walks : view.walks.slice(0, 4)).map(walk => <HistoryRow key={walk.id} walk={walk}/>)}</ul>
          {view.walks.length > 4 && <button type="button" className={styles.textButton} onClick={() => setShowAll(!showAll)}>{showAll ? '최근 기록만 보기' : '전체 산책 보기'}</button>}</>
        : <p className={styles.empty}>{recording && (view.steps ?? 0) > 0 ? '산책을 마치면 여기에 보여요.' : '아직 저장한 산책이 없어요.'}</p>}
    </section>
    <footer className={styles.footer}><Link href="/health/privacy/">걸음수 이용 안내</Link><Link href="/walking/demo/">가상 걸음 예시 체험</Link></footer>
  </main>;
}
