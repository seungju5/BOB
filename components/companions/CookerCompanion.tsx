'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { appPath } from '@/lib/app-path';
import './companions.css';

type Gesture = 'settle' | 'hello' | 'happy' | 'bow' | 'rest';
const greetings: { gesture: Gesture; text: string }[] = [
  { gesture: 'hello', text: '오늘도 반가워요.' },
  { gesture: 'happy', text: '작은 안부도 따뜻하게.' },
  { gesture: 'bow', text: '마음을 나눠 줘서 고마워요.' },
  { gesture: 'rest', text: '서두르지 않아도 괜찮아요.' },
];

/** Original pixels, with the lid articulated independently. No new image or animation library. */
export function CookerArt({ gesture = 'settle' }: { gesture?: Gesture }) {
  const id = useId().replaceAll(':', '');
  const art = appPath('/brand/rice-cooker-companion.png');
  // Contour surrounds only the open lid; the rice, face and pot remain intact.
  const lid = 'M307 598 L301 514 Q324 411 489 338 Q480 302 531 285 Q620 263 645 312 Q788 286 841 354 Q899 413 813 481 Q724 551 538 599 L430 615 Z';
  return <svg className="cooker-art" data-gesture={gesture} viewBox="275 250 760 790" aria-hidden="true" focusable="false">
    <defs>
      <clipPath id={`${id}-lid`}><path d={lid}/></clipPath>
      <clipPath id={`${id}-pot`}><path clipRule="evenodd" d={`M0 0H1254V1254H0Z ${lid}`}/></clipPath>
    </defs>
    <g className="cooker-body">
      <image href={art} width="1254" height="1254" clipPath={`url(#${id}-pot)`}/>
      <g className="cooker-lid"><image href={art} width="1254" height="1254" clipPath={`url(#${id}-lid)`}/></g>
    </g>
    <g className="cooker-kindness" fill="currentColor"><path d="M940 440c-44-28-13-66 8-41 22-25 52 13 8 41l-8 7Z"/></g>
  </svg>;
}

/** Fits inside the meal card instead of adding a floating character or another home section. */
export function HomeMealCompanion() {
  const [greeting, setGreeting] = useState<{gesture: Gesture; text: string; key: number}>({gesture:'settle',text:'',key:0});
  const next = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  function greet() {
    const choice = greetings[next.current++ % greetings.length];
    setGreeting({...choice, key:next.current});
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setGreeting(previous => ({...previous, text:''})), 3400);
  }
  return <div className="meal-companion-heading">
    <div className="meal-companion-copy">
      <h2>오늘의 끼니</h2>
      <p className="meal-companion-caption" aria-hidden={Boolean(greeting.text)}>{greeting.text || '작은 소식도 다정하게'}</p>
      <span className="sr-only" role="status">{greeting.text}</span>
    </div>
    <button type="button" className="meal-companion-button" onClick={greet} aria-label="밥솥이에게 인사하기">
      <CookerArt key={greeting.key} gesture={greeting.gesture}/>
    </button>
  </div>;
}

/** Only mounted while data is actually absent. CSS delays decoration, never the data or navigation. */
export function HomeLoadingCompanion() {
  return <div className="home-loading-companion" role="status">
    <span className="home-loading-character"><CookerArt gesture="rest"/></span>
    <span>오늘의 안부를 불러오고 있어요.</span>
  </div>;
}
