# 이전 Firebase 통합판의 카카오 로그인 기록

2026년 11월 15~16일 Impact Series 통합판의 구현·검사 기록이다. 팀 앱의 현재 로그인 방법은 [팀 앱 안내](../apps/warming-up/README.md)를 따른다.

## 사용자 흐름

공개 앱 `/bapmunna/app/login/`에서 **카카오로 시작하기 → 카카오 확인 → 밥뭇나 복귀 → 최초 이메일 확인 → 기존 소개·가구 설정** 순서다. 이미 이메일과 프로필을 확인한 카카오 계정은 기존 시작 화면으로 간다. 기존 Google·이메일 로그인, Firebase UID와 가구 자료는 유지한다.

카카오에서 이메일·프로필·전화번호를 수집하지 않는다. 앱의 기존 본인 가구 규칙이 확인된 이메일을 요구하므로 처음 한 번 본인이 입력한 주소로 Firebase 확인 메일을 보낸다. 이미 Google·이메일 계정에 쓰인 주소를 자동으로 합치지 않으며 해당 로그인 방식으로 돌아가도록 안내한다. 카카오 로그인과 삼성 기기 연결은 서로 다른 단계다.

## 구현 및 운영 설정

이전 통합판은 Firebase custom authentication을 사용했다. 기존 Vercel 서버가 카카오 응답을 검증하고 custom token을 발급하는 구조였다.

| 위치 | 설정 |
| --- | --- |
| 카카오 Developers | 앱 ID 확인, 카카오 로그인 활성화, REST API 키와 Client Secret 확인 |
| 카카오 등록 Redirect URI | `https://bapmunna-smartthings.vercel.app/api/kakao/callback` |
| Vercel production | `KAKAO_APP_ID`(숫자 앱 ID), `KAKAO_CLIENT_ID`(REST API 키), `KAKAO_CLIENT_SECRET` |
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

**2026-11-16 현재: 실제 카카오 동의 → 공개 앱 복귀 → Firebase 인증 성공을 확인했다.** 새로고침 후 세션 복원과 로그아웃 후 카카오 재로그인도 성공했다. 화면에는 Firebase 인증된 사용자에게만 표시하는 “처음 한 번, 이메일을 확인해요”가 나타났고 콘솔 오류·경고는 0개였다. 본인 이메일을 선택·확인한 후 프로필·소개·가구 설정을 끝내는 신규 가입 전체 경로는 아직 실계정 검증하지 않았다.

사용자의 구체적 승인 후 기존 앱 **밥뭇나(1649759)**의 카카오 로그인을 ON으로 바꾸고 정확한 Vercel Redirect URI를 등록했다. 기존 REST 키·로그인 Client Secret과 앱 ID는 Vercel의 **production Secret**으로 보관했다. 시크릿 보호 ON·OIDC OFF를 유지했으며 카카오 이메일·프로필·전화번호 권한은 추가하지 않았다. 실제 동의 화면도 Service User ID만 제공한다고 표시했다. 비밀값은 소스·문서·이미지에 남기지 않았다.

첫 활성화 배포에서 정상 시작 요청이 400으로 실패했다. 설치된 공식 Vercel CLI의 라우트 생성기를 확인하니 `[...path].mjs`가 `...path=start` 쿼리를 추가했고 엄격한 서비스 검증과 충돌했다. 카카오 경로를 `config/start/callback/exchange.mjs` 4개로 명시하고 공통 핸들러로 위임해 해결했다. 모르는 쿼리·중복 flow를 거부하는 보호는 유지했다. 삼성 라우트와 공통 HTTP 어댑터는 바꾸지 않았다.

최종 소스 **270a38d**의 서버 24개 파일을 배포 **dpl_8RCTuTfvmD4SCSJho4E3YEUGvrBH**에 게시하고 Ready·Current를 확인했다. 공개 주소에서 정상 시작 303, 고정 callback, 범위 추가 없음, Secure/HttpOnly/SameSite 쿠키와 잘못된 입력·Origin·무인증·미서명 차단 **16개 모두 통과**했다. 활성 상태 영수증은 `workspaces/smartthings-vercel/releases/20261116-kakao-active.json`이다. 앞선 `20261116-kakao-runtime.json`은 키 설정 전의 역사적 영수증으로 보존한다.

최종 전체 검사: `.harness/runs/2026-11-16T02-53-26-915Z-42357/report.md` — **492개 통과, 실패·skip 0**, 시작/종료 소스 지문 일치. 실제 로컬 Firestore 트랜잭션·기존 병합 Rules 차단, 콜백 TSX 실행 회귀 11개와 Vercel 정적 라우트 회귀 2개를 포함한다. 독립 검토자가 라우트 검사 7개를 재실행했으며 추가 결함이 없었다. 앞선 공개 로그인 320/390px 가로 넘침 0과 만료 콜백 복귀 확인도 보존한다.

Hosting은 기존 건강 설치 공개 버전 `9c953108d6155e4d`를 확인하고 해당 소스 `c2077aa`를 병합한 뒤 `675c7f7210170b44`로 게시했다. 카카오와 건강 설치 소스가 각각 검증본과 동일하다는 독립 검토, 다운로드 파일 무결성 검사 2개, 공개 변경 124파일 일치·기존 경로 누락 0을 확인했다. 기존 공개 Android 링크·영수증과 나머지 사이트 파일을 보존했다. 배포 소스는 `d466af4`, 영수증은 `workspaces/bapmunna-final/releases/20261116-kakao-login.json`이다.

**남은 실사용 확인:** 본인이 선택한 이메일의 수신·링크 확인 → 프로필·소개·가구 설정, 동의 취소와 다른 Google 계정 전환. 이메일을 임의로 지정하거나 기존 계정을 합치지 않았다. 카카오 콘솔의 User Unlinked 웹훅은 미설정이므로 외부 카카오 연결 해제와 밥뭇나 계정 정리의 자동 동기화는 이번 완료 범위에 포함하지 않는다.

무료 한도와 기존 Spark/Hobby·IAM·Rules·Google/이메일·건강 설치 흐름을 유지한다. 삼성 인증은 사용자 요청대로 보류하며 이번 카카오 로그인 성공을 삼성 기기 연결 성공으로 표현하지 않는다. **카카오/Firebase 인증 성공과 이메일 확인을 포함한 가입 전체 완료를 구분한다.**

## 복구와 인계

서버 소스는 GitHub `codex/google-kakao-login`의 `270a38d`에 보관했다. 재게시할 때 이 소스에서 스테이징하고 production의 기존 Secret을 유지한다. 정상 시작을 막던 과거 catch-all 배포를 단순히 되돌려 사용하지 않는다. 공개 웹앱은 `/bapmunna/app/login/`, 서버는 위 Vercel 고정 도메인이다. Firebase Hosting은 이번 서버 경로 수정 중 재배포하지 않았다.

이미지는 작업공간 `output/bapmunna-kakao-20261116/`의 `kakao-activation-on.jpg`, `vercel-kakao-secrets.jpg`, `vercel-kakao-fixed-ready.jpg`, `kakao-firebase-authenticated.jpg`에 있다. 과거 OFF/준비 중/QR 이미지는 현재 상태 증거로 사용하지 않는다.

공식 기준: [Firebase custom token 생성](https://firebase.google.com/docs/auth/admin/create-custom-tokens), [웹 custom authentication](https://firebase.google.com/docs/auth/web/custom-auth), [카카오 로그인 REST API](https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api).
