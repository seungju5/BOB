# 토끼 캐릭터 수정 기록

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
