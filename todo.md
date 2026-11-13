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
- [ ] VAPID 키 생성, Web Push 발송 유틸 — 발송 유틸(`_shared/push.ts`, npm:web-push) 작성, **키 생성·Secrets 등록·재배포 남음**
- [x] 알림 권한 요청 UI(알림 화면 카드), 서비스 워커(`public/sw.js`), 구독 저장(`push_subscriptions` 직접 upsert, `/api/push/subscribe` 대신) (2026-11-12)
- [x] device_offline 알림 판단 (T-EDGE-01·02) — 발송은 check-alerts 구현 후
- [ ] 실제 기기 푸시 수신 확인 (Android, iOS 홈 화면 추가)
- [ ] 외식·자리 비움·주간 리포트 알림: 앱·데모 완료, `0003_news_alerts_weekly.sql` 적용 + senior·jobs 재배포 남음 (팀 확인)

## Phase 3 — 부양자 앱

- [x] 로그인 (Supabase Auth 이메일 링크) — 실제 메일 수신은 사용자 확인 필요
- [x] Google·Kakao OAuth PKCE 콜백, 세션 검증, 취소·만료 오류 안내 코드 — 공급자 콘솔 설정과 실제 로그인 검증은 별개
- [ ] Supabase URL·publishable key와 Google·Kakao 공급자 설정 후 두 제공자의 실제 로그인·취소·로그아웃·가구 격리 확인
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


### 2026-11-03 SmartThings 파일럿

- [x] 기존 토끼, 로그인, 기기 연결 화면과 Figma 6개 설계
- [x] OAuth/암호화/웹훅 검증/계정 분리 서버와 테스트
- [x] Impact Series callback·webhook·읽기 권한 등록 manifest
- [x] 제공된 단기 토큰으로 실제 전력 기기 상태 조회
- [x] 삼성 계정 인증 후 OAuth 앱 등록 성공 및 설정 재조회 (`f1b8149d-45c5-4f4b-8136-2ad518faf4ec`)
- [x] 사용자 결정 반영: 유료 전환 없이 Spark·현재 등록·구현 상태 유지
- [ ] 보류: 공개 API 배포와 Target URL CONFIRMED (사용자의 재개 요청 필요)
- [ ] 보류: 실제 OAuth 로그인·플러그 구독·신호 지속 수신·해제·갱신 검증
- [ ] 2–3가구 각각의 동의와 데이터 격리 실사용 확인
- [ ] 보류: 실제 연결 팀 시연. 현재는 구현 화면·앱 등록 결과만 공유하며 자동 수신은 미검증으로 표시

### 2026-11-03 원본 3D 토끼 반영

- [x] 처음 만든 초록 가디건 3D 토끼 원본으로 Firebase 통합판 캐릭터 통일
- [x] 같은 공유 링크의 Figma 로그인·연결 6개 화면 교체
- [x] API/OAuth 설명 PDF 3쪽의 캐릭터 교체와 전 페이지 렌더 검수
- [x] 기존 테스트·타입·빌드 통과 및 390×844 역할 전환·로그인·연결 화면 검수

### 2026-11-03 승인 디자인 동기화
- [x] Firebase·Supabase 프런트엔드·Next.js·Figma의 토끼, 로고, 색상, 서체 통일
- [x] 공통 자산 검사, 세 메뉴, 모바일 역할 전환 검수
- [x] Impact Series 공개 배포·기존 KU GPA 디자인 갱신·전후 복구본 보존
- [ ] 팀 PR 검토/병합 및 별도 Vercel 배포 상태 확인
- [ ] 실제 SmartThings OAuth·자동 수신: 유료 전환 없이 현 상태 유지 결정에 따라 보류

### 2026-11-03 향후 유료 전환 준비

- [x] 삼성 등록 3개 항목 재조회와 공개 callback/webhook 응답 확인
- [x] 무료 유지 결정을 재확인하고 자동 과금·배포 없는 사전 점검 명령 준비
- [x] 기존 URI와 권한을 유지하는 고정 배포 설정·재개 안내·비공개 인계 메모 저장
- [ ] 사용자 유료 전환 승인 후 결제·공개 서버·Target 확인·실기기 OAuth/수신 검증 재개

### 2026-11-03 · 깡총 뛰고 손 흔드는 토끼
- [x] 16자세 제작, 두 번 점프·손 인사·깜빡임·고개 인사 연결
- [x] 유한 재생·접근성·화면 이탈 정리·기존 역할 화면 검증
- [x] 공개 배포와 실제 링크 최종 확인

## 2026-11-04 원본 토끼 모션

- [x] 원본 픽셀·얼굴·가디건·연필·클립보드 유지, 부위별 관절 변형과 접지 그림자
- [x] 두 번의 점프·손 인사·깜빡임·고개 인사 및 원본 복원
- [x] 모션 접근성·GPU 실패·메시 뒤집힘·모바일/데스크톱·역할 전환 확인
- [x] Firebase·Next.js·Synagogue 검증 및 빌드
- [x] Impact·KU GPA 공개 배포 및 네 provider 원본 이미지 해시 일치 검증

