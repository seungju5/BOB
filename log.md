# log.md — Dev Log

> 작업할 때마다 위에 새 항목을 추가한다 (최신이 위).

---

## 2026-11-12 (Google·Kakao 보호자 로그인)

- **한 일:** `main`의 기존 소셜 로그인 버튼에 PKCE 코드 교환 전용 `/auth/callback`을 연결했다. 이메일 링크도 같은 콜백을 사용한다. 성공 시 `getUser()`를 확인한 뒤 실서비스 모드를 켜고, 취소·만료·설정 오류를 로그인 화면에 안내한다. 로그아웃/계정 전환 중 끝난 이전 가구의 요청이 화면 캐시를 다시 채우지 않도록 요청 세대를 구분했다.
- **문서:** 공급자 콘솔 설정과 Redirect URL 구분을 `docs/google-kakao-login.md`에 기록하고 ADR-006·설계·할 일을 갱신했다.
- **검증:** 단위 테스트 48개, ESLint, TypeScript, webpack 프로덕션 빌드 통과. Supabase Google·Kakao 공급자 설정과 실제 계정의 성공·취소·가구 격리는 아직 검증하지 못했다. 기본 Turbopack 빌드와 로컬 브라우저 실행은 이 로컬 환경의 포트 바인딩 제한으로 완료되지 않았다.
- **배포:** 저장소 브랜치의 코드만 변경했다. 운영 DB·RLS·배포 설정·Firebase 계정은 변경하지 않았다.

## 2026-10-16 (Supabase 연결)

- **한 일:**
  - 기존 빈 프로젝트 BOB(서울, 무료 플랜, 추가 비용 없음)에 스키마·RLS·RPC 적용 (`0001_init.sql`), pg_cron·pg_net·Vault 예약 작업 적용 (`0002_jobs_cron.sql`)
  - Edge Functions 배포: `jobs`(ingest/judge/alerts/daily), `senior`(어르신 앱), `register-plug`(플러그 등록)
  - 앱: 데이터 계층 `lib/data`(데모·실서버 공통 모양), 이메일 로그인(`/login`), 온보딩·설정에 플러그 등록·연결 숫자 발급 연결
  - 검증: 예약 작업 응답 200, 임시 가구로 어르신 연결 → 상태 조회 → 외식 기록 → 점심 `eat_out` 판정 → 알림 중복 방지까지 실서버에서 확인 후 임시 가구 삭제
- **결정한 것:** ADR-004(이메일 로그인 링크), ADR-005(별도 API 없이 RLS + Edge Function, 주기 작업 단일 함수)
- **막힌 것 / 확인 못 한 것:**
  - 보호자 로그인 메일 수신은 실제 메일함이 필요해 확인하지 못함. 기본 메일 발송 한도가 낮음 → 현장테스트 전 커스텀 SMTP 필요
  - SmartThings 실제 플러그가 없어 `ingest`·`register-plug`의 외부 호출은 미검증
  - Web Push 미구현 (알림은 DB와 화면에만 쌓임)
  - 플러그를 등록하지 않은 가구에는 '플러그를 연결해 주세요' 알림이 계속 떠 있음 (의도)
- **다음 할 일:** 로그인 실사용 확인 → Web Push → 실제 플러그 연결 → Vercel 배포 + Supabase Redirect URL 등록

## 2026-10-16

- **한 일:**
  - Next.js 16.4 + TypeScript + Tailwind 4 프로젝트 생성, Vitest 설정
  - 판단 로직 순수 함수 `detectEvents`, `resolveMealSlots`, `evaluateAlerts` (`lib/judge/`). test.md 기반 단위 테스트 38개 통과
  - 디자인 시스템: 노란 콜라보 시안(A안) 기반 토큰 (`app/globals.css`), 밥솥이 캐릭터·아이콘·공통 UI
  - 화면: 시작(`/`), 어르신(`/s`: 페어링·버튼 3개), 보호자 온보딩 7단계(`/onboarding`), 홈·기록·리포트·알림·설정
  - Supabase 스키마·RLS SQL 작성 (`supabase/migrations/0001_init.sql`, 아직 적용 안 함)
  - 브라우저에서 확인: 온보딩 → 어르신 페어링 → 도와줘요 → 보호자 홈 알림, 기록·리포트·설정, 플러그 끊김 알림
- **결정한 것:**
  - Supabase 연결 전까지 화면은 `lib/demo`(localStorage) 데모 상태로 동작. 같은 브라우저의 어르신·보호자 화면이 상태를 공유
  - 결식 연속 계산에서 `away`(부재)는 연속을 끊는다 (design.md 4.3 수정: "부재가 끝난 뒤부터 다시 센다"와 맞춤)
  - 플러그 오프라인 중에는 결식 알림도 보내지 않는다 (기기 문제와 결식 구분)
  - 어르신 버튼 이름은 시안대로 "도와줘요" (기능 이름은 도움 요청)
  - 차트는 의존성 없이 CSS 막대로 구현 (Recharts 미도입)
  - 리포트는 확인율이 평소보다 10%p 이상 떨어지면 안내
- **막힌 것:** 없음. 실제 연결에는 Supabase 프로젝트·SmartThings 토큰·밥솥 실측이 필요
- **다음 할 일:** Supabase 프로젝트 생성·마이그레이션 적용 → Auth → Edge Functions(ingest-power, judge-events, check-alerts) → Web Push. 병행으로 밥솥 실측
