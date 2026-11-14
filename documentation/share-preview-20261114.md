# 모바일 링크 공유 썸네일

공유 주소: https://impact-series.web.app/bapmunna/share

기존 밥뭇나 로고(1200×630 PNG, 89,605 bytes)를 그대로 사용한다. 제목은 ‘밥뭇나 · 밥 한 끼로 전하는 안부’, 설명은 ‘안부가 폴짝 찾아왔어요. 매일 쓰는 밥솥이 대신 전하는 안부를 만나보세요.’다. 새 공유 주소는 같은 보호자용 앱을 직접 제공하며 로그인·데이터 저장소를 새로 만들지 않는다.

## 변경

- Firebase 시작·보호자·어르신·공유 별칭, 별도 Supabase판 및 모음 페이지의 canonical/og:url을 각 주소에 맞췄다.
- Open Graph의 image:type/secure_url과 Twitter 이미지 대체 설명을 추가했다. 이미지 URL에 `?v=20261114`를 붙여 이전 이미지 캐시와 구분했다.
- Next 정적 앱도 같은 로고 정보를 제공한다. `/bapmunna/app`의 og:url은 해당 basePath로 빌드할 때에만 적용한다.
- `/share#account` 새로고침·어르신 화면 방문 후 복귀에도 보호자 역할을 유지한다. 원래 화면의 역할 전환은 그대로 사용할 수 있다.

## 확인한 범위

- 빌드된 24개 HTML의 `<head>`에서 OG/Twitter 이미지 주소·PNG 형식·1200×630 크기·대체 설명을 확인했다. JavaScript 실행이나 로그인 없이 읽을 수 있다.
- 320px/390px 브라우저에서 공유 링크의 보호자 계정 진입, 새로고침, 어르신 화면 방문 후 보호자 링크 복귀와 가로 넘침 없음을 확인했다.
- 기존 역할 검사에 공유 별칭의 로그인·새로고침 회귀를 추가했다. 역할 검사 10개 통과. Firebase 전체 검사, 타입 검사, 일반 Next 빌드, 정적 export와 Firebase 빌드 통과.
- 하네스 초기 실행의 기존 SmartThings HTTP 검사 1건은 샌드박스의 localhost 바인딩 제한으로 실패했다. 정상 권한 재실행은 48개 통과·실패 0·Firestore emulator 1개 skip이다. 최초 하네스 보고서를 전체 성공으로 바꾸지 않는다.
- 독립 검토에서 발견한 공유 링크의 역할 복귀와 일반 Next 빌드의 OG 주소 문제를 수정했다. 독립 재검증의 역할·콜백 입력 864조합과 메타데이터 검사가 통과했다.

## 배포 범위와 한계

운영 기준은 Hosting `66beb76f7bf738fd`다. Firebase/Supabase의 진입 HTML·역할 판별 파일, 모음 HTML, Next 정적 빌드만 변경하며 기존 전체 경로와 Hosting 설정을 보존한다. 저장소에 먼저 들어온 SmartThings/Auth 후속 코드나 서버는 이번 공유 썸네일 배포에 포함하지 않는다. 카카오 로그인·Identity Platform 전환은 사용자의 보류 결정을 유지한다.

카카오 공유 디버거가 로그아웃 상태여서 기존 URL의 캐시 초기화 및 실제 카카오톡/iMessage 수신 카드 검증은 수행하지 않았다. 새 `/share` 주소와 이미지 버전 URL을 제공한다. 이미 보낸 메시지의 카드가 자동 갱신된다고 보장하지 않는다.

배포 계획·보존 검사·공개 응답 검증은 로컬 `tmp/share-preview-20261114/`에 기록하고, 게시 결과는 `workspaces/bapmunna-final/releases/20261114-share-preview.json`에 남긴다.

참고: [Open Graph 규격](https://ogp.me/), [카카오 공유 도구](https://developers.kakao.com/docs/en/tool/common), [이미지 URL 캐시 안내](https://devtalk.kakao.com/t/topic/146695).
