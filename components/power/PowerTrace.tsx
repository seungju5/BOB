import {useId} from 'react';
import type {PowerRecording, PowerFrame} from '@/packages/power-pattern/index.mjs';
import {displayNumber, observedSegments} from './presentation';
import styles from './power-lab.module.css';

/** The curve contains the supplied observations only; gaps have no connecting line. */
export function PowerTrace({recording, frame, imported}: {recording: PowerRecording; frame: PowerFrame; imported: boolean}) {
  const identifier = useId().replace(/:/g, '');
  const width = 320, height = 184;
  const displayedDuration = Math.max(recording.minutes, 0);
  const duration = Math.max(displayedDuration, 1);
  const ceiling = Math.max(recording.maxW, ...recording.rows.map(row => row.upper ?? row.power ?? 0), 1);
  const maximum = Math.ceil(ceiling / (ceiling < 200 ? 20 : 200)) * (ceiling < 200 ? 20 : 200);
  const x = (minute: number) => Math.max(0, Math.min(width, minute / duration * width));
  const y = (watts: number) => height - Math.max(0, Math.min(height, watts / maximum * height));
  const segments = observedSegments(recording.rows);
  const selected = recording.rows.find(row => row.minute === frame.minute && row.power != null);
  const known = segments.reduce((count, segment) => count + segment.length, 0);

  return <figure className={styles.chartCard} aria-labelledby={`${identifier}-title`}>
    <figcaption id={`${identifier}-title`} className={styles.sectionHeading}>전력이 남긴 선</figcaption>
    <p className={styles.chartReadout}>선택한 구간 <strong>{frame.meanW == null ? '측정값 없음' : `${displayNumber(frame.meanW)} W`}</strong></p>
    <div className={styles.axisUnit}>전력 W</div>
    <div className={styles.chartGrid}>
      <div className={styles.yAxis} aria-hidden="true"><span>{displayNumber(maximum, 0)}</span><span>{displayNumber(maximum / 2, 0)}</span><span>0</span></div>
      <div className={styles.plot}>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${identifier}-description`} preserveAspectRatio="none">
          <title id={`${identifier}-description`}>{`${imported ? '불러온 자료' : '합성 예시'}의 전력 파형. ${displayNumber(displayedDuration)}분 동안 관측값 ${known}개. 비어 있는 구간은 선으로 잇지 않습니다. 현재 ${displayNumber(frame.minute)}분, ${frame.meanW == null ? '측정값 없음' : `${displayNumber(frame.meanW)}와트`}.`}</title>
          <defs><pattern id={`${identifier}-gap`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" className={styles.gapStripe}/></pattern></defs>
          {[0, .5, 1].map(fraction => <line key={fraction} x1="0" x2={width} y1={height * fraction} y2={height * fraction} className={styles.gridLine}/>)}
          {recording.rows.filter(row => row.power == null).map((row, index) => {
            const start = row.startMinute ?? Math.max(0, row.minute - 1);
            const end = row.endMinute ?? row.minute;
            return <rect key={`gap-${index}`} x={x(start)} y="0" width={Math.max(1, x(end) - x(start))} height={height} fill={`url(#${identifier}-gap)`}/>;
          })}
          {segments.map((segment, index) => {
            const points = segment.map(row => `${x(row.minute)},${y(row.power!)}`).join(' ');
            const bounds = segment.every(row => row.lower != null && row.upper != null);
            const band = bounds ? [...segment.map(row => `${x(row.minute)},${y(row.upper!)}`), ...[...segment].reverse().map(row => `${x(row.minute)},${y(row.lower!)}`)].join(' ') : '';
            return <g key={index}>{band && segment.length > 1 ? <polygon points={band} className={styles.errorBand}/> : null}
              {segment.length === 1 ? <circle cx={x(segment[0].minute)} cy={y(segment[0].power!)} r="3" className={styles.tracePoint}/> : <polyline points={points} className={styles.traceLine}/>}
            </g>;
          })}
          <line x1={x(frame.minute)} x2={x(frame.minute)} y1="0" y2={height} className={styles.cursorLine}/>
          {selected ? <circle cx={x(selected.minute)} cy={y(selected.power!)} r="5" className={styles.selectedPoint}/> : null}
        </svg>
        {!known ? <span className={styles.emptyPlot}>그릴 수 있는<br/>관측값이 없어요.</span> : null}
      </div>
    </div>
    <div className={styles.xAxis} aria-hidden="true"><span>0</span><span>{displayNumber(displayedDuration / 2)}</span><span>{displayNumber(displayedDuration)}분</span></div>
    <div className={styles.chartLegend}><span><i className={styles.legendLine}/>구간 전력</span><span><i className={styles.legendBand}/>계측 오차 범위</span><span><i className={styles.legendGap}/>기록 없음</span></div>
    <p className={styles.caption}>{imported ? '파일에 들어 있는 구간 자료를 보여요.' : '세로선 시점까지 들어온 자료로만 판단해요.'} 빈 곳은 0 W로 채우지 않아요. 음영은 입력 기준의 계측 오차이며, 정확도나 신뢰도 표시가 아니에요.</p>
  </figure>;
}
