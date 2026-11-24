'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  Cursor,
  Member,
  Overview,
  Profile,
  Stage,
  Studio,
  StudioChange,
  StudioDetail,
} from '@/lib/supabase/studio-types';
import { studioError as errorText } from '@/lib/supabase/studio';
import { IconChart, IconCheck, IconFile, IconClock, IconArrowRight } from '@/components/icons';

const stageLabel: Record<Stage, string> = { new: '미처리', review: '확인 중', done: '처리 완료' };
const number = new Intl.NumberFormat('ko-KR');
const time = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const date = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
function stamp(iso: string | null, short = false) {
  return iso ? (short ? date : time).format(new Date(iso)) : '기록 없음';
}
function Message({ error, children }: { error?: boolean; children: React.ReactNode }) {
  return (
    <p className={error ? 'studio-error' : 'studio-message'} role={error ? 'alert' : 'status'}>
      {children}
    </p>
  );
}
function Badge({ person }: { person: Member }) {
  return (
    <span
      className={
        person.disabled ? 'studio-badgeOff' : person.verified ? 'studio-badgeOk' : 'studio-badgeWait'
      }
    >
      <i />
      {person.disabled ? '사용 중지' : person.verified ? '인증 완료' : '인증 대기'}
    </span>
  );
}
function MembersTable({ rows, select }: { rows: Member[]; select: (id: string) => void }) {
  if (!rows.length) return <Message>조건에 맞는 가입자가 없습니다.</Message>;
  return (
    <div className="studio-tableWrap">
      <table>
        <thead>
          <tr>
            <th>가입 계정</th>
            <th>인증 상태</th>
            <th>가입일</th>
            <th>최근 로그인</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.uid}>
              <td>
                <button className="studio-rowLink" onClick={() => select(p.uid)}>
                  <span className="studio-smallAvatar">
                    {(p.email || '?').slice(0, 1).toUpperCase()}
                  </span>
                  <span>{p.email || p.uid}</span>
                </button>
              </td>
              <td>
                <Badge person={p} />
              </td>
              <td>{stamp(p.joined, true)}</td>
              <td>{stamp(p.lastLogin, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function StudioDashboard({
  api,
  uid,
  select,
  showMembers,
}: {
  api: Studio;
  uid: string;
  select: (id: string) => void;
  showMembers: () => void;
}) {
  const [data, setData] = useState<Overview | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    void api
      .overview(uid)
      .then((x) => {
        if (live) setData(x);
      })
      .catch((e) => {
        if (live) setError(errorText(e));
      });
    return () => {
      live = false;
    };
  }, [api, uid]);
  if (error) return <Message error>{error}</Message>;
  if (!data) return <Message>운영 집계를 불러오는 중입니다.</Message>;
  const week = data.days.reduce((sum, d) => sum + d.count, 0),
    max = Math.max(1, ...data.days.map((d) => d.count));
  const metrics = [
    { name: '전체 가입자', value: data.total, unit: '명', Icon: IconChart },
    { name: '이메일 인증 완료', value: data.verified, unit: '명', Icon: IconCheck },
    { name: '저장된 보호자 프로필', value: data.stored, unit: '개', Icon: IconFile },
  ];
  const ratio = data.total ? Math.round((data.verified * 100) / data.total) : 0;
  return (
    <>
      <section className="studio-metrics" aria-label="가입 및 저장 현황">
        {metrics.map(({ name, value, unit, Icon }) => (
          <div key={name} className="studio-metric">
            <span>
              <Icon />
              {name}
            </span>
            <strong>
              {number.format(value)}
              <small>{unit}</small>
            </strong>
          </div>
        ))}
      </section>
      <div className="studio-insights">
        <section className="studio-panel">
          <div className="studio-panelHead">
            <h2>가입 추이</h2>
            <span>최근 7일</span>
          </div>
          <p className="studio-chartTotal">
            신규 가입 <strong>{number.format(week)}명</strong>
          </p>
          <div
            className="studio-chart"
            role="img"
            aria-label={data.days.map((d) => d.day + ' 가입 ' + d.count + '명').join(', ')}
          >
            {data.days.map((d) => (
              <div key={d.day} className="studio-chartCol">
                <div className="studio-plot">
                  <div style={{ height: (d.count / max) * 78 + '%' }} className="studio-bar" />
                  <small>{d.count}</small>
                </div>
                <span>{d.day.slice(5).replace('-', '/')}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="studio-panel">
          <div className="studio-panelHead">
            <h2>이메일 인증 현황</h2>
          </div>
          <p className="studio-ratio">{data.total ? ratio + '%' : '—'}</p>
          <div className="studio-track">
            <i style={{ width: ratio + '%' }} />
          </div>
          <dl className="studio-legend">
            <div>
              <dt>
                <i />
                인증 완료
              </dt>
              <dd>{number.format(data.verified)}명</dd>
            </div>
            <div>
              <dt>
                <i />
                인증 대기
              </dt>
              <dd>{number.format(data.total - data.verified)}명</dd>
            </div>
          </dl>
        </section>
      </div>
      <section className="studio-panel">
        <div className="studio-panelHead">
          <h2>최근 가입자</h2>
          <button onClick={showMembers} className="studio-textLink">
            전체 보기 <IconArrowRight />
          </button>
        </div>
        <MembersTable rows={data.latest} select={select} />
      </section>
      <p className="studio-source">
        <IconClock />팀 인증 서버에서 확인한 시각 ·{' '}
        {stamp(data.syncedAt)}
      </p>
    </>
  );
}
export function StudioDirectory({
  api,
  uid,
  kind,
  refresh,
  select,
}: {
  api: Studio;
  uid: string;
  kind: 'members' | 'profiles';
  refresh: number;
  select: (id: string) => void;
}) {
  const [input, setInput] = useState(''),
    [search, setSearch] = useState(''),
    [stack, setStack] = useState<(Cursor | null)[]>([null]);
  const [result, setResult] = useState<{ rows: (Member | Profile)[]; next: Cursor | null } | null>(null),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  const cursor = stack.at(-1) ?? null;
  useEffect(() => {
    let live = true;
    void api
      .page(uid, kind, search, cursor)
      .then((x) => {
        if (live) {
          setError('');
          setResult(x);
        }
      })
      .catch((e) => {
        if (live) setError(errorText(e));
      });
    return () => {
      live = false;
    };
  }, [api, uid, kind, search, cursor, retry, refresh]);
  function load() {
    setError('');
    setResult(null);
    setRetry((x) => x + 1);
  }
  function find(next: string) {
    setSearch(next.trim());
    setStack([null]);
    load();
  }
  return (
    <section className="studio-panel">
      <div className="studio-toolbar">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            find(input);
          }}
        >
          <label htmlFor="studio-search" className="studio-sr">
            전체 이메일 또는 사용자 UID
          </label>
          <input
            id="studio-search"
            placeholder="전체 이메일 또는 사용자 UID"
            type="search"
            maxLength={254}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button className="studio-subButton">검색</button>
        </form>
        {search && (
          <button
            className="studio-textLink"
            onClick={() => {
              setInput('');
              find('');
            }}
          >
            검색 해제
          </button>
        )}
      </div>
      {error ? (
        <>
          <Message error>{error}</Message>
          <button className="studio-subButton" onClick={load}>
            다시 조회
          </button>
        </>
      ) : !result ? (
        <Message>목록을 불러오는 중입니다.</Message>
      ) : kind === 'members' ? (
        <MembersTable rows={result.rows as Member[]} select={select} />
      ) : result.rows.length ? (
        <div className="studio-tableWrap">
          <table>
            <thead>
              <tr>
                <th>보호자 이름</th>
                <th>계정 이메일</th>
                <th>프로필 저장 시각</th>
              </tr>
            </thead>
            <tbody>
              {(result.rows as Profile[]).map((p) => (
                <tr key={p.uid}>
                  <td>
                    <button className="studio-rowLink" onClick={() => select(p.uid)}>
                      <span className="studio-smallAvatar">{p.name.slice(0, 1)}</span>
                      {p.name}
                    </button>
                  </td>
                  <td>{p.email}</td>
                  <td>{stamp(p.saved)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Message>조건에 맞는 저장 프로필이 없습니다.</Message>
      )}
      <div className="studio-pager">
        <span>
          {stack.length}페이지{result ? ' · ' + result.rows.length + '건' : ''}
        </span>
        <button
          className="studio-subButton"
          disabled={stack.length === 1 || !result}
          onClick={() => {
            setStack((x) => x.slice(0, -1));
            load();
          }}
        >
          이전
        </button>
        <button
          className="studio-subButton"
          disabled={!result?.next}
          onClick={() => {
            if (result?.next) {
              setStack((x) => [...x, result.next]);
              load();
            }
          }}
        >
          다음
        </button>
      </div>
    </section>
  );
}
export function StudioDetails({
  api,
  uid,
  id,
  close,
  saved,
}: {
  api: Studio;
  uid: string;
  id: string;
  close: () => void;
  saved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<StudioDetail | null>(null),
    [name, setName] = useState(''),
    [note, setNote] = useState(''),
    [stage, setStage] = useState<Stage>('new');
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0);
  const active = useRef(true),
    lock = useRef(false);
  function show(x: StudioDetail) {
    setData(x);
    setName(x.profile?.name ?? '');
    setStage(x.stage);
    setNote(x.note);
  }
  useEffect(() => {
    active.current = true;
    dialog.current?.showModal();
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    void api
      .detail(uid, id)
      .then((x) => {
        if (live) show(x);
      })
      .catch((e) => {
        if (live) setError(errorText(e));
      });
    return () => {
      live = false;
    };
  }, [api, uid, id, reload]);
  async function submit(change: StudioChange) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.save(uid, id, change);
      const latest = await api.detail(uid, id);
      if (!active.current) return;
      // Keep the other form's unsaved draft and original conflict-check version.
      if (change.type === 'name') {
        setData((previous) => (previous ? { ...previous, profile: latest.profile } : latest));
        setName(latest.profile?.name ?? '');
      } else {
        const { stage, note, caseAt, caseVersion } = latest;
        setData((previous) => (previous ? { ...previous, stage, note, caseAt, caseVersion } : latest));
        setStage(stage);
        setNote(note);
      }
      saved();
      if (
        change.type === 'name'
          ? latest.profile?.name !== change.name.trim()
          : latest.stage !== change.stage || latest.note !== change.note.trim()
      )
        throw Error('다른 변경이 반영되었습니다. 최신 내용을 확인해 주세요.');
      setNotice('서버에서 저장한 내용을 확인했습니다.');
    } catch (e) {
      if (active.current) setError(errorText(e));
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <dialog
      className="studio-drawer"
      aria-labelledby="detail-title"
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header>
        <div>
          <span>계정 상세</span>
          <h2 id="detail-title">{data?.profile?.name || '가입자 정보'}</h2>
        </div>
        <button className="studio-subButton" onClick={close}>
          닫기
        </button>
      </header>
      <div className="studio-drawerBody">
        {error && (
          <>
            <Message error>{error}</Message>
            <button
              className="studio-subButton"
              disabled={busy}
              onClick={() => {
                setError('');
                setNotice('');
                setData(null);
                setReload((x) => x + 1);
              }}
            >
              최신 정보 다시 조회
            </button>
          </>
        )}
        {notice && (
          <p className="studio-success" role="status">
            {notice}
          </p>
        )}
        {!data && !error ? (
          <Message>저장 정보를 확인하는 중입니다.</Message>
        ) : (
          data && (
            <>
              <h3>가입 정보</h3>
              <dl className="studio-info">
                <dt>이메일</dt>
                <dd>{data.member?.email || data.profile?.email || '기록 없음'}</dd>
                <dt>사용자 UID</dt>
                <dd>{id}</dd>
                <dt>인증 상태</dt>
                <dd>{data.member ? <Badge person={data.member} /> : '가입 목록에 없음'}</dd>
                <dt>가입 시각</dt>
                <dd>{stamp(data.member?.joined ?? null)}</dd>
              </dl>
              <h3>저장 데이터</h3>
              <dl className="studio-info">
                <dt>보호자 프로필</dt>
                <dd>{stamp(data.profile?.saved ?? null)}</dd>
                <dt>가구 정보</dt>
                <dd>{stamp(data.householdAt)}</dd>
                <dt>생활·알림 설정</dt>
                <dd>{stamp(data.settingsAt)}</dd>
              </dl>
              {data.profile && (
                <form
                  className="studio-editor"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit({ type: 'name', name, version: data.profile!.version });
                  }}
                >
                  <label htmlFor="operator-name">보호자 이름</label>
                  <input
                    id="operator-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    minLength={2}
                    maxLength={30}
                    required
                    disabled={busy}
                  />
                  <button
                    className="studio-subButton"
                    disabled={busy || name.trim() === data.profile.name}
                  >
                    프로필 이름 저장
                  </button>
                </form>
              )}
              <h3>운영 기록</h3>
              <form
                className="studio-editor"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit({ type: 'case', stage, note, version: data.caseVersion });
                }}
              >
                <label htmlFor="case-stage">처리 상태</label>
                <select
                  id="case-stage"
                  value={stage}
                  disabled={busy}
                  onChange={(e) => setStage(e.target.value as Stage)}
                >
                  {(Object.keys(stageLabel) as Stage[]).map((k) => (
                    <option key={k} value={k}>
                      {stageLabel[k]}
                    </option>
                  ))}
                </select>
                <label htmlFor="case-note">팀 내부 메모</label>
                <textarea
                  id="case-note"
                  rows={3}
                  maxLength={500}
                  disabled={busy}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                {data.caseAt && <small>마지막 수정 · {stamp(data.caseAt)}</small>}
                <button
                  className="studio-primary"
                  disabled={busy || (stage === data.stage && note.trim() === data.note)}
                >
                  운영 기록 저장
                </button>
              </form>
            </>
          )
        )}
      </div>
    </dialog>
  );
}
