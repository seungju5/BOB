# 밥뭇나 SmartThings 연결 서버

2026-11-03 구현: **본인 로그인 → 삼성 동의 → 플러그 선택 → 신호 도착 확인 → 연결 해제**. **삼성 OAuth 앱 등록과 설정 재조회는 완료했다.** 공개 서버 배포와 실제 사용자 OAuth·구독·자동 수신 검증은 남아 있다. 프런트는 서버가 없거나 설정되지 않았으면 ‘준비 중’을 표시한다.

등록 증거는 비밀값을 제외한 [registration-status.json](registration-status.json)에 있다. App ID는 `f1b8149d-45c5-4f4b-8136-2ad518faf4ec`, 앱 유형은 `API_ONLY`, 현재 webhook Target 상태는 `PENDING`이다. Client ID·Secret은 발급되었고 접근 제한된 비공개 파일에 보관했다. URL이 저장되었다는 사실과 공개 서버가 가동된다는 사실을 구분한다. [배포·비용·실제 시연 계획](deployment-plan.md)을 따른다.

## 이번 주에 팀이 할 일

| 순서 | 할 일 | 완료 기준 |
| --- | --- | --- |
| 1 | Figma에서 캐릭터·로그인·연결 화면 확인 | 기존 초록 가디건 토끼를 전 화면에 사용, 노란 밥솥은 브랜드 로고 |
| 2 | 삼성 개발자 계정의 앱 등록·팀 서비스 이용 조건 확인 | App ID, Client ID, Client Secret 발급 완료. 결제·Business 계약은 별도 결정 |
| 3 | 테스트용 서버와 비밀 키 설정 | 아래 설정을 별도 테스트 환경에서 완료하고 `config.enabled=true` 확인 |
| 4 | 1가구의 실제 플러그로 연결·사용·해제 | 전력 측정 capability, 삼성 허용 화면, 수신 시각, 재연결, 철회 확인 |
| 5 | 2–3가구 각각 본인 계정으로 반복 | 다른 가구 정보가 보이지 않고 각 기기에서 신호 수신 |
| 다음 단계 | 식사 판정·가족 동의·알림 연결 | 실측 근거와 동의 흐름 검증 후 별도 작업 |

**이번 구현의 범위:** 사용자마다 플러그 1개, 전력 측정 지원 기기, 연결 상태 및 최근 도착 시각. 원시 전력 시계열·식사 판정·가족 전송·푸시는 이 서버에 포함하지 않는다. 기기 신호가 없다고 결식이나 오프라인을 확정하지 않는다. 장시간 사용하지 않아도 계정이 유지되는지는 실제 삼성 grant 정책으로 검증해야 한다.

## 등록과 설정

