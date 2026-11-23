# SmartThings 실제 연결 작업 · 2026-11-14

> 최신 공개 서버 배포·삼성 403 제한·남은 검증은 [11월 15일 결과](smartthings-live-20261115.md)를 따른다. 아래는 11월 14일 준비 시점의 기록이다.

## 11월 14일 준비 시점 판정

11월 14일에는 연결 화면과 로컬 서버 검사를 마쳤다. 두 브라우저에서 삼성 콘솔 접근 오류를 재현했고, 기존 CLI에서는 전력 측정 기기 1대의 상태를 읽었다. 서버 파일 15개를 Vercel Drop에 올린 뒤 첫 배포의 추가 이메일 인증을 기다리던 시점이다. 웹앱의 실제 삼성 OAuth·자동 웹훅 수신은 당시 확인하지 못했다.

후속 진단·발송 전 지원 문의 초안: [smartthings-console-support-20261114.md](smartthings-console-support-20261114.md). 콘솔 오류를 전체 장애 또는 결제 문제로 단정하지 않으며, CLI 기기 조회 성공을 웹앱 연결 완료로 표시하지 않는다.

## 확인한 사실

- 공식 SmartThings CLI **3.0.1**로 `smartapps`와 `smartapps:oauth` 읽기에 성공했다. 기존 2.1.3 `/apps`의 403을 권한/과금 차단으로 확정했던 추론은 철회한다.
- 기존 앱 `f1b8149d-45c5-4f4b-8136-2ad518faf4ec`, `API_ONLY`, `r:devices:*`만 유지한다.
- 등록 callback은 `https://impact-series.web.app/api/smartthings/callback`, webhook은 `https://impact-series.web.app/api/smartthings/events`, target은 **PENDING**이다. 새 CLI 성공이 실제 OAuth·웹훅 성공은 아니다.
- Firebase Spark Hosting은 임의 외부 서버로 POST 프록시하지 못한다. 외부 서버를 사용하려면 삼성 등록 URL을 그 서버의 고정 주소로 변경해야 한다. 301/302 웹훅 우회는 구현하지 않았다.
- 현재 삼성 공식 App Setup은 paid Developer 또는 Business plan을 선행조건으로 명시한다. 기존 계정의 플랜·전환기간 적용은 콘솔 로그인 후 확인해야 한다. 다른 가구 대상 파일럿에 개인 Developer 자격을 임의 적용하지 않는다.

## 구현된 연결 흐름

1. Firebase 앱에서 가입·로그인·안내·기본정보를 마친다.
2. 연결 안내를 읽고 동의한 뒤 삼성 연결 창을 연다. Firebase ID token은 정확한 창·origin·난수 채널에만 메모리로 전달한다. URL과 저장소에는 넣지 않는다.
3. 연결 창의 서버가 사용자 UID, 인증 상태와 동의를 확인하고, 브라우저 nonce 쿠키와 일회 state를 발급한다.
4. 삼성의 읽기 허용을 마치면 같은 서버 callback으로 복귀한다. 토큰을 암호화해 본인 UID에 저장한다.
5. 기존 앱은 자신의 bearer 인증으로 연결 상태를 확인한다. 전력을 읽을 수 있는 허용 기기만 선택할 수 있다.
6. 서명을 검증한 새 기기 신호의 도착 시각을 표시한다. 수동 조회 시각과 자동 수신 시각을 구분한다. 원시 W값·삼성 토큰은 브라우저에 보내지 않는다.

취소·로그아웃은 서버의 해당 시도에 취소 기록을 남기며, token exchange와 취소가 겹쳐도 최종 연결 저장 트랜잭션이 이를 검사한다. 이미 완료된 연결을 늦은 취소로 삭제하지 않는다. 취소 요청이 끝난 뒤 상태를 다시 읽는다. Firebase 사용자 폐기·정지·토큰 취소도 callback에서 재확인한다. 삼성 COOP로 창 연결이 끊겨 성공 메시지를 전달하지 못하면 상태 조회로 회복한다. 삼성 거부·실패의 자동 전달은 보장하지 않으며 명시적인 대기 종료·복귀 버튼을 제공한다.

