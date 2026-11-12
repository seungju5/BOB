# 밥뭇나

밥솥 전력 사용 패턴으로 떨어져 사는 부모님의 식사 공백을 파악해, 부양 자녀에게 알려주는 서비스.
테크포임팩트 · 고려대학교(세종) 팀 워밍업.

## 실행

```bash
npm install
```

```bash
npm run dev
```

http://localhost:3000 에서 '보호자로 시작'(온보딩 → 홈)과 '어르신으로 시작'(연결 숫자 → 버튼 3개)을 확인할 수 있습니다.
지금은 **데모 모드**입니다. 데이터는 브라우저 저장소에만 있고, 지난 5주치 밥솥 기록이 미리 채워져 있습니다. 같은 브라우저의 두 탭이 상태를 공유합니다.

```bash
npm test
```

## 문서

CLAUDE.md → brd.md → cps.md → design.md → plan.md → todo.md → test.md (참고: stack.md, adr.md, log.md)

Google·카카오 로그인 콘솔 설정과 검증 순서는 [로그인 연결 가이드](docs/google-kakao-login.md)를 참고하세요.
