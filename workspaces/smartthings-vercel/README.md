# 밥뭇나 SmartThings 무료 서버 배포 패키지

기존 Firebase Auth·Firestore를 그대로 사용하는 별도 Node.js 서버입니다. 루트 Next.js/Supabase 앱을 배포하거나 계정·DB를 이전하지 않습니다. 이 폴더의 명령은 로컬 패키지만 만들며 Vercel 게시·삼성 앱 수정·IAM·결제 설정을 실행하지 않습니다.

## 만들기

저장소 루트에서 `npm --prefix workspaces/smartthings-vercel run stage`를 실행합니다. `.stage/`에 검토된 SmartThings 서버 6개·카카오 서버 4개, 각 API 어댑터, 명시된 연결 화면 3개와 승인 자산 1개, 고정 의존성 잠금파일만 복사합니다. 이 디렉터리가 독립 Vercel 프로젝트의 배포 루트입니다. 새 프로젝트 연결이나 게시 명령은 자동 실행하지 않습니다. 기존 Vercel 프로젝트를 쓸 때는 루트 Next.js 서비스와 충돌하지 않는 배포 대상을 먼저 확인합니다.

Vercel Node.js 24, 서울 `icn1`, SmartThings API catch-all 원래 경로, 최대 요청 300초를 사용합니다. 카카오는 `config`·`start`·`callback`·`exchange`의 고정 파일 경로와 공통 핸들러를 사용합니다. Vercel catch-all이 `...path`를 쿼리에 추가해 정상 OAuth 시작을 거부하던 운영 오류를 해결하며, 임의 쿼리·중복 값 거부는 유지합니다. `NODEJS_HELPERS=0`으로 플랫폼 본문 파싱을 끄며, 서버는 최대 1MiB 원문을 보존합니다. `Host`·`X-Forwarded-*`로 공개 주소를 정하지 않습니다. 로그에는 요청 본문·OAuth 코드·인증 토큰·서비스 계정 오류를 출력하지 않습니다. 실제 Vercel edge 접근 로그의 쿼리 문자열 보관 설정은 게시 전에 별도로 확인해야 합니다.

Vercel은 기본적으로 CommonJS의 ESM 로딩을 끄므로 Firebase Admin 14의 `jwks-rsa` → `jose` 초기화가 실패한다. 공식 지원 설정 `NODE_OPTIONS=--experimental-require-module`을 production 환경과 배포 템플릿에 명시한다. 의존성을 과거 버전으로 낮추지 않는다. 연결 화면의 끝 슬래시(`/connect/`)가 경로별 헤더에서 누락된 실제 응답을 확인했으므로, 이 독립 서버의 모든 경로에 `no-store`·`no-referrer`·CSP·프레임 차단을 적용한다.

## 운영 환경변수

비밀값은 운영 환경의 서버 비밀 설정에만 넣습니다. 브라우저 번들, Git, `.stage/`, 문서나 로그에 복사하지 않습니다. 이 저장소에는 실제 키를 추가하지 않습니다.

| 이름 | 값 또는 목적 |
| --- | --- |
| `PUBLIC_ORIGIN` | 삼성에 등록할 고정 HTTPS 서버 원점. Preview 주소로 바꾸지 않음 |
| `APP_URL` | 같은 서버 원점의 `/connect/` |
| `BAPMUNNA_APP_ORIGINS` | `https://impact-series.web.app` |
| `BAPMUNNA_RETURN_URL` | `https://impact-series.web.app/bapmunna/carer/#connect` |
| `FIREBASE_PROJECT_ID` | 기존 계정·DB 프로젝트 `ku-gpa` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | 위 프로젝트 전용 최소권한 서비스 계정 JSON. 서버에만 보관 |
| `SMARTTHINGS_APP_ID` / `SMARTTHINGS_CLIENT_ID` | 기존 삼성 OAuth 앱 식별자 |
| `SMARTTHINGS_CLIENT_SECRET` | 삼성 OAuth 앱 비밀값 |
| `SMARTTHINGS_ENCRYPTION_KEY` | 서버 토큰 저장용 32바이트 base64 키. 기존 암호화 데이터가 있으면 키 유지 |
| `SMARTTHINGS_OAUTH_PREFIX` | 기존 등록 앱과 일치하는 `/oauth` 또는 `/v1/oauth` |
| `SMARTTHINGS_CONNECTION_ENABLED` | 기본값은 비활성. Business 이용 자격·운영 callback/webhook 등록 검증 후에만 `true`로 설정 |
| `CRON_SECRET` | 32~256자의 공백 없는 무작위 비밀값. 청소 요청 인증에만 사용 |
| `NODEJS_HELPERS` | `0` — `vercel.json`에도 명시 |
| `NODE_OPTIONS` | `--experimental-require-module` — Vercel 기본 ESM 로딩 제한과 Firebase Admin 호환 |

