import {appPath} from '@/lib/app-path';
import {HEART_ITEMS,type HeartEquipment,type HeartSummary} from '@/packages/walking-hearts/core.mjs';
import {heartPathFill} from '@/lib/hearts/presentation';

export function HeartIcon({filled=false,className=''}:{filled?:boolean;className?:string}){
  return <svg className={`heart-symbol ${filled?'is-filled':''} ${className}`} viewBox="0 0 40 40" aria-hidden="true"><path d="M20 35C17 32 4 24 4 14a9 9 0 0 1 16-6 9 9 0 0 1 16 6c0 10-13 18-16 21Z"/></svg>;
}
export function BunnyScene({equipped,compact=false,children}:{equipped:HeartEquipment;compact?:boolean;children?:React.ReactNode}){
  return <div className={`hearts-scene ${compact?'is-compact':''} ${equipped.background==='autumn'?'is-autumn':''}`}>
    {/* Artwork has no baked-in numbers: real text and progress are accessible HTML. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={appPath('/walking/park-bunny.png')} width="1254" height="1254" alt="공원 산책길을 걷는 밥뭇나 토끼" className="hearts-scene-art"/>
    <svg className="hearts-clothes" viewBox="0 0 100 100" aria-hidden="true">
      {equipped.outfit==='vest'?<g><path d="m44 72 5 2 6-3 5 11-4 4-12-2Z" fill="#849b6d" stroke="#5c6f48" strokeWidth=".5"/><path d="m51 74 1 11m-5-6 3 .4m4-.4 3-.6" stroke="#edf1d7" strokeWidth=".8"/><circle cx="52" cy="80" r=".5" fill="#583f28"/></g>:null}
      {equipped.outfit==='hanbok'?<g><path d="m44 73 13-1 5 13q-10 4-23-1Z" fill="#ec9ba6" stroke="#b77987" strokeWidth=".5"/><path d="m44 72 6 3 7-3 2 6-16 1Z" fill="#ffedcb"/><path d="m49 74 6 4m-1-1 2 4m-2-4-3 4" stroke="#b96b7c" strokeWidth="1"/></g>:null}
      {equipped.accessory==='scarf'?<g fill="#ca684a" stroke="#a84d35" strokeWidth=".4"><path d="m44 69q8 3 15-1l-.4 3q-8 3-14-.1Z"/><path d="m46 71 3 1-1 8-3-.7Z"/><path d="m45 78 3 1" stroke="#f2bc8b" strokeWidth=".6"/></g>:null}
      {equipped.accessory==='basket'?<g stroke="#76512f" strokeWidth=".5"><path d="m60 79q0-7 6-1" fill="none" strokeWidth="1"/><path d="m58 79 11-1-1 8-8 1Z" fill="#bd8c49"/><path d="m59 81 9-1m-8 3 8-1m-5-3 1 7m2-7 .5 7" stroke="#e5c68d"/></g>:null}
      {equipped.hat==='straw-hat'?<g fill="#e8c975" stroke="#a98442" strokeWidth=".6"><ellipse cx="51" cy="53" rx="14" ry="3"/><path d="m43 53 2-7q7-3 13 1l1 6Z"/><path d="m44 51q7 2 14 0" fill="none" stroke="#bf7152" strokeWidth="1.7"/></g>:null}
      {equipped.hat==='hiking-cap'?<g fill="#739b82" stroke="#416952" strokeWidth=".5"><path d="M42 54q1-11 16-7l3 7Z"/><path d="m51 53q12-2 15 2-10 3-15 0Z"/><path d="m51 48 1 4" stroke="#b8d5be"/></g>:null}
      {equipped.hat==='crown'?<g fill="#efbf35" stroke="#ac7821" strokeWidth=".7"><path d="m43 52-2-8 6 4 4-8 5 8 7-5-2 9Z"/><circle cx="51" cy="48" r="1" fill="#d88161"/></g>:null}
    </svg>
    {children}
    {equipped.background==='autumn'?<span className="hearts-season">가을 산책길</span>:null}
  </div>;
}
export function HeartsGarden({summary}:{summary:HeartSummary}){
  const progress=summary.percent??0;
  const fill=heartPathFill(summary.percent);
  return <section className="hearts-garden" aria-label="오늘의 산책 진행">
    <BunnyScene equipped={summary.equipped}>
      <div className="hearts-scene-title"><h1>오늘의 산책</h1><p>오늘 걸음 수</p><strong><span className="hearts-shoe" aria-hidden="true">👟</span> {summary.count===null?'—':summary.count.toLocaleString('ko-KR')}</strong><span className="hearts-goal">{summary.count===null?'오늘 기록을 기다려요':`내 목표 ${summary.goal.toLocaleString('ko-KR')}걸음 · ${Math.floor(progress)}%`}</span></div>
    </BunnyScene>
    <div className="hearts-path" role="group" aria-label="자동으로 채워지는 다섯 단계">
      <div className="hearts-track" aria-hidden="true"><span style={{width:`${fill}%`}}/></div>
      <ol className="hearts-stages">{summary.milestones.map((stage,index)=><li key={stage.id} className={stage.achieved?'is-done':''}>
        <span className="hearts-node" aria-hidden="true">{stage.achieved?'✓':''}</span>
        <strong>{index===0?<><span aria-hidden="true">🍚</span><span>취사 소식</span></>:`${stage.id}%`}</strong>
        <HeartIcon filled={stage.achieved}/><span className="sr-only">{stage.achieved?'달성':'기다리는 중'}</span>
      </li>)}</ol>
      <p className="hearts-garden-copy">{summary.percent!==null&&summary.percent>=100?'오늘의 목표를 채웠어요. 편하게 쉬어도 좋아요.':'하트는 저절로 채워져요. 내 속도로 걸어요.'}</p>
    </div>
  </section>;
}
export function EquippedNames({equipped}:{equipped:HeartEquipment}){
  const names=Object.values(equipped).filter(Boolean).map(id=>HEART_ITEMS.find(item=>item.id===id)?.name).filter(Boolean);
  return <p className="hearts-small">{names.length?names.join(' · '):'토끼의 기본 산책 차림이에요.'}</p>;
}
