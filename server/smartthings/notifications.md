# 기기 알림 발송

팀 웹앱에서 사용자가 직접 알림을 켜면 이 서버가 그 기기의 Web Push 구독을 등록한다. 가구 동의와 이메일 인증을 확인하고, 구독 주소와 열쇠는 AES-GCM으로 암호화한다. 구독이 없는 기기에는 보내지 않는다. 앱 화면의 ‘기기 표시 확인’과 서버의 ‘시험 알림’은 각각 다른 경로를 검사한다. 아이폰은 iOS 16.4 이상에서 웹앱을 홈 화면에 추가하고 사용자가 알림을 허용해야 한다. [Apple WebKit 안내](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)

## 발송 조건

- 삼성 웹훅이나 10분 조회로 실제 밥솥의 새 취사 신호가 기록되면 신호가 생긴 한국 날짜를 보낸다. 사용자는 밥솥 소식 수집과 해당 기기의 알림 수신에 각각 동의해야 한다.
- 같은 취사 구간, 과거 구독 전의 신호, 가상 플러그, 해제된 계정은 제외한다. 발송 직전에도 현재 가구 동의, 연결과 구독을 확인한다. 일시 오류가 있으면 같은 최근 신호의 다음 웹훅이나 조회에서 다시 시도한다. 취사 알림은 발생 후 최대 한 시간 동안 유효하다.
- 사용자가 요청한 시험 알림은 그 브라우저 한 대에만 보낸다. 서버가 발송 서비스의 접수를 확인하면 `accepted`를 반환한다. 잠금화면 도착 여부는 그 휴대폰에서 확인한다.

## 운영 연결

1. 이 디렉터리에서 Node.js 24로 `npm ci --omit=dev --ignore-scripts`와 `npm start`를 실행할 수 있다. 같은 서버를 HTTPS로 운영하거나, 팀 소유의 별도 HTTPS Node 런타임에 올리면 Firebase Hosting을 Spark로 유지할 수 있다. 외부 런타임의 플랜·사용 한도는 그 호스트에서 확인한다. 알림 구독과 시험 알림만 운영할 때 삼성 OAuth 자격은 필요하지 않다.
2. 런타임에 워밍업 팀 Firebase 프로젝트 전용 [Google 애플리케이션 기본 사용자 인증 정보](https://cloud.google.com/docs/authentication/application-default-credentials)를 연결한다. 필요한 작업은 해당 사용자의 이메일 인증·토큰 취소 상태 조회, 동의·연결 문서 읽기, 암호화된 알림 구독 문서의 조회·쓰기·삭제·트랜잭션이다. Hosting 배포 전용 계정은 배포 용도로만 유지한다.
3. 서버 비밀 설정에 P-256 VAPID 개인키를 Base64URL로 `WEB_PUSH_PRIVATE_KEY`에 넣고, 암호화용 32바이트 Base64 비밀키를 `WEB_PUSH_ENCRYPTION_KEY`에 넣는다. 통합 서버에서 암호화 키를 따로 지정하지 않으면 기존 `SMARTTHINGS_ENCRYPTION_KEY`를 사용한다. 서버는 VAPID 공개키를 계산해 `GET /api/smartthings/config`의 `webPush.publicKey`로 제공한다. 키 교체 시 기존 기기의 재등록과 저장된 구독의 암호화 키 이관을 함께 계획한다. [Web Push 라이브러리](https://github.com/web-push-libs/web-push)
4. 기존 팀 연결 서버를 같은 원점에 제공하면 기본 경로를 사용한다. 별도 호스트를 쓸 때는 공개 요청에 SSO 페이지 없이 응답하는 팀 전용 고정 HTTPS 주소를 확인하고 `config/team.ts`의 `TEAM_NOTIFICATION_ORIGIN`에 지정해 앱을 배포한다. 서버는 팀 웹앱 원점에서만 구독 요청을 받으며, 앱은 팀 프로젝트 ID와 공개키를 확인한 뒤에만 로그인 토큰을 보낸다.
5. 이메일 확인과 가구 동의를 마친 시험 계정으로 실제 기기에서 알림을 켠다. 서버 시험 알림을 요청하고 잠금화면에서 배너를 눌러 앱이 열리는지 확인한다. 앱을 닫은 상태의 밥솥 알림은 실제 기기·삼성 이벤트 수신이 운영 중일 때 확인한다.

인증 API는 `POST /api/smartthings/notification-subscription` 한 곳에서 `register`, `check`, `remove`, `test`를 처리한다. 가입자는 Firebase ID 토큰으로 식별한다. 시험 알림은 기기별 1분에 한 번, 계정별 활성 구독은 최대 다섯 대다. 브라우저 해지·서버 해지 또는 푸시 서비스의 만료 응답을 처리한다. 데이터베이스에 원시 전력값이나 푸시 본문을 추가로 저장하지 않는다.
