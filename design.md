# design.md — Application Design

> cps.md의 솔루션을 시스템으로 옮긴 문서다. 기술 스택, 아키텍처, 데이터 모델, 판단 로직, UI/UX, API를 정의한다.
> `(가정)` / `(미확정)` 표기는 brd.md와 같은 뜻이다.

---

## 1. 기술 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 프론트엔드 | **Next.js (App Router) + TypeScript + Tailwind CSS** | 부양자 앱과 시니어 앱을 한 프로젝트 안의 두 라우트 그룹으로 둔다 |
| 앱 형태 | **PWA** (홈 화면 추가 + Web Push) | ADR-002 참고. 네이티브는 후속 |
| 백엔드/DB | **Supabase** (Postgres, Auth, Edge Functions, pg_cron) | ADR-001 참고 |
| 배포 | **Vercel** (Next.js) + Supabase (함수·크론) | |
| IoT | **삼성 스마트플러그 + SmartThings API** (`powerMeter` capability) | 홈어시스턴트 경유는 대안 (ADR-003) |
| 알림 | **Web Push (VAPID)** | iOS는 16.4 이상, 홈 화면에 추가해야 받을 수 있다 |
| 차트 | CSS 막대 (Recharts 미도입) | |
| 로그인 | **Supabase Auth 이메일 로그인 링크** (비밀번호 없음, PKCE) | ADR-004 |

자세한 버전과 명령어는 stack.md에 있다.

## 2. 아키텍처

```
[밥솥]─(전원)─[삼성 스마트플러그]──Wi-Fi──▶ [SmartThings Cloud]
                                                   │  REST: 디바이스 status (powerMeter)
                                                   ▼
                     ┌────────── Supabase (프로젝트 BOB, ap-northeast-2) ──────┐
  pg_cron (1분) ───▶ │ Edge Fn jobs?job=ingest → power_readings_raw            │
  pg_cron (5분) ───▶ │ Edge Fn jobs?job=judge  → cooker_events, meal_slots,    │
                     │                           daily_cooker_stats, raw 삭제  │
  pg_cron (10분) ──▶ │ Edge Fn jobs?job=alerts → alerts  (Web Push는 다음 단계) │
  pg_cron (00:00) ─▶ │ Edge Fn jobs?job=daily  → 어제 확정, 지난 이벤트 삭제    │
                     │ Edge Fn senior        ← 어르신 앱 (기기 토큰)           │
                     │ Edge Fn register-plug ← 보호자 (세션 JWT)               │
                     │ Postgres + RLS / Auth / Vault                            │
                     └──────────────────────────────────────────────────────────┘
                                    ▲                     ▲
                       [부양자 PWA (Next.js)]     [시니어 PWA: 버튼 3개]
                        RLS로 직접 읽기·쓰기        Edge Fn senior만 호출
```

- **실제 구현 기준 (2026-10-16):** 스키마의 원본은 `supabase/migrations/`다. 아래 3장은 설계 의도이고, 구현에서 추가된 것: `households`의 어르신 정보·`onboarding_step`·`last_cooker_at`·`senior_consent_at` 컬럼, 시니어 버튼 기록 `senior_actions` 테이블, 열린 알림 중복 방지 인덱스, RPC `ensure_household`·`issue_pairing_code`(보호자), `store_plug_token`·`get_plug_token`·`job_secret`(service role 전용).
- **원시값 보존:** 판정 창 90분이 지난 원시값은 judge 작업이 지우고, 어떤 경우에도 24시간을 넘기지 않는다 (daily 작업).
- **주기 작업 인증:** pg_cron → `private.run_job()` → `x-job-secret` 헤더. 비밀값은 Vault(`job_secret`)에만 있다.

