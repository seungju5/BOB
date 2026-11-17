# Android 선택 참여 산책·랭킹 테스트 릴리스

- 버전: 0.2.0-test.1 / versionCode 3, Android10 이상.
- 소스 커밋: `2b2d90acdde2b1ff3a67fb8e067c8f4cfaadd243`. 네이티브 소스 지문: `12f923f5588030baa8e2d854729c4bd000060d0edb4bcb4587f62159f93fe509`.
- Next16.4.5 루트 export→기존 /health/ 80파일 prepare→Android/iOS sync→Android release154작업 성공. 양 플랫폼 copied bundle82파일의 지문은 `dc07e8a84bcf2d4dc4b30d1c7b0d8bd69f0f0779c651eb220f4c443522985504`.
- 이전 공개 테스트와 동일한 인증서 `9db8fa66280f1cb6a29d0b5148a01105904e25e1d15a210cd3a4ea158fdaf1e5`로 서명했다. v2 서명 검증 통과, debuggable=false, 앱ID com.bapmunna.senior. 새 서명키·권한/IAM·결제 변경은 없다.
- APK 21,147,069 bytes, SHA256 `fef35102c44bcaaae93aca07545cdfeb198a04c3f2881acb117a331c6c30a9bb`. 공개 URL을 인증 없이 내려받아 크기/해시 일치를 확인했다.
- [공개 테스트 릴리스](https://github.com/jooji13/bapmunna-downloads/releases/tag/android-0.2.0-test.1). Firebase에는 APK를 올리지 않고 검증 영수증만 둔다.

기본 건강 조회는 휴대폰 안에서만 처리한다. 별도 웹 참여 동의·휴대폰 목적지 별명 확인·공유 동의를 모두 마친 경우에만 한국 시간 오늘 걸음수 합계를 랭킹 서버에 전송한다. 토큰은 Keychain/Keystore에, 서버에는 해시로만 남는다. 직접 선택한 시각의 산책/기존 혈당 계획 확인 알림은 OS 로컬 예약이다. 실제 식사 완료·혈당 측정·건강 판단으로 표현하지 않는다.

현재 Vercel 걸음수 서버 게시에는 사용자 이메일 본인 확인이 남아 있다. 기존 서버를 Ready로 확인한 과거 결과를 이번 새 경로 배포 성공으로 사용하지 않는다. 웹/서버 게시 결과는 별도 릴리스 영수증으로 갱신한다.

실제 Android의 건강 권한·삼성 헬스 합계 대조·잠금/절전/재부팅 알림·기기 서버 왕복은 미검증이다. iOS는 Swift 구문/순수 응답 검사·plist·번들 sync까지이며 Xcode/서명/IPA/실기기는 미완료다.