서비스 계정 JSON이 없으면 로컬/Google 서버에서만 기존 ADC 방식을 사용합니다. Vercel에서는 준비 완료를 표시하지 않고 초기화를 거부합니다. Vercel에 로컬 CLI 토큰을 가져오지 않습니다. 서비스 계정에는 사용자 취소/정지 확인을 포함한 Firebase Auth 조회와 프로젝트 Firestore 문서 접근 8개 권한만 부여하며 Owner/Editor를 주지 않습니다. IAM은 SmartThings 컬렉션만으로 제한되지 않습니다. Admin SDK는 브라우저 규칙을 우회하므로 컬렉션·소유권 경계는 서버 코드가 지킵니다. 실제 IAM 부여·키 생성·비밀 설정은 별도 운영 단계입니다.

`node integrations/bapmunna-firebase/scripts/provision-smartthings-identity.mjs plan`은 정확한 서비스 계정·권한만 출력합니다. `apply`는 실제 운영 변경이며, 두 프로젝트 Spark 확인, 기존 추가/조건부 역할 거부, IAM etag와 복구본 보존, 기존 원격 키 활성 여부 확인을 수행합니다. 키 생성 후 로컬 저장에 실패하면 `tmp/smartthings-live-20261114/generated-key-*.json`의 공개 키 이름으로 해당 새 키만 폐기한 뒤 재시도해야 합니다. 비밀키는 재다운로드할 수 없습니다. 스크립트는 이 복구 작업을 자동 수행하지 않습니다.

삼성 Redirect URI는 `<PUBLIC_ORIGIN>/api/smartthings/callback`, 웹훅은 `<PUBLIC_ORIGIN>/api/smartthings/events`여야 합니다. 고정 운영 배포의 웹훅·콜백은 Vercel 로그인 보호 없이 접근되어야 합니다. Firebase Spark의 301/302 리다이렉트를 웹훅 프록시로 사용하지 않습니다.

`/config`의 `enabled`는 서버 설정 존재 여부이고 `connectionReady`는 신규 소비자 연결 허용 여부입니다. 두 값을 혼동하지 않습니다. 신규 연결이 닫혀 있어도 기존 상태 확인·연결 해제·이미 시작한 callback은 유지합니다. 고객은 PAT를 발급하지 않고 자신의 삼성 계정으로 동의합니다. 개발사 Business 계약 하나가 고객 전체의 공용 토큰이 되는 것은 아닙니다. 고객별 설치·토큰을 서버에서 분리합니다.

## TTL 없이 만료 정보 정리

카카오 로그인도 이 서버의 `/api/kakao/*`를 사용하지만 준비 상태는 삼성 설정과 독립적입니다. 추가 환경변수는 `KAKAO_APP_ID`, `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`입니다. 정확한 등록 주소·브라우저 복귀·실제 완료 기준은 [Firebase 카카오 설정](../../documentation/kakao-firebase-20261115.md)을 따릅니다. 앱 ID나 비밀이 없으면 카카오 config는 비활성으로 응답합니다.

`GET /api/smartthings/cleanup`은 `Authorization: Bearer <CRON_SECRET>`로만 실행합니다. 일반 로그인 토큰이나 브라우저 Origin으로는 허용하지 않습니다. 하루 한 번 `18:00 UTC`(다음 날 한국 03시)에 실행하도록 설정했습니다. Hobby는 해당 시각으로부터 59분 늦게 실행될 수 있고 실행 실패·지연이 가능합니다.

정리 대상은 서버의 `States`, `Locks`, `Receipts` 컬렉션 중 만료된 문서뿐입니다. 한 번에 전체 최대 5,000개, 트랜잭션당 100개를 처리하며 갱신된 잠금·유효한 상태를 재확인해 보존합니다. 연결·설치·가구·암호화 토큰 문서는 정리 대상이 아닙니다. 결과는 `scanned`, `deleted`, `limitReached`와 컬렉션별 집계만 반환합니다.

같은 인증된 cron이 카카오의 만료 `States`, `Handoffs`, `Limits`도 최대 1,000개 추가 정리합니다. 카카오와 삼성 중 준비된 통합을 각각 청소하므로 삼성 미설정이 카카오 정리를 막지 않습니다. 두 통합이 모두 미설정이면 실행하지 않습니다. 무료 읽기·삭제 할당량 계산에는 이 추가 문서도 포함해야 합니다.

이 cron은 SmartThings의 갱신 예정 연결도 최대 20개·120초 예산으로 유지합니다. 브라우저를 열지 않아도 서버가 토큰을 갱신하며, API 요청 시 갱신과 동일한 설치별 잠금을 사용합니다. 일회용 refresh token을 요청하기 전에 시도 상태를 기록하고 새 access/refresh 쌍을 원자적으로 저장합니다. 응답 유실처럼 결과가 불확실하면 같은 토큰을 재사용하지 않고 재연결을 안내합니다. 기존 데이터 중 유지관리 메타데이터가 없는 연결은 새 OAuth 연결이 필요합니다. 일일 작업은 대규모 상용 서비스의 처리량·복구 시간을 보장하지 않습니다.

