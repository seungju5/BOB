# stack.md — Tech Stack Reference

> 고정 스택 레퍼런스다. 버전은 Phase 0에서 프로젝트를 만들 때 실제 설치한 값으로 채운다. 스택을 바꾸면 adr.md에 이유를 남긴다.

---

## 고정 스택

| 영역 | 기술 | 버전 | 용도 |
|---|---|---|---|
| 런타임 | Node.js | 24.20 LTS | |
| 프레임워크 | Next.js (App Router, Turbopack, Cache Components) | 16.4.2 | 부양자·시니어 PWA |
| UI | React | 19.3 | |
| 언어 | TypeScript | 5.9 | strict 모드 |
| 스타일 | Tailwind CSS | 4.3 | 토큰은 `app/globals.css`의 `@theme` |
| 폰트 | Pretendard(CDN) + Gaegu(next/font, 손글씨) | — | |
| DB/백엔드 | Supabase (Postgres, Auth, Edge Functions, pg_cron, Vault) | — | 데이터, 인증, 수집·판정·알림 함수 |
| 배포 | Vercel | — | Next.js 호스팅 |
| IoT | SmartThings REST API | v1 | 스마트플러그 전력값 (`powerMeter`) |
| 푸시 | Web Push (`web-push`) | 설치 시 기록 | VAPID 알림 |
| 차트 | CSS 막대 (Recharts 미도입) | — | 식사 기록 차트 |
| 단위 테스트 | Vitest | 5.0 | 판단 로직 (`npm test`) |
| E2E | Playwright | 미설정 | 유저플로우 |

## Supabase

- 프로젝트: **BOB** (`vqqolzpodmaibnjazxus`, ap-northeast-2, 무료 플랜), 조직 seungju5's Org
- 마이그레이션: `0001_init.sql`(스키마·RLS·RPC), `0002_jobs_cron.sql`(pg_cron·pg_net·Vault 비밀값·예약)
- Edge Functions: `jobs`(verify_jwt 끔, `x-job-secret`), `senior`(verify_jwt 끔, 기기 토큰), `register-plug`(verify_jwt 켬)
- Vault 비밀값: `project_url`, `job_secret`, 플러그별 SmartThings 토큰(`plug_<가구id>_<시각>`)
- 예약 확인: `select * from cron.job;` / 응답 확인: `select * from net._http_response order by id desc limit 10;`
- 함수 배포 시 함께 올릴 파일: `index.ts`, `_shared/core.ts`, `lib/judge/{time,types,resolveMealSlots,detectEvents,evaluateAlerts}.ts`, `config/detection.ts`, 배포용 `deno.json` `{"imports":{"@/":"./"}}`. (`senior`·`register-plug`는 detectEvents·evaluateAlerts·config 불필요)

## 폴더 구조 (제안)

```
app/
  (guardian)/          부양자 앱: login, onboarding, records, report, alerts, settings
  (senior)/s/          시니어 앱: 페어링, 버튼 3개
  api/                 Route Handlers
lib/
  judge/               detectEvents, resolveMealSlots, evaluateAlerts (순수 함수)
  supabase/            클라이언트, 서버 헬퍼
  push/                Web Push 유틸
config/
  detection.ts         판단 기준값 상수
supabase/
  migrations/          스키마, RLS
  functions/           ingest-power, judge-events, check-alerts, create-daily-slots, senior-pair, senior-action
tests/
  unit/                T-DET, T-MEAL, T-ALR
  e2e/                 T-FLOW
```

## 환경변수

| 이름 | 위치 | 설명 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel, 로컬 | Supabase URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel, `.env.local` | 클라이언트 키 (sb_publishable_…) |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 | 절대 클라이언트에 노출 금지 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Vercel, 로컬 | Web Push 공개키 |
| `VAPID_PRIVATE_KEY` | Supabase 함수 secrets | Web Push 개인키 |
| SmartThings 토큰 | Supabase Vault | 가구별 PAT. env에 두지 않는다 |

## 자주 쓰는 명령어

```bash
npm run dev
```

```bash
npx vitest
```

```bash
npx playwright test
```

```bash
npx supabase start
```

```bash
npx supabase migration new <name>
```

```bash
npx supabase db push
```

```bash
npx supabase functions deploy <name>
```

```bash
npx web-push generate-vapid-keys
```
