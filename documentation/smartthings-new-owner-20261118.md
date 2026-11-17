# SmartThings 새 계정 연결 점검 — 2026-11-18

## 결론

**새 계정 로그인·공식 CLI 인증·기기 목록 조회는 성공했다. 밥뭇나 자체 OAuth 앱 등록과 실기기 연동은 아직 완료되지 않았다.** 새 계정의 앱 생성 요청은 삼성 서버가 HTTP 403으로 거절했고, 개발자 콘솔의 플랜 화면은 `denied=true&reason=outage`로 돌아왔다. 새 계정의 실제 가입 플랜은 확인하지 못했다.

이 기록은 11월 3일의 과거 등록 성공이나 로컬 검사 성공보다 우선하는 현재 계정 상태다. 이전 계정의 앱과 운영 시크릿은 보존했다.

## 직접 확인한 결과

| 항목 | 확인 결과 |
| --- | --- |
| 새 삼성 계정 문자 인증 | 성공 |
| 위치정보 이용약관 | 사용자가 명시 승인한 뒤 동의 완료 |
| 공식 `smartthings-cli` 권한 | 새 계정에 대한 사용자 승인 후 인증 성공 |
| 새 계정 앱 목록 | 조회 성공, 0개 |
| 새 계정 기기 목록 | 조회 성공, 0개 |
| 새 계정 장소 목록 | 조회 성공, 1개 |
| 새 계정 조직 목록 | HTTP 403. 이 결과 자체를 앱 생성 실패와 구분 |
| 새 계정 기본 소유자 앱 생성 | 2026-11-18 00:03 KST, 실제 생성 요청 1회, HTTP 403 |
| 개발자 콘솔·플랜 화면 | 인증 및 약관 동의 뒤에도 오류 화면으로 복귀 |
| 공식 상태 페이지 | 조회 당시 All Systems Operational. 콘솔의 문구만으로 전면 장애라고 단정하지 않음 |
| 결제·운영 배포·Rules/IAM·운영 시크릿 변경 | 없음 |

CLI는 공식 3.0.1의 로그인 구현과 SDK를 사용했다. 새 계정의 토큰은 사용자 승인에 따라 별도 비공개 로컬 폴더에 저장했으며, 이전 계정의 프로필과 분리했다. 비밀번호·SMS 코드·OAuth 코드·토큰·Client Secret은 이 문서와 Git에 포함하지 않는다.

## 등록하려고 준비한 설정 — 아직 삼성에 등록되지 않음

| 설정 | 값 |
| --- | --- |
| 종류 | `API_ONLY`, `CONNECTED_SERVICE`, `LOCATION` |
| 앱 이름 | 밥뭇나 · Warming Up |
| Redirect URI | `https://bapmunna-smartthings.vercel.app/api/smartthings/callback` |
| Webhook URL | `https://bapmunna-smartthings.vercel.app/api/smartthings/events` |
| 요청 권한 | `r:devices:*`만 사용 |
| 개인정보 안내 | `https://impact-series.web.app/bapmunna/app/privacy/` |

새 Client ID/Secret은 발급되지 않았다. 따라서 이전 계정의 운영 시크릿을 새 계정의 것으로 바꿨다고 보고하지 않는다. 403 이후 같은 생성 요청을 반복하지 않았다.

## 운영 서버와 기존 계정은 별도

- 현재 Vercel 운영 서버는 `dpl_1pwiU6uoBSLcdLyfWFDCGYisC1zU`이며 소스는 `077233e422f1d7645cdc07b65aab6dff7fad82af`다. 이번 작업에서 재배포하지 않았다.
- 2026-11-17 23:43 KST 공개 조회: SmartThings config HTTP 200, `enabled:true`, `connectionReady:false`. 인증 없는 status와 서명 없는 webhook은 HTTP 401로 거절했다. 카카오는 `enabled:true`다.
- 새 계정으로 전환하기 전, 이전 계정 앱의 webhook 변경은 실제 HTTP 403이었다. 재조회한 Target은 여전히 과거 Hosting URL과 `PENDING`이었다. 과거 Hosting callback/webhook 경로는 404였다.
- `enabled:true`는 서버 설정이 있다는 뜻이며 실제 사용자 연결 성공을 뜻하지 않는다. 공식 CLI 로그인 역시 밥뭇나 앱의 사용자 OAuth 성공과 다르다.

## 삼성 이용 조건

공식 안내는 2026-11-04~12-15 동안 요금제를 선택하지 않은 앱 소유자가 신규 API Access 앱을 만들거나 기존 앱을 수정할 수 없다고 설명한다. 이번 403은 이 제한과 일치하지만, **계정의 실제 플랜과 삼성 내부 거절 원인은 콘솔에서 확인되지 않았다**. HTTP 403 하나만으로 원인을 확정하지 않는다.

