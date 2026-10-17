# todo.md — Task List & Progress

> plan.md를 작업 단위로 쪼갠 체크리스트다. 작업이 끝나면 `[x]`로 바꾸고, 담당자와 날짜를 적는다.
> 테스트 ID는 test.md를 참고한다.
>
> **2026-10-16 현황:** Supabase(BOB)에 연결됨. 화면은 로그인하면 실서버, '데모로 둘러보기'면 브라우저 저장소를 쓴다. 남은 큰 일: Web Push, 실제 플러그로 수집 검증, Vercel 배포.

---

## Phase 0 — 준비

- [x] Next.js(App Router) + TypeScript + Tailwind 프로젝트 생성 (2026-10-16, Next 16.4)
- [ ] PWA 설정: manifest, 아이콘, service worker — manifest·아이콘 완료, service worker 남음
- [ ] ESLint·Prettier, Vitest(단위), Playwright(E2E) 설정 — ESLint·Vitest 완료, Prettier·Playwright 남음
- [x] Supabase 프로젝트 연결 (BOB, 기존 빈 프로젝트 사용), `supabase/migrations` 구조 — CLI 로컬 환경은 미설정
- [ ] Vercel 연결, `.env.example` 작성 — `.env.example` 완료, Vercel 남음
- [ ] SmartThings PAT 발급, `powerMeter` 조회 확인, rate limit 확인
- [ ] 밥솥 실측: 스마트플러그 설치, 1분 간격 3일 이상 기록 스크립트
- [ ] 실측 라벨링: 취사·보온·뚜껑 열림 시각 기록
- [ ] 실측 결과 정리 → adr.md에 기준값 근거 기록

## Phase 1 — 데이터 수집·판단

- [x] 마이그레이션: profiles, households, household_guardians, senior_devices, smart_plugs (`supabase/migrations/0001_init.sql`, BOB에 적용)
- [x] 마이그레이션: meal_profiles, alert_settings, absences (적용)
- [x] 마이그레이션: power_readings_raw, cooker_events, daily_cooker_stats, meal_slots, alerts, push_subscriptions (적용)
- [ ] RLS 정책 + T-PRV-01·02 테스트 — 정책 적용, 자동 테스트 남음
- [x] SmartThings 토큰 Vault 저장 (T-PRV-04, `register-plug` → `store_plug_token`)
- [x] `config/detection.ts` 기준값 상수 (실측 전 초기값)
- [x] T-DET-01~07 테스트 작성
- [x] `detectEvents()` 구현
- [x] T-MEAL-01~07 테스트 작성
- [x] `resolveMealSlots()` 구현
- [x] `ingest-power` → `jobs?job=ingest` + pg_cron 1분 (실제 플러그로는 미검증)
- [x] `judge-events` → `jobs?job=judge` + pg_cron 5분, raw 삭제, last_activity_at 갱신
- [x] `create-daily-slots` → `jobs?job=daily` + pg_cron 00:00 KST (전날 이벤트 집계·삭제 포함, T-REC-04)
- [x] raw 24시간 정리 작업 (T-PRV-03, daily 작업)
- [ ] 실측 데이터로 기준값 튜닝

## Phase 2 — 알림

- [x] T-ALR-01~09 테스트 작성 (T-ALR-07 즉시 발송은 화면에서 확인)
- [x] `evaluateAlerts()` 구현 (부재·오프라인 처리 포함)
- [x] `check-alerts` → `jobs?job=alerts` + pg_cron 10분, 중복 방지(유니크 인덱스)
- [ ] VAPID 키 생성, Web Push 발송 유틸
- [ ] `/api/push/subscribe`, 알림 권한 요청 UI
- [x] device_offline 알림 판단 (T-EDGE-01·02) — 발송은 check-alerts 구현 후
- [ ] 실제 기기 푸시 수신 확인 (Android, iOS 홈 화면 추가)

## Phase 3 — 부양자 앱

- [x] 로그인 (Supabase Auth 이메일 링크) — 실제 메일 수신은 사용자 확인 필요
- [x] 온보딩 레이아웃 + 진행도 바
- [x] 온보딩 ① 스마트플러그 연결 ② 수신 확인 (화면만, 실제 API 확인은 연결 후)
- [x] 온보딩 ③ 가구 정보 ④ 식사 패턴 ⑤ 밥솥 습관
- [x] 온보딩 ⑥ 알림 기준(+시니어 동의) ⑦ 페어링 코드 발급
- [x] 온보딩 이어하기 (T-ONB-05)
- [x] 홈: 오늘 끼니 카드, 마지막 활동, 기기 상태, 진행 중 알림
- [x] 식사 기록: 일·주·월 차트 (CSS 막대로 구현, Recharts 미사용)
- [x] 리포트: 최근 7일 vs 이전 28일
- [x] 알림 이력·확인 처리
- [x] 설정: 알림 기준, 식사 시간대, 부재 일정, 기기 관리

