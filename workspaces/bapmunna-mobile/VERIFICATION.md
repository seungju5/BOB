# 로컬 검증 기록 — 2026-11-14

대상: `@bapmunna/phone-steps@0.1.0`와 Capacitor 8.6.2 로컬 셸. 최종 사용자 결정인 Samsung Health / Apple Health 읽기 경로를 기준으로 합니다.

| 확인 | 결과 | 증거의 범위 |
|---|---|---|
| 플러그인 `npm test` | 3개 통과, 건너뜀 없음 | 웹·SSR 미지원 fallback, 네이티브 설정을 열었다고 가장하지 않음, 실제 JDK로 날짜/DST/시간대/빈 값/0/정수 한계 확인 |
| 셸 `npm test` | 4개 통과 | 원본 HTML 보존, CSP 인라인 해시, 외부 코드·프레임 거부, 웹 자산 allowlist, `/bapmunna/app` 등 비루트 자산 경로 거부 |
| 원본 static export 준비 | 통과 | `tmp/impact-final/build`에서 승인된 route/RSC·`_next/static`·`public` 파일 120개만 복사. 서버 코드·환경 파일·trace·source map 제외 |
| `npm run sync` | Android/iOS 모두 통과 | 두 플랫폼 모두 `@bapmunna/phone-steps@0.1.0` 1개 탐지. Android classpath, iOS SPM product와 `PhoneStepsPlugin` 등록 생성 |
| `plutil -lint` | 4개 통과 | iOS Info.plist·HealthKit entitlement·PrivacyInfo.xcprivacy·Xcode 프로젝트 형식 |
| CSP 적용 웹 번들 브라우저 확인 | 통과 | 로컬 브라우저에서 시작→어르신 진입→예시 체험. 기존 밥솥·세 버튼·예시에서는 걸음수 읽지 않는 안내 확인. 관찰된 콘솔 error/warn 0. 임시 탭과 로컬 서버 종료 |

독립 검토에서 지적된 iOS 자정 경계 샘플은 `strictStartDate` 일반 합계 대신 로컬 자정 anchor·달력 하루 간격의 `HKStatisticsCollectionQuery`로 수정했습니다. 웹 번들 경로 검사는 단일 `/bapmunna` 문자열 대신 실제 각 HTML의 `_next` 자산 URL을 해석하며, 중첩 prefix 회귀 검사가 통과했습니다.

**실행하지 않은 것:** Kotlin/Android 전체 빌드, iOS/HealthKit 전체 빌드, 에뮬레이터/실기기 건강 권한·실제 기록 조회, Samsung Health 동기화, HealthKit 자정 교차/DST 샘플 결과, 네이티브 로그인·페어링·설정 앱 이동, 서명·스토어 업로드·공개 배포. Android SDK/Studio와 Xcode가 없으므로 위 로컬 결과로 이를 인증하지 않습니다.

기록한 브라우저 결과는 웹 번들 확인입니다. 네이티브 브리지 실행이나 스마트싱스 API 성공을 뜻하지 않습니다. 루트 앱이 이후 변경되면 최종 static export → `prepare:web` → `sync`를 다시 수행해야 합니다. 최종 런처/스플래시는 템플릿 상태이며 게시 전 승인된 브랜드 자산 적용이 남아 있습니다.

## 부모 작업의 최종 갱신

최종 동의 경계·큰 글씨 수정 후 static export → prepare:web → sync를 다시 실행했다. 최종 번들은 allowlist **121파일**이며 양 플랫폼 플러그인1개 등록을 확인했다. iOS 통계는 유한·0 이상·JS 안전 범위 확인 후 정수로 표시하고, 초기 결과를 받은 collection query는 종료한다. 날짜·시간대는 조회 시점 값을 응답에 유지한다.

전체 하네스 `.harness/runs/2026-11-14T14-02-23-685Z-72170/report.md` 통과(루트142, 하네스25, 개인정보48, Firebase59, SmartThings49, skip0). 최종 번들의 320/390px·CSS200% 사본·세 행동·Escape 복귀 검증은 `documentation/phone-steps-20261114.md`에 기록했다. 이는 APK/IPA 컴파일·실기기 건강 데이터 검증을 대신하지 않는다.

하네스 이후 문서 정리와 함께 자동 생성된 예제 테스트 두 파일(2+2, 기존 Capacitor 샘플 packageId 검사)을 제거했다. 앱 동작 코드는 바꾸지 않았으며, 이 예제들은 위 실행 횟수에 포함하지 않았다. 실제 네이티브 계측 테스트는 여전히 남아 있다.
