# 밥뭇나 로컬 건강 연결 앱

기존 밥뭇나의 `/health/` 화면과 승인된 디자인을 담는 Android/iPhone 설치형 모듈입니다. 웹의 **로그인 → 튜토리얼 → 홈 → 건강 연결 선택** 순서는 그대로 두고, 설치형 앱은 본인 휴대폰의 오늘 걸음수만 보여줍니다. Firebase 운영 계정·페어링·Supabase 로그인을 네이티브 원점으로 옮기지 않습니다.

- Android: Samsung Health가 Health Connect로 공유한 `StepsRecord`만 읽습니다. `com.sec.android.app.shealth` 출처 필터와 `READ_STEPS` 한 권한을 사용합니다.
- iPhone: Apple 건강(HealthKit)의 `stepCount`를 읽기만 합니다. 읽기 거부와 기록 없음은 구분할 수 없어 모두 정직하게 `no-data`로 표시합니다.
- 건강 숫자를 서버·가족에게 보내거나 저장하지 않습니다. 로컬 동의 플래그만 보관합니다. 연결 해제는 이 앱의 읽기를 멈추며 OS 건강 공유 권한을 철회하지 않습니다.
- 브라우저에서 건강 자료를 읽거나 연동 완료·걸음수를 예시 숫자로 만들지 않습니다.

## 준비와 실행

1. 저장소 루트와 이 폴더의 npm 의존성을 설치합니다. Node 22+, Capacitor **8.6.2**입니다. 브랜드 규격 변환은 기존 루트 Next 의존성 `sharp`를 사용합니다.
2. 루트에서 `BAPMUNNA_STATIC_EXPORT=1 NEXT_PUBLIC_APP_BASE_PATH='' npm run build -- --webpack`으로 기존 앱을 export합니다. 담당자가 이미 빌드 중이면 중복 실행하지 않습니다.
3. 이 폴더에서 `npm run prepare:web -- tmp/impact-final/build`를 실행합니다. 입력은 저장소 기준 실제 export 디렉터리입니다. 현재 출력은 `out`이 아닙니다.
4. `npm run prepare:brand`, `npm test`, `npm run sync`로 원본 자산·네이티브 등록을 준비합니다. sync는 컴파일·배포가 아닙니다. 빌드는 www와 양쪽 copied public·설정의 전체 일치를 검사하며, sync를 빠뜨리면 실패합니다.
5. `npm run doctor` 후 `npm run build:android`로 디버그 APK를 만듭니다. SDK/JDK는 저장소 내부 경로만 사용합니다. 빌드 스크립트는 SDK 설치·약관 수락을 수행하지 않습니다.
6. `npm run build:android:unsigned`는 서명하지 않은 AAB, `npm run bundle:ios-source`는 iOS 소스 묶음을 만듭니다. 산출물은 Git 제외 `.local/artifacts/`에 있습니다. iOS 소스 묶음은 IPA가 아닙니다.

Android: JDK 21, SDK 36, Build Tools 35.0.0/36.0.0, Gradle 8.14.3, AGP 8.13.0, Kotlin 2.2.20, 최소 Android 10(API 29). Health Connect 1.1.0, Coroutines 1.10.2, AppCompat 1.7.1. iOS: Xcode 26+, iOS 15+, SPM Capacitor 8.6.2, HealthKit entitlement. `BAPMUNNA_ANDROID_SDK`와 `BAPMUNNA_JAVA_HOME`으로 프로젝트 내부 경로를 지정합니다.

## 진입·복귀 경계

허용 외부 입력은 아래 네 문자열뿐입니다. 대소문자 변경·공백·쿼리·fragment·사용자 정보·포트·인코딩 경로는 거부합니다. OS의 token/account/extras/userActivity를 JS에 전달하지 않습니다.

```text
bapmunna://health
bapmunna://health/
https://impact-series.web.app/bapmunna/app/health
https://impact-series.web.app/bapmunna/app/health/
```

앱 시작은 `https://localhost/health/`(Android), `capacitor://localhost/health/`(iOS)입니다. 인자가 없는 `PhoneSteps.openWebApp()`은 **https://impact-series.web.app/bapmunna/app/** 만 시스템 브라우저로 엽니다. 로그인은 검증된 웹앱에서만 이루어집니다. HTTPS App/Universal Links는 실제 서명 식별자와 서버 association 파일이 있어야 검증됩니다.

`appResumed`는 빈 생명주기 신호만 보냅니다. UI가 `readToday()`로 새로고침하며 이 호출은 권한 창을 띄우지 않습니다. 권한 요청은 사용자 클릭의 `connect()`만 수행합니다.

## 번들·브랜드

Capacitor는 extensionless 경로에 `index.html`을 제공하므로, **기존 `/health/index.html`을 루트 index에도 동일하게 복사**합니다. 다른 로그인·계정·privacy HTML은 제외합니다. 개인정보 설명은 건강 화면 안에 표시하며 `/health/privacy`는 웹 전용입니다. 네이티브 새 페이지를 추가하려면 라우터·HTML·RSC·CSP 전략도 함께 바꿔야 합니다.

건강 HTML·정적 청크·실제 public 자산·manifest만 가져오며 서버 코드·환경 파일·source map은 제외합니다. CSP는 로컬 스크립트와 정확한 inline hash만 허용하고 `connect-src 'self'`로 외부 API/telemetry를 막습니다. 원격 페이지·iframe·원격 스크립트·서비스워커를 네이티브 브리지에 넣지 않습니다.

런처는 기존 `public/brand/rice-logo.png`, 공통 시작은 원본 `public/brand/bunny.png`입니다. 원본을 수정하지 않고 플랫폼 규격의 크기·여백만 변환합니다. `brand-assets.json`에 원본 SHA256을 기록합니다. 로고가 160px이므로 대형 스토어 이미지용 고해상도 원본은 별도 전달 항목입니다.

남은 배포 조건은 [RELEASE.md](RELEASE.md), 실행 증거는 [VERIFICATION.md](VERIFICATION.md)에 있습니다.