## Phase 4 — 시니어 앱

- [x] `senior-pair` → `senior` op=pair (실서버로 검증)
- [x] `senior-action` → `senior` op=eat_out/help/away/back (T-SEN-06: 토큰 해시로 가구 고정)
- [x] 페어링 화면
- [x] 버튼 3개 화면 (큰 글씨, 고대비)
- [x] 외식했어요 확인 팝업
- [x] 놀러가요 날짜 선택 (오늘만/2일/3일/일주일 + 일찍 귀가)
- [x] 도움 요청 확인 → 즉시 알림 (T-ALR-07, 데모 저장소 기준)
- [ ] 어르신 1명 사용성 테스트

## Phase 5 — QA·현장테스트

- [ ] test.md 전체 실행, 결과 기록
- [ ] E2E T-FLOW-01~05
- [ ] 개인정보 점검 (T-PRV 전체)
- [ ] 현장 설치 가이드 작성
- [ ] 세종 테스트 가구 설치
- [ ] 1주 운영, 지표 수집 (test.md 4장)
- [ ] 피드백 반영, 배포 링크 확정

---

## Firebase 통합판

- [x] 기존 앱 보존, Firebase를 별도 폴더로 가져오기 (2026-10-16)
- [x] 공통 판단 코드 생성·누락 검사·동등성 테스트
- [x] 노란색·로고 유지, 토끼 자연스러운 질감 개선, 작은 밥 캐릭터 추가
- [x] 이후 작업용 제품 결정 기록과 CI 설치안 작성
- [x] 최신 main의 가구 정보 후 환영 흐름을 Firebase 디자인으로 반영 (2026-10-17, Codex)
- [x] 독립된 1분 체험, 5가지 하루, 근거 보기와 날짜별 기록 탐색 (2026-10-17, Codex)
- [x] 도움 요청 우선 동선, 시니어 행동 접수 안내, 설정 초안·최종 적용 분리 (2026-10-17, Codex)
- [x] Supabase와 같은 외출 기간 선택지, 직접 입력 접기, 귀가 안내 갱신 (2026-10-17, Codex)
- [x] 320px·390px·큰 글씨·역할 전환·키보드 탐색 검증 (2026-10-17, Codex)
- [x] 본문 바로가기의 역할 주소 보존, 외출 창 Esc 후 버튼 초점 복귀 (2026-10-17, Codex)
- [x] 7장면 소개 영상, 한국어 합성 음성·자막, 1페이지 대본 PDF 제작 (2026-10-17, Codex)
- [x] 사용자 제공 밥솥 캐릭터의 투명 배경 시안·기기 소식 영역 적용, 기존 토끼·로고·데이터 밥그릇 보존 (2026-10-17, Codex)
- [x] 최신 요청에 따라 밥솥 캐릭터를 브랜드 심볼로 채택, 글자 로고·토끼 유지 및 이전 심볼 파일 보관 (2026-10-17, Codex)
- [ ] 실제 어르신·보호자에게 1분 체험과 도움 요청 흐름 사용성 검증
- [ ] 권한 있는 관리자가 CI 설치안 활성화 (`workflow` 권한 부족, 계정 권한 변경 안 함)
- [ ] 루트 Supabase BOB 인증·페어링·실서버 API 어댑터 연결 (별도 범위)
- [ ] 실제 센서·푸시 통합 및 현장 검증
- [ ] PR 리뷰 후 병합·운영 배포 여부 결정

## 회고

> Phase가 끝날 때마다 적는다.

### Phase 0
- 잘된 점:
- 아쉬운 점:
- 다음에 바꿀 것:

### Phase 1
- 잘된 점:
- 아쉬운 점:
- 다음에 바꿀 것:

### Phase 2
- 잘된 점:
- 아쉬운 점:
- 다음에 바꿀 것:

### Phase 3·4
- 잘된 점:
- 아쉬운 점:
- 다음에 바꿀 것:

### Phase 5
- 잘된 점:
- 아쉬운 점:
- 다음에 바꿀 것:
