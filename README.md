# Warming Up · 밥뭇나

보호자와 어르신이 밥솥 소식과 안부를 나누는 팀 웹앱입니다. [웹앱 열기](https://warming-up-bapmunna.web.app/) · [팀 Firebase 콘솔](https://console.firebase.google.com/project/warming-up-bapmunna/overview)

## 팀에서 수정할 때

GitHub에서 `codex/warming-up-firebase`를 선택하세요. 이 브랜치는 밥뭇나의 Firebase 판 전체 소스입니다. 수정용 브랜치에서 이 브랜치로 PR을 보내면 함께 검토할 수 있습니다. GitHub Actions는 반영된 커밋마다 테스트하고 배포 파일을 만듭니다. 해당 브랜치의 Vercel 자동 배포는 꺼져 있습니다.

```sh
git clone --single-branch --branch codex/warming-up-firebase https://github.com/seungju5/BOB.git warming-up
cd warming-up
npm ci
npm test
npm run test:domain
npm run check:types
npm run build
node scripts/check-public.mjs
```

Node.js 24를 기준으로 합니다. `npm run dev`로 화면과 가상 체험을 확인할 수 있습니다. 실제 계정 로그인은 팀 Hosting에서 제공하는 같은 출처의 `/__/firebase/init.json`을 사용합니다. 로컬 개발 서버만 띄운 경우에는 실계정 로그인 설정이 제공되지 않습니다.

## 데이터와 서비스

- 팀 프로젝트 ID는 `warming-up-bapmunna`이며, 인증·Firestore·Hosting을 이 프로젝트에서 운영합니다. 이전 서비스의 가입자나 가구 기록은 가져오지 않았습니다.
- 이용자는 본인 이메일과 비밀번호로 가입하고 메일에 온 링크를 눌러 주소를 확인합니다. 확인 후 본인 프로필과 가구 설정을 저장할 수 있습니다. 로그인 화면의 ‘비밀번호 찾기’에서 비밀번호를 재설정할 수 있습니다. 보안 규칙은 `firebase/firestore.rules`, 브라우저 연결 코드는 `firebase/provider/`, 공개 주소와 문의처는 `config/team.ts`에 있습니다.
- 데모를 선택하면 산책, 토끼 꾸미기, 전력 예시를 체험할 수 있습니다. 새 계정에는 팀에서 수신한 데이터만 표시합니다. 카카오·삼성 OAuth, 휴대폰 걸음수 공유, 팀 서명 Android 배포는 각각 팀 등록 및 검증이 완료된 뒤 연결하세요.
- 팀 개인정보 문의는 [Warmingu9@gmail.com](mailto:Warmingu9@gmail.com)으로 받습니다.

## 배포와 복구

팀 소유자는 Python 3, GitHub CLI(`gh`), Firebase CLI(`firebase`)가 설치된 컴퓨터에서 `gh auth login`, `firebase login`으로 최초 로그인합니다. [Actions의 빌드](https://github.com/seungju5/BOB/actions/workflows/firebase-hosting.yml?query=branch%3Acodex%2Fwarming-up-firebase)가 끝나면 저장소 루트에서 다음 명령을 실행합니다.

```sh
npm run release:hosting
```

이 명령은 팀 브랜치 최신 커밋과 통과한 빌드를 찾고, GitHub가 기록한 SHA-256으로 파일을 확인합니다. 새 Firebase에 게시한 뒤 첫 화면·로그인·개인정보 안내·기기 연결 화면을 GitHub 파일과 비교합니다. 게시는 생략하고 일치 여부만 확인할 때는 `npm run release:hosting -- --check-live`를 사용하세요. 빌드 파일 보관 기간은 2일이며 만료되면 해당 커밋의 워크플로를 다시 실행합니다.

현재 운영 방식은 GitHub 자동 검사와 팀 소유자 계정을 통한 게시입니다. 향후 팀이 무인 게시를 승인하면 새 프로젝트의 Hosting 전용 서비스 계정에 해당 GitHub 브랜치의 단기 인증을 연결하고 `WARMING_UP_AUTO_PUBLISH` 저장소 변수를 `true`로 설정합니다. 워크플로와 소유자 게시 명령 모두 같은 GitHub 빌드를 사용합니다. Firestore 규칙은 별도로 검토 후 프로젝트 소유자가 `firebase deploy --only firestore:rules --project warming-up-bapmunna`로 적용합니다.

잘못된 변경을 되돌리려면 원인 커밋을 revert하고 이 브랜치에 반영하세요. 긴급 복구는 Firebase 콘솔의 Hosting 출시 기록에서도 진행할 수 있습니다. 앱 디자인과 판단 기준의 출발점은 팀 main의 `a1204cb`이고, 독립판은 로그인·문의처·기기 연결 및 배포 대상을 팀 프로젝트에 맞췄습니다.
