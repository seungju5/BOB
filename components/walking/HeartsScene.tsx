/**
 * [EN] Animated walking bunny with scrolling 2-scene park panorama and 5-stage progress garden.
 * [KR] 벤치·튤립화단·이정표·우체통·다람쥐 배경이 실제로 흘러가는 걷기 토끼 장면 및 5단계 진행 정원 컴포넌트입니다.
 */
'use client';

import {useState} from 'react';
import {appPath} from '@/lib/app-path';
import {HEART_ITEMS,type HeartEquipment,type HeartSummary} from '@/packages/walking-hearts/core.mjs';
import {heartPathFill} from '@/lib/hearts/presentation';
import {BunnyWearOverlay,ParkTrailWonders} from './HeartsArt';

export function HeartIcon({filled=false,className=''}:{filled?:boolean;className?:string}){
  return <svg className={`heart-symbol ${filled?'is-filled':''} ${className}`} viewBox="0 0 40 40" aria-hidden="true"><path d="M20 35C17 32 4 24 4 14a9 9 0 0 1 16-6 9 9 0 0 1 16 6c0 10-13 18-16 21Z"/></svg>;
}

export function BunnyScene({equipped,compact=false,children}:{equipped:HeartEquipment;summary?:HeartSummary;compact?:boolean;children?:React.ReactNode}){
  const [hopping,setHopping]=useState(false);
  function triggerHop(){
    setHopping(true);
    window.setTimeout(()=>setHopping(false),720);
  }
  return <div
    className={`hearts-scene ${compact?'is-compact':''} ${equipped.background==='autumn'?'is-autumn':''} ${hopping?'is-hopping':''}`}
    onClick={triggerHop}
  >
    {/* Seamless 2-scene panoramic park strip (Bench & Trees -> Tulip Garden, Signpost, Red Postbox & Squirrel) */}
    <div className="hearts-panorama-track">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={appPath('/walking/park-panorama.jpg')} width="2508" height="1254" alt="공원 산책길을 걷는 밥뭇나 토끼" className="hearts-scene-art"/>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={appPath('/walking/park-panorama.jpg')} width="2508" height="1254" alt="" aria-hidden="true" className="hearts-scene-art"/>
    </div>
    <ParkTrailWonders/>
    <div className="hearts-walker" aria-hidden="true">
      <span className="hearts-walker-shadow"/>
      <span className="hearts-foot-puff hearts-foot-puff-a"/>
      <span className="hearts-foot-puff hearts-foot-puff-b"/>
      <span className="hearts-step-heart">♥</span>
      <div className="hearts-walker-rig">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={appPath('/walking/bunny-leg-back.png')} width="370" height="620" alt="" className="hearts-rig-part hearts-rig-leg-back"/>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={appPath('/walking/bunny-leg-front.png')} width="370" height="620" alt="" className="hearts-rig-part hearts-rig-leg-front"/>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={appPath('/walking/bunny-upper.png')} width="370" height="620" alt="" className="hearts-rig-part hearts-rig-upper"/>
        <BunnyWearOverlay equipped={equipped}/>
      </div>
    </div>
    {equipped.background==='autumn'?<div className="hearts-autumn-leaves" aria-hidden="true"><span>🍂</span><span>🍁</span><span>🍂</span></div>:null}
    {children}
    {equipped.background==='autumn'?<span className="hearts-season">가을 산책길</span>:null}
  </div>;
}

export function HeartsGarden({summary}:{summary:HeartSummary}){
  const progress=summary.percent??0;
  const fill=heartPathFill(summary.percent);
  const completed=summary.percent!==null&&summary.percent>=100;
  return <section className="hearts-garden" aria-label="오늘의 산책 진행">
    <BunnyScene equipped={summary.equipped} summary={summary}>
      <div className="hearts-scene-title">
        <h1>오늘의 산책</h1>
        <p>오늘 걸음 수</p>
        <strong><span className="hearts-shoe" aria-hidden="true">👟</span> {summary.count===null?'—':summary.count.toLocaleString('ko-KR')}</strong>
        <span className="hearts-goal">{summary.count===null?'오늘 기록을 기다려요':`내 목표 ${summary.goal.toLocaleString('ko-KR')}걸음 · ${Math.floor(progress)}%`}</span>
      </div>
    </BunnyScene>
    <div className="hearts-path" role="group" aria-label="자동으로 채워지는 다섯 단계">
      <div className="hearts-track" aria-hidden="true">
        <span style={{width:`${fill}%`}}/>
      </div>
      <ol className="hearts-stages">{summary.milestones.map((stage,index)=><li key={stage.id} className={stage.achieved?'is-done':''}>
        <span className="hearts-node" aria-hidden="true">{stage.achieved?'✓':''}</span>
        <strong>{index===0?<><span aria-hidden="true">🍚</span><span>취사 소식</span></>:`${stage.id}%`}</strong>
        <HeartIcon filled={stage.achieved}/>
        <span className="sr-only">{stage.achieved?'달성':'기다리는 중'}</span>
      </li>)}</ol>
      <div className="hearts-copy-split">
        <span className="hearts-copy-pill">{completed?'오늘의 목표를 채웠어요.':'하트는 저절로 채워져요.'}</span>
        <p className="hearts-garden-copy">{completed?'편하게 쉬어도 좋아요.':'내 속도로 걸어요.'}</p>
      </div>
    </div>
  </section>;
}

export function EquippedNames({equipped}:{equipped:HeartEquipment}){
  const names=Object.values(equipped).filter(Boolean).map(id=>HEART_ITEMS.find(item=>item.id===id)?.name).filter(Boolean);
  return <p className="hearts-small">{names.length?names.join(' · '):'토끼의 기본 산책 차림이에요.'}</p>;
}