## 2026-11-04 손 인사 왜곡 수정

- [x] 얼굴과 손 분리, 손·연필의 회전·이동만 허용
- [x] 원본 손 뒤 가림 영역 복원, 그림자 잔상·경계 정리
- [x] 얼굴 핵심 영역 픽셀 차이 0, 손 모양 보존·자산 실패 검사
- [x] 56개 단위 검사·기존 Firebase/Synagogue 검사·타입·두 앱 빌드 및 모바일 확인
- [x] 두 공개 Firebase 주소의 모듈·복원 자산 배포, 공개 바이트·실제 재생 확인

## 2026-11-12 Super Members 개발 하네스

- [x] 두 앱의 원본·계정·실연동 경계를 분석하고 7개 재사용 AI 역할 구성
- [x] 총괄 + 최대 3명 전문가, 파일별 담당·독립 검토·인계 방식 작성
- [x] 스마트싱스·시니어 경험·로그인 격리의 작업 계획과 완료 기준 제공
- [x] 로컬 doctor/plan/check, 변경 파일별 검사 선택, 소스 지문·로그·결과 기록 구현
- [x] 하네스 회귀 검사 22개 및 독립 검토 통과; 부분 성공·건너뜀·준비 부족을 구분
- [ ] CI 자동 실행 활성화는 별도 관리 작업. 현재는 로컬 명령으로 사용
- [ ] 실기기 OAuth·웹훅·가구 격리·푸시·현장 사용성은 별도 증거로 계속 추적

### Super Members 캐릭터

- [x] 원래 3D 토끼를 모티프로 일곱 역할의 상징·색·소품·표정 제작
- [x] 팀 소개판·프롬프트 저장 및 이름·역할·7명 구성 시각 확인
- [x] 한국어·영어 호칭과 간단한 말투를 역할 설정에 연결

### Super Members 가상 작업실

- [x] Impact Series `/super-members/`에 별도 작업실 제작·게시, 기존 2,421개 경로와 설정 보존
- [x] 일곱 3D 토끼의 인사·말하기·점프, 낮/밤·러그·화분 꾸미기와 움직임 정지
- [x] 전용 Firebase 웹 앱, 무료 Gemini AI 대화와 App Check 강제 설정, Spark/무결제 상태 읽기 확인
- [x] 멤버별 대화 문맥·로컬 저장·텍스트 내보내기·개발 도구용 실행 요청 복사
- [x] 독립 검토의 뒤로 가기·키보드 이동·초안 보존·삭제 실패 문제 수정, 대화 검사 13개 통과
- [x] 공개 사이트 실제 답변·이전 문맥·새로고침 복구, 데스크톱/390px 화면 확인
- [ ] OS 자체 모션 줄이기 설정을 바꾼 실기기 검사는 별도; 코드상 설정 지원은 구현·검토됨

## 2026-11-12 로그인·모바일 최종 통합

- [x] Google·카카오 PKCE 콜백과 실패 복구, 계정 전환 캐시 격리
- [x] main 최신 전체 화면 + Firebase 디자인·계정·하네스·AI 작업실 소스 병합
- [x] Supabase 설치 없이 GitHub 로그인 브랜치 최초 푸시
- [x] Firebase 하위 경로 정적 export·PWA·모바일 로그인 진입 및 통합 모음
- [x] 독립 검토·회귀 검사 및 기존 Hosting 보존/복구 계획
- [x] 최종 통합 커밋 푸시·PR #3 및 공개 배포 검증 기록
- [ ] 등록된 카카오 앱·Provider 연결과 실제 로그인 완료 검증
- [ ] Firestore emulator, 실제 가구 격리·실기기 검증 (기존 보류 유지)

### 2026-11-13 최신 화면 수정

- [x] 보호자 홈 중앙 이미지를 귀여운 밥솥이로 교체하고 상태·설명 분리
- [x] 첫 문구 ‘안부가 폴짝 찾아왔어요’ 복원
- [x] 홈·더보기의 계정/기기 연결 입구 및 로그인 뒤 홈 이동
- [x] 모바일 320/390px·전체 검사·독립 검토

### 2026-11-13 공유 썸네일·서체·캐릭터 수정

- [x] 첫 표지 토끼 유지, 로그인·튜토리얼·홈·기기·관리 화면은 밥솥이로 통일
- [x] 로고 전용 1200×630 공유 이미지와 Open Graph/Twitter metadata
- [x] 튜토리얼의 외부 손글씨 제거, 로컬 Pretendard 및 굵기·줄 간격 조정
- [x] 320/390px 튜토리얼·공통 밥솥이 표시와 기존 기능 검사
- [ ] GitHub 푸시 및 Firebase 공개 배포·메타데이터 확인
