# 밥뭇나 소비자용 SmartThings 연결 — 2026-11-16

## 구현 범위

사용자는 밥뭇나 로그인 → 어르신 정보 이용 동의 확인 → 삼성 계정으로 연결 허용 → 호환 플러그 선택 순서로 이용한다. PAT 발급·복사·붙여넣기 화면은 없다. 개발사는 Business 앱을 운영하지만, 각 가정의 삼성 동의와 토큰은 서로 독립적이다. 관리자 공용 PAT로 고객 기기를 모으지 않는다.

- 실제 Firebase 홈·가구 요약·설정에서 `/bapmunna/app/connect/`로 진입한다. 기존 Google·카카오 인증 및 소개/가구 흐름을 유지한다.
- 삼성 화면은 고정 서버의 popup/복귀 경로를 사용한다. UID·origin·일회용 channel을 확인하고 로그인 토큰을 URL에 넣지 않는다.
- 읽기 권한 `r:devices:*` 내에서 전력 측정 플러그를 선택한다. 기기 전원 제어 권한을 추가하지 않는다.
- 서버에 고객별 토큰을 암호화해 저장한다. 자동 갱신 잠금, 일회용 refresh token 회전, 원자 저장, 불명확한 실패 후 재사용 금지를 적용한다.
- 일일 인증 cron에서 갱신 예정 연결을 최대 20개·120초 예산으로 처리한다. 앱이 닫힌 동안의 갱신 경로도 있다. 대규모 운영에서는 처리량·실패 감시·호스팅 이용 조건을 별도로 준비해야 한다.
- 시작, callback, 조회, 이벤트, 유지관리에서 계정 및 저장된 동의를 검사한다. 처리 중 동의가 철회되면 새 기기 데이터 저장/반환을 막는다.
- 연결 해제는 밥뭇나의 연결 정보·암호화된 토큰을 삭제한다. 삼성 서비스 권한 철회와 구분해 안내한다. 동의 확인만 취소하면 새 조회/수신 저장은 중지하지만 토큰은 연결 해제 전까지 보관한다.
- 홈에는 실제 자동 수신 시각만 반영한다. 수동 상태 조회를 자동 수신으로 표시하지 않는다. 오래되거나 미래인 시각을 온라인 근거로 쓰지 않는다.
- 원시 전력값 장기 저장, 식사 판정, 가족 연결/알림은 이 변경으로 활성화하지 않는다. 기기 신호 부재를 식사 미확인이나 건강 이상으로 바꾸지 않는다.

## 삼성 등록에서 실제 확인한 장애물

2026-11-16 11:25 UTC 공식 SmartThings CLI 3.0.1로 기존 앱을 조회했다.

| 항목 | 확인값 |
| --- | --- |
| 앱 ID | `f1b8149d-45c5-4f4b-8136-2ad518faf4ec` |
| 기존 webhook | `https://impact-series.web.app/api/smartthings/events` |
| 기존 callback | `https://impact-series.web.app/api/smartthings/callback` |
| webhook 상태 | `PENDING` |
| 권한 | `r:devices:*` |

11:36 UTC 기존 앱의 webhook만 현재 서버 `https://bapmunna-smartthings.vercel.app/api/smartthings/events`로 변경 요청했다. 삼성 CLI가 **유료 플랜 필요 안내로 거절**했다. 새 권한·앱·유료 계약을 만들지 않았으며 callback 변경은 진행하지 않았다. 이번 응답에서 원시 HTTP 상태 코드를 확인하지 못했으므로 403이라고 단정하지 않는다. 비밀 없는 결과는 로컬 `tmp/business-oauth-20261116/registration-attempt.json`에 있다.

따라서 PAT로 기기 목록을 읽었던 성공과 별개로, 소비자 OAuth·실제 webhook 자동 수신은 아직 검증되지 않았다. 서버 구현만으로 삼성 Business 자격이나 등록 제한을 우회할 수 없다.

## 신규 연결을 여는 조건

1. 운영 회사의 SmartThings Business API 이용 자격/견적·계약을 확정한다. 개인용 Developer 플랜을 소비자 서비스에 쓸 수 있다고 안내하지 않는다.
2. 기존 앱 callback을 `https://bapmunna-smartthings.vercel.app/api/smartthings/callback`, webhook을 같은 원점의 `/api/smartthings/events`로 등록하고 webhook 확인 상태를 점검한다.
3. 기존 OAuth client에 맞는 prefix·credentials를 서버 Secret에서 확인한다. 실제 값은 소스/문서/채팅에 넣지 않는다.
4. `SMARTTHINGS_CONNECTION_ENABLED=true`로 설정하고 기존 프로젝트를 재배포한다. 기본값은 false다. `/config.enabled`는 서버 준비, `/config.connectionReady`는 신규 연결 허용으로 구분한다.
5. 소유자의 삼성 동의→복귀→플러그 선택→자동 이벤트 수신→갱신→해제 및 2~3개 가구 격리를 각각 실검증한다. 실패하면 신규 연결을 다시 닫는다.

