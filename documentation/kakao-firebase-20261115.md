# Firebase 밥뭇나 카카오 로그인

## 사용자 흐름

공개 앱 `/bapmunna/app/login/`에서 **카카오로 시작하기 → 카카오 확인 → 밥뭇나 복귀 → 최초 이메일 확인 → 기존 소개·가구 설정** 순서다. 이미 이메일과 프로필을 확인한 카카오 계정은 기존 시작 화면으로 간다. 기존 Google·이메일 로그인, Firebase UID와 가구 자료는 유지한다.

카카오에서 이메일·프로필·전화번호를 수집하지 않는다. 앱의 기존 본인 가구 규칙이 확인된 이메일을 요구하므로 처음 한 번 본인이 입력한 주소로 Firebase 확인 메일을 보낸다. 이미 Google·이메일 계정에 쓰인 주소를 자동으로 합치지 않으며 해당 로그인 방식으로 돌아가도록 안내한다. 카카오 로그인과 삼성 기기 연결은 서로 다른 단계다.

## 구현 및 운영 설정

Firebase Spark에서 custom authentication을 사용한다. Identity Platform/OIDC 업그레이드, 새 IAM 권한, DB 규칙 변경은 하지 않는다. 기존 Vercel `bapmunna-smartthings` 서버와 전용 Firebase 서비스 계정을 재사용하며, 공개 앱은 기존 Impact Series Hosting에 둔다.

| 위치 | 설정 |
| --- | --- |
| 카카오 Developers | 앱 ID 확인, 카카오 로그인 활성화, REST API 키와 Client Secret 확인 |
| 카카오 등록 Redirect URI | `https://bapmunna-smartthings.vercel.app/api/kakao/callback` |
| Vercel production | `KAKAO_APP_ID`(숫자 앱 ID), `KAKAO_CLIENT_ID`(REST API 키), `KAKAO_CLIENT_SECRET` |
| 기존 서버 비밀 | `FIREBASE_PROJECT_ID=ku-gpa`, `FIREBASE_SERVICE_ACCOUNT_JSON` 유지 |
| 고정 원점 | `KAKAO_API_ORIGIN=https://bapmunna-smartthings.vercel.app`, `BAPMUNNA_WEB_ORIGIN=https://impact-series.web.app` (코드 기본값과 동일) |
| 앱으로 복귀 | `https://impact-series.web.app/bapmunna/app/auth/kakao/` |

REST API 키와 비밀값은 서버 환경변수에만 보관한다. `KAKAO_APP_ID`는 계정 식별 기준이므로 임의 변경하지 않는다. 사용자 UID는 앱 ID와 카카오 사용자 ID의 해시로 결정하며, 키를 교체해도 앱 ID가 같으면 계정은 유지된다. 이 Firebase 등록 주소를 별도 Supabase 판의 `/auth/v1/callback`과 섞지 않는다.

`GET /api/kakao/config`의 `enabled:true`는 필수 설정이 있다는 뜻이다. 실제 카카오 앱 등록·동의·로그인 성공의 증거는 아니다. 서버가 미설정이거나 응답하지 않으면 로그인 버튼은 **준비 중**으로 비활성화한다.

## 보호 장치

- 10분짜리 일회용 OAuth state와 HttpOnly/Secure/SameSite 쿠키를 함께 확인한다.
- 앱 복귀 코드도 2분·일회용이며 원래 브라우저가 가진 무작위 증명값과 일치해야 교환한다. Firebase custom token과 카카오 토큰은 URL이나 브라우저 저장소에 넣지 않는다.
- Firebase 검증된 세션이 된 뒤에만 화면을 진행한다. 뒤로가기·중복 콜백·StrictMode·느린 응답·다른 탭의 새 로그인 때문에 이전 카카오 인증이 새 계정을 덮어쓰지 않도록 막는다.
- 서버 전용 자료는 기존 비공개 `bapmunnaSystem/kakao` 아래 저장한다. 카카오 access/refresh token은 저장하지 않고 사용자 ID 확인 직후 폐기한다.
- 하루 시작 요청 300회, 네트워크별 10분 10회의 제한을 둔다. 만료 state·handoff·제한 자료는 기존 인증된 하루 cron에서 최대 1,000개씩 정리한다. 논리 만료는 즉시 적용하지만 물리 삭제 시각은 cron 성공 시점에 따른다.