식사 판정, 가족 공유·푸시를 이번 기기 연결 화면의 성공으로 주장하지 않는다. 두 앱의 Firebase/Supabase 계정은 합치지 않는다.

## 서버와 보관

`workspaces/smartthings-vercel/`은 Node 24 서울 서버용 명시 파일 패키지를 만든다. 요청 본문은 1MiB까지 원문 그대로 검증하고 외부 Host 헤더를 신뢰하지 않는다. 별도 서버 계정 JSON이 없으면 Vercel 초기화를 거부한다.

Vercel은 사용자 승인으로 새 Hobby 계정을 만들었고 소스 업로드 전에 모델 학습 데이터 공유를 끄고 저장했다. 공식 CLI 접근은 승인됐으나 인증 흐름의 네트워크 오류·비활성 버튼으로 실제 grant는 확인되지 않았다. 공식 Drop 업로드로 전환해 15개 파일을 확인했고 프로젝트 이름을 `bapmunna-smartthings`로 설정했다. 첫 Deploy 뒤 추가 이메일 본인 확인 화면이 나타나 최신 보안 코드를 요청했다. 고정 도메인·성공한 빌드·공개 함수 응답은 아직 확정하지 않았다. 업로드 ZIP SHA-256은 `70756220953219fd8acebe8558a0db07762f38a2a72d00488d6dd10bbe97202b`이며 자격증명 파일은 포함하지 않았다.

Firestore TTL 유료 기능은 사용하지 않는다. 일일 인증 cron이 만료 States/Locks/Receipts만 최대 5,000개 정리한다. 논리 만료와 물리 삭제 시각은 다르며 엄격한 24시간 삭제를 약속하지 않는다. 원시 전력값은 저장하지 않는다. 자세한 운영·복구·환경변수는 배포 패키지 README를 따른다.

## 검증과 다음 순서

전체 하네스, 로컬 Firestore Emulator의 `demo-bapmunna` 프로젝트에서 실제 트랜잭션 실행, localhost Node HTTP, 표시 UID/지연 observer, 취소 경합, bearer/CORS, 서명·재전송, 토큰 갱신·삭제 검사를 수행했다. 공개 배포와 삼성 실기기를 대신하는 증거가 아니다. 현재 준비한 frontend API origin은 빈 값이며 기존 같은 원점 동작을 유지한다.

최종 전체 보고서: `.harness/runs/2026-11-14T00-47-16-956Z-31108/report.md`. 하네스25·루트121·서버 동의 경계48·Firebase 역할/관리58·SmartThings49개 통과, 실패/skip 0. Firebase 계약 검사에는 새 popup·remote UI·실제 provider 소스 검사를 포함한다. 타입·도메인/디자인 동기화·Firebase 빌드·Next 정적 빌드도 통과했다. 독립 검토에서 발견한 UID 경합·취소 저장 문제를 수정했고, 마지막 취소 대기 경합은 추가 회귀로 확인했다. 320px에서는 가로 넘침 없이 승인 캐릭터와 오류 복귀 링크가 표시된다.

당시 후속 검증 항목은 삼성 callback·웹훅 등록, 사용자 동의와 플러그 선택, 실제 자동 수신, 토큰 갱신·해제·재연결, 동의한 가구 간 데이터 격리였다. 팀 앱의 기기 연결 구성은 [팀 서버 안내](../apps/warming-up/server/smartthings/README.md)에서 확인할 수 있다.

## 공식 근거

- [SmartThings App Setup](https://developer.smartthings.com/docs/service-integrations/app-setup)
- [OAuth](https://developer.smartthings.com/docs/service-integrations/oauth), [웹훅 검증](https://developer.smartthings.com/docs/service-integrations/webhook-events)
- [CLI 3.0.1](https://github.com/SmartThingsCommunity/smartthings-cli/releases/tag/@smartthings/cli@3.0.1)
- [Firebase Hosting rewrite 대상](https://firebase.google.com/docs/hosting/full-config)
- [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Firestore IAM](https://firebase.google.com/docs/firestore/security/iam)
