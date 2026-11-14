# SmartThings 콘솔 접근 오류 진단 · 2026-11-14

## 현재 확인한 결과

삼성 문자 코드를 유효시간 안에 입력한 새 브라우저 세션에서도 Developer Console 접근이 실패했다. 공식 CLI로는 기존 앱 설정과 실제 전력 측정 기기를 읽을 수 있다. **개발자 도구의 조회 성공은 밥뭇나 웹앱 OAuth·웹훅 완료를 뜻하지 않는다.**

| 확인한 항목 | 결과 |
| --- | --- |
| 기존 Chrome에서 다시 로그인 | Console의 `denied=true&reason=outage`와 오류 안내로 복귀 |
| Chrome과 분리된 앱 내 브라우저에서 새 SMS 코드 입력 | 남은 유효시간 약 2분에 입력, 같은 Console 오류로 복귀 |
| ‘다음에 2단계 인증 건너뛰기’ | 새 브라우저에서 해제 상태 확인 |
| 공식 Manage Plans 직접 접근 | 삼성 로그인 화면으로 돌아감; 현재 플랜 확인 못함 |
| 공식 CLI 3.0.1 앱·OAuth 설정 GET | 성공; 기존 Redirect URI와 `r:devices:*`, 웹훅 `PENDING` 유지 |
| 같은 CLI의 `organizations:current` | HTTP 403; 원인·플랜 상태는 확인되지 않음 |
| 실제 기기 조회, 22:09 KST | `powerMeter` 지원 기기 1대 조회, 해당 기기 상태 읽기 성공 |
| 기기 응답의 전력·누적 전력량·전력 시각 존재 | 확인; 원시 값·기기 식별자는 보고서에 기록하지 않음 |
| 공식 서비스 상태 페이지 | Developer Tools·Platform APIs 정상 표시 |

이는 전체 SmartThings 장애나 요금제 미가입을 확정하는 증거가 아니다. Console 로그인 완료 경로, 계정의 개발자 접근 및 조직 연결 상태에 대한 공식 확인이 필요하다. 비밀번호 오류나 SMS 코드 만료로 단정해서 재발송을 반복하지 않는다.

운영 DB·IAM·삼성 앱 URL·요금제·서버 배포는 이번 진단에서 변경하지 않았다. 기존 CLI 사용자 자격증명을 연결 서버에 배포하지 않는다. 새 PAT, 새 앱, client secret 회전도 하지 않았다.

## 삼성 지원팀에 전달할 문의 초안 — 아직 보내지 않음

공식 접수: <https://developer.smartthings.com/contact>

발송 전 사용자가 지정한 성함과 회신 이메일이 필요하다. 아래 본문에는 비밀번호, 인증번호, access/refresh token, client secret, 기기 ID와 전력 원시 값이 없다.

**Subject: Developer Console redirects to denied=true&reason=outage after SMS verification; CLI app/device reads work**

Hello SmartThings Developer Support,

We are developing Bapmunna / Warming Up and cannot access the Developer Console or the Manage Plans page for the Samsung account that owns our existing integration.

On November 14, 2026 (Asia/Seoul), we reproduced the following:

1. Re-entering the existing account credentials in Chrome returns to `https://developer.smartthings.com/console?denied=true&reason=outage` with the unexpected-outage banner.
2. In a separate browser session, we requested a fresh SMS code and entered it with approximately two minutes remaining. The page automatically redirected to the same Console error. The option to skip two-step verification on this device was unchecked in that session.
3. Opening the official `/console/service-integrations/manage-plans` page leads back to Samsung sign-in. We have not been able to inspect the current plan.
4. Using the existing authorized official CLI 3.0.1 session, `smartapps` and `smartapps:oauth` GET requests succeed for our existing API_ONLY app. Its webhook target remains PENDING. `organizations:current` returns HTTP 403.
5. At 2026-11-14 13:09 UTC (22:09 KST), the same CLI successfully listed one powerMeter-capable device and read its status. We have not included device identifiers or raw measurements in this report.
6. The public status page reports Developer Tools and Platform APIs as operational at the time of our check.

Please check this account's Developer Center access and default organization linkage, explain the Console return reason, and advise how we can safely access the current plan and manage the existing API_ONLY app. We do not want to create a duplicate app, rotate its client secret, or activate a paid plan without reviewing its conditions first.

The existing app ID and an error screenshot can be supplied privately if required. We will not send passwords, SMS codes, or access tokens.

Thank you.

## 다음 작업

1. 삼성 지원 확인 또는 Console 접근 복구 후 현재 플랜·외부 가구 이용 조건 확인.
2. 사용자가 확인 중인 Vercel 기존 계정으로 서버 게시 권한 확보.
3. 검증한 서버의 고정 HTTPS 주소 확보 후 등록 주소 변경, 서명 검증·웹훅 확인.
4. 웹앱의 실제 사용자 OAuth·기기 선택·자동 신호 수신·해제·재연결 확인.

새 요금제 활성화나 유료 전환은 승인되지 않은 상태다. 실제 기기 조회를 웹앱 로그인, 자동 수신, 식사 판정 또는 가족 알림 성공으로 표시하지 않는다.

## 근거와 내부 증거

- [공식 서비스 상태](https://status.smartthings.com/)
- [공식 오류 구분 안내](https://developer.smartthings.com/docs/service-integrations/troubleshoot)
- [공식 문의 접수](https://developer.smartthings.com/contact)
- 내부 정제 기록: `tmp/smartthings-live-20261114/device-read-diagnostic.json` (Git 제외)
- 브라우저 증거: `tmp/smartthings-live-20261114/post-otp-outage.jpg` (Git 제외)
- CLI 조직 403에는 유료 플랜 판정 처리기가 없다. 앱 생성·수정·confirm 명령의 별도 유료 플랜 안내와 혼동하지 않는다.
