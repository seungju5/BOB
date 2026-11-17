# 현재 검증 — 2026-11-17 걷기 랭킹·산책 알림

이번 소스는 건강 조회에 더해 **선택한 전체 사용자 랭킹 공유**와 **기본 꺼짐인 로컬 알림**을 추가한다. 이전 ‘로컬 조회 전용’ 설명은 아래 과거 릴리스에만 해당한다. Android 버전은 `versionCode 3 / 0.2.0-test.1`이다.

| 확인 | 실제 결과와 범위 |
| --- | --- |
| Android Kotlin/Java | 기존 승인 SDK/JDK와 복제한 Gradle 캐시로 `--offline :app:compileReleaseJavaWithJavac :bapmunna-phone-steps:compileReleaseKotlin` 성공. 최종 재검사 56 tasks 중 수정된 4개 실행. 공유 node_modules의 빌드 산출물은 host `.local/native-build/`로 분리 |
| PhoneSteps 플러그인 | 5개 통과, skip 0. 실제 JDK KST/DST/자정·no-data와 0 구분·알림 시간 계산·초기 미연결과 조회 중 철회 구분, 네트워크/저장 없는 웹 fallback, 실제 Capacitor JSValue 구현을 사용한 macOS Swift 응답 필터 검사 |
| 모바일 셸 | 13개 통과, skip 0. 링크 허용 경계, copied bundle 일치, CSP, manifest 자산, OS 건강 권한 설명·Apple 수집 선언 회귀 |
| 웹 번들 | 빈 basePath의 Next static export 성공, `/health/`와 정적 자산 78파일 prepare, Android/iOS cap sync 성공. 최종 웹 변경 후에는 다시 export → prepare → sync가 필요 |
| Swift / plist | 전체 플러그인 Swift 문법 parse 성공, Info.plist·PrivacyInfo.xcprivacy lint 성공. 순수 `WalkingPayload`는 실제 Capacitor JSValue/coercion 소스로 macOS compile·실행 성공 |
| 미실행 | iOS 앱 전체 compile·서명·IPA(이 Mac에 Xcode 없음), 실제 휴대폰 권한/HealthKit·Samsung Health 합계/Keychain·Keystore/실제 OS 알림/재부팅/오프라인 해제·실기기 서버 왕복. 위 소스 검사는 이를 증명하지 않음 |

토큰은 Keystore 암호화 저장/Keychain에 남고 JS에는 전달하지 않는다. 8자리 코드 교환은 미확정 상태이며 별명 확인·별도 공유 동의 전 업로드가 없다. 해제는 서버 응답 전부터 영속 대기 장벽으로 추가 업로드를 막는다. 정상적인 최초 건강 미연결·권한 없음은 `ok:false`로 남아 순위판 조회를 계속하고, 조회 도중 동의 변경은 stale로 거절한다. 응답은 공개 필드만 통과하며 빈 기록을 0으로 바꾸지 않는다.

알림은 직접 고른 휴대폰 시각(최대4개)의 OS 로컬 일정이다. Android는 inexact alarm과 재부팅/시간대 변경 재계산, iOS는 반복 calendar trigger를 쓴다. 실제 식사를 감지하거나 혈당을 측정했다고 말하지 않는다. 집중 모드·배터리 최적화·강제 종료·알림 설정에 따른 지연/미표시는 실기기 확인 항목이다.

이 절의 담당 작업에서는 새 서명키 발급·서명·배포·스토어 제출을 수행하지 않았다. 최종 공개 APK와 배포 여부는 부모 작업의 별도 릴리스 증거로 확인한다.

---

# 이전 검증 — 2026-11-15

이번 변경은 기존 앱 전체 셸에서 **로컬 /health/ 화면만 제공하는 건강 연결 모듈**로 범위를 정리했다. 아래 2026-11-14 기록은 과거 상태이며, 현재 완료·미완료는 이 절과 산출물 evidence.json을 기준으로 한다.

- Android 실제 Kotlin/Java compile, debug APK, release unsigned AAB 빌드가 성공했다. AppCompatActivity classpath 누락을 실제 compile에서 찾아 AppCompat 1.7.1 직접 의존성으로 수정했다. debug key는 프로젝트 내부의 임시 개발 키다.
- 플러그인 테스트 3개, 셸 테스트 7개 통과·skip 0. 실제 JDK 날짜/DST, Java 및 macOS Swift로 네 문자열 링크 allowlist·악성 변형 거부, 웹 CSP/패키징, 오래된 copied asset을 배포 증거로 기록하지 못하게 하는 회귀를 포함한다.
- 최신 건강 전용 export는 루트 담당자가 큰 글씨 200%·320px overflow 0을 확인한 tmp/impact-final/build이다. prepare → sync → build를 순서대로 수행하며 Android/iOS copied public·config가 www와 일치해야 빌드와 소스 묶음이 가능하다. 빌드 뒤에도 같은 digest인지 재확인한다.
- localhost /health/ 초기 진입, 고정 네 문자열 deep link 수신, 고정 시스템 브라우저 복귀, 빈 appResumed 이벤트를 구현했다. 브라우저/실제 OS 동작 증거와 순수 predicate 검사를 구분한다.
- 기존 rice-logo의 플랫폼 규격 변환과 원본 bunny의 시작 화면 재사용을 완료했다. 원본 해시는 brand-assets.json에 기록했다. 외부 API 요청은 CSP connect-src self로 차단한다.
- iOS plist·entitlements·Xcode project 구문 검사를 통과했다. Xcode가 없어 HealthKit iOS 앱 compile·서명·IPA·TestFlight는 미완료이며 소스만 전달한다.
- 실제 휴대폰은 사용자가 현재 연결할 수 없다고 답했다. 실제 건강 권한 창·Samsung Health 동기화·Apple 건강 합계·0/no-data·권한 철회·설정 복귀·자정 샘플·실제 OS cold/warm 링크를 검증했다고 하지 않는다.
- 에뮬레이터는 별도 android-sdk-arm-dbt-license가 나타나 미수락 상태다. 원문은 .local/emulator-license.txt에 보관했으며 가상 기기 실행은 아직 하지 않았다.
- 운영 release signing, App/Universal Links association 호스팅, Play 건강 선언, 스토어 업로드, 공개 배포, SmartThings 실제 연동은 수행하지 않았다.

산출물은 .local/artifacts/android-debug/, android-release-unsigned/, ios-source/에 있다. 각 evidence.json에서 산출물 SHA256·copied bundle digest·원본 파일 해시·Git 기준 커밋·서명 상태를 확인한다. 이후 소스 변경은 재빌드해야 하며 이전 브라우저/하네스 결과를 새 native 앱의 실제 건강 연동 증거로 사용하지 않는다.

---

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