## 검증과 완료 기준

최종 통합 전체 검사: `.harness/runs/2026-11-16T01-27-22-878Z-28170/report.md` — 490개 통과, 실패·skip 0, 시작/종료 소스 지문 일치. 실제 로컬 Firestore 트랜잭션·기존 병합 Rules 차단과 실제 콜백 TSX 실행 회귀 11개를 포함한다. 독립 검토에서 지연 로그인 계정 덮어쓰기·삼성 미설정 시 카카오 청소 누락·이전 계정 확인 주소 잔류를 찾아 수정 후 재검증했다. 320/390px 공개 로그인 화면의 가로 넘침 0, 콘솔 오류/경고 0, 만료된 콜백의 오류 안내·로그인 복귀를 실제 브라우저에서 확인했다.

2026-11-16 Vercel 본인 확인 후 기존 production에 서버 20개 파일을 게시했다. 배포 `dpl_47mADN9AH8CKet4gtgh998t9X5fw`의 Ready와 공개 응답·잘못된 Origin/무인증 차단 12개를 확인했다. 실제 카카오 키는 아직 없으므로 config는 `enabled:false`, 시작·교환은 `setup_required`다. 영수증은 `workspaces/smartthings-vercel/releases/20261116-kakao-runtime.json`이다.

Hosting은 기존 건강 설치 공개 버전 `9c953108d6155e4d`를 확인하고 해당 소스 `c2077aa`를 병합한 뒤 `675c7f7210170b44`로 게시했다. 카카오와 건강 설치 소스가 각각 검증본과 동일하다는 독립 검토, 다운로드 파일 무결성 검사 2개, 공개 변경 124파일 일치·기존 경로 누락 0을 확인했다. 기존 공개 Android 링크·영수증과 나머지 사이트 파일을 보존했다. 배포 소스는 `d466af4`, 영수증은 `workspaces/bapmunna-final/releases/20261116-kakao-login.json`이다.

**현재 남은 일:** 카카오 Developers 로그인 완료 탭을 아직 확인하지 못해 앱 ID·REST API 키·Client Secret과 콘솔 등록을 확인하지 못했다. 카카오 QR 로그인 화면을 준비했고, 공개 버튼은 준비 중으로 남긴다. 실제 계정으로의 카카오 동의→복귀→이메일 확인은 아직 미검증이다. 소스 구현·서버/화면 게시·실제 로그인 완료를 구분한다.

최종 운영 확인은 다음 순서로 한다.

1. 콘솔의 정확한 Redirect URI와 로그인 활성 상태를 읽어 확인한다.
2. 서버 production 비밀 설정과 코드 배포 후 config·잘못된 state·무인증 교환·다른 Origin 거부를 확인한다.
3. 실제 카카오 동의 후 앱 복귀 → 본인 확인 메일 → 프로필·소개·가구 설정까지 진행한다.
4. 로그아웃·같은 계정 재로그인·동의 취소·다른 Google 계정 전환에서 기존 자료 보존과 계정 격리를 확인한다.

무료 한도와 기존 Spark/Hobby 선택을 유지한다. 이 변경은 유료 플랜 가입이나 카카오/삼성의 이용 조건 변경을 포함하지 않는다. 서버 소스 배포와 콘솔 설정이 끝나도 3번의 실사용 확인 전에는 카카오 로그인 완료라고 안내하지 않는다.

공식 기준: [Firebase custom token 생성](https://firebase.google.com/docs/auth/admin/create-custom-tokens), [웹 custom authentication](https://firebase.google.com/docs/auth/web/custom-auth), [카카오 로그인 REST API](https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api).
