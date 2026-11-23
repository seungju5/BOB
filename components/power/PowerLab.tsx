'use client';

import Link from 'next/link';
import {useEffect, useRef, useState, type ChangeEvent} from 'react';
import {Logo, Mascot} from '@/components/Mascot';
import {getPowerScenarios, MAX_INPUT_BYTES, parsePowerInput, PowerInputError, sampleJSON, type ImportedPowerRecording} from '@/packages/power-pattern/index.mjs';
import styles from './power-lab.module.css';

const scenarios = getPowerScenarios();
const exampleNames: Record<string, string> = {
  cycle: '취사 후 보온으로 이어질 때',
  'quiet-warming': '보온이 잠시 쉬어 갈 때',
  missing: '기록이 잠시 끊겼을 때',
  boundary: '상태가 아직 뚜렷하지 않을 때',
  cut: '가열을 멈췄을 때',
  'ambiguous-mode': '밥솥이 열심히 가열할 때',
  'short-burst': '잠깐 가열했을 때',
  conflict: '기기 소식을 다시 확인할 때',
};
const statusCopy = {
  COOKING: {label:'취사로 추정', title:'밥을 짓는 것 같아요', description:'취사할 때와 비슷한\n밥솥의 움직임이 보였어요.'},
  WARMING: {label:'보온으로 추정', title:'보온하는 것 같아요', description:'따뜻함을 이어가는\n밥솥의 움직임이 보였어요.'},
  OFF: {label:'가열 멈춤으로 추정', title:'잠시 쉬어 가는 모습이에요', description:'가열하지 않는 모습이에요.\n전원이 꺼졌다는 뜻은 아니에요.'},
  UNKNOWN: {label:'확인 필요', title:'아직은 알기 어려워요', description:'지금 기록만으로는\n밥솥의 상태를 알기 어려워요.'},
};

