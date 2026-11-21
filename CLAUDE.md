# CLAUDE.md — 밥뭇나

밥솥 전력 사용 패턴으로 떨어져 사는 부모님의 식사 공백을 파악해, 부양 자녀에게 알려주는 서비스.

## 매 요청 전 복기 순서

작업을 시작하기 전에 아래 문서를 이 순서로 확인한다.

1. **brd.md**: 무엇을 왜 만드는가. MVP 5개와 범위 밖
2. **cps.md**: 핵심 문제와 솔루션 설계 원칙
3. **design.md**: 스택, 데이터 모델, 판단 로직, UI/UX, API
4. **plan.md**: 지금 어느 Phase인가
5. **todo.md**: 다음에 할 작업
6. **test.md**: 해당 기능의 테스트 케이스

참고: stack.md (버전·명령어), adr.md (결정 이유), log.md (작업 기록)

@AGENTS.md — **Next.js 16.4다.** 학습 데이터와 API가 다를 수 있으니 코드를 쓰기 전에 `node_modules/next/dist/docs/`의 해당 문서를 확인한다. (params·searchParams는 Promise, middleware → proxy, Cache Components 켜져 있음)

## 현재 구조 (2026-10-16)

- `lib/judge/` 판단 로직(순수 함수) · `config/detection.ts` 기준값 · `tests/unit/` 단위 테스트
- `lib/data/` **화면용 데이터 계층.** 보호자 화면은 `useApp()`, 어르신 화면은 `useSenior()`만 쓴다. 모드가 두 가지다: `live`(Supabase 로그인, `live.ts`)와 `demo`(브라우저 저장소, `lib/demo/`). 둘 다 같은 `AppView`·`AppActions` 모양(`view.ts`)이라 화면 코드는 모드를 몰라도 된다.
- `supabase/functions/` Edge Functions(`jobs`, `senior`, `register-plug`). 판단 로직은 `lib/judge`를 함께 배포한다 (stack.md).
- `app/page.tsx` 시작 · `app/s` 어르신 · `app/onboarding` · `app/(guardian)/{home,records,report,alerts,settings}`
- `components/` 공통 UI·아이콘·밥솥이 캐릭터 · `supabase/migrations/` 스키마(미적용)
- 디자인 토큰: `app/globals.css`의 `@theme` (cream, paper, butter, cocoa …). 색은 토큰으로만 쓴다.

## 기술 스택

- Next.js (App Router) + TypeScript + Tailwind CSS, PWA
- Supabase: Postgres, Auth, Edge Functions, pg_cron, Vault
- Vercel 배포
- 삼성 스마트플러그 + SmartThings API (`powerMeter`)
- Web Push (VAPID). 차트는 CSS 막대 (Recharts 미도입)
- 테스트: Vitest (단위, `npm test`), Playwright (E2E, 미설정)

## 코딩 원칙

- **판단 로직은 순수 함수로 만든다.** `detectEvents`, `resolveMealSlots`, `evaluateAlerts`는 DB·네트워크와 분리해 `lib/judge/`에 두고, test.md의 케이스를 먼저 테스트로 작성한다.
- **기준값은 상수 한 곳에.** 700W·15분, 20~70W, 2끼, 48h, 72h 같은 값은 `config/detection.ts`와 `alert_settings` 기본값에만 둔다. 코드에 숫자를 직접 쓰지 않는다.
- **시간은 KST로 판정하고 UTC로 저장한다.** 날짜 경계(끼니 슬롯, 부재 기간)는 `Asia/Seoul` 기준이다.
- **Edge Function은 멱등하게.** 같은 주기가 두 번 돌아도 결과가 같아야 한다.
- **시니어 화면은 버튼 3개만.** 글자 24px 이상, 고대비, 확인 단계는 한 번. 기능을 늘리지 않는다.
- 사용자에게 보이는 문구는 존댓말로, 짧고 따뜻하게 쓴다 ("잘 드셨어요!", "가족에게 알렸어요").

## 확인 후 진행할 것

아래는 바로 구현하지 말고 먼저 물어본다.

- 판단 기준값 변경 (실측 근거가 있으면 adr.md에 기록)
- `lib/judge`·`config/detection.ts`를 바꿨다면 Edge Functions(`jobs`, `senior`, `register-plug`)도 다시 배포해야 한다 — 배포 전 확인
- DB 스키마 변경, RLS 정책 변경
- 새 외부 API·라이브러리 추가
- brd.md "범위 밖"에 있는 기능
- 72시간 신고 대상·방식 (아직 미확정)
- 알림 문구와 조건 변경

## 절대 금지

- **원시 전력값을 영구 저장하거나 클라이언트에 노출하지 않는다.** 판정 후 삭제한다.
- 가족 화면에 끼니 상태(확인됨/미확인/외식/부재) 이외의 식사 데이터를 노출하지 않는다.
- SmartThings 토큰·VAPID 개인키·service role 키를 코드나 DB 평문으로 두지 않는다.
- 카메라·음성·위치 수집 기능을 넣지 않는다 (brd 기각 항목).
- 밥솥 데이터로 영양 상태를 "판정"하는 문구나 기능을 만들지 않는다. 우리는 패턴 변화만 알린다.
- 플러그 오프라인을 결식으로 처리하지 않는다.

## 자주 쓰는 패턴

- 구현: "plan.md의 [Phase 1 - 3번]을 구현해줘. 완료되면 todo.md 업데이트하고 다음 작업 알려줘."
- 문서 보완: "brd.md를 바탕으로 design.md의 데이터 모델 섹션을 보완해줘."
- 막혔을 때: "현재 [문제]야. design.md 아키텍처 원칙을 지키면서 해결법 3가지 제안해줘."
- 작업이 끝나면 todo.md 체크, 중요한 결정은 adr.md, 진행 기록은 log.md에 남긴다.

## 개발 로그

자세한 기록은 log.md에 있다. 최근 상태만 여기에 한 줄로 적는다.

- 2026-10-16: 문서 세트 생성. Phase 0 시작 전.
- 2026-10-16: 판단 로직 + 테스트 38개, 전체 화면(데모 저장소) 완료.
- 2026-10-16: Supabase(BOB) 연결 — 스키마·RLS·Vault, Edge Functions 3개, pg_cron, 이메일 로그인. 다음은 Web Push.
- 2026-10-17: 별도 Firebase 통합판의 1분 체험·기록 근거·간편 외출·소개 영상 개선. 186개 검사 통과, 운영 배포·DB 변경 없음. 상세는 log.md와 ADR-007.
- 2026-11-21: Windows 빌드 수정, 판단 기준값을 화면과 통일(700W·15분, 20~70W, ADR-014). 기록 화면 전력 해석은 아직 예시 데이터 — 배포 전 처리 필요.
