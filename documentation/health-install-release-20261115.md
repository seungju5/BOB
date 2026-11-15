# Android 테스트 설치 파일 공개 — 2026-11-15

사용자가 설치 파일 공개와 실기기 검증을 요청했다. 연결 가능한 Android 기기가 없었고 사용자가 ‘지금은 휴대폰 연결이 어려워요’라고 확인했다. 실기기 검사 결과를 성공으로 기록하지 않는다. 이 Mac에는 Xcode가 없으며 iOS 컴파일·팀 서명·IPA/TestFlight 공개는 진행하지 않았다.

## 배포 구성

- 웹 안내: https://impact-series.web.app/bapmunna/app/health/
- 설치 파일 전용 공개 저장소: https://github.com/jooji13/bapmunna-downloads
- 테스트 릴리스: https://github.com/jooji13/bapmunna-downloads/releases/tag/android-0.1.0-test.1
- APK: https://github.com/jooji13/bapmunna-downloads/releases/download/android-0.1.0-test.1/bapmunna-health-0.1.0-test.1.apk
- 웹 공개 영수증: https://impact-series.web.app/bapmunna/app/downloads/20261115/release.json

Firebase Spark는 APK 호스팅을 제한한다([공식 정책](https://firebase.google.com/docs/hosting/faq-and-troubleshooting)). 요금제 전환·확장자 위장 없이 APK를 전용 GitHub Release에 올리고, 기존 Firebase 안내가 그 다운로드로 연결한다. GitHub Release는 바이너리를 제공할 수 있다([공식 설명](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)). 기존 `seungju5/-1` 소스 저장소는 비공개로 유지한다. 새 공개 저장소에는 README와 APK·해시·공개 영수증만 있고, 자동 source archive는 안내 README만 담는다.

## 설치 파일

`com.bapmunna.senior`, versionCode 2, `0.1.0-test.1`, 최소 Android 10(API29), 타깃 API36. 네이티브 빌드 기준은 `b5512b6e160b75cc1358d0d94f5b05ca0dede7d8`이며 독립 검토에서 네이티브 원본 해시·www/패키지 자산 일치를 확인했다.

- 크기: 21,040,188바이트
- SHA256: `5a5b22b1ea799cf0bc586fa348a6176e9e5840336ff7a4cfe26adc130a594257`
- 인증서 SHA256: `9db8fa66280f1cb6a29d0b5148a01105904e25e1d15a210cd3a4ea158fdaf1e5`
- 독립 APK 서명 검증 통과, debuggable=false, allowBackup=false.
- 앱 동작 권한: INTERNET와 READ_STEPS. AndroidX 내부 signature receiver도 포함한다.
- 별도 공개 테스트 서명키는 암호화·로컬 파일 권한 제한·Git 제외로 보관하고 원래 프로젝트의 `.local/public-test-signing-20261115/`에 사본을 남겼다. 키·암호는 출력·공개·압축 배포하지 않는다. 새 APK 업데이트에는 이 키를 보존해야 한다. 과거 debug APK는 서명이 다르므로 삭제 후 설치해야 할 수 있다.

설치형은 오늘 걸음수 전용이며 웹 로그인/가족 화면을 네이티브 원점으로 옮기지 않는다. 웹 안내에는 테스트판·실기기 미검증·아이폰 설치본 없음·직접 설치 동의·이전 개발본 교체를 표시한다. 권한 창이 실패하면 이용 안내 안에서 휴대폰 설정으로 이동할 수 있다. Android 권한 목적 화면의 개인정보 링크도 공개 건강 안내로 바꿨다.

## 이번에 실행한 검사

- Android release 모드 오프라인 컴파일·별도 서명·v2 검증·디버깅 미활성 검사 통과. SDK XML/Gradle deprecated 경고는 남아 있으며 컴파일 오류는 없다.
- 네이티브 포장/Java·Swift URL 검사 11개, 걸음수 플러그인/시간창 검사 3개, 공개 파일 교체 방지 검사 2개 통과. Swift URL 검사는 iOS 전체 빌드가 아니다.
- 권장 Node 24 전체 하네스 `.harness/runs/2026-11-15T05-28-06-806Z-21737/report.md`: 427개 통과(25/246/48/59/49), 실패·skip 0. 타입·동기화·양쪽 웹 빌드·소스 안정성도 통과. 첫 Node26 실행은 기존 HTTP 테스트 종료 후 EPIPE가 있어 실패했고 그 결과를 통과로 기록하지 않는다.
- 최종 다운로드 원점 변경 후 네이티브/15개 경로 정적 export 재빌드와 공개 파일 검사 재실행 통과.
- 390/320px 브라우저에서 기종 선택·다운로드 주소·접히는 설치 안내, 24px 본문·가로 넘침0·콘솔 오류/경고0 확인. 실제 휴대폰 OS 동작 증거가 아니다.
- 독립 검토: APK identity/signature/source/packaged assets/권한/비밀 파일 미포함과 staging317파일(설치 파일0, 영수증만)을 확인했다.

공개 후 다운로드·Hosting 영수증은 `workspaces/bapmunna-final/releases/20261115-public-install.json`으로 별도 기록한다. Firebase Auth/Rules/DB/SmartThings와 카카오 보류·결제 미활성화는 변경하지 않는다.

## 실기기 검사 — 미실행

| 항목 | 상태 | 완료에 필요한 실제 확인 |
| --- | --- | --- |
| APK 설치·첫 실행 | 기기 연결 대기 | APK 설치와 시작 화면·밥솥이·권한 전 무조회 |
| 웹 → 앱 → 웹 | 기기 연결 대기 | cold/warm 실행, 토큰 없는 링크, 브라우저 복귀 |
| Health Connect 동의 | 기기 연결 대기 | 허용·거부·철회·설정 복귀, OS 차단 안내 |
| 삼성 헬스 걸음수 | 기기 연결 대기 | 당일 삼성 출처 합계 대조, 동기화 지연·빈 기록 구별 |
| 연결 끄기·재시작 | 기기 연결 대기 | 숫자 숨김, 자동 재조회 없음, 다시 명시적 동의 |
| 날짜·접근성 | 기기 연결 대기 | 자정·시간대·오프라인, 큰 글꼴·TalkBack |
| iPhone | Xcode·팀 서명·기기 필요 | 전체 HealthKit 빌드, 설치, 동의·빈 기록·복귀 |

실제 건강 숫자·화면·기기 일련번호는 보고서에 저장하지 않고 모델/OS/앱 버전과 성공·실패만 기록한다. 테스트용 건강 기록을 만들어 실제 삼성/Apple 기록으로 주장하지 않는다.

## 공개 결과

2026-11-15 14:39 KST Hosting `9c953108d6155e4d`, 이전 `8135bed18869753c`. 공개88개 파일의 바이트 일치·기존경로 누락0·기존2616개 보존·총2704개·무료 상태를 확인했다. GitHub 사전 출시445835923의 APK는 인증 없이 HTTP200으로 다운로드됐고, 크기·SHA256·MIME·attachment 헤더·JSON·체크섬 파일이 모두 검증본과 일치했다.

공개 브라우저의 다운로드 버튼·390px 화면·오류0·스크린샷은 확인했다. IAB 다운로드 이벤트 대기는 타임아웃됐고 이어진 helper는 컴퓨터 오프라인으로 실패했다. 이를 실제 브라우저 파일 저장 성공이나 실기기 설치 성공으로 표현하지 않는다. 위 무인증 HTTP 다운로드 증거와 구분한다.
