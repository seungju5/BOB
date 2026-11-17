'use client';

import Link from 'next/link';
import {useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ChangeEvent} from 'react';
import {Logo} from '@/components/Mascot';
import {getPowerScenarios, MAX_INPUT_BYTES, parsePowerInput, PowerInputError, sampleJSON, type ImportedPowerRecording, type PowerTrace as DecisionTrace} from '@/packages/power-pattern/index.mjs';
import {displayNumber, stateLabels} from './presentation';
import {PowerTrace} from './PowerTrace';
import styles from './power-lab.module.css';

const scenarios = getPowerScenarios();
const stageStatus = {passed:'통과', blocked:'멈춤', pending:'더 관찰', unverified:'검증 전'} as const;
function subscribeMotion(listener: () => void) {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
const motionSnapshot = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const serverMotionSnapshot = () => false;
function traceDescription(trace: DecisionTrace) {
  if (trace.key === 'mode') return '실제 밥솥 모드와 식사 여부는 현장 검증이 필요해요.';
  if (trace.key === 'quality') return trace.status === 'passed' ? '관측 구간과 연결 상태 등 입력 조건을 통과했어요.' : '자료가 충분하고 서로 맞는지 먼저 확인해요.';
  if (trace.key === 'pattern') return trace.status === 'passed' ? '전력 크기·시간·반복에서 패턴 후보가 나왔어요.' : '세 패턴 중 고를 근거가 충분한지 살펴요.';
  return trace.status === 'passed' ? '새로운 측정에서도 같은 후보가 이어졌어요.' : '새로운 측정이 더 쌓여야 이어짐을 확인해요.';
}

export function PowerLab() {
  const [scenarioId, setScenarioId] = useState('cycle');
  const [position, setPosition] = useState(49);
  const [playing, setPlaying] = useState(false);
  const [imported, setImported] = useState<ImportedPowerRecording | null>(null);
  const [reading, setReading] = useState(false);
  const [fileError, setFileError] = useState('');
  const [fileNotice, setFileNotice] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const alive = useRef(false), request = useRef(0);
  const downloads = useRef(new Set<string>());
  const reducedMotion = useSyncExternalStore(subscribeMotion, motionSnapshot, serverMotionSnapshot);
  const recording = imported ?? scenarios.find(scenario => scenario.id === scenarioId) ?? scenarios[0];
  const currentPosition = Math.min(Math.max(0, position), recording.frames.length - 1);
  const frame = recording.frames[currentPosition];
  const unknown = frame.state === 'UNKNOWN';
  const tone = unknown ? 'unknown' : frame.state === 'COOKING' ? 'heat' : frame.state === 'WARMING' ? 'warm' : 'quiet';
  const level = frame.meanW == null ? .15 : Math.min(1, Math.max(0, frame.meanW / Math.max(recording.maxW, 1)));
  const moving = playing && !unknown && !imported && !reducedMotion;

  useEffect(() => {
    alive.current = true;
    const stopWhenHidden = () => { if (document.visibilityState !== 'visible') setPlaying(false); };
    document.addEventListener('visibilitychange', stopWhenHidden);
    const urls = downloads.current;
    return () => { alive.current = false; document.removeEventListener('visibilitychange', stopWhenHidden); urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); };
  }, []);

  useEffect(() => {
    if (!playing || imported) return;
    const timer = setTimeout(() => {
      if (currentPosition >= recording.frames.length - 1) setPlaying(false);
      else setPosition(value => Math.min(value + 1, recording.frames.length - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [playing, imported, currentPosition, recording.frames.length]);

  function chooseScenario(id: string) {
    const next = scenarios.find(scenario => scenario.id === id);
    if (!next) return;
    request.current++; setReading(false); setImported(null); setPlaying(false);
    setScenarioId(next.id); setPosition(Math.max(0, next.selected - 1)); setFileError(''); setFileNotice('');
  }

  async function openFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const ticket = ++request.current;
    setPlaying(false); setReading(true); setFileError(''); setFileNotice('');
    // Remove the old import before reading another file. A failure must not make
    // the previous recording look like the result of the newly selected file.
    setImported(null); setScenarioId('cycle'); setPosition(49);
    try {
      if (file.size > MAX_INPUT_BYTES) {
        setFileError('파일이 너무 커요. 2 MiB 이하의 JSON 파일을 골라 주세요.');
        setFileNotice('새 파일을 분석하지 못해 합성 예시를 표시하고 있어요.');
        return;
      }
      const text = await file.text();
      if (!alive.current || ticket !== request.current) return;
      const parsed = parsePowerInput(text);
      setImported(parsed); setPosition(0);
      setFileNotice('파일의 한 관측창을 이 화면에서만 분석했어요. 서버에 보내거나 저장하지 않았어요.');
    } catch (error) {
      if (alive.current && ticket === request.current) {
        setFileError(error instanceof PowerInputError ? error.message : '파일을 읽지 못했어요. JSON 형식과 파일 크기를 확인해 주세요.');
        setFileNotice('새 파일을 분석하지 못해 합성 예시를 표시하고 있어요.');
      }
    } finally { if (alive.current && ticket === request.current) setReading(false); }
  }

  function downloadExample() {
    const url = URL.createObjectURL(new Blob([sampleJSON], {type:'application/json;charset=utf-8'}));
    downloads.current.add(url);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'bapmunna-power-synthetic-example.json'; anchor.click();
    setTimeout(() => { URL.revokeObjectURL(url); downloads.current.delete(url); }, 1000);
    setFileNotice('합성 예제 JSON 다운로드를 요청했어요. 실측 보정값이나 실제 가구 자료가 아니에요.');
  }

  const featureRows = [
    {name:'관측된 구간', value:frame.coverage == null ? '—' : `${displayNumber(frame.coverage * 100, 0)}%`, description:'필요한 관측창 중 값이 있는 비율'},
    {name:'높은 전력 시간', value:frame.highMinutes == null ? '—' : `${displayNumber(frame.highMinutes)}분`, description:'짧은 관측창 안의 누적 시간'},
    {name:'기준 위 에너지', value:frame.excessWh == null ? '—' : `${displayNumber(frame.excessWh)} Wh`, description:'계측 오차를 반영한 하한값'},
    {name:'반복 가열 구간', value:frame.runs == null ? '—' : `${displayNumber(frame.runs, 0)}회`, description:'보온 관측창의 가열 구간 수'},
    {name:'후보 유지 시간', value:`${displayNumber(frame.confirmationSeconds, 0)}초`, description:'새 관측에서도 같은 후보가 이어진 시간'},
    {name:'조용한 구간', value:`${displayNumber(frame.quietMinutes)}분`, description:'분석 함수가 계산한 저전력 시간'},
  ];

  return <main className={styles.lab}>
    <header className={styles.header}><Logo/><Link href="/more" className={styles.menuLink}>메뉴 <span aria-hidden="true">↗</span></Link></header>
    <div className={styles.intro}><p className={styles.eyebrow}>BAPMUNNA · ENERGY LAB</p><h1>전력의 흐름을<br/>눈으로 읽어요.</h1><p>작은 숫자들을 모아,<br/>어떤 패턴인지 차근차근 살펴요.</p></div>
    <aside className={styles.originNotice} data-imported={Boolean(imported)}><span className={styles.noticeDot} aria-hidden="true"/><div><strong>{imported ? '내 파일 · 이 화면에서만 분석' : '합성 예시 · 실제 가구 데이터 아님'}</strong><p>{imported ? '한 관측창을 계산해요. 재생 자료나 검증된 기기 모드로 바꾸지 않아요.' : '아래 변화는 예시 자료로 분석 함수를 실행한 결과예요.'}</p></div></aside>

    <section className={styles.energyHero} data-tone={tone} data-moving={moving} aria-labelledby="power-state-title">
      <div className={styles.heroTop}><span>POWER PATTERN · V2</span><span className={styles.engineBadge}>{unknown ? '판단 대기' : '후보 분석'}</span></div>
      <div className={styles.energyField} style={{'--energy-level':level} as CSSProperties}>
        <div className={styles.energyDrawing} aria-hidden="true"><div className={styles.halo}/><div className={styles.orbitOne}/><div className={styles.orbitTwo}/><div className={styles.orbitThree}/><div className={styles.orbCore}/><div className={styles.orbShine}/></div>
        <div className={styles.energyReading}><span>선택한 구간 전력</span><strong>{frame.meanW == null ? '—' : displayNumber(frame.meanW, 0)}{frame.meanW != null ? <small>W</small> : null}</strong><span>{frame.meanW == null ? '측정값을 기다려요' : `${displayNumber(frame.minute)}분 시점`}</span></div>
      </div>
      <div className={styles.heroState} aria-live={playing ? 'off' : 'polite'}><p id="power-state-title">{stateLabels[frame.state]}</p><span>{unknown ? '근거가 모일 때까지, 빛도 잠시 멈춰요.' : '빛의 움직임은 전력 패턴을 설명하는 표현이에요.'}</span></div>
      <div className={styles.heroBottom}><span>{imported ? '단일 관측창' : `${currentPosition + 1} / ${recording.frames.length} 시점`}</span><span>{reducedMotion ? '움직임 줄이기 적용' : moving ? '시간과 함께 움직여요' : '움직임 멈춤'}</span></div>
    </section>

    <section className={styles.controlCard} aria-labelledby="power-explore-title"><h2 id="power-explore-title" className={styles.sectionHeading}>다른 순간도 살펴볼까요?</h2>
      <label htmlFor="power-scenario" className={styles.fieldLabel}>예시 선택 · 8가지 상황</label><div className={styles.selectWrap}><select id="power-scenario" value={imported ? 'imported' : scenarioId} onChange={event => chooseScenario(event.target.value)}>{imported ? <option value="imported" disabled>내 파일 분석 중</option> : null}{scenarios.map(scenario => <option value={scenario.id} key={scenario.id}>{scenario.name}</option>)}</select><span aria-hidden="true">⌄</span></div>
      {imported ? <div className={styles.singleWindow}><strong>파일에 적힌 한 시점만 계산했어요.</strong><p>관측 시각: {imported.metadata.asOf}<br/>반복 관측이 있는 것처럼 시간을 재생하지 않아요.</p></div> : <>
        <div className={styles.timelineLabel}><label htmlFor="power-time">관측 시점</label><output htmlFor="power-time">{displayNumber(frame.minute)}분</output></div>
        <input id="power-time" className={styles.timeline} type="range" min="0" max={recording.frames.length - 1} step="1" value={currentPosition} aria-valuetext={`${displayNumber(frame.minute)}분, ${stateLabels[frame.state]}`} onChange={event => { setPlaying(false); setPosition(Number(event.target.value)); }}/>
        <div className={styles.timelineEnds}><span>1분</span><span>{displayNumber(recording.minutes)}분</span></div>
        <div className={styles.playControls}><button type="button" className={styles.primaryButton} aria-pressed={playing} onClick={() => { if (!playing && currentPosition === recording.frames.length - 1) setPosition(0); setPlaying(value => !value); }}><span aria-hidden="true">{playing ? 'Ⅱ' : '▶'}</span>{playing ? '일시정지' : '시간 재생'}</button><button type="button" className={styles.secondaryButton} onClick={() => { setPlaying(false); setPosition(0); }}>처음부터</button></div>
        <p className={styles.caption}>재생하면 1초마다 예시의 1분을 살펴요. 화면을 떠나면 멈춰요. 움직임 줄이기 설정에서는 빛이 움직이지 않아요.</p>
      </>}
    </section>

    <PowerTrace recording={recording} frame={frame} imported={Boolean(imported)}/>

    <section className={styles.reasonCard} aria-labelledby="power-reason-title"><div className={styles.sectionKicker}>WHY THIS PATTERN</div><h2 id="power-reason-title" className={styles.sectionHeading}>이렇게 읽은 이유예요.</h2><p className={styles.mainReason}>{frame.detail}</p>
      <dl className={styles.candidateRow}><div><dt>이번 창에서 나온 후보</dt><dd>{stateLabels[frame.candidateState]}</dd></div><div><dt>이어짐 확인</dt><dd>{frame.phase === 'stable_candidate' ? '같은 후보가 이어짐' : frame.phase === 'accumulating' ? '새 관측을 더 기다려요' : '판단 보류'}</dd></div></dl>
      <p className={styles.caption}>‘후보’는 실제 취사 모드나 식사 완료를 뜻하지 않아요. 이 화면은 알림을 보내지 않아요.</p>
      <details className={styles.rawDetails}><summary>원본 판단 근거 보기</summary><p>분석 함수가 돌려준 값을 그대로 보여요.</p><dl><dt>state / candidateState</dt><dd><code>{frame.state} / {frame.candidateState}</code></dd><dt>phase</dt><dd><code>{frame.phase}</code></dd>{frame.subtype ? <><dt>subtype</dt><dd><code>{frame.subtype}</code></dd></> : null}</dl><ul>{frame.reasons.map((reason,index) => <li key={`${index}-${reason}`}><code>{reason}</code></li>)}</ul></details>
    </section>

    <section className={styles.traceCard} aria-labelledby="power-trace-title"><h2 id="power-trace-title" className={styles.sectionHeading}>네 번 살펴보고,<br/>성급히 단정하지 않아요.</h2><ol className={styles.decisionTrace}>{frame.trace.map((trace,index) => <li key={trace.key} data-status={trace.status}><span className={styles.stageNumber}>{String(index + 1).padStart(2,'0')}</span><div><div className={styles.stageHeader}><h3>{trace.label}</h3><span>{stageStatus[trace.status]}</span></div><p>{traceDescription(trace)}</p></div></li>)}</ol></section>

    <section className={styles.metricsSection} aria-labelledby="power-features-title"><div className={styles.sectionKicker}>INSIDE THE FUNCTION</div><h2 id="power-features-title" className={styles.sectionHeading}>판단에 쓰인 숫자들</h2><p className={styles.caption}>선택한 시점의 실제 계산 결과예요. ‘—’는 값 없음이며 0과 달라요. 관측 비율은 판단 정확도가 아니에요.</p><dl className={styles.metrics}>{featureRows.map(feature => <div key={feature.name}><dt>{feature.name}</dt><dd>{feature.value}</dd><p>{feature.description}</p></div>)}</dl></section>

    <section className={styles.fileCard} aria-labelledby="power-file-title"><span className={styles.localBadge}>LOCAL ONLY</span><h2 id="power-file-title" className={styles.sectionHeading}>내 구간 자료도<br/>여기서 살펴봐요.</h2><p>올바른 형식의 JSON을 고르면, 이 화면 안에서만 분석해요. 계정이나 서버로 보내지 않아요.</p><p className={styles.caption}>최대 2 MiB · 구간 2,000개. 기기별 기준값과 관측 조건이 필요해요. SmartThings 순간값을 구간 평균으로 가정해 채우지 마세요.</p>
      <input ref={input} type="file" accept=".json,application/json" hidden onChange={event => void openFile(event)}/>
      <button type="button" disabled={reading} className={styles.primaryButton} onClick={() => input.current?.click()}>{reading ? '파일을 읽는 중이에요…' : 'JSON 파일 고르기'}</button>
      <button type="button" className={styles.secondaryButton} onClick={downloadExample}>합성 예제 JSON 내려받기 <span aria-hidden="true">↓</span></button>
      {imported ? <button type="button" className={styles.textButton} onClick={() => chooseScenario('cycle')}>불러온 자료 지우고 예시로 돌아가기</button> : null}
      {fileError ? <p role="alert" className={styles.fileError}>{fileError}</p> : null}{fileNotice ? <p role="status" className={styles.fileNotice}>{fileNotice}</p> : null}
      <p className={styles.caption}>예제의 기준값은 합성 자료용이에요. 실제 기기의 보정값이나 검증된 정확도로 사용하지 마세요.</p>
    </section>

    <footer className={styles.footer}><p>전력은 패턴의 단서예요.<br/><strong>식사·혈당·건강 상태를 판단하지 않아요.</strong></p><nav aria-label="다른 메뉴"><Link href="/walking">산책·걸음수 보기 <span aria-hidden="true">↗</span></Link><Link href="/more">메뉴로 돌아가기 <span aria-hidden="true">↗</span></Link></nav></footer>
  </main>;
}
