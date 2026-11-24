'use client';

import Link from 'next/link';
import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { Logo } from '@/components/Mascot';
import { IconArrowRight, IconCheck } from '@/components/icons';
import {
  CATEGORIES, LOCAL_LOOK_KEY, STARTER_ITEMS, lookName, readLocalLook, saveWithWardrobeLock, type LookChanges,
} from '@/lib/walking/wardrobe';
import type { HeartCategory } from '@/packages/walking-hearts/core.mjs';
import { ItemArt, PartIcon, WarmingStage } from './WarmingArt';
import { WarmingWardrobe } from './WarmingWardrobe';

const changedEvent = 'warming-walk-look';
function followLook(notify: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === LOCAL_LOOK_KEY || event.key === null) notify(); };
  window.addEventListener('storage', storage);
  window.addEventListener(changedEvent, notify);
  return () => { window.removeEventListener('storage', storage); window.removeEventListener(changedEvent, notify); };
}
function followView(notify: () => void) {
  window.addEventListener('hashchange', notify);
  return () => window.removeEventListener('hashchange', notify);
}
const currentView = () => window.location.hash === '#trail' ? 'trail' : 'wardrobe';
const initialView = () => 'wardrobe';
const initialStored = () => null;

export function WarmingWalk() {
  const memory = useRef<string | null>(null);
  const getStored = useCallback(() => {
    if (memory.current !== null) return memory.current;
    try { return window.localStorage.getItem(LOCAL_LOOK_KEY); } catch { return null; }
  }, []);
  const stored = useSyncExternalStore(followLook, getStored, initialStored);
  const view = useSyncExternalStore(followView, currentView, initialView);
  const [category, setCategory] = useState<HeartCategory>('hat');
  const [walking, setWalking] = useState(true);
  const [notice, setNotice] = useState('');
  const title = useRef<HTMLHeadingElement>(null);
  const look = readLocalLook(stored);

  function navigate(to: 'trail' | 'wardrobe') {
    window.history.pushState(null, '', '#' + to);
    window.dispatchEvent(new Event('hashchange'));
    requestAnimationFrame(() => title.current?.focus({ preventScroll: true }));
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function openWardrobe(part: HeartCategory = 'hat') {
    setCategory(part);
    setNotice('');
    navigate('wardrobe');
  }

  function persist(changes: LookChanges) {
    const next = JSON.stringify({ ...readLocalLook(getStored()), ...changes });
    try {
      window.localStorage.setItem(LOCAL_LOOK_KEY, next);
      memory.current = null;
      setNotice('산책 차림을 이 브라우저에 저장했어요.');
    } catch {
      memory.current = next;
      setNotice('브라우저 저장이 꺼져 있어 이번 방문 동안 차림을 입어요.');
    }
    window.dispatchEvent(new Event(changedEvent));
    setWalking(true);
    navigate('trail');
    return true;
  }

  return <main className="warming-walk">
    <header className="ward-header">
      <Link href="/" aria-label="밥뭇나 홈"><Logo/></Link>
      <Link href="/more" className="ward-menu"><PartIcon part="menu"/>메뉴</Link>
    </header>
    <div className="ward-shell">
      <div className="ward-heading"><h1 ref={title} tabIndex={-1}>워밍이의 산책</h1>
        <nav className="ward-views" aria-label="워밍이의 산책 보기">
          <a href="#trail" aria-current={view === 'trail' ? 'page' : undefined} onClick={() => setNotice('')}><PartIcon part="trail"/>산책길</a>
          <a href="#wardrobe" aria-current={view === 'wardrobe' ? 'page' : undefined} onClick={() => setNotice('')}><PartIcon part="hanger"/>옷장</a>
        </nav>
      </div>
      {view === 'wardrobe' ?
        <WarmingWardrobe equipped={look} items={STARTER_ITEMS} initialCategory={category} onSave={changes => saveWithWardrobeLock('local', () => persist(changes))}
          onCancel={() => { setNotice(''); navigate('trail'); }}/> :
        <div className="ward-editor ward-trail-view">
          <WarmingStage look={look} walking={walking} toggleWalk={() => setWalking(!walking)}/>
          <section className="ward-picker ward-saved" aria-label="저장한 산책 차림">
            <h2><PartIcon part="hanger"/>오늘의 차림</h2>
            <div className="ward-worn">
              {CATEGORIES.map(part => <button type="button" key={part.id} onClick={() => openWardrobe(part.id)}
                aria-label={part.name + ' 바꾸기 · ' + lookName(part.id, look[part.id])}>
                <span className="ward-worn-art"><ItemArt category={part.id} id={look[part.id]}/></span>
                <span><small>{part.name}</small><strong>{lookName(part.id, look[part.id])}</strong></span>
                <IconArrowRight/>
              </button>)}
            </div>
            <p className="ward-notice" role="status">{notice && <><IconCheck/>{notice}</>}</p>
            <button type="button" className="ward-primary" onClick={() => openWardrobe()}><span>옷장 열기</span><PartIcon part="hanger"/></button>
          </section>
        </div>}
      <footer className="ward-footer">
        <span>산책 차림은 이 브라우저에 저장해요.</span>
        <div><Link href="/walking/demo">산책 하트 예시 체험<IconArrowRight/></Link>
          <Link href="/walking/connect">걸음수 연결 안내<IconArrowRight/></Link></div>
      </footer>
    </div>
  </main>;
}