- **수집 방식:** MVP는 SmartThings REST를 **폴링**한다. 간격은 1분이 기본값이고 `(미확정)`이다 (brd 미확정 #2). SmartApp 웹훅 구독은 후속 개선이다.
- **SmartThings 인증:** MVP 현장테스트는 가구별 PAT(Personal Access Token)를 쓴다 `(가정)`. 정식 서비스는 SmartThings OAuth(SmartApp)로 바꾼다.
- **시간대:** 모든 판정은 `Asia/Seoul` 기준이다. DB에는 timestamptz(UTC)로 저장한다.

## 3. 데이터 모델

> 원칙: **원시 전력값은 판정 후 삭제한다.** 영구 저장하는 것은 날짜별 취사·열림 횟수와 끼니별 상태뿐이다. 취사·열림 시각(cooker_events)은 다음 날 집계 후 삭제한다. 가족 화면에는 끼니 상태만 노출한다.

```sql
-- 부양자 계정 (Supabase Auth의 auth.users와 1:1)
profiles (
  id uuid pk references auth.users,
  name text, phone text,
  created_at timestamptz
)

-- 가구 (알림 단위)
households (
  id uuid pk,
  name text,                     -- 예: "세종 어머니 댁"
  resident_count int,            -- 거주 인원
  has_pet boolean,               -- 반려견 포함 여부
  region text,                   -- 'sejong' 등
  last_activity_at timestamptz,  -- 마지막 취사·뚜껑 열림·시니어 체크
  created_at timestamptz
)

-- 가구-부양자 연결 (MVP는 1명, 가족 초대는 후속)
household_guardians (
  household_id uuid fk, user_id uuid fk,
  role text default 'owner',     -- owner | member(후속)
  primary key (household_id, user_id)
)

-- 시니어 기기 (로그인 없이 페어링 코드로 접근)
senior_devices (
  id uuid pk, household_id uuid fk,
  pairing_code text unique,      -- 6자리, 부양자가 발급
  device_token_hash text,        -- 페어링 후 발급한 토큰의 해시
  paired_at timestamptz, last_seen_at timestamptz
)

-- 스마트플러그
smart_plugs (
  id uuid pk, household_id uuid fk,
  st_device_id text,             -- SmartThings deviceId
  st_token_secret_id uuid,       -- Supabase Vault에 둔 토큰 참조 (평문 저장 금지)
  status text,                   -- online | offline | unknown
  last_reading_at timestamptz
)

-- 식사 패턴·밥솥 습관 (온보딩)
meal_profiles (
  household_id uuid pk fk,
  meals_per_day int,             -- 하루 평균 끼니 수
  meal_windows jsonb,            -- [{"slot":"breakfast","start":"06:00","end":"10:00"}, ...]
  eat_out_per_week int,
  uses_keep_warm boolean,        -- 보온 사용 여부 (false면 뚜껑 열림 감지 불가)
  cooks_per_week int
)

-- 알림 기준
alert_settings (
  household_id uuid pk fk,
  missed_meals_threshold int default 2,   -- 연속 결식 N끼
  fasting_hours int default 48,           -- 공복시간 주의
  emergency_hours int default 72,         -- 건강 위험 신고
  emergency_contact jsonb                 -- 신고 대상 (미확정, MVP는 부양자 연락처 + 지정 연락처)
)

-- 원시 전력값 (임시 테이블, 판정 후 삭제)
power_readings_raw (
  id bigserial pk, plug_id uuid fk,
  measured_at timestamptz, watts numeric
)

-- 판정된 밥솥 이벤트
cooker_events (
  id uuid pk, household_id uuid fk,
  type text,                     -- cook | lid_open
  started_at timestamptz, ended_at timestamptz
)

-- 끼니별 상태 (가족 화면에 노출하는 유일한 식사 데이터)
meal_slots (
  household_id uuid fk, date date, slot text,   -- breakfast | lunch | dinner
  status text,                   -- confirmed | unconfirmed | eat_out | away | pending
  source text,                   -- cooker | senior_check | absence | null
  primary key (household_id, date, slot)
)

-- 부재 기간 (놀러가요)
absences (
  id uuid pk, household_id uuid fk,
  start_date date, end_date date,
  created_by text                -- senior | guardian
)

-- 알림 이력
alerts (
  id uuid pk, household_id uuid fk,
  type text,                     -- missed_meals | fasting | emergency | help_request | device_offline
  triggered_at timestamptz, acknowledged_at timestamptz,
  payload jsonb
)

push_subscriptions (
  id uuid pk, user_id uuid fk, endpoint text unique, keys jsonb
)
```

- **RLS:** 부양자는 `household_guardians`에 연결된 가구의 행만 읽고 쓸 수 있다. 시니어 기기는 Edge Function(`senior-action`)을 통해서만 쓴다. 토큰을 검증하고 자기 가구에만 쓸 수 있다. `power_readings_raw`와 `cooker_events`는 클라이언트에 노출하지 않는다 (service role 전용).
- **cooker_events 보존:** brd의 "개폐 원시 기록은 판정 후 삭제" 원칙에 따라, 그날의 끼니 판정이 끝나면(다음 날 00:00) 이벤트를 날짜별 횟수로 집계해 `daily_cooker_stats`에 남기고 이벤트 행은 삭제한다. 일·주·월 차트는 `daily_cooker_stats`로 그린다.

```sql
-- 날짜별 취사·열림 횟수 (차트용 요약, 시각 정보 없음)
daily_cooker_stats (
  household_id uuid fk, date date,
  cook_count int, lid_open_count int,
  primary key (household_id, date)
)
```

## 4. 판단 로직

### 4.1 전력 → 밥솥 이벤트 (judge-events)

| 이벤트 | 판단 기준 (초기값) | 비고 |
|---|---|---|
| 취사 `cook` | 800W 이상이 **연속 N분 이상** 이어진 구간 (N=5, `가정`) | 순간값이 아닌 구간 단위로 판단 |
| 보온 상태 | 30~60W가 연속 10분 이상 이어진 구간 | 이벤트로 저장하지 않고 열림 판단의 전제로만 쓴다 |
| 뚜껑 열림 `lid_open` | 보온 중 히터 재가동으로 전력이 순간 상승(보온 기준선 대비 +X W, X는 실측 후 결정) | 보온을 쓰지 않으면 감지할 수 없다. 센서 교차 확인 검토 중 (ADR-003) |

- 모든 기준값은 `config/detection.ts`의 상수로 두고, 밥솥 실측 후 확정한다 (brd 미확정 #5).
- 판정이 끝난 구간의 `power_readings_raw` 행은 같은 트랜잭션에서 삭제한다. 판정에 쓰이지 않은 데이터도 24시간이 지나면 삭제한다.

### 4.2 이벤트 → 끼니 상태

1. 매일 0시에 가구별 `meal_windows`로 오늘의 `meal_slots`를 만든다 (`pending`).
2. 슬롯 시간대 안에 `cook` 또는 `lid_open` 이벤트가 있으면 → `confirmed` (source=cooker).
3. 시간대 안에 시니어가 "외식했어요"를 누르면 → `eat_out` (source=senior_check). 슬롯 밖에 누르면 가장 가까운 슬롯에 적용한다.
4. 부재 기간에 걸린 날짜의 슬롯 중 2·3에 해당하지 않는 슬롯은 → `away`. 부재 중에도 취사가 감지되면(예정보다 일찍 귀가) `confirmed`가 우선한다.
5. 슬롯 종료 후에도 `pending`이면 → `unconfirmed`.

### 4.3 알림 판단 (check-alerts)

| 알림 | 조건 | 받는 사람 |
|---|---|---|
| 결식 알림 `missed_meals` | 최근 `unconfirmed` 슬롯이 연속 `missed_meals_threshold`개 이상 (`pending`은 건너뛰고, `eat_out`·`confirmed`·`away`가 끊는다) | 부양자 |
| 공복시간 주의 `fasting` | `now - last_activity_at >= fasting_hours` | 부양자 |
| 건강 위험 신고 `emergency` | `now - last_activity_at >= emergency_hours` | 부양자 + 지정 신고 대상 (`미확정`) |
| 도움 요청 `help_request` | 시니어가 버튼을 누름 | 부양자 + 지정 신고 대상, 즉시 |
| 기기 확인 `device_offline` | 플러그 마지막 수신 후 2시간 이상 `(가정)` | 부양자 |

- `last_activity_at`은 cook·lid_open 이벤트와 시니어 버튼(외식했어요·놀러가요·도움 요청) 중 가장 최근 시각으로 갱신한다 `(가정)`.
- **부재 기간 중**에는 missed_meals·fasting·emergency를 보내지 않는다. 부재가 끝나는 날부터 다시 센다.
- **플러그 오프라인 중**에는 fasting·emergency를 보내지 않고 device_offline만 보낸다. 미수신 시간은 공복시간에 넣지 않는다.
- 같은 유형의 알림은 조건이 풀리기 전까지 다시 보내지 않는다 (중복 방지).

## 5. UI/UX 구조

### 5.1 부양자 앱 (`/app/(guardian)`)

| 화면 | 경로 | 내용 |
|---|---|---|
| 로그인 | `/login` | 이메일 매직링크 또는 카카오 로그인 `(가정)` |
| 온보딩 | `/onboarding/[step]` | 상단 진행도 바와 "거의 다 왔어요!" 안내. ① 스마트플러그 연결(SmartThings 토큰) ② 와이파이·수신 확인 ③ 가구 정보 ④ 식사 패턴 ⑤ 밥솥 습관 ⑥ 알림 기준 ⑦ 시니어 기기 페어링 코드 발급 |
| 홈 | `/` | 오늘 끼니 상태 카드(아침·점심·저녁: 확인됨/미확인/외식/부재), 마지막 활동 시각, 기기 상태, 진행 중인 알림 |
| 식사 기록 | `/records?range=day\|week\|month` | 취사·열림 횟수 차트, 끼니 상태 캘린더 |
| 리포트 | `/report` | **종합**(가전 무관): 최근 7일 vs 이전 28일 끼니 확인율, 끼니별 확인율, 하루별 끼니 상태. **가전별 탭**: `components/report/devices.tsx` 등록부(DeviceReport)를 돌며 그린다. 지금은 밥솥(사용 횟수 vs 평소·알려 준 횟수, 전기 사용량·요금)만 있고 전자레인지·냉장고는 '준비 중'. 전기요금은 `daily_cooker_stats`에 하루 전력량 합계(energyWh)가 생기면 표시된다 (스키마·jobs 변경 필요, 미적용). 계산은 `lib/report/metrics.ts` |
| 알림 이력 | `/alerts` | 알림 목록, 확인 처리 |
| 설정 | `/settings` | 알림 기준, 식사 시간대, 부재 일정 등록, 기기 관리 |

### 5.2 시니어 앱 (`/app/(senior)/s`)

- 한 화면에 큰 버튼 3개만 둔다. 글자는 최소 24px, 버튼은 화면 높이의 1/4 이상, 고대비로 만든다.
  - 🍜 **외식했어요** → "밖에서 드셨나요?" 확인 팝업 → 완료 화면 ("잘 드셨어요!")
  - 🧳 **놀러가요** → 시작일(기본 오늘)·종료일 선택 → 완료
  - 🚨 **도움 요청** → "도움을 요청할까요?" 확인(두 번 탭하지 않게 한 번 확인) → 즉시 발송 → "가족에게 알렸어요"
- 로그인이 없다. 처음 한 번만 부양자가 준 6자리 페어링 코드를 넣는다.

## 6. API 설계

> 구현 결정 (ADR-005): 별도 Next.js API를 두지 않는다. 보호자 앱은 Supabase에 **RLS로 직접** 읽고 쓰고, 권한이 더 필요한 일만 RPC·Edge Function으로 한다. 주기 작업 4개는 Edge Function `jobs` 하나로 묶었다.

### 보호자 앱 → Supabase (세션 필요, RLS 적용)

| 동작 | 방법 |
|---|---|
| 내 가구 가져오기/만들기 (온보딩 시작) | RPC `ensure_household()` |
| 온보딩 단계·어르신 정보·식사 패턴·알림 기준 저장 | `households`·`meal_profiles`·`alert_settings` update |
| 끼니 상태·횟수 조회 | `meal_slots`·`daily_cooker_stats` select (최근 35일) |
| 부재 일정 추가·삭제 | `absences` insert/delete |
| 알림 목록·확인 | `alerts` select / update `acknowledged_at` |
| 어르신 연결 숫자 발급 (24시간) | RPC `issue_pairing_code(h)` |
| 플러그 등록 | Edge Function `register-plug` (아래) |

### Supabase Edge Functions

| 함수 | 인증 | 설명 |
|---|---|---|
| `jobs?job=ingest` | `x-job-secret` (pg_cron 1분) | 플러그마다 SmartThings `powerMeter` 조회 → `power_readings_raw`, `smart_plugs.status` |
| `jobs?job=judge` | 〃 (5분) | 4.1 판정(창 양 끝에서 잘린 구간 제외) → `cooker_events`, 90분 지난 원시값 삭제, 오늘 `meal_slots`·`daily_cooker_stats` 재계산 |
| `jobs?job=alerts` | 〃 (10분, :02부터) | 4.3 판정 → `alerts` 생성·해제. Web Push 발송은 다음 단계 |
| `jobs?job=daily` | 〃 (00:00 KST) | 어제 끼니 확정·집계, 지난 `cooker_events` 삭제, 24시간 지난 원시값 삭제 |
| `senior` | 기기 토큰 (해시만 저장) | `pair`(연결 숫자 → 토큰), `status`, `eat_out`, `help`(즉시 `help_request` 알림), `away`(days), `back` |
| `register-plug` | 보호자 세션 JWT | SmartThings 값을 실제로 읽어 확인한 뒤 토큰을 Vault에 저장 (`store_plug_token`) |

배포: 각 함수는 `supabase/functions/<이름>/index.ts` + `_shared/core.ts` + 앱의 `lib/judge/*`, `config/detection.ts`를 함께 올린다 (판단 로직은 앱과 서버가 같은 코드). 배포용 `deno.json`은 `{"imports": {"@/": "./"}}`.
## 7. 비기능 요구

- **개인정보:** 원시 전력값은 판정 후 삭제한다. SmartThings 토큰은 Vault에 둔다. 가족 화면에는 끼니 상태만 노출한다. 온보딩에서 시니어 동의를 확인하는 체크를 받는다.
- **신뢰성:** 함수 실패는 다음 주기에 다시 처리한다 (멱등). 알림 발송 실패는 로그로 남긴다.
- **접근성:** 시니어 화면은 큰 글자, 고대비, 최소한의 단계로 만든다.
