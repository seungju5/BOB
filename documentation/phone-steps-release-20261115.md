# 걸음수 연결과 설치형 배포 준비

2026-11-15. 최신 사용자 요청: 실제 휴대폰 건강 연동을 구현하고 설치형 배포를 준비하며, 기존 Impact Series 웹앱에서 시작할 수 있게 한다. 사용자 확인: 현재 USB 실기기 연결 불가. Google Android SDK 약관 동의와 프로젝트 내부 설치는 명시 승인됨. 유료 전환·스토어 가입은 실행하지 않는다.

## 동작 흐름

1. 기존 웹의 로그인 → 튜토리얼 → 홈 순서는 그대로 유지한다.
2. 어르신 화면의 ‘내 휴대폰 걸음수 연결’에서 `/bapmunna/app/health/` 안내로 이동한다. 안내를 보거나 예시 체험을 선택하는 것만으로 건강 기록을 읽지 않는다.
3. 사용자가 설치된 앱 열기를 누르면 고정된 건강 화면만 연다. 앱이 없으면 Android는 같은 HTTPS 안내로 복귀하고, iPhone은 웹 안내에 남는다. 앱이 열렸다고 연결 성공으로 표시하지 않는다.
4. 설치형 앱은 기존 Next UI·밥솥이·색상·글꼴의 `/health/`만 로컬로 묶는다. 별도의 Firebase/Supabase 로그인처럼 보이게 하지 않는다. ‘동의하고 연결하기’ 후 OS 건강 권한을 요청한다.
5. 건강 자료는 이 휴대폰에서만 조회한다. Apple HealthKit 오늘 걸음수, 또는 Health Connect의 Samsung Health 출처 걸음수를 읽는다. 권한 거절·빈 기록은 0으로 바꾸지 않는다.
6. 화면 복귀, 앱 재개, 날짜 변경, 사용 중 60초 간격과 수동 재확인에 갱신한다. 숨겨진 화면에서는 주기 조회하지 않는다. 백그라운드 읽기 권한이나 서버 업로드는 없다.
7. 고정된 Impact Series 웹 주소를 시스템 브라우저로 열어 기존 앱으로 돌아간다. 계정 토큰·가구 ID·건강 데이터는 링크에 실어 보내지 않는다.

## 사용 도구·API와 파일

| 영역 | 실제 사용 | 원본 |
|---|---|---|
| 웹 | 기존 Next.js 16.4.2·React·TypeScript·Tailwind, 정적 export | `app/health`, `components/senior/HealthConnection*` |
| 개인정보 안내 | 같은 내용의 웹 페이지와 네이티브 접기/펼치기 | `HealthPrivacyContent.tsx` |
| 실행 링크 | 고정 iOS scheme, Android intent + 고정 HTTPS fallback | `lib/mobile/links.ts` |
| 설치형 셸 | Capacitor 8.6.2, 기존 건강 화면의 로컬 자산만 묶기 | `workspaces/bapmunna-mobile` |
| Apple | HealthKit stepCount, 오늘 합계, 읽기 전용 | `packages/phone-steps/ios` |
| Galaxy | Android Health Connect 1.1.0, READ_STEPS, Samsung 출처 필터 | `packages/phone-steps/android` |
| 상태·동의 | 늦은 응답 폐기, 계정 변경 시 동의 초기화, 날짜 경계, OS 복귀 이벤트 | `lib/steps`, `PhoneStepsCard.tsx` |
| Android 빌드 | 공식 command-line tools 22.0, API 36, Build Tools 36.0.0, JDK 21, Gradle | `tmp/bapmunna-android-sdk` 및 설치형 빌드 스크립트 |

별도 유료 서버/API, 원시 건강 데이터 저장소, 광고·분석 SDK를 추가하지 않는다. SmartThings 서버는 다른 채팅 담당이며, 그 배포·OAuth 상태를 건강 연동 성공으로 간주하지 않는다.

## 검증 기록

