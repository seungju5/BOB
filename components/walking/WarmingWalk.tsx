'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { Logo } from '@/components/Mascot';
import { IconArrowRight, IconCheck } from '@/components/icons';
import {
  CATEGORIES, LOCAL_LOOK_KEY, LOCAL_WARDROBE_ITEMS, TRAIL_STAMPS, TRAIL_STAMP_KEY,
  lookName, readLocalLook, saveWithWardrobeLock, type LookChanges,
} from '@/lib/walking/wardrobe';
import type { HeartCategory } from '@/packages/walking-hearts/core.mjs';
import { ItemArt, PartIcon, WarmingStage } from './WarmingArt';
import { WarmingWardrobe } from './WarmingWardrobe';

const changedEvent = 'warming-walk-look';
function followLook(notify: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === null || event.key === LOCAL_LOOK_KEY || event.key.startsWith(TRAIL_STAMP_KEY)) notify();
  };
  window.addEventListener('storage', storage);
  window.addEventListener(changedEvent, notify);
  return () => { window.removeEventListener('storage', storage); window.removeEventListener(changedEvent, notify); };
}
function followView(notify: () => void) {
  window.addEventListener('hashchange', notify);
  window.addEventListener('popstate', notify);
  return () => { window.removeEventListener('hashchange', notify); window.removeEventListener('popstate', notify); };
}
const currentView = () => window.location.hash === '#trail' ? 'trail' : 'wardrobe';
const initialView = () => 'wardrobe';
const initialStored = () => null;
const noStamps = () => '';

export function WarmingWalk() {
  const memory = useRef<string | null>(null);
  const sessionStamps = useRef(new Set<string>());
  const getStamps = useCallback(() => {
    const visited = new Set(sessionStamps.current);
    try {
      for (const stamp of TRAIL_STAMPS) {
        if (window.localStorage.getItem(TRAIL_STAMP_KEY + stamp.id) === '1') visited.add(stamp.id);
      }
    } catch { /* Keep stamps for this visit when browser storage is unavailable. */ }
    return TRAIL_STAMPS.filter(stamp => visited.has(stamp.id)).map(stamp => stamp.id).join(',');
  }, []);
  const getStored = useCallback(() => {
    if (memory.current !== null) return memory.current;
    try { return window.localStorage.getItem(LOCAL_LOOK_KEY); } catch { return null; }
  }, []);
  const stored = useSyncExternalStore(followLook, getStored, initialStored);
  const view = useSyncExternalStore(followView, currentView, initialView);
  const stampIds = useSyncExternalStore(followLook, getStamps, noStamps);
  const visited = stampIds ? stampIds.split(',') : [];
  const canWearCape = visited.length === TRAIL_STAMPS.length;
  const [category, setCategory] = useState<HeartCategory>('hat');
  const [walking, setWalking] = useState(true);
  const [notice, setNotice] = useState('');
  const title = useRef<HTMLHeadingElement>(null);
  const look = readLocalLook(stored, canWearCape);
  const background = look.background;

  useEffect(() => {
    if (view !== 'trail') return;
    const stamp = TRAIL_STAMPS.find(trail => trail.background === background);
    if (!stamp || getStamps().split(',').includes(stamp.id)) return;
    // One key per virtual trail. Two tabs collecting different stamps cannot overwrite one another.
    try { window.localStorage.setItem(TRAIL_STAMP_KEY + stamp.id, '1'); }
    catch { sessionStamps.current.add(stamp.id); }
    window.dispatchEvent(new Event(changedEvent));
  }, [view, background, getStamps]);

  function navigate(to: 'trail' | 'wardrobe', outfit?: 'star-cape') {
    const url = new URL(window.location.href);
    if (outfit) url.searchParams.set('outfit', outfit);
    else url.searchParams.delete('outfit');
    url.hash = to;
    window.history.pushState(window.history.state, '', url);
    window.dispatchEvent(new Event('hashchange'));
    requestAnimationFrame(() => title.current?.focus({ preventScroll: true }));
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function followLink(event: MouseEvent<HTMLAnchorElement>, to: 'trail' | 'wardrobe', outfit?: 'star-cape') {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setNotice('');
    navigate(to, outfit);
  }

  function openWardrobe(part: HeartCategory = 'hat') {
    setCategory(part);
    setNotice('');
    navigate('wardrobe');
  }

  function persist(changes: LookChanges) {
    const earned = getStamps().split(',').filter(Boolean).length === TRAIL_STAMPS.length;
    if (changes.outfit === 'star-cape' && !earned) return false;
    const next = JSON.stringify({ ...readLocalLook(getStored(), earned), ...changes });
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
          <a href="#trail" aria-current={view === 'trail' ? 'page' : undefined} onClick={event => followLink(event, 'trail')}><PartIcon part="trail"/>산책길</a>
          <a href="#wardrobe" aria-current={view === 'wardrobe' ? 'page' : undefined} onClick={event => followLink(event, 'wardrobe')}><PartIcon part="hanger"/>옷장</a>
        </nav>
      </div>
      <Link href="/walking/steps/" className="ward-motion-link">
        <PartIcon part="trail"/><span><strong>내 걸음 측정</strong><small>휴대폰으로 걷고 내 산책 기록 보기</small></span><IconArrowRight aria-hidden/>
      </Link>
      {view === 'wardrobe' ?
        <WarmingWardrobe equipped={look} items={LOCAL_WARDROBE_ITEMS} trailCollection={{visited:visited.length,canWearCape}} initialCategory={category} onSave={changes => saveWithWardrobeLock('local', () => persist(changes))}
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
            <section className="ward-stamps" aria-label="산책길 도장">
              <h3>산책 수첩 <span>{visited.length} / {TRAIL_STAMPS.length}</span></h3>
              <ul>{TRAIL_STAMPS.map(stamp => {
                const collected = visited.includes(stamp.id);
                return <li key={stamp.id} data-collected={collected}>
                  <span className="ward-stamp-art"><ItemArt id={stamp.background} category="background"/>{collected && <IconCheck aria-hidden/>}</span>
                  <span>{stamp.name}</span><span className="sr-only">{collected ? ' · 방문함' : ' · 아직 방문 전'}</span>
                </li>;
              })}</ul>
              <p role="status">{canWearCape ? '세 길의 도장이 모였어요. 별자수 망토가 내 옷장에 들어왔어요.' : '워밍이와 세 산책길을 방문하면 별자수 망토를 받을 수 있어요.'}</p>
              {canWearCape ? <a href="?outfit=star-cape#wardrobe" onClick={event => followLink(event, 'wardrobe', 'star-cape')}>별자수 망토 입어 보기 <IconArrowRight aria-hidden/></a> :
                <button type="button" onClick={() => openWardrobe('background')}>다른 산책길 고르기 <IconArrowRight aria-hidden/></button>}
            </section>
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