삼성 [10월 30일 공지](https://blog.smartthings.com/smartthings-updates/smartthings-api-additional-details-for-developers-and-business-partners/)에 따라 11월 4일부터 유료 플랜 미선택 계정은 신규 앱 생성·기존 앱 수정을 할 수 없고, 12월 15일 이후 미가입 앱의 API가 제한·중단될 수 있다. 오늘 등록해도 영구 무료가 되는 것은 아니다.

삼성 공식 [앱 설정](https://developer.smartthings.com/docs/service-integrations/app-setup)은 조사일 현재 새 API Access App 등록을 coming soon으로 표시한다. 계정에 실제로 활성화된 등록 경로를 확인해야 하며, 준비 코드를 실제 연결 완료로 보지 않는다. 기존 OAuth 앱은 [Quick Start](https://developer.smartthings.com/docs/getting-started/quickstart)의 경로가 다르므로 발급한 앱과 API 버전을 맞춘다.

`app-registration.json`은 공식 CLI의 OAuth-In/API_ONLY 생성 입력이다. 11월 3일 공식 CLI 2.1.3에서 삼성 계정 인증과 CLI 권한 승인을 마친 뒤 `apps:create`에 성공했다. 이어 `apps`와 `apps:oauth`로 Redirect URI·Target URL·읽기 권한이 이 파일과 일치하는지 확인했다. manifest와 공개 등록 증거에는 Client Secret이나 테스트 토큰이 없다. 기존 앱을 다시 만들거나 Client Secret을 불필요하게 재발급하지 않는다.

### 인증을 재개할 때

CLI 로그인은 10분 뒤 종료되므로 시간이 지난 경우 공식 CLI 로그인부터 새로 시작한다. 계정 소유자가 준비된 시점에 문자 코드를 요청하고 수신 직후 입력한다. ‘다음에 2단계 인증 건너뛰기’는 해제해 다음 로그인에도 인증을 유지한다.

1. 공식 `@smartthings/cli`의 `apps --json`으로 로그인한 뒤 같은 `appName`의 기존 앱부터 조회한다. 중복 앱을 만들지 않는다.
2. 앱이 없을 때만 `apps:create -i server/app-registration.json --json`을 실행한다. 최초 응답의 Client Secret은 접근 제한된 로컬 비밀 파일에 바로 저장하고 출력·Git·Figma에 넣지 않는다.
3. `apps <App ID> --json`, `apps:oauth <App ID> --json`으로 Redirect URI·Target URL·`r:devices:*`를 다시 확인한다. 등록 결과를 확인하기 전에는 완료로 표시하지 않는다.
4. 공개 서버를 배포한 뒤 `apps:register <App ID>`로 웹훅 확인을 요청하고, 삼성의 확인 완료 상태를 조회한다. URL 등록과 웹훅 가동은 별도 단계다.

제공된 테스트용 PAT는 실제 기기 조회에는 성공했지만 앱 조회·생성에는 403을 반환했다. 이 토큰을 장기 OAuth 자격 증명 대신 배포하지 않는다. 현재 결제 계정이 없는 Firebase의 공개 서버 배포는 아래 준비 사항이 해결된 뒤 진행한다.

1. 삼성 앱 표시 이름 `밥뭇나 · Warming Up`, 읽기 권한 `r:devices:*`만 등록한다. 실행·기기 삭제 권한을 요청하지 않는다. 삼성에서 허용한 기기 목록을 조회한 후 사용자가 앱에서 플러그 하나를 고른다.
2. Redirect URI: `https://impact-series.web.app/api/smartthings/callback`
3. Webhook Target URL: `https://impact-series.web.app/api/smartthings/events`
4. `.env.example`의 값을 배포 환경에 등록한다. `FIREBASE_PROJECT_ID=ku-gpa`는 기존 Firebase 데이터 프로젝트이며 `impact-series`는 Hosting 사이트다. 실제 운영 구성을 먼저 확인한다. 테스트 환경은 origin·callback·APP_URL을 함께 변경한다.
5. Client Secret과 32바이트 난수의 base64인 `SMARTTHINGS_ENCRYPTION_KEY`는 Secret Manager에 저장해 컨테이너 환경 변수로 제공한다. 키를 Git·채팅·브라우저·평문 Firestore에 넣지 않는다. 로컬도 키 파일을 커밋하지 않는다. 암호화 키 교체에는 기존 토큰 재암호화 또는 전체 재연결 절차가 필요하다.
6. Node 24로 `npm ci`, `npm test`, `npm start`. 미설정 상태에서도 `/api/smartthings/config`는 `{enabled:false}`를 반환한다. 프로세스는 Firebase Admin의 Application Default Credentials를 사용한다. 서비스 계정 키를 프런트나 컨테이너 이미지에 복사하지 않는다.

```sh
cd integrations/bapmunna-firebase/server
npm ci
npm test
npm start
```

`SMARTTHINGS_OAUTH_PREFIX` 기본값 `/oauth`는 오늘 CLI에서 생성하는 기존 OAuth-In 앱의 공식 예제 기준이다. 새로운 API Access App은 발급된 설정에 맞춰 `/v1/oauth`를 선택할 수 있다. 구독 요청도 기존 SDK의 nested `device.subscriptionName`과 새 문서의 top-level 형식을 이 설정에 맞춰 사용한다. 다른 주소로 자동 우회하지 않는다. 공개 HTTPS URL의 **정확한 origin과 callback**을 삼성 설정과 일치시킨다. 프런트와 API는 같은 origin을 사용한다.

## Firebase / Cloud Run 연결 준비

`Dockerfile`과 `hosting-rewrite.example.json`은 검토용 예시이며 자동 배포하지 않는다. 기존 Hosting 설정 전체를 예시 파일로 덮어쓰면 안 된다. `/api/smartthings/**` rewrite를 기존 SPA fallback보다 앞에 추가하고 나머지 사이트 설정을 보존한다. 11월 3일 실제 기본 Firestore 위치가 `asia-northeast3`임을 확인해 서버도 같은 서울 리전으로 준비했다. Hosting이 지원하는 리전이며 실제 지역별 요금과 사용량은 배포 전에 확인한다.

- [Firebase Hosting + Cloud Run](https://firebase.google.com/docs/hosting/cloud-run)에는 결제 계정 연결이 필요하며 Spark 프로젝트는 Blaze로 바뀔 수 있다. 2026-11-03 실제 조회에서 `ku-gpa`의 billingEnabled=false와 Cloud Run/Functions API 미활성을 확인했다. 결제 연결 및 비용 확인 전에는 webhook URL을 등록하더라도 서버 검증 완료라고 표시할 수 없다. 이 PR은 결제나 유료 플랜을 활성화하지 않는다.
- 공개 endpoint는 사용자 API의 Firebase ID token 검증과 삼성 webhook 서명 검증으로 보호한다. 서버의 IAM은 필요한 Firebase Auth 사용자 조회·Firestore 접근과 해당 Secret 조회 범위로 제한한다. Firebase ID token은 폐기 여부까지 확인한다.
- [Firebase Hosting은 `__session` 쿠키만 전달](https://firebase.google.com/docs/hosting/manage-cache)하므로 OAuth nonce는 이 이름과 `/api/smartthings` 경로, HttpOnly·Secure·SameSite=Lax·10분 만료를 사용한다. 다른 기능이 같은 경로의 `__session`을 쓰는지 확인한다. 사용자 응답은 `Cache-Control: no-store`다.
- `firebase/bapmunna.rules`의 SmartThings 다섯 collection은 모든 브라우저 읽기/쓰기를 거부한다. 기존 전체 규칙과 병합하고 공개 wildcard가 없는지 확인한 뒤 배포해야 한다. 로컬 테스트는 두 밥뭇나 fragment + deny-all 조합이며 현재 운영 규칙 검증을 대신하지 않는다.
- Firestore의 `bapmunnaSmartThingsStates`, `Locks`, `Receipts`에 `expiresAt` TTL 정책을 설정한다. TTL은 즉시 삭제가 아니므로 만료·일회성 검증은 서버에서 별도로 한다. connection은 연결 해제 시 삭제한다. 수신 중복 메타데이터는 24시간 TTL이다.
- 로그에 Authorization, Cookie, OAuth code, confirmation URL, webhook 본문을 기록하지 않는다. Cloud Run 접근 로그의 callback 쿼리 저장도 배포 시 제외/마스킹해야 한다. 오류 코드와 집계 수치로 운영한다.
- 2–3가구 파일럿에서 요청 시간 제한, 최대 인스턴스, 예산 알림을 설정한다. 분산 refresh lease는 120초이므로 단일 요청 실행이 그 시간을 넘지 않도록 운영 제한과 지연을 검증한다. 대규모 운영 전 lease fencing·정교한 사용자별 제한·보존/삭제 작업을 추가 검토한다.

## API 계약

| 경로 | 역할 |
| --- | --- |
| `GET /config` | 공개된 준비 여부만 반환 |
| `POST /start` | verified Firebase 사용자 + 같은 Origin + 동의 버전 → 삼성 이동 URL |
| `GET /callback` | 10분 state + 브라우저 nonce 검증, 일회 사용, 서버에서 토큰 교환 |
| `GET /status` | 로그인한 본인의 기기·최근 도착/확인 시각 |
| `GET /devices` | 허용한 기기 중 powerMeter 지원 목록. 목록 자체는 서버에 저장하지 않음 |
| `POST /device` | `{deviceId}`. 서버에서 권한/지원 여부 재확인 후 구독 |
| `POST /check` | 최근 상태 직접 확인. 30초 내 반복 요청 제한 |
| `DELETE /connection` | `{confirm:true}`. 구독 해제 성공 후 연결 정보 삭제 |
| `POST /events` | RSA 서명·digest·5분 freshness 검증 후 중복 제거, 도착 시각만 저장 |

`start`의 동의 버전은 `/config`의 `consentVersion`을 사용한다. 앱 callback에는 OAuth token/code를 전달하지 않고 결과 상태만 표시한다. ID token은 Firebase SDK에서 받아 Authorization 헤더로 보내며 별도 저장하지 않는다.

**해제와 오류:** 삼성 grant가 만료되어 구독 삭제가 불가능하면 사용자에게 SmartThings의 연결된 서비스에서 권한 철회를 안내한다. 그 안내 후 명시적 `forgetExpired:true`로 로컬 연결을 지울 수 있다. 정상 해제도 삼성 계정 전체 권한 철회와는 구분한다. 402는 이용 계획 확인, 429는 기다렸다 재시도로 안내한다. 반복 자동 결제·무한 API 재시도는 없다. 구독 실패 후 ‘연결 마무리’로 재시도하며 성공 전 완료로 표시하지 않는다.

## 검증과 실제 연결의 차이

- 서버 단위: OAuth state/nonce, 암호화/AAD, 다른 사용자/기기, 토큰 만료·동시 갱신, RSA 서명, 재전송, 해제, 402/429.
- Firestore emulator: 실제 트랜잭션의 소유자 매핑, lease, state 일회 사용, 이벤트 중복·역순, 연결 삭제. 프로덕션 데이터 미접근.
- 화면: 모바일 역할 전환, 로그인, 준비 중 메뉴 검증. 연결 후 화면은 테스트용 응답과 Figma 설계로 확인하며 실제 삼성 계정의 성공 증거가 아니다.
- 삼성 앱 등록과 설정 재조회는 완료했다. Target URL 확인, 실제 사용자 인증·기기 구독·계속 수신·24시간 이후 갱신·계정 철회는 실제 장비 검증 항목으로 남는다. CONFIRMATION도 서명을 요구한다. 실제 header 형식이 다르면 검증 근거를 확인해 수정하고, 서명 검증을 임의로 끄지 않는다.
- 2026-11-03 `npm audit`는 공식 Admin SDK의 하위 의존성에서 moderate 6건을 보고했다. 호환 범위의 `npm audit fix`로 해결되지 않았으며, 배포 전 공급자 업데이트를 재확인한다. 강제 major override는 적용하지 않았다.

공식 근거: [OAuth](https://developer.smartthings.com/docs/service-integrations/oauth), [토큰 갱신](https://developer.smartthings.com/docs/service-integrations/token-management), [기기 목록](https://developer.smartthings.com/docs/service-integrations/query-and-list-devices), [webhook 검증](https://developer.smartthings.com/docs/service-integrations/webhook-events), [Firebase ID token 검증](https://firebase.google.com/docs/auth/admin/verify-id-tokens).
