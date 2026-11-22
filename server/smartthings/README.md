# 워밍업 밥뭇나 SmartThings 서버

사용자가 삼성 계정에 동의하고 밥솥 플러그 하나를 고르면, 밥뭇나가 그 기기의 최근 전력값을 읽고 새 신호 도착을 표시합니다. 기기 종류와 측정 시각도 함께 확인합니다. 이 서버의 배포 대상은 팀 프로젝트 `warming-up-bapmunna`, 서울 `asia-northeast3`, 서비스 `warming-up-smartthings`입니다.

## 팀에서 한 번 준비할 일

1. **운영 조건을 결정합니다.** Firebase Hosting의 Cloud Run 연결에는 결제가 연결된 프로젝트가 필요합니다. 팀 프로젝트가 Spark인 동안 정적 앱과 데모는 사용할 수 있고, 실제 OAuth 시작은 준비 중으로 표시합니다. 팀의 Cloud Run·빌드·저장소 및 필요한 삼성 앱 이용 플랜 승인 후 아래 작업을 진행합니다. [Firebase Hosting과 Cloud Run](https://firebase.google.com/docs/hosting/cloud-run)
2. **팀 소유의 삼성 API Access App을 등록합니다.** Redirect URI는 `https://warming-up-bapmunna.web.app/api/smartthings/callback`, Target URL은 `https://warming-up-bapmunna.web.app/api/smartthings/events`, 개인정보 안내는 `https://warming-up-bapmunna.web.app/privacy/`입니다. DEVICE 웹훅 구독에 필요한 읽기 권한 `r:devices:*` 한 개를 등록합니다. [앱 등록](https://developer.smartthings.com/docs/service-integrations/app-setup) · [구독별 요구 권한](https://developer.smartthings.com/docs/service-integrations/subscribe-to-events)
3. **런타임 계정과 비밀값을 준비합니다.** 전용 서비스 계정을 Cloud Run 서비스·Job에 연결하고 Admin SDK가 해당 계정의 기본 자격 증명(ADC)을 사용하도록 합니다. 기본 Firestore 문서 읽기·조회·생성·갱신·삭제 및 트랜잭션, Firebase Auth 사용자 조회(`firebaseauth.users.get`), 아래 비밀값에 대한 Secret Accessor가 필요합니다. Firestore에는 `roles/datastore.user` 또는 해당 트랜잭션 권한을 포함하는 맞춤 역할을 쓸 수 있습니다. 서버 Admin SDK는 클라이언트 규칙을 우회하므로 서버는 모든 요청에서 사용자의 계정·동의·설치·기기를 확인합니다. 배포 작업자의 권한은 런타임 계정과 구분합니다. [Cloud Run 비밀값 연결](https://cloud.google.com/run/docs/configuring/services/secrets)

   | 환경 설정 | 넣을 값 |
   |---|---|
   | `SMARTTHINGS_APP_ID` | 팀 삼성 앱 ID |
   | `SMARTTHINGS_CLIENT_ID` | 그 앱의 OAuth Client ID |
   | `SMARTTHINGS_CLIENT_SECRET` | 그 앱의 Client Secret, 팀 Secret Manager에서 주입 |
   | `SMARTTHINGS_ENCRYPTION_KEY` | 팀 전용 32바이트 무작위 키를 Base64로 인코딩해 Secret Manager에 보관. 기존 데이터가 있을 때는 토큰 이관 또는 재연결 계획과 함께 교체 |
   | `SMARTTHINGS_CONNECTION_ENABLED` | 등록·검증 중 `false`, 팀이 신규 연결을 열 때 `true` |

4. **서버와 경로를 연결합니다.** 이 디렉터리의 Dockerfile로 이미지를 만들고 위 프로젝트·지역·서비스에 배포합니다. HTTP 서버는 `PORT`(기본 8080)를 사용합니다. 파일 업로드 목록은 `.gcloudignore`와 `.dockerignore`에서 제한합니다. 시범 운영은 최소 인스턴스 0, 최대 1로 구성할 수 있습니다. 삼성 콜백·서명된 웹훅과 공개 설정 조회가 도착하도록 서비스가 HTTPS 요청을 받을 수 있어야 합니다. 팀 저장소의 `firebase.json`에서 `/service-status/smartthings.json`을 가리키는 기존 `rewrites` 항목 하나를 아래 항목으로 교체합니다. 팀 소유자 게시 명령과 GitHub 워크플로가 이 설정을 함께 사용합니다. 액세스 로그의 콜백 쿼리 문자열은 제한하거나 제외합니다.

   ```json
   {
     "source": "/api/smartthings/**",
     "run": {"serviceId": "warming-up-smartthings", "region": "asia-northeast3"}
   }
   ```

5. **등록을 확인하고 신규 연결을 엽니다.** 삼성 콘솔에서 Target URL 확인을 요청합니다. 서버가 삼성 서명과 등록된 앱 ID를 확인하고 해당 앱의 삼성 확인 URL에 응답하면 콘솔에서 `CONFIRMED`를 확인할 수 있습니다. 서비스에 팀 앱 키·암호화 키가 준비된 후 `GET /api/smartthings/config`가 `projectId: warming-up-bapmunna`, `enabled: true`를 반환하는지 확인합니다. 신규 연결을 켜면 `connectionReady: true`가 됩니다. 각 값은 서버 설정 상태입니다. 실제 사용자 연결은 아래 검증을 따릅니다. [웹훅 등록 확인](https://developer.smartthings.com/docs/service-integrations/app-setup)

## 한 가구의 실제 플러그로 확인하기

1. 참여자가 SmartThings 앱에 실제 플러그를 등록하고 온라인 상태 및 전력 측정 기능을 확인합니다. 밥뭇나에 로그인해 가입 안내와 가구 준비 확인을 마친 뒤 기기 연결 안내에서 별도로 동의합니다.
2. 밥뭇나가 삼성 동의 화면을 열면 참여자가 허용합니다. 팀 앱의 `/connect/`로 돌아와 목록에서 밥솥에 연결한 플러그를 직접 고릅니다. 서버는 등록된 삼성 장치 정보를 재조회하고 해당 설치·기기 조합으로 이벤트 구독을 확인합니다. `VIRTUAL` 기기는 `isVirtual: true`로 표시합니다. 미분류 기기나 가상 기기의 숫자로 실물 밥솥 사용을 판정할 수 없습니다.
3. 상태 확인에서 `reading.watts`(W)와 `reading.measuredAt`(실제 측정 시각, Unix 밀리초)를 확인합니다. 0W도 측정입니다. 전력값 또는 유효한 측정 시각이 없으면 `reading: null`을 반환합니다. 아까 받은 값일 수 있으므로 측정 시각을 함께 봅니다. 선택과 조회 후 재검사는 30초 간격입니다.
4. 실제 밥솥을 평소처럼 사용할 때 측정 시각이 바뀌는지 확인합니다. 직접 조회 버튼을 누르지 않은 상태에서 ‘삼성이 기록한 신호 시각’과 ‘자동으로 받은 마지막 신호’가 모두 새로 찍히면 자동 전달까지 확인할 수 있습니다. `lastEventAt`은 삼성이 자동 신호에 기록한 시각, `lastReceivedAt`은 밥뭇나가 서명된 신호를 받은 시각입니다. `lastCheckedAt`은 직접 조회한 시각이고, `lastSignalAt`은 직접 조회와 자동 신호 중 더 최근 기기 시각입니다. 이전 연결 기록에 자동 신호 시각이 없으면 다음 자동 신호를 기다립니다. 전력 신호만으로 식사 여부를 확정하지 않습니다.

## 서버 계약과 데이터

모든 경로의 앞부분은 `/api/smartthings`입니다. `/config`는 공개이고, `/callback`은 일회용 상태와 브라우저 nonce를 대조하며 `/events`는 삼성 RSA 서명과 원문 해시를 검증합니다. 나머지는 이메일 인증을 마친 팀 Firebase 사용자의 유효한 ID 토큰이 필요합니다. 브라우저 변경 요청은 팀 사이트에서만 받습니다. OAuth 정보는 서버에서 `/v1/oauth/token`으로 교환합니다. [삼성 OAuth](https://developer.smartthings.com/docs/service-integrations/oauth) · [웹훅 서명과 이벤트](https://developer.smartthings.com/docs/service-integrations/webhook-events)

| 요청 | 결과 |
|---|---|
| `GET /config` | 팀 프로젝트 ID, 서버 설정·신규 연결 가능 여부, 현재 기기 동의 버전 |
| `POST /start` | `{consentVersion}`을 확인하고 삼성 주소 `{url}`과 10분짜리 HttpOnly·Secure `__session` 쿠키 발급 |
| `POST /cancel-start` | 진행 중인 본인의 `attemptId`를 취소합니다. 로그아웃·계정 전환·동의 철회 시 이전 승인 요청을 정리합니다. |
| `GET /callback` | 동의·계정·nonce 재검사 후 팀 앱 `/connect/?smartthings=...`로 복귀 |
| `GET /status`, `GET /devices` | 본인의 연결 정보, 선택 가능한 전력 측정 기기 목록 |
| `POST /device` | `{deviceId}` 확인 후 선택 기기, 구독 상태, 일회성 실측값 반환 |
| `POST /check` | 빈 JSON `{}`을 받아 저장된 본인 기기의 일회성 실측값 반환 |
| `POST /events` | 유효한 서명의 선택 기기 신호 및 삼성 측 설치 삭제 이벤트 처리 |
| `DELETE /connection` | `{confirm:true}`. 삼성에서 해당 설치의 구독을 정리하고 로컬의 연결·암호화된 토큰을 삭제 |

온보딩 준비 상태는 `bapmunnaAccounts/{uid}/preferences/settings`, 가입 동의는 `bapmunnaAccounts/{uid}`에서 읽습니다. 기기 연결에는 `smartthings-read-2026-11-22` 동의가 별도로 필요하며, 동의·선택 기기를 Firestore 트랜잭션에서 다시 확인합니다. 서버 전용 컬렉션에는 암호화된 삼성 토큰, 선택 기기, 동의 버전과 시각, 최근 확인·도착 정보, OAuth 상태·잠금·중복 방지 식별 해시만 저장합니다. 원시 W와 시계열은 저장하지 않습니다. 앱이 삼성 권한 자체를 제거하려면 사용자가 SmartThings의 연결 서비스 관리에서 밥뭇나 승인을 철회합니다. 삼성 연결 해지 웹훅이 오면 서버에서도 제거합니다. 삼성 토큰이 이미 만료되어 구독 정리가 불가능할 때는 삼성에서 직접 철회한 뒤 `{confirm:true,forgetExpired:true}`로 로컬 기록을 정리합니다.

## 장기 수신과 정리

서버는 조회 직전에 만료가 임박한 토큰을 갱신합니다. 정기 운영에는 같은 불변 컨테이너 이미지로 비공개 Cloud Run Job `warming-up-smartthings-maintenance`을 같은 지역·서비스 계정·비밀값으로 구성하고, 실행 명령을 `node maintenance.mjs`로 지정합니다. 태스크 1개, 병렬 1개, 실행 제한 5분으로 시작할 수 있습니다. [삼성 토큰 갱신](https://developer.smartthings.com/docs/service-integrations/token-management)

팀에서 예약 실행을 승인하면 Cloud Scheduler에서 이 Job의 `:run` API를 6시간마다 호출합니다. 인증은 스케줄러 전용 서비스 계정의 OAuth 액세스 토큰을 사용하고 해당 Job에서만 `roles/run.invoker`를 부여합니다. Job은 한 번에 만기가 가까운 계정 최대 20개를 확인하고, 만료된 임시 Firestore 문서 최대 500개를 정리합니다. 가입·동의가 철회된 계정은 갱신을 중지합니다. 토큰 회전의 결과가 불명확하면 재사용을 중단하고 재연결을 요청합니다. 로그는 계정·기기 식별자가 없는 집계 수치입니다. 반복 실행에서 `limitReached`나 `deferred`가 누적되면 실행 간격과 상태를 확인합니다. 예약 실행이 없으면 만료된 임시 기록은 다음 정리 실행까지 남습니다. [Cloud Run Job 예약 실행](https://cloud.google.com/run/docs/execute/jobs-on-schedule)

로컬에서는 Node 24로 `npm ci`, `npm test`를 실행합니다. Firestore 통합 검사까지 포함하려면 루프백의 Firestore 에뮬레이터를 `demo-warming-up` 프로젝트로 시작하고 `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`을 지정합니다. 테스트는 가상 응답과 일회용 테스트 키를 사용합니다.
