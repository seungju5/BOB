# SmartThings 연결 화면 수정 · 2026-11-13

## 범위와 순서

사용자 결정: 로그인 → 5장 튜토리얼 → 홈 → 홈에서 기기 연결 선택 → 기존 SmartThings API 연동 화면. 기기 연결을 가입이나 홈 이용의 필수 조건으로 만들지 않는다.

- 원본: `team-bapmunna-google-kakao/integrations/bapmunna-firebase/docs/smartthings-view.mjs`
- 계정·튜토리얼·홈의 라우팅 및 실제/데모 표시: 별도 채팅 `테크포임팩트 우수 사례 분석` 담당.
- 원본 캐릭터·공유 이미지·글꼴과 게시 절차: 별도 채팅 `시니어용 원터치 시스템 구현 가능성` 담당과 조정.
- 기존 초록 토끼/밥솥 디자인 편집과 Firebase·Supabase 계정 분리는 유지했다.

## 재현 근거

기존 연결 뷰는 `connectCloud()` 완료와 첫 `onUser` 통지가 와야 config를 요청했다. SDK나 인증 통지가 끝나지 않으면 API가 미배포여도 로딩이 끝나지 않았다. fetch, 토큰 갱신, JSON 본문 읽기에도 시간 제한이 없었다.

기존 소스를 복제한 baseline에서 ‘API 미배포/HTML fallback/disabled + 인증 지연’ 3가지와 SDK 지연 1가지 검사가 실패했다. `baseline-regression.txt`에 기록했다. 이는 재현 가능한 코드 결함의 증거다. 사용자의 당시 휴대폰 네트워크 기록을 확보하거나 그 세션의 정확한 원인을 단정한 것은 아니다.

공개 앱을 비로그인으로 직접 `#connect` 진입했을 때는 준비 중 화면이 나왔다. 직접 링크 성공과 사용자 계정 진입 당시 오류를 구분했다.

## 수정

1. config를 인증 SDK보다 먼저 확인한다. 미배포 404/정적 HTML 또는 `enabled:false`이면 즉시 준비 중으로 종료한다.
2. 활성화된 API만 기존 본인 인증 → 동의 → 삼성 OAuth → 플러그 선택 UI로 이어진다.
3. 전체 초기화와 각 동작에 12초 제한을 적용한다. SDK, 첫 인증 이벤트, 토큰, fetch, JSON 읽기 모두 범위에 포함된다.
4. 실패 상태에 다시 확인과 홈 복귀를 제공한다. 로딩 중에도 홈으로 나갈 수 있다. 별도 연결 뷰를 사용하는 곳에서는 계정 복귀도 지원한다.
5. 로그아웃·계정 변경·재시도·화면 이탈 시 이전 요청을 취소하고 늦은 결과를 무시한다.
6. 잘못된 JSON/기기 목록/연결 상태를 완료로 표시하지 않는다. 삼성 OAuth 허용 URL 검증을 유지한다.
7. 세 신호 시각은 nullable epoch 숫자 계약으로 검증한다. 손상된 시각이 렌더러에서 예외를 내는 경로를 막고 포맷터도 방어한다.

## 기술 기록

- 기존 JavaScript ES modules, `AbortController`, `Promise.race`, 제한 시간 타이머 사용. 새 라이브러리·계정·유료 API 없음.
- API 경로는 그대로: `GET /api/smartthings/config`, `GET status`, `POST start`, `GET devices`, `POST device`, `POST check`, `DELETE connection`.
- 인증 토큰은 기존 제공자의 `getIdToken()`으로 받아 Authorization 헤더로만 전달한다. 토큰·원시 전력값·다른 계정 정보를 기록하지 않는다.
- Node 내장 `node:test`로 34개 회귀검사. 테스트의 인증과 API는 가짜이며 실기기를 제어하지 않는다.
- 브라우저 검증은 Codex CUA의 로컬 IAB 사용. 지연·기기 선택 fixture는 별도 출력 폴더에만 있고 서비스에는 포함하지 않는다.