Developer 플랜의 공개 가격은 월 US$4.99이며 개인 가구용이다. 타 가구 2–3곳에 제공하는 밥뭇나 파일럿에 이 플랜을 사용할 수 있다고 가정하지 않는다. Business 적용 조건·학생 파일럿 지원·가격은 삼성 확인이 필요하다. 다른 채팅에서 11월 17일 보낸 지원 문의가 있으며, 이번 작업에서 추가 메일이나 유료 계약을 보내거나 수락하지 않았다. Firebase Spark·Vercel Hobby는 유지한다.

## 코드 검증과 실사용 검증의 경계

기준 소스 `1f07c2be6637f3298f4d9b35c1ab9fdc961dffe8`에 대한 독립 검토에서 코드상 확정된 차단 결함은 발견되지 않았다. 서비스/state/consent/refresh/disconnect 35개와 HTTP/raw-body/Vercel/CORS/retention/deployment 30개, 합계 **65개 합성 검사가 통과**했다. 후자 검사는 동일 서버 소스의 다른 작업본에서 실행했으며 소스 일치를 확인했다. 이 검토에서는 Firestore emulator·운영 OAuth·실물 기기를 실행하지 않았다.

현재 수신기는 선택한 기기의 **신호 도착 메타데이터**를 저장한다. 전력 패턴 함수의 실제 입력 연결·기기별 보정·자동 식사 판단·자동 알림은 별도 미완료 항목이다. 이번 API 점검을 그 기능의 완료 증거로 사용하지 않는다.

문서 변경 후 기본 하네스도 실행했다. 루트298·개인정보48·Firebase85·하네스27개, 타입·동기화·계약·정적 산출물 검사는 통과했다. 서버군 첫 실행의 실패1개는 localhost 포트에 대한 샌드박스 `EPERM`이었다. 포트 사용을 허용해 같은 서버군만 재실행한 결과 **101개 통과·실패0·건너뜀8개**였다. 8개는 emulator 미기동으로 건너뛴 통합검사이며 성공에 포함하지 않는다. 첫 하네스 보고서의 failed 기록을 통과로 덮어쓰지 않았다. 실행 증거는 `.harness/runs/2026-11-17T15-06-48-830Z-31606/report.md`와 로컬 `tmp/smartthings-completion-20261117/server-tests-localhost.log`다. 앱 실행 코드는 이번 작업에서 바꾸지 않았다.

## 다음에 실제 연결을 끝낼 순서

1. 삼성에서 새 계정의 콘솔 접근과 적합한 API 이용 자격을 확인한다. 유료 조건이 필요하면 구체적인 금액·범위를 먼저 확인하고 사용자가 결정한다.
2. SmartThings 휴대폰 앱에서 새 계정에 테스트용 스마트플러그를 추가한다. 현재 조회 0개이므로 실물 수신 시험은 할 수 없다. 연결 후 `powerMeter` 지원 여부와 단위를 실제 API로 확인한다.
3. 위 주소·읽기 권한으로 새 앱 등록을 마치고, 발급된 Client ID/Secret을 올바른 `/v1/oauth` 설정과 함께 승인된 서버 비밀 설정에 보관한다. 발급 결과를 확인하기 전 운영 시크릿을 바꾸지 않는다.
4. 최신 통합 소스로 서버를 게시하고 webhook 등록 요청·서명 검증·`CONFIRMED`를 확인한다. 다른 채팅의 진행 중인 산책·가족 기능을 예전 ZIP으로 덮어쓰지 않는다.
5. 허용 조건이 갖춰진 뒤 신규 연결을 열고, 실제 밥뭇나 로그인 → 삼성 동의 → callback 복귀 → 플러그 선택 → 새 신호 자동 수신을 확인한다. 수동 조회 성공을 자동 수신 성공으로 대신하지 않는다.
6. 토큰 갱신·연결 해제·재연결·동의 철회·2–3가구 간 접근 분리를 각각 실검증한다. 결과를 근거로 완료 상태를 갱신한다.

## 공식 근거

- [플랜·가격·개인/사업자 범위](https://developer.smartthings.com/smartthingsapi)
- [등록 제한 일정과 CLI/PAT의 용도](https://blog.smartthings.com/smartthings-updates/smartthings-api-additional-details-for-developers-and-business-partners/)
- [앱 등록](https://developer.smartthings.com/docs/service-integrations/app-setup)
- [OAuth](https://developer.smartthings.com/docs/service-integrations/oauth)
- [웹훅 검증](https://developer.smartthings.com/docs/service-integrations/webhook-events)
- [공식 서비스 상태](https://status.smartthings.com/)
