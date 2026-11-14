# SmartThings 실제 연결 작업 · 2026-11-14

## 현재 판정

**구현·로컬 검증 완료, 공개 서버와 실제 삼성 OAuth·실기기 검증 미완료.** 사용자는 실제 가동을 요청했으며 기존 Firebase 무료 유지 조건은 바꾸지 않았다. 소유자 Vercel 로그인과 삼성 문자 인증을 기다린다. 새 결제, IAM 권한·키 생성, 삼성 앱 URL 변경, Hosting 배포는 실행하지 않았다. 공개 Hosting은 `66beb76f7bf738fd`다.

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

전용 서비스 계정 계획은 Firebase 계정 조회와 프로젝트 Firestore 문서용 8개 권한이다. Owner/Editor·계정 수정·기기 제어 권한은 없다. IAM으로 SmartThings 컬렉션만 분리한 것은 아니므로 서버의 UID·컬렉션 경계 검사를 유지한다. `provision-smartthings-identity.mjs plan`만 실행했으며 `apply`는 미실행이다.

Firestore TTL 유료 기능은 사용하지 않는다. 일일 인증 cron이 만료 States/Locks/Receipts만 최대 5,000개 정리한다. 논리 만료와 물리 삭제 시각은 다르며 엄격한 24시간 삭제를 약속하지 않는다. 원시 전력값은 저장하지 않는다. 자세한 운영·복구·환경변수는 배포 패키지 README를 따른다.

## 검증과 다음 순서

전체 하네스, 실제 `demo-bapmunna` Firestore 트랜잭션, localhost Node HTTP, 표시 UID/지연 observer, 취소 경합, bearer/CORS, 서명·재전송, 토큰 갱신·삭제 검사를 수행했다. 공개 배포와 삼성 실기기를 대신하는 증거가 아니다. 현재 준비한 frontend API origin은 빈 값이며 기존 같은 원점 동작을 유지한다.

최종 전체 보고서: `.harness/runs/2026-11-14T00-47-16-956Z-31108/report.md`. 하네스25·루트121·서버 동의 경계48·Firebase 역할/관리58·SmartThings49개 통과, 실패/skip 0. Firebase 계약 검사에는 새 popup·remote UI·실제 provider 소스 검사를 포함한다. 타입·도메인/디자인 동기화·Firebase 빌드·Next 정적 빌드도 통과했다. 독립 검토에서 발견한 UID 경합·취소 저장 문제를 수정했고, 마지막 취소 대기 경합은 추가 회귀로 확인했다. 320px에서는 가로 넘침 없이 승인 캐릭터와 오류 복귀 링크가 표시된다.

로그인 완료 뒤 이어갈 순서:

1. 소유자 Vercel 계정의 Hobby 자격·기존 프로젝트를 확인하고 별도 고정 production origin을 확보한다.
2. 삼성 콘솔에서 기존 앱의 현재 플랜 및 URL 변경 가능성을 확인한다. 유료 결정이 필요하면 정확한 조건을 제시하고 별도 승인을 받는다.
3. 검토한 전용 runtime identity를 적용하고 기존 삼성 secret·암호화 키를 production 환경에만 주입한다. Firebase CLI 개인 자격증명은 배포하지 않는다.
4. 공개 config·callback state 거부·unsigned webhook 거부·정확한 CORS·cron 인증을 확인한다.
5. 기존 삼성 앱의 redirect와 webhook을 새 고정 주소로 변경하고 `smartapps:confirm` 및 target 재조회로 확정한다. 기존 secret은 회전하지 않는다.
6. `docs/smartthings-config.mjs`에 검증한 origin을 넣고 Firebase 파일을 기존 서비스 경로를 보존하며 게시한다.
7. 실제 삼성 동의, 플러그 선택, 자동 웹훅 새 신호, 갱신·해제·재연결 및 동의한 2~3가구 격리를 확인한다.

## 공식 근거

- [SmartThings App Setup](https://developer.smartthings.com/docs/service-integrations/app-setup)
- [OAuth](https://developer.smartthings.com/docs/service-integrations/oauth), [웹훅 검증](https://developer.smartthings.com/docs/service-integrations/webhook-events)
- [CLI 3.0.1](https://github.com/SmartThingsCommunity/smartthings-cli/releases/tag/@smartthings/cli@3.0.1)
- [Firebase Hosting rewrite 대상](https://firebase.google.com/docs/hosting/full-config)
- [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Firestore IAM](https://firebase.google.com/docs/firestore/security/iam)
