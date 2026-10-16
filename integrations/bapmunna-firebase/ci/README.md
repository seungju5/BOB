# 자동 검증 설치안

`firebase-parity.yml`은 아직 실행되지 않는 GitHub Actions 설치안입니다. 현재 GitHub CLI OAuth 연결에는 `workflow` 권한이 없어 `.github/workflows/`에 업로드할 수 없습니다. 계정 권한은 변경하지 않았습니다.

워크플로 관리 권한이 있는 저장소 관리자가 내용을 검토한 뒤 루트 `.github/workflows/firebase-parity.yml`로 복사하는 별도 PR을 만들면 활성화할 수 있습니다. `contents: read`만 사용하며 배포·비밀값·병합·외부 데이터 접근은 없습니다. 이 폴더에 있는 동안 자동 검증이 실행된다고 가정하지 마세요.

그전에는 루트에서 다음을 실행합니다.

```sh
npm run check:firebase-sync
npm test
npm run test:firebase
npx tsc --noEmit
npm run build:firebase
```
