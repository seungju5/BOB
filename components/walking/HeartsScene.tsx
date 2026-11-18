/**
 * [EN] Animated walking bunny scene and 5-stage progress garden for Bapmunna Option B.
 * [KR] 밥뭇나 B안('오늘의 산책')의 실시간 걷기 애니메이션 토끼 장면과 5단계 진행 정원 컴포넌트입니다.
 */
'use client';

import {useState} from 'react';
import {appPath} from '@/lib/app-path';
import {HEART_ITEMS,type HeartEquipment,type HeartSummary} from '@/packages/walking-hearts/core.mjs';
import {heartPathFill} from '@/lib/hearts/presentation';
import {BunnyWearOverlay,ParkTrailWonders} from './HeartsArt';

const TRAIL_NOTES=[
  '산들바람이 발걸음 끝에 살랑 내려앉아요 🌿',
  '길가 다람쥐도 도토리를 들고 응원해요 🐿️',
  '한 걸음 내디딜 때마다 마음이 한결 가벼워져요 ✨',
  '따스한 햇살 아래, 오늘 보폭이 참 곱네요 ☀️',
];

export function HeartIcon({filled=false,className=''}:{filled?:boolean;className?:string}){
  return <svg className={`heart-symbol ${filled?'is-filled':''} ${className}`} viewBox="0 0 40 40" aria-hidden="true"><path d="M20 35C17 32 4 24 4 14a9 9 0 0 1 16-6 9 9 0 0 1 16 6c0 10-13 18-16 21Z"/></svg>;
}

export function BunnyScene({equipped,summary,compact=false,children}:{equipped:HeartEquipment;summary?:HeartSummary;compact?:boolean;children?:React.ReactNode}){
  const [hopIndex,setHopIndex]=useState(0);
  const [hopping,setHopping]=useState(false);
  function triggerHop(){
    setHopIndex(prev=>(prev+1)%TRAIL_NOTES.length);
    setHopping(true);
    window.setTimeout(()=>setHopping(false),720);
  }
  return <div
    className={`hearts-scene ${compact?'is-compact':''} ${equipped.background==='autumn'?'is-autumn':''} ${hopping?'is-hopping':''}`}
    onClick={triggerHop}
  >
    {/* Clean park stage background without baked-in numbers or static duplicate bunny */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={appPath('/walking/park-stage-bg.jpg')} width="1254" height="1254" alt="공원 산책길을 걷는 밥뭇나 토끼" className="hearts-scene-art"/>
    <ParkTrailWonders summary={summary} compact={compact}/>
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
    {!compact?<span className="hearts-trail-whisper" aria-live="polite">{TRAIL_NOTES[hopIndex]}</span>:null}
    {equipped.background==='autumn'?<span className="hearts-season">가을 단풍 산책길</span>:null}
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
        <span className="hearts-goal">
          {summary.count===null
            ?'첫 발걸음이 닿으면 산책길이 깨어나요'
            :`오늘의 목표 ${summary.goal.toLocaleString('ko-KR')}걸음 중 ${Math.floor(progress)}%`}
        </span>
      </div>
    </BunnyScene>
    <div className="hearts-path" role="group" aria-label="자동으로 채워지는 다섯 단계">
      <div className="hearts-track" aria-hidden="true">
        <span style={{width:`${fill}%`}}/>
        <i className="hearts-track-walker" style={{left:`${Math.min(96,Math.max(4,fill))}%`}}>🐾</i>
      </div>
      <ol className="hearts-stages">{summary.milestones.map((stage,index)=><li key={stage.id} className={stage.achieved?'is-done':''}>
        <span className="hearts-node" aria-hidden="true">{stage.achieved?'✓':''}</span>
        <strong>
          {index===0
            ?<><span aria-hidden="true">🍚</span><span>따스한 밥김<small className="sr-only"> (취사 소식)</small></span></>
            :`${stage.id}%`}
        </strong>
        <HeartIcon filled={stage.achieved}/>
        <span className="sr-only">{stage.achieved?'달성':'기다리는 중'}</span>
      </li>)}</ol>
      <div className="hearts-copy-block">
        <span className="hearts-auto-pill">
          <span aria-hidden="true">✨</span>
          {completed
            ?'오늘 약속한 걸음을 기분 좋게 채우셨어요'
            :'버튼을 누르지 않아도 걸음마다 하트가 사르르 차올라요'}
        </span>
        <p className="hearts-garden-copy">
          {completed
            ?<>오늘의 산책은 이미 충분히 빛나고 있어요.<br/>남은 하루는 벤치에 앉듯 편안히 쉬어가세요.</>
            :<>누구와 비교할 필요 없어요.<br/>오늘 내 보폭 그대로, 바람을 따라 천천히 걸어보세요.</>}
        </p>
      </div>
    </div>
  </section>;
}

export function EquippedNames({equipped}:{equipped:HeartEquipment}){
  const names=Object.values(equipped).filter(Boolean).map(id=>HEART_ITEMS.find(item=>item.id===id)?.name).filter(Boolean);
  return <p className="hearts-small">{names.length?`지금 입은 차림 · ${names.join(' · ')}`:'주황 가방 하나 메고 나서는 기본 산책 차림이에요.'}</p>;
}
