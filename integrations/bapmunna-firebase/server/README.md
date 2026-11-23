# 밥뭇나 통합판 연결 서버

팀 앱의 SmartThings 서버와 운영 설정은 `apps/warming-up/server/smartthings`에서 관리합니다. 팀 사이트의 콜백과 웹훅 등록, 본인 계정 동의, 플러그 구독 및 자동 수신을 확인하는 절차는 [팀 서버 안내](../../../apps/warming-up/server/smartthings/README.md)에 있습니다.

이 디렉터리는 별도 통합판의 SmartThings·카카오·걷기 기능과 로컬 회귀 검사를 제공합니다. Node 24에서 저장소 루트를 기준으로 다음 명령을 실행합니다.

```sh
npm --prefix integrations/bapmunna-firebase/server ci
npm run test:smartthings
npm run check:smartthings -- --offline
```

오프라인 점검은 팀 앱의 Firebase 기본 프로젝트, Hosting 사이트와 경로, 정적 준비 상태 및 서버 콜백 설정을 읽습니다. `npm run check:smartthings`는 팀 앱의 공개 상태를 조회하며, `-- --registration`을 추가하면 소유자의 삼성 CLI 세션으로 등록 정보를 조회합니다. 실제 사용자 동의와 자동 신호 수신은 참여 가구의 기기로 따로 확인합니다. Firestore와 Auth 통합 검사는 루프백 에뮬레이터에 연결할 때 실행됩니다.

## 로컬 서버 설정

서버 환경 변수는 [.env.example](.env.example)에 있습니다. SmartThings는 `FIREBASE_PROJECT_ID`, `APP_URL` 또는 `PUBLIC_ORIGIN`, 삼성 앱의 서버용 자격 증명, 32바이트 암호화 키를 사용합니다. `SMARTTHINGS_CONNECTION_ENABLED`의 기본값은 `false`입니다. 카카오 및 걷기 어댑터는 각각 `KAKAO_API_ORIGIN`, `WALKING_API_ORIGIN`과 웹 앱의 `BAPMUNNA_WEB_ORIGIN`을 명시해야 연결할 수 있습니다. 로컬에서 설정 없이 `npm --prefix integrations/bapmunna-firebase/server start`를 실행하면 SmartThings의 `GET /api/smartthings/config`에서 준비 상태를 확인할 수 있습니다.

## SmartThings API

모든 경로는 `/api/smartthings` 아래에 있습니다. 설치별 OAuth 자격 증명은 사용자와 설치 ID를 묶어 서버에서 암호화합니다. 웹훅은 원문 해시, 삼성 키로 검증한 서명, 시각 및 선택한 기기를 확인한 뒤 중복을 제거합니다.

| 경로 | 동작 |
| --- | --- |
| `GET /config` | 서버 설정과 신규 연결 가능 여부 |
| `POST /start`, `POST /cancel-start` | 로그인한 사용자의 동의를 확인하고 일회용 연결 요청을 시작하거나 취소 |
| `GET /callback` | 사용자의 상태값과 브라우저 쿠키를 검증한 뒤 토큰 교환 |
| `GET /status`, `GET /devices` | 본인의 연결 상태와 허용된 전력 측정 기기 목록 |
| `POST /device`, `POST /check` | 기기와 구독을 확인하거나 최근 상태를 직접 조회 |
| `POST /events` | 삼성에서 자동으로 도착한 신호 및 설치 이벤트 처리 |
| `DELETE /connection` | 확인 후 구독과 저장한 연결 정보 해제 |