Business 문의를 발송하거나 결제/계약을 수락하지 않았다. Firebase Spark·기존 계정·Rules·IAM은 변경하지 않는다. Vercel Hobby는 현재 시험용이며 상용 운영의 이용 자격과 비용은 별도 판단 대상이다.

## 검증 기록

- 루트 앱 282개, 개인정보 48개, Firebase 85개, SmartThings 88개, 하네스 25개(총 528개) 자동 검사에서 실패/skip 0 확인. 타입·동기화·빌드·소스 안정성도 통과했다. 최종 보고서: `.harness/runs/2026-11-16T11-42-23-873Z-62716/report.md`.
- 공유 연결 화면·popup 52개 검사 통과. 준비 상태, 저장된 동의, 계정 교체/로그아웃, 타임아웃, 잘못된 응답, 연결 해제 후 재연결을 포함한다.
- 별도 검토자가 실제 로컬 Firestore emulator를 포함해 저장/잠금/동의 경계를 확인했다. 발견된 늦은 상태 응답 덮어쓰기와 동의 철회 경합을 수정했다.
- 정적 export는 18개 경로. 합성 계정/기기만 사용하는 로컬 320/390px 화면에서 준비→선택→연결→확인→해제 동선을 검사했다. 수동 확인 후 자동 수신은 ‘아직 없음’으로 표시한다. 가로 넘침 없음. 320px에서 Space로 동의 선택 후 Tab으로 연결 버튼 이동도 확인했다. OS 글꼴/실기기 검사를 대신하지 않는다.
- 실제 삼성 OAuth·실물 플러그 자동 수신, 실기기 모바일 검증은 미완료다. 합성 UI 검사를 실연결 성공으로 보고하지 않는다.

## 공식 근거

- [SmartThings API 플랜](https://developer.smartthings.com/smartthingsapi)
- [Business 문의](https://info.developer.smartthings.com/SmartThingsAPI)
- [OAuth](https://developer.smartthings.com/docs/service-integrations/oauth)
- [토큰 관리](https://developer.smartthings.com/docs/service-integrations/token-management)
- [앱 등록](https://developer.smartthings.com/docs/service-integrations/app-setup)
- [Vercel Hobby 이용 조건](https://vercel.com/docs/plans/hobby)

## 게시 기록

2026-11-17 확인 기준:

- 소스 `077233e422f1d7645cdc07b65aab6dff7fad82af`를 기존 `codex/consent-feedback-20261116` 브랜치에 푸시했다.
- Hosting `32111bb72b9a0a15` 게시. 변경 126개 공개 바이트 일치·기존 경로 누락 0·기존 파일 2,675개 보존·Spark 유지. `/bapmunna/app/connect/`는 비로그인 시 기존 Google/카카오 로그인 화면으로 이동한다. 공개 브라우저 오류/경고 0.
- Vercel 24개 파일 ZIP을 게시했다. 사용자의 인증 코드 재전송 요청 후 같은 창에서 본인 확인이 완료되어 **`dpl_1pwiU6uoBSLcdLyfWFDCGYisC1zU`가 Ready·현재 Production**인 것을 확인했다. 운영 도메인은 `https://bapmunna-smartthings.vercel.app`이며 기존 Secret·권한·과금 설정을 유지했다.
- 자동 승인 검토가 PRIVATE KEY 문자열을 우려해 서버 게시를 차단했으나, 두 곳 모두 환경변수의 키 헤더를 검사하는 코드임을 확인했다. ZIP 21개 코드·자산이 커밋과 일치하고 나머지는 생성된 의존성/제외 목록이다. 실제 자격 증명 없음 확인 후 같은 게시 재시도는 허용됐다. 그다음 Vercel 자체 본인 확인이 표시됐다.
- 새 서버의 공개 검사 **20/20 통과**. SmartThings config는 `enabled:true`, `connectionReady:false`이고 카카오 config는 기존처럼 `enabled:true`다. 연결 portal 모듈은 게시한 소스와 바이트가 일치한다. 삼성 시작 원점 제한(다른 원점 403)·동일 원점 무인증(401), 서명 없는 webhook/청소 요청 거부, 카카오 정상 시작 URL 및 잘못된 교환/원점/쿼리 차단을 확인했다. 실제 Samsung OAuth·자동 수신·운영 갱신은 Business 단계 때문에 미검증이다.

영수증: `workspaces/bapmunna-final/releases/20261117-business-oauth.json`, `workspaces/smartthings-vercel/releases/20261117-business-oauth-active.json`. Vercel 인증 대기는 해소됐고 삼성 Business 활성화·실기기 검증은 계속 남아 있다.
