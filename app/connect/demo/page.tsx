'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Logo } from '@/components/Mascot';
import { MeterReadings } from '@/components/MeterReadings';
import { TEAM_SITE_URL } from '@/config/team';
import type { SmartThingsEnergy, SmartThingsReading } from '@/lib/firebase/smartthings';
import { formatDeviceTime, smartThingsErrorMessage } from '@/lib/smartthings/presentation';

type Grant = { grant: string; expiresAt: number; choices: { index: number; label: string }[] };
type Result = {
  deviceKind: 'recognized' | 'virtual' | 'unknown'; checkedAt: number;
  reading: SmartThingsReading | null; energy: SmartThingsEnergy | null;
};
const messages: Record<string, string> = {
  reconnect_required: '삼성이 토큰을 승인하지 않았어요. 토큰의 만료 여부를 확인한 뒤 다시 준비해 주세요.',
  permission_required: '기기를 읽을 권한이 없어요. 기기 읽기 권한을 선택해 발급한 토큰으로 다시 준비해 주세요.',
  invalid_token_input: '삼성에서 발급한 개인 액세스 토큰을 입력해 주세요.',
  no_meters: '이 계정에서 전력을 측정할 수 있는 기기를 찾지 못했어요. SmartThings 앱에서 플러그 연결을 확인해 주세요.',
  grant_ended: '이 조회권은 사용했거나 시간이 지났어요. 다시 준비해 주세요.',
  local_only: '시연 컴퓨터에서 로컬 서버 주소를 열어 주세요.',
};
const button = 'min-h-12 rounded-full bg-cocoa px-5 py-3 font-bold text-white disabled:opacity-50';
const field = 'w-full rounded-xl border border-line bg-white px-3 py-3 text-cocoa';
const card = 'grid gap-3 rounded-2xl border border-line bg-white p-5';
const api = '/api/demo/smartthings/';

async function post<T>(action: string, body: object, grant?: string): Promise<T> {
  const response = await fetch(api + action, {
    method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error',
    headers: { 'Content-Type': 'application/json', ...(grant && { Authorization: 'Bearer ' + grant }) },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'upstream_unavailable');
  return data;
}

export default function DemoPage() {
  const [local, setLocal] = useState<'checking' | 'ready' | 'unavailable'>('checking');
  const [grant, setGrant] = useState<Grant | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pat = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    async function check() {
      if (window.location.hostname !== '127.0.0.1') return false;
      const response = await fetch(api + 'ready', { cache: 'no-store', credentials: 'omit', redirect: 'error' });
      return response.ok && (await response.json()).available === true;
    }
    void check().catch(() => false).then(ready => { if (mounted) setLocal(ready ? 'ready' : 'unavailable'); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!grant) return;
    const timer = window.setTimeout(() => {
      setGrant(null);
      setError(messages.grant_ended);
    }, Math.max(0, grant.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [grant]);

  function showError(cause: unknown) {
    const code = cause instanceof Error ? cause.message : 'upstream_unavailable';
    setError(Object.hasOwn(messages, code) ? messages[code] : smartThingsErrorMessage(code));
  }

  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pat.current || busy) return;
    const value = pat.current.value.trim();
    pat.current.value = '';
    setBusy(true); setError('');
    try {
      const prepared = await post<Grant>('prepare', { pat: value });
      setChoice(prepared.choices.length === 1 ? prepared.choices[0].index : null);
      setGrant(prepared);
    } catch (cause) { showError(cause); }
    finally { setBusy(false); }
  }

  async function finish(action: 'read' | 'cancel') {
    if (!grant || busy || (action === 'read' && choice === null)) return;
    setBusy(true); setError(''); setGrant(null);
    try {
      if (action === 'read') setResult(await post<Result>('read', { choice }, grant.grant));
      else await post('cancel', {}, grant.grant);
    } catch (cause) { showError(cause); }
    finally { setBusy(false); }
  }

  return <main className="flex flex-1 flex-col gap-5 px-5 py-7 text-cocoa">
    <Logo />
    <header><h1 className="text-[28px] font-bold">플러그 한 번 조회</h1>
      <p className="mt-2 text-[16px] leading-relaxed text-muted">발표에 사용할 밥솥 플러그를 골라 SmartThings의 마지막 측정 결과를 확인해요.</p></header>
    {local === 'checking' && <p role="status">시연 서버를 확인하고 있어요.</p>}
    {local === 'unavailable' && <p role="status">발표 컴퓨터에서 <code>npm run demo:smartthings</code>를 실행하고 터미널에 표시된 주소를 열어 주세요.</p>}
    {local === 'ready' && !grant && !result && !busy && <form className={card} onSubmit={prepare} autoComplete="off">
      <label className="font-bold" htmlFor="demo-pat">삼성 개인 액세스 토큰 (PAT)</label>
      <input id="demo-pat" ref={pat} type="password" required maxLength={2048} className={field} autoComplete="off" autoCapitalize="none" spellCheck={false}/>
      <p className="text-sm leading-relaxed text-muted">계정 소유자가 기기 읽기 권한으로 발급한 토큰을 이 컴퓨터에 입력해 주세요.</p>
      <a className="underline" href="https://account.smartthings.com/tokens" target="_blank" rel="noreferrer">삼성에서 토큰 발급하기</a>
      <button className={button}>기기 목록 불러오기</button>
    </form>}
    {grant && <section className={card}>
      <label htmlFor="demo-meter" className="font-bold">밥솥에 연결한 플러그</label>
      <select id="demo-meter" className={field} value={choice ?? ''} onChange={e => setChoice(e.target.value === '' ? null : Number(e.target.value))}>
        {grant.choices.length > 1 && <option value="" disabled>시연할 플러그를 선택해 주세요</option>}
        {grant.choices.map(item => <option key={item.index} value={item.index}>{item.label}</option>)}
      </select>
      <p className="text-sm text-muted">10분 안에 선택한 플러그의 상태를 한 번 조회할 수 있어요.</p>
      <button type="button" className={button} disabled={choice === null} onClick={() => void finish('read')}>측정 결과 한 번 조회</button>
      <button type="button" className="min-h-11 underline" onClick={() => void finish('cancel')}>취소</button>
    </section>}
    {busy && <p role="status">요청을 처리하고 있어요.</p>}
    {error && <p role="alert" className="rounded-xl border border-line p-3">{error}</p>}
    {result && <section className={card} aria-label="SmartThings 조회 결과">
      <h2 className="text-xl font-bold">SmartThings 조회 결과</h2>
      <p>{{ recognized: '실물 유형으로 등록된 기기', virtual: '가상 기기', unknown: '실물 여부를 확인할 수 없는 기기' }[result.deviceKind]}</p>
      <p className="text-sm text-muted">조회 시각 · {formatDeviceTime(result.checkedAt)} (한국 시간)</p>
      <MeterReadings reading={result.reading} energy={result.energy} checkedAt={result.checkedAt} physicalPlug={result.deviceKind === 'recognized'} />
      <button type="button" className="min-h-11 underline" onClick={() => setResult(null)}>결과 닫기</button>
    </section>}
    <a className="mt-auto pt-4 font-bold underline" href={TEAM_SITE_URL + '/walking/steps/'} rel="noreferrer">휴대폰에서 내 걸음 측정 열기</a>
  </main>;
}
