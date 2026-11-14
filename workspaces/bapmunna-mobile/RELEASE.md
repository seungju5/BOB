# 설치형 건강 연결 배포 준비

웹 운영판은 Impact Series Firebase이고, 설치형 모듈은 **본인 기기 건강 읽기 전용**입니다. 계정 동기화 앱으로 소개하지 않습니다. 공개 서버·스토어·계정·결제는 변경하지 않았습니다.

## 로컬 도구 기록

2026-11-15 사용자가 SDK 약관 동의 및 프로젝트 내부 설치를 명시 승인했습니다. 공식 Google CLI zip의 SHA256을 확인하고 필요한 `android-sdk-license`를 수락했습니다. 위치는 저장소 `tmp/bapmunna-android-sdk/`입니다. 글로벌 SDK·Android Studio·Xcode는 설치하지 않았습니다.

| 도구 | 준비 내용 |
| --- | --- |
| Google command-line tools | 22.0, `commandlinetools-mac_arm64-15859902_latest.zip` |
| 공식 zip SHA256 | `835b62a26162b229b441d1f6d4680383815a270809eb33522c0d480fa5002c4e` |
| Android | API 36, platform-tools, Build Tools 36.0.0 및 AGP 기본 35.0.0 |
| JDK | `tmp/java21/jdk-21.0.13+9/Contents/Home` |
| Gradle | 8.14.3, SHA256 `ed1a8d686605fd7c23bdf62c7fc7add1c5b23b2bbc3721e661934ef4a4911d7c` 고정 |
| iOS | Xcode 없음. macOS Command Line Tools Swift 6.4는 URL 순수 로직 검사에만 사용 |

CLI 22 `sdkmanager`는 deprecated 경고를 냅니다. 이번에는 고정 버전의 공식 호환 명령을 사용했으며 새 자동화는 [Android CLI](https://developer.android.com/tools/agents/android-cli)를 검토합니다. 이후 빌드는 SDK를 자동 설치하지 않도록 `android.builder.sdkDownload=false`입니다. 원본은 [공식 Android 다운로드](https://developer.android.com/studio), 서명은 [Android 앱 서명 문서](https://developer.android.com/studio/publish/app-signing)를 따릅니다.

## Android 전달

1. `npm test` → `npm run verify` → `npm run sync` → `npm run build:android`. `.local/artifacts/android-debug/bapmunna-health-debug.apk`는 **테스트용 디버그 서명**입니다. `.local/debug.keystore`를 운영 업로드 키로 사용하지 않습니다.
2. `npm run build:android:unsigned`는 서명하지 않은 AAB를 만듭니다. 이는 바로 설치·스토어 업로드할 수 없습니다.
3. 담당자가 실제 운영 키를 제공하면 비공개 환경에서 `BAPMUNNA_KEYSTORE`, `BAPMUNNA_STORE_PASSWORD`, `BAPMUNNA_KEY_ALIAS`, `BAPMUNNA_KEY_PASSWORD`를 설정하고 `npm run build:android:signed`를 실행합니다. 값은 출력·Git 기록하지 않습니다. 자동 키 발급·계정 생성·업로드는 없습니다.
4. 실제 Galaxy에서 Samsung Health→Health Connect 걸음수 공유 후 권한 허용/거부/철회, no-data, 당일 합계, 설정 복귀, 재시작, 연결 해제, 자정·시간대 변경을 확인해야 합니다. 타 출처 제외와 삼성 동기화 지연도 확인합니다.
5. Play Console 건강 앱/Health Connect 선언, 건강 데이터가 실제로 설명된 개인정보 처리방침, Data safety, 내부 테스트, 앱 ID·업로드 키 소유권이 남았습니다. 콘솔 제출은 수행하지 않았습니다.

## iPhone 전달

`npm run bundle:ios-source` 산출물을 Xcode 26+ 환경으로 가져옵니다. 같은 상대 디렉터리 구조에서 npm 의존성을 설치하고 `ios/App/App.xcodeproj`를 엽니다. 실제 팀의 Bundle ID `com.bapmunna.senior`, HealthKit/Associated Domains 권한, provisioning profile, 인증서를 연결해야 합니다. 로컬 ID를 계정에 등록됐다고 간주하지 않습니다.

실제 iPhone에서 권한 요청, 거부와 no-data, Apple 건강의 날짜 합계, foreground 복귀, disconnect, 자정/DST를 확인한 후 archive/export/TestFlight를 진행합니다. Xcode·실기기가 없어 **HealthKit iOS compile·signing·IPA·TestFlight는 미완료**입니다. [HealthKit 권한](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data), [앱과 웹 연결](https://developer.apple.com/documentation/xcode/allowing-apps-and-websites-to-link-to-your-content)을 참고합니다.

## 링크 호스팅

HTTPS 자동 앱 열기는 `https://impact-series.web.app/.well-known/assetlinks.json`의 **실제 release signing SHA256**, `/.well-known/apple-app-site-association`의 **실제 App Identifier Prefix + Bundle ID**가 필요합니다. placeholder나 개발 키를 운영 association으로 게시하지 않습니다.

`node scripts/association-files.mjs`는 명시된 공개 식별자로 로컬 파일만 생성합니다. 자동 배포하지 않습니다. 경로는 건강 연결로 한정합니다. 커스텀 scheme Java/Swift 순수 로직 검사는 실제 OS의 cold/warm 진입·링크 검증을 대신하지 않습니다. SmartThings 서버 배포는 별도 담당이며 이 빌드 성공과 무관합니다.

## 산출물과 복구

산출물 옆 `evidence.json`은 파일 SHA256, 소스별 SHA256, Git 기준 커밋, 웹 bundle 정보, 서명 상태를 기록합니다. 소스나 번들이 바뀌면 재생성하고 이전 검증을 새 파일에 적용하지 않습니다.

기존 웹 배포를 변경하지 않아 웹 rollback은 없습니다. 테스트 앱 삭제·이전 APK 재설치 시 로컬 동의는 사라지지만 사용자 건강 저장소는 삭제하지 않습니다. 게시 후 운영 복구는 이전 안전 소스를 더 높은 versionCode/build로 재빌드하고 스토어 절차를 밟아야 합니다.