- 신규 연결 링크·동의/날짜·어르신 회귀 검사 62개, 기존 앱 전체 단위 검사 164개 통과. TypeScript와 변경 파일 ESLint 통과.
- 최초 Turbopack 정적 빌드가 진행 없이 머물러 중단했다(종료130). 기존 Webpack 경로로 정적 빌드 재실행 성공. 현재 결과를 Turbopack 통과로 기록하지 않는다.
- 320/390px 웹 안내, 기종 선택, 개인정보 페이지 왕복, 어르신 화면에서 진입, 예시 체험 종료 후 실제 안내 진입 확인. 정적 브라우저 콘솔 경고·오류0.
- SDK 공식 파일 해시 일치 및 프로젝트 내 설치 확인. 첫 실제 Android 컴파일에서 AppCompat 의존성 누락을 발견해 플러그인에 host와 같은 1.7.1 직접 의존성을 선언했다.
- 최종 Android 빌드·파일 서명·릴리스 산출물 및 독립 검토의 세부 증거는 설치형 폴더의 `VERIFICATION.md`와 출력 보고서에 기록한다. 이 문서의 초기 단위 검사 숫자를 이후 통합본의 검사 숫자로 대신 쓰지 않는다.

## 배포와 실제 확인의 경계

웹 건강 안내 게시, 로컬 APK 생성, 스토어 배포, 실기기 건강 조회는 각각 별개이다. 사용자가 현재 기기를 연결할 수 없어 실제 Apple/Samsung 권한 승인과 본인 걸음수 대조를 수행했다고 표시할 수 없다. Xcode가 설치되지 않아 이 Mac의 iOS 네이티브 전체 컴파일·서명·IPA/TestFlight 업로드도 미검증이다. 준비된 소스와 스크립트는 설치 가능한 iOS 앱을 의미하지 않는다.

웹은 기존 Hosting의 모든 다른 프로젝트 경로와 최신 Firebase 본인 설정 스키마를 보존해야 한다. 설치형 앱 파일을 아직 게시하지 않았다면 다운로드 링크나 스토어 주소를 만들어 표시하지 않는다. Android debug APK는 내부 확인용이며 Play 배포 파일로 주장하지 않는다. 제품용 서명은 사용자 소유 키/계정 설정 후 수행한다.

## 공식 근거

- [Samsung Health와 Health Connect 연결·동기화](https://developer.samsung.com/health/health-connect-faq.html)
- [Capacitor 앱 실행 링크](https://capacitorjs.com/docs/guides/deep-links)
- [Android SDK 이용약관](https://developer.android.com/studio/terms)
- [SDK Manager](https://developer.android.com/tools/sdkmanager)

앞선 설계와 개인정보 경계는 [11월14일 기술 기록](phone-steps-20261114.md)에 남아 있다. 이후에는 이 문서와 최종 산출물의 확인 날짜·소스 버전을 함께 읽는다.

## Impact Series 웹 게시 검증

별도 공개 작업 브랜치 `codex/health-web-20261115`는 최종 웹 소스 c2195aa의 지정 변경만 이전 공개 b4b43af/bc86c92에 반영한다. 기존 Firebase 계정·가구 설정·Rules·SmartThings 원점은 변경하지 않는다. 정적 export는 `/bapmunna/app` 기준 15개 경로와 147개 파일이며 설치 파일·서명키를 포함하지 않는다.

배포 작업본 전체 하네스 `.harness/runs/2026-11-14T15-29-11-885Z-99273/report.md`: 하네스 25, 루트 246, 개인정보 48, Firebase 59, SmartThings 49개 및 타입·동기화·빌드·소스 안정성이 실패/skip 없이 통과했다. 320/390px 실제 브라우저에서 진입·기종 변경·개인정보 왕복·24px 본문·가로 넘침 0·콘솔 오류/경고 0을 확인했다. 고정 링크의 실제 OS 실행과 건강 권한은 이 웹 검사로 인증하지 않는다.

이전 공개 기준은 `9ea0c97d5e9613ec`이며, 게시 후 URL·버전·공개 파일 바이트·기존 경로 보존 결과를 별도 릴리스 영수증으로 추가한다.
