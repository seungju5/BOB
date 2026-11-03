# 캐릭터 수정 기록

## 2026-11-03 · 처음 만든 3D 토끼로 통일

- 사용자 요청: 처음 만든 더 입체감 있는 귀여운 토끼를 앱·Figma·GitHub에 반영.
- 선택: `docs/assets/bunny.png`, 480×480 RGBA. 초록 가디건, 클립보드, 접힌 귀, 둥근 눈의 원본을 재사용한다. 새 이미지 생성·픽셀 편집은 하지 않았다.
- 적용: 시작·로그인·역할별 홈·기기 연결·체험 화면, Figma 6개 설계 화면, API/OAuth 설명 PDF. 귀와 발이 잘리지 않도록 전체 이미지를 표시한다.
- 이전 손그림 변형 `bunny-natural.png`과 기존 소개 영상은 제작 이력으로 보존한다. 영상 생성 스크립트는 원본 3D 토끼를 참조한다.
- 캐릭터 표정은 식사·건강 판정이 아니며, 현재 SmartThings의 공개 서버·사용자 OAuth·자동 수신 미검증 상태는 그대로다.

## 2026-10-17 · 사용자 제공 밥솥 친구

- 참조: 사용자가 직접 첨부한 `codex-clipboard-02e1385e-3d91-47fd-b82b-3af6d6466e86.png`.
- 방식: 내장 image generation의 참조 이미지 편집. 노란 배경·검은 테두리·배경 별을 제거하는 투명 PNG 시안. 픽셀 단위로 완전히 동일한 자동 추출이라고 주장하지 않는다.
- 보존: 크림색 밥솥, 열린 뚜껑, 웃는 밥, 볼터치, 갈색 윤곽, 노란 띠, 옆의 김.
- 결과: `docs/assets/rice-cooker-companion.png`, 1254×1254 RGBA. 원본 및 이전 `rice-companion.svg`는 삭제하지 않는다.
- 적용: 시니어 소식 행, 보호자의 안부 카드 제목, 센서 체험 전력값 옆. UI에서 투명 여백만 프레이밍하고 PNG는 재가공하지 않는다. 장식용 빈 alt와 aria-hidden을 사용하며 동작 줄이기 설정에서는 등장 효과가 없다.
- 토끼·로고·데이터에 따라 달라지는 밥그릇은 유지. 소개 영상은 재제작하지 않음. 운영 사이트 배포는 별도 작업.

### 편집 프롬프트 (내장 도구)

```text
Edit the supplied image for a Korean elder-care web app asset. Background extraction only: remove the yellow rectangular background, black outer border, and the isolated lower-right sparkle. Preserve the central adorable cream electric rice cooker mascot with its tilted open lid, smiling rice mound, dark cocoa hand-drawn outlines, tiny pink cheeks, yellow trim, small feet and side handles, and the small steam marks immediately beside its lid. Keep the exact character identity, pose, proportions, expression, warm illustration texture, and original colors; do not redesign or add anything. Output a genuinely transparent RGBA cutout, not a checkerboard drawn in the image. Center the full mascot and nearby steam in a snug square canvas with about 8% transparent padding so it reads clearly at small UI sizes. No text, no drop shadow, no extra elements.
```

## 2026-10-16 · 토끼

2026-10-16. 기존 밥뭇나 토끼의 정체성을 유지하고 부드러운 손그림 질감, 자연스러운 비대칭 자세, 절제된 눈빛으로 다듬었습니다. 초록 카디건·클립보드·접힌 귀를 유지했습니다. 사람이 직접 그렸다고 주장하지 않습니다.

- 방식: 내장 image generation 도구의 참조 이미지 편집, 투명 배경.
- 원본: `docs/assets/bunny.png` (보존).
- 결과: `docs/assets/bunny-natural.png` (신규 파일).
- 적용: 앱의 토끼 이미지 참조를 새 파일로 교체. 기존 점프 인사와 모션 줄이기 설정 유지.
- 기존 MP4 파일은 다시 제작하지 않았습니다. 새 토끼의 웹 인사는 이미지와 CSS 애니메이션입니다.
- 작은 `rice-companion.svg`는 루트 `components/Mascot.tsx`의 따뜻한 표정·밥 이미지를 참고한 별도 코드 기반 장식입니다. 주요 토끼·브랜드 로고를 대체하지 않습니다.

## 사용한 편집 프롬프트

```text
Use case: style-transfer / identity-preserve edit. Image 1 is the edit target: the established Bapmunna care-app rabbit mascot. Refine this SAME bunny so it feels like a lovingly hand-painted illustrator's character, not a glossy CGI toy. Preserve the cream-white rabbit, one upright ear and one softly folded ear, sage-green knitted cardigan with oatmeal ribbing, tiny heart brooch, small clipboard and pencil, full-body upright pose and calm friendly expression. Make the posture a little relaxed and naturally asymmetrical, expression gentle rather than exaggerated, eyes small warm cocoa with restrained highlights. Use delicate watercolor and colored-pencil edges, matte gouache softness and subtle organic fabric detail, understated peach cheeks, tasteful sophisticated Korean picture-book warmth. Keep silhouette clear and adorable at 160px in a yellow/cream mobile interface. Single character only, centered full body with ears and feet entirely visible, generous small transparent padding. Genuinely transparent background, no ground or painted backdrop, no hard shadow, no text or watermark. No additional props, no huge glassy eyes, no plastic sheen, no excessive fur noise, no extra fingers or limbs. This is a refinement, not a redesign.
```
