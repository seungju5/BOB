'use client';
import Link from 'next/link';
import {useState} from 'react';
import {Logo,Mascot} from '@/components/Mascot';
import {walkingDemo} from '@/lib/walking/model';
import {useNow} from '@/lib/demo/store';
import {WalkingBoard} from './WalkingBoard';
import './walking.css';

export function WalkingDemo(){
  const [count,setCount]=useState(2400);
  const now=useNow(),board=now?walkingDemo(count,now):null;
  return <main className="bapmunna-walking"><header className="walking-header"><Logo/><Link href="/walking" className="walking-back">실제 참여 안내</Link></header>
    <div className="walking-hero"><div><span className="walking-eyebrow">순위가 바뀌는 모습을 살펴요</span><h1>산책 랭킹<br/>예시 체험</h1></div><Mascot variant="bunny" className="h-24 w-24"/></div>
    <aside className="walking-demo-notice"><strong>모든 이름과 걸음수는 예시예요.</strong><p>휴대폰 기록을 읽거나 실제 랭킹에 보내지 않아요.</p></aside>
    <section className="walking-card"><h2 className="walking-heading">내 예시 걸음수를 바꿔봐요</h2><label className="walking-slider-label" htmlFor="demo-step-count">{count.toLocaleString('ko-KR')}걸음</label><input id="demo-step-count" aria-label="예시 걸음수" type="range" min="0" max="8000" step="100" value={count} onChange={event=>setCount(Number(event.target.value))}/><div className="walking-demo-actions"><button onClick={()=>setCount(4800)}>공동 순위 보기</button><button onClick={()=>setCount(7000)}>1등 예시 보기</button></div></section>
    {board?<WalkingBoard board={board} demo/>:<p role="status">예시 순위를 준비하고 있어요…</p>}<Link href="/walking" className="walking-primary">실제 랭킹 참여 안내</Link><Link href="/more" className="walking-text-link">메뉴로 돌아가기</Link>
  </main>;
}
