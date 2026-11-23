import type {WalkingBoard as Board} from '@/lib/walking/model';

export function WalkingBoard({board,demo=false}:{board:Board;demo?:boolean}){
  const top=board.entries.slice(0,3);
  return <div className="walking-board">
    <p className="walking-meta">{Number(board.date.slice(5,7))}월 {Number(board.date.slice(8,10))}일 · 한국 시간 기준{demo?' · 예시':''}</p>
    <h2 className="walking-heading">오늘, 함께 걸은 발걸음</h2>
    {top.length?<ol className="walking-podium" aria-label="오늘의 상위 세 명">
      {top.map((entry,index)=><li key={entry.publicId} className={`walking-podium-card walking-podium-${index}`}>
        <span className="walking-medal" aria-hidden>{entry.rank===1?'🥇':entry.rank===2?'🥈':entry.rank===3?'🥉':'🌿'}</span>
        <strong className="walking-rank">{entry.rank}등</strong>
        <span className="walking-name">{entry.nickname}</span>
        <span className="walking-count">{entry.count.toLocaleString('ko-KR')}<small>걸음</small></span>
      </li>)}
    </ol>:<div className="walking-empty"><span aria-hidden>🌱</span><h3>오늘의 첫걸음을 기다려요</h3><p>휴대폰 걸음수가 연결되면<br/>실제 기록으로 순위를 보여 드려요.</p></div>}
    <section className="walking-my-record" aria-labelledby="walking-my-title">
      <div><h3 id="walking-my-title">나의 오늘</h3><p>{board.me.nickname}</p></div>
      <div className="walking-my-count"><strong>{board.me.rank===null?'기록 기다리는 중':`${board.me.rank}등`}</strong><span>{board.me.count===null?'아직 전송된 걸음수가 없어요':`${board.me.count.toLocaleString('ko-KR')}걸음`}</span></div>
    </section>
    {board.me.lastSyncedAt?<p className="walking-caption">내 걸음수 확인 · {new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'}).format(new Date(board.me.lastSyncedAt))}</p>:null}
    <div className="walking-list-heading"><h3>오늘 기록이 있는 참여자</h3><span>{board.total.toLocaleString('ko-KR')}명</span></div>
    <p className="walking-caption">같은 걸음수는 공동 순위예요. 순위보다 내 몸에 맞는 속도가 먼저예요.</p>
    {board.entries.length?<ol className="walking-list" aria-label="오늘 걸음수 순위">
      {board.entries.map(entry=><li key={entry.publicId} className={entry.publicId===board.me.publicId?'walking-list-me':''}>
        <span className="walking-list-rank">{entry.rank}<small>등</small></span><span className="walking-list-name">{entry.nickname}{entry.publicId===board.me.publicId?<small>나</small>:null}</span><strong>{entry.count.toLocaleString('ko-KR')}<small>걸음</small></strong>
      </li>)}
    </ol>:null}
    {board.total>board.entries.length?<p className="walking-caption">상위 {board.limit}명과 내 순위를 보여 드려요.</p>:null}
  </div>;
}
