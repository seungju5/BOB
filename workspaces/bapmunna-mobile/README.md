# 기존 밥뭇나 앱의 설치형 셸

이 폴더는 원래 Next.js 앱의 static export를 그대로 담는 Capacitor Android/iPhone 프로젝트입니다. 별도 홈 화면이나 샘플 MVP를 만들지 않습니다. 건강 연결은 `packages/phone-steps`의 Samsung Health→Health Connect / Apple HealthKit 읽기 전용 모듈을 사용합니다. Firebase판 계정·DB·서버와 합치지 않습니다.

## 로컬 준비

1. 저장소 루트 의존성과 이 폴더 의존성을 설치합니다(`npm ci`). Capacitor 패키지는 8.6.2로 고정되어 있습니다.
2. 저장소 루트에서 기존 앱을 `BAPMUNNA_STATIC_EXPORT=1 NEXT_PUBLIC_APP_BASE_PATH='' npm run build`로 export합니다. 이 설정은 호스팅 경로 `/bapmunna`가 없는 설치형 번들용입니다.
3. 이 폴더에서 `npm run prepare:web -- <저장소 루트 기준 export 폴더>`를 실행합니다. 기본은 `out`입니다. Next 설정의 출력 위치가 다르면 실제 `index.html`이 있는 폴더를 전달합니다. 소스 코드는 변경하지 않고 완성된 파일만 복사합니다.
4. `npm run test`, `npm run sync`를 실행합니다. sync는 로컬 네이티브 프로젝트의 플러그인/웹 자산 등록이며, 네이티브 컴파일이나 서버 배포가 아닙니다.
5. Android Studio 또는 Xcode에서 대상 기기로 빌드합니다. 앱 ID `com.bapmunna.senior`는 로컬 프로젝트 식별자이며 스토어/Apple 계정에 등록되었다는 뜻이 아닙니다.

도구: Node 22+, Android Studio Otter 이상·Android SDK 36·JDK 21, iOS는 Xcode 26+·iOS 15+. Android 프로젝트 최소 버전은 API 29입니다. Android Gradle wrapper는 공식 Capacitor 템플릿의 8.14.3이며, 라이선스 동의나 SDK 자동 설치는 이 작업에서 수행하지 않았습니다.

## 화면과 접근 경계

`www/`는 생성 파일입니다. 기존 앱의 HTML/JS/CSS를 복사하고 로컬 인라인 부트스트랩의 해시가 있는 CSP만 추가합니다. 원본 Next.js 코드·토끼·밥솥·레이아웃은 바꾸지 않습니다. 프레임·외부 스크립트·다른 문서 base를 거부하고 서비스워커 실행을 막아 설치된 번들과 오래된 웹 캐시가 섞이지 않게 합니다. 기존 HTTPS API 요청은 유지됩니다. `server.url`과 외부 `allowNavigation`은 사용하지 않습니다.

앱 진입도 기존 로그인→튜토리얼→홈을 유지합니다. **외부 OAuth 로그인 후 앱으로 돌아오는 URL, 로그인 세션 복구, 시니어 페어링은 실제 기기에서 아직 확인하지 않았습니다.** 기존 웹 Redirect URI가 설치형 앱에서도 동작한다고 가정하면 안 됩니다. 원격 로그인 사이트를 권한 있는 웹뷰에 넣어 해결하지 말고 시스템 브라우저 및 검토한 앱 복귀 경로를 사용해야 합니다. 이 프로젝트는 OAuth 콘솔·키·계정을 변경하지 않습니다.

Android 권한 설명 화면은 걸음수 이용 목적과 기존 Notion 개인정보 처리방침 링크를 보여줍니다. 배포 시 같은 정책에 건강 데이터 처리 내용이 포함되고 Play Console 신고와 일치하는지 확인해야 합니다. iOS에는 HealthKit entitlement와 읽기 목적 문구만 있습니다. 건강 자료는 이 셸/플러그인에서 서버나 보호자에게 전송하지 않습니다.

## 완료로 간주하지 않은 항목

네이티브 빌드, 서명, 건강 권한 창, 실제 걸음수, Samsung Health 동기화, 앱의 백그라운드 복귀, 로그인/페어링, 스토어 게시를 검증하지 않았습니다. 생성된 네이티브 프로젝트의 런처 아이콘/스플래시 자산도 공식 템플릿 상태이므로 최종 게시 전에 승인된 밥뭇나 자산으로 적용해야 합니다. 웹 화면은 원본 앱 export를 사용합니다. SDK·Xcode가 없는 현재 환경에서는 JS 검증과 자산·등록 점검만 실행할 수 있습니다.