시작·callback·읽기·자동 수신·유지관리에서 활성 Firebase 계정과 해당 UID에 저장한 어르신 동의를 확인합니다. 데이터 저장 직전에는 트랜잭션으로 동의를 재확인합니다. 동의 철회 시 새 조회·수신 저장을 멈추고 연결을 재연결 필요 상태로 두며, 암호화된 자격 증명은 명시적인 연결 해제 때 삭제합니다. 삼성 계정의 서비스 허용 철회는 SmartThings에서도 별도로 할 수 있습니다.

Firestore TTL을 활성화하지 않고 일반 조회·삭제 무료 할당량을 사용합니다. 5,000개 정리 시 후보 조회와 재확인으로 최대 약 10,000회 읽기와 5,000회 삭제(재시도·빈 쿼리 별도)가 발생할 수 있습니다. 3가구가 각 1분마다 1회 전송하면 하루 4,320개 수신증이 생기므로 이 예시 빈도에서는 일일 상한 안이지만, 여러 기기·속성·빠른 이벤트는 상한을 넘길 수 있습니다.

매 API 요청마다 자동 삭제하는 방식은 공격·반복 요청에 DB 작업이 따라오고 조용한 날에는 정리되지 않아 채택하지 않았습니다. 하루 cron도 엄격한 물리 삭제 시각을 보장하지 않습니다. `limitReached=true`, 실패, 누락 실행을 운영자가 확인하고 필요한 경우 동일 인증 경로를 다시 실행해야 합니다. 수신증의 논리적 만료는 24시간이며 물리 삭제는 다음 성공한 정리 때 이뤄집니다. 원시 전력값은 애초에 저장하지 않습니다.

## 비용·실제 검증 경계

### 선택 참여 걸음수 랭킹

`/api/walking/[action].mjs` 하나가 config/profile/join/leave/pairing/pair/confirm/unpair/sync/board를 처리한다. 카카오 고정 경로 4개와 SmartThings 1개를 보존해 총 함수 6개다. 플랫폼 action 메타데이터는 경로와 정확히 일치하는 단일 값만 정규화하고 나머지 쿼리는 거절한다. 기존 Firebase 서버 자격정보를 재사용하며 새 Secret·Rules·IAM·요금제 변경은 필요하지 않다.

계정의 현재 인증·이메일 확인·프로필 동의를 확인하고, 전체 사용자 대상의 별도 랭킹 참여와 휴대폰의 목적지 별명 확인·동의를 거친다. 서버 비공개 `bapmunnaSystem/walking`만 사용하며 외부에는 임의 publicId·별명·오늘 합계·순위만 반환한다. 참여자 계정 ID·건강 원본 기록은 반환하지 않는다. 한국 시간의 오늘 합계만 순위에 포함하며 상위 50명과 본인의 정확한 순위를 제공한다. 기기 토큰은 30일·해시 보관이고 연결 해제/참여 철회를 트랜잭션으로 처리한다.

기존 인증 cron은 walking의 지난 합계·만료된 코드·기기·rate-limit 문서도 회당 최대 1,000개 정리한다. 다른 통합의 청소 실패가 walking 청소를 막지 않으며 실패 여부는 503 집계 응답에 남긴다. 오늘 이전 합계는 청소 전에도 순위에서 제외된다. 소규모 시험의 무료 할당량을 이용하며 참여자 증가 시 읽기·집계·쓰기와 호출량을 점검해야 한다.

계약·검사·실기기 한계는 [걸음수 기능 기록](../../documentation/walking-ranking-20261117.md)을 따른다. 게시 후 `node workspaces/smartthings-vercel/scripts/check-walking-public.mjs <결과.json>`으로 준비 상태·원점/인증 차단·기존 공급자 유지 여부를 검사한다. 이 검사는 건강 기록을 만들거나 랭킹 참여를 신청하지 않는다.

Vercel Hobby는 개인·비상업적 이용 자격과 무료 한도를 확인해야 합니다. Firebase Spark를 유지하며 유료 기능을 활성화하지 않습니다. 무료 서버가 삼성 API 이용료·정책까지 면제한다는 뜻은 아닙니다. Google WIF 구성 문서는 결제 활성화를 선행조건으로 요구하므로 무과금 환경에서 새 WIF가 가능하다고 가정하지 않습니다.

소스 검사와 로컬 합성 테스트는 실제 연결 증거가 아닙니다. 게시 후 원문 서명 웹훅, OAuth 동의→복귀, 기기 선택, 실제 자동 수신, 갱신·해제, 서로 다른 2~3가구 소유권, 청소 cron 실행을 각각 확인해야 합니다.

공식 자료: [Vercel Node 원문 요청](https://vercel.com/docs/functions/runtimes/node-js/advanced-node-configuration), [Hobby](https://vercel.com/docs/plans/hobby), [이용 조건](https://vercel.com/legal/terms), [cron 제한](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing), [Firestore 무료 한도·TTL](https://firebase.google.com/docs/firestore/pricing), [외부 서버 Firebase 인증](https://firebase.google.com/docs/admin/setup), [WIF 선행조건](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-other-providers).
