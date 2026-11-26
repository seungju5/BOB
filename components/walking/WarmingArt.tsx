'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { IconHeart, IconPlay } from '@/components/icons';
import { appPath } from '@/lib/app-path';
import { CATEGORIES, lookName, type Look, type LookId } from '@/lib/walking/wardrobe';
import type { HeartCategory } from '@/packages/walking-hearts/core.mjs';
import { TrailSymbol } from './TrailSymbol';
import { DressedRabbit } from './DressedRabbit';

const asset = (name: string) => appPath('/walking/wardrobe/' + name + '.webp');
export const trailArt = (background: LookId | null) => asset('trail-' + (background ?? 'park'));

export function PartIcon({ part }: { part: HeartCategory | 'hanger' | 'pause' | 'menu' | 'pin' | 'trail' }) {
  if (part !== 'pause' && part !== 'menu' && part !== 'pin') return <TrailSymbol kind={part}/>;
  const paths = {
    pause: <><path d="M8.5 6v12M15.5 6v12" strokeWidth="3"/></>,
    menu: <><path d="M5 7h14M5 12h14M5 17h14"/></>,
    pin: <><path d="M18.5 10c0 4.7-6.5 10.3-6.5 10.3S5.5 14.7 5.5 10a6.5 6.5 0 1 1 13 0Z"/><circle cx="12" cy="10" r="2.1"/></>,
  };
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[part]}</svg>;
}

export function ItemArt({ category, id }: { category: HeartCategory; id: LookId | null }) {
  if (!id && category !== 'background') return <span className="ward-basic-art"><PartIcon part={category}/></span>;
  const part = id ?? 'park';
  return <Image src={asset('item-' + part)} unoptimized width={180} height={135} alt="" draggable={false}
    className={'ward-item-art ward-item-art-' + category}/>;
}

export function WarmingRabbit({ look }: { look: Look }) {
  return <DressedRabbit body={look.outfit ?? 'base'} hat={look.hat} accessory={look.accessory} asset={asset}
    label={'워밍이 · ' + CATEGORIES.map(({id}) => lookName(id, look[id])).join(' · ')}/>;
}

export function WarmingStage({ look, walking, toggleWalk }: { look: Look; walking: boolean; toggleWalk: () => void }) {
  const [greeting, setGreeting] = useState(false);
  useEffect(() => {
    if (!greeting) return;
    const timer = window.setTimeout(() => setGreeting(false), 900);
    return () => window.clearTimeout(timer);
  }, [greeting]);
  return <div className={'ward-stage' + (walking ? ' is-walking' : '')} data-trail={look.background ?? 'park'}>
    <Image alt="" fill sizes="(min-width: 760px) 530px, 100vw" src={trailArt(look.background)} unoptimized
      priority draggable={false} className="ward-stage-landscape"/>
    <span className="ward-place"><PartIcon part="pin"/>{lookName('background', look.background)}</span>
    <div className={'ward-stage-bunny' + (greeting ? ' is-greeting' : '')}>
      <WarmingRabbit look={look}/>
      <button type="button" className="ward-greet" aria-label="워밍이와 인사하기" title="워밍이와 인사하기" onClick={() => setGreeting(true)}/>
      {greeting && <span className="ward-greet-heart" aria-hidden="true"><IconHeart/></span>}
    </div>
    <span className="sr-only" role="status">{greeting ? '워밍이가 하트를 보냈어요.' : ''}</span>
    <button type="button" className="ward-play" onClick={toggleWalk} aria-pressed={walking} aria-label={walking ? '워밍이 동작 멈추기' : '워밍이 걷기'}>
      {walking ? <PartIcon part="pause"/> : <IconPlay/>}{walking ? '워밍이 멈추기' : '워밍이 걷기'}
    </button>
  </div>;
}