## 확인한 결과

- 수정본 34개 회귀검사 통과. 같은 원본 실패 조건이 수정본에서 종료·재시도로 바뀜.
- 별도 채팅의 읽기 전용 독립 검토에서 발견된 timestamp 렌더 예외를 수정했다. 검토자가 원래 재현을 다시 실행하여 미처리 예외 0, 로딩 종료, 재시도 표시를 확인했고 34개 검사를 별도로 재실행했다. `INDEPENDENT-REVIEW.md` 참고.
- `npm test`: 73개 통과.
- `npm run test:firebase`: 시나리오 및 66/9/8/43개 검사 묶음 통과.
- `npx tsc --noEmit`, `node --check`, `git diff --check` 통과.
- 실제 로컬 앱 `http://127.0.0.1:5331/carer/#connect`: 준비 중 표시, 재시도 뒤 `aria-busy=false`, 계정 복귀 링크 확인, 390px 가로 넘침 없음.
- 별도 모의 화면: 지연 뒤 오류/재시도/복귀 표시, 기존 기기 목록→선택→상태 화면 작동. 390px·320px 가로 넘침 없음. 모의 화면 제한은 빠른 시각 검증을 위해 1.2초이며 서비스 기본값은 12초다.
- 브라우저 증거: `timeout-mobile.png`, `device-flow-fixture.png` (모두 모의 화면 표시 포함).

## 아직 구분할 것

- 통합 라우팅은 별도 담당의 모의 인증 브라우저 검사로 확인했다. 5장 튜토리얼→역할별 홈→기존 연결→홈 복귀, 계정 변경/로그아웃/이메일 인증/실패 재시도, 320/390px을 검사했다. 실제 OAuth 또는 실제 BFCache 적중을 증명한 것은 아니다.
- 동결 통합본 하네스: 하네스24·루트73·Firebase 시나리오58 및 node83(새 회귀52 포함)·Firebase58·SmartThings 서버14 통과. 타입·동기화·Firebase/Next 빌드 통과, 소스 지문 동일. 기존 Firestore emulator1개 skip으로 전체 상태는 incomplete다. 첫 실행의 portable 생성물 변경을 정리한 뒤 안정된 소스로 재실행했다.
- 보고서: `.harness/runs/2026-11-13T01-45-49-732Z-77072/report.md`. 공개 배포 검증은 이어 기록한다.
- 공개 SmartThings 서버는 기존 무료 유지 결정상 미배포다. UI 수정이 삼성 계정 OAuth 또는 실기기 자동 수신 성공을 뜻하지 않는다.
- 운영 DB·서버·요금제·기기 제어·실제 동의 상태를 변경하지 않았다.

## 공개 반영 완료

- 코드 커밋 `21ccabe`, `codex/google-kakao-login` 푸시 완료.
- Firebase 버전 `sites/impact-series/versions/ba77c944182e5d1b`. 이전 `4e797660f901e693`.
- 변경 파일12개 공개 바이트 확인, 기존 경로 누락0. 2,580개 기존 파일·Next export·브랜드·Hosting 설정·무료 요금제 보존.
- 실제 공개 주소에서 로그인 폼, #connect 준비 상태 종료, 준비 상태 재조회, 홈 복귀 링크를 확인했다. 비로그인 복귀는 로그인 화면으로 보호된다. 실제 Google/Samsung OAuth를 새로 수행한 것은 아니다.
- 공개 화면에서 JavaScript 오류 로그 없음. 실제 확인 폭583px에서 가로 넘침 없음. 모바일320/390px은 앞의 로컬/모의 화면 검증을 근거로 구분한다.
- 공개 증거 `output/bapmunna-smartthings-fix-20261113/public-connect.png`. 실제 삼성 API 서버는 계속 미배포 상태이며 UI 수정과 실기기 연결 성공을 구분한다.