export function PowerLab() {
  const [scenarioId, setScenarioId] = useState('cycle');
  const [imported, setImported] = useState<ImportedPowerRecording | null>(null);
  const [reading, setReading] = useState(false);
  const [fileError, setFileError] = useState('');
  const [fileNotice, setFileNotice] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const alive = useRef(false), request = useRef(0);
  const downloads = useRef(new Set<string>());
  const example = scenarios.find(scenario => scenario.id === scenarioId) ?? scenarios[0];
  const frame = imported ? imported.frames[0] : example.frames[Math.max(0, example.selected - 1)];
  const status = statusCopy[frame.state];
  const description = frame.state === 'OFF' && frame.subtype === 'supply_cut_reported'
    ? '플러그가 꺼졌다는 소식이 있어요.\n밥솥의 상태도 함께 살펴봐 주세요.'
    : status.description;

  useEffect(() => {
    alive.current = true;
    const urls = downloads.current;
    return () => { alive.current = false; urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); };
  }, []);

  function chooseScenario(id: string) {
    if (!scenarios.some(scenario => scenario.id === id)) return;
    request.current++; setReading(false); setImported(null);
    setScenarioId(id); setFileError(''); setFileNotice('');
  }

  async function openFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const ticket = ++request.current;
    setReading(true); setFileError(''); setFileNotice('');
    // A failed replacement must not leave the previous file looking current.
    setImported(null); setScenarioId('cycle');
    try {
      if (file.size > MAX_INPUT_BYTES) {
        setFileError('파일이 너무 커요. 2 MiB 이하의 JSON 파일을 골라 주세요.');
        setFileNotice('새 파일을 읽지 못해 예시 화면으로 돌아왔어요.');
        return;
      }
      const text = await file.text();
      if (!alive.current || ticket !== request.current) return;
      setImported(parsePowerInput(text));
      setFileNotice('불러온 기록을 확인했어요. 파일은 서버에 보내거나 저장하지 않았어요.');
    } catch (error) {
      if (alive.current && ticket === request.current) {
        setFileError(error instanceof PowerInputError ? error.message : '파일을 읽지 못했어요. JSON 형식과 파일 크기를 확인해 주세요.');
        setFileNotice('새 파일을 읽지 못해 예시 화면으로 돌아왔어요.');
      }
    } finally { if (alive.current && ticket === request.current) setReading(false); }
  }

  function downloadExample() {
    const url = URL.createObjectURL(new Blob([sampleJSON], {type:'application/json;charset=utf-8'}));
    downloads.current.add(url);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'bapmunna-power-synthetic-example.json'; anchor.click();
    setTimeout(() => { URL.revokeObjectURL(url); downloads.current.delete(url); }, 1000);
    setFileNotice('예제 파일 다운로드를 요청했어요. 실제 가구의 기록이 아닌 합성 예제예요.');
  }

  return <main className={styles.page}>
    <header className={styles.header}><Logo/><Link href="/more" className={styles.menuLink}>더보기 <span aria-hidden="true">›</span></Link></header>
    <div className={styles.intro}><p className={styles.eyebrow}>작은 소식, 다정한 안부</p><h1>밥솥의 소식을<br/>살펴봐요</h1></div>
    <p className={styles.sourceNote}><span className={styles.sourceLabel}>{reading ? '확인 중' : imported?.dataOrigin === 'USER_SUPPLIED_LOCAL_ONLY' ? '가져온 파일' : '합성 예시'}</span><span>{reading ? '새 기록을 불러오고 있어요' : imported ? imported.label : '화면 설명을 위해 만든 가상 입력값이에요'}</span></p>

    <section className={styles.statusCard} data-state={frame.state} aria-labelledby="power-state-title" aria-busy={reading}>
      <div className={styles.cardHeading}>
        <span className={styles.cardLabel}>밥솥이 전하는 소식</span>
        <svg className={styles.riceMark} viewBox="0 0 40 40" aria-hidden="true" focusable="false"><path d="M13 26c-5-2-7-7-5-10 5 0 9 4 9 8M21 21c-4-4-4-10 0-13 4 3 4 9 0 13ZM25 26c5-2 7-7 5-10-5 0-9 4-9 8"/><path d="M12 30c5 3 11 3 16 0"/></svg>
      </div>
      <div className={styles.mascotScene}><span className={styles.mascotCircle} aria-hidden="true"/><Mascot className={styles.mascot}/></div>
      <div className={styles.statusMessage} aria-live="polite" aria-atomic="true">
        <span className={styles.statusBadge}>{reading ? '기록 확인 중' : status.label}</span>
        <h2 id="power-state-title">{reading ? '기록을 살펴보고 있어요' : status.title}</h2>
        <p>{reading ? '잠시만 기다려 주세요.' : description}</p>
      </div>
      <p className={styles.gentleNote}>밥솥 사용으로 추정한 소식이에요.<br/>실제 식사 여부를 뜻하지는 않아요.</p>
    </section>

    <section className={styles.exampleCard} aria-labelledby="power-example-title">
      <h2 id="power-example-title">다른 소식도 볼까요?</h2>
      <label htmlFor="power-scenario" className={styles.fieldLabel}>보고 싶은 예시</label>
      <div className={styles.selectWrap}><select id="power-scenario" value={imported ? 'imported' : scenarioId} onChange={event => chooseScenario(event.target.value)}>{imported ? <option value="imported" disabled>가져온 파일을 확인하고 있어요</option> : null}{scenarios.map(scenario => <option value={scenario.id} key={scenario.id}>{exampleNames[scenario.id] ?? scenario.name}</option>)}</select><span aria-hidden="true">⌄</span></div>
      <p className={styles.caption}>예시를 고르면 밥솥의 소식이 바뀌어요.</p>
    </section>

    <details className={styles.fileCard}>
      <summary>JSON 파일로 확인하기 <span aria-hidden="true">+</span></summary>
      <div className={styles.fileContent}>
        <p>JSON 파일을 골라 이 화면에서만 확인해요. 서버에 보내거나 저장하지 않아요.</p>
        <p className={styles.caption}>최대 2 MiB · 구간 2,000개.<br/>구간 평균과 기기별 기준이 있는 자료가 필요해요. SmartThings 순간값만으로는 확인할 수 없어요.</p>
        <input ref={input} type="file" accept=".json,application/json" hidden onChange={event => void openFile(event)}/>
        <button type="button" disabled={reading} className={styles.primaryButton} onClick={() => input.current?.click()}>{reading ? '기록을 불러오는 중이에요…' : 'JSON 파일 고르기'}</button>
        <button type="button" className={styles.secondaryButton} onClick={downloadExample}>예제 파일 내려받기 <span aria-hidden="true">↓</span></button>
        {imported ? <button type="button" className={styles.textButton} onClick={() => chooseScenario('cycle')}>가져온 파일 지우고 예시로 돌아가기</button> : null}
        {fileError ? <p role="alert" className={styles.fileError}>{fileError}</p> : null}{fileNotice ? <p role="status" className={styles.fileNotice}>{fileNotice}</p> : null}
        <p className={styles.caption}>예제는 합성 자료예요. 실제 밥솥의 보정값으로 사용할 수 없어요.</p>
      </div>
    </details>

    <footer className={styles.footer}><p>밥 한 끼로 전하는 안부</p><Link href="/more">다른 소식 살펴보기 <span aria-hidden="true">›</span></Link></footer>
  </main>;
}
