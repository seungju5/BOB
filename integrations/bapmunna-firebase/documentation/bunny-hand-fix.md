# 손 인사 시 얼굴·손 일그러짐 수정 · 2026-11-04

## 문제와 수정

이전 연속 메시의 팔 가중치가 볼·턱까지 포함했고, 손 내부에도 서로 다른 변형량을 적용했다. 메시가 뒤집히지 않는 검사만으로는 얼굴·손 모양 보존을 보장할 수 없었다.

원본을 **몸통·얼굴 / 손·연필 / 가려진 부분 복원**으로 분리했다. 얼굴과 몸통에는 손 회전 행렬을 적용하지 않는다. 손·연필은 원본 픽셀 한 조각으로, 손목을 중심으로 회전·이동만 한다. 비균일 확대·축소, 전단, 피부 가중치와 눈 압축을 제거했다. 눈은 원본 표정으로 유지한다. 두 번의 점프·그림자·마지막 가벼운 인사는 3.6초로 유지한다.

Canvas 2D로 표시하며 WebGL·셰이더·새 실행 라이브러리는 필요 없다. 모션 줄이기, 숨긴 탭 일시 정지, 재생 중 화면 이동, 반복 클릭, 로딩 실패 원본 대체 동작을 유지한다. 원본 또는 복원 이미지가 준비되지 않으면 원본을 숨기지 않는다.

손이 이동한 자리에 원래 손이나 연필 그림자가 남지 않도록 가려진 옷·털 부분만 복원한다. 복원 이미지 전체를 새 캐릭터로 사용하지 않는다. 이동하는 손과 화면에 보이는 얼굴·소품은 기존 `bunny.png`를 사용한다. 좁은 복원 경계는 부드럽게 이어 붙였다.

## 검증

- 단위 56개 중 인사 제어·얼굴 고정·손 모양 보존·복원 자산 실패 검사 14개 통과.
- 실제 렌더러가 사용하는 변환 행렬에서 손·연필 점 간 거리와 면적이 모든 동작 시각에 보존됨을 검사.
- 브라우저 원본/최대 회전/복귀 렌더에서 눈·코·입·볼 영역(원본 좌표 x=120–330, y=145–239)의 RGBA 최대 차이 **0/255**. 턱의 연필 뒤 가림 영역은 복원 영역이므로 이 픽셀 비교에서 제외한다.
- 320/390px 앱 화면, 확대된 손·연필 경계, 재생 중 어르신용 진입, Next.js 프로덕션 390px 화면 확인.
- Firebase 58개 시나리오·31개 워크시트·9개 역할·8개 관리·41개 동등성/체험 검사, TypeScript, 디자인 일치, Firebase 빌드, Next.js Webpack 빌드 통과.
- Synagogue 58+31+9 검사와 단일 파일 빌드 통과. 공개 배포 영수증은 `bunny-greeting-release.json` 참조.

## 복원 자산과 생성 기록

- 원본: `docs/assets/bunny.png`, 변경 없음. SHA-256 `87d86ce95e85f69168a6720419fd0cc3a22f32a67f13db2dea37e96e626f19f6`.
- 복원 자산: [bunny-underlay.webp](../docs/assets/bunny-underlay.webp), 480×480 RGBA. Next.js의 `public/brand/`에 같은 파일을 동기화한다.
- 생성 도구: **내장 image_gen** 편집. CLI/API 대체 도구 사용 없음.
- 생성 원본: `output/bapmunna-rigid-hand-20261104/bunny-underlay-source.png`. 프로젝트 배포 자산은 기존 sharp로 480px WebP 인코딩했다.
- 입력: 원래 초록 가디건 토끼 `bunny.png`. 투명 배경 유지.
- 복원 WebP SHA-256: `910701b6351d1e600e776ed240c1406388b9d73b9c7c8af4284a543454a7d82a`.

최종 프롬프트:

```text
Use case: precise-object-edit. Edit target: the supplied transparent original bunny. Produce a clean background/body plate for a cutout animation, not a redesigned mascot. Remove ONLY the viewer-left white paw, its cream knitted cuff and the pencil it holds (the raised hand crossing the left side of the chest). Reconstruct the sage-green cardigan and the tiny area of cream fur that were hidden behind that paw/cuff/pencil. Keep the upper left green sleeve, other clipboard-holding arm, clipboard, face, glossy eyes, nose, mouth, both ears, legs, every proportion, exact camera view, original silhouette, original placement and size completely unchanged. The viewer-left arm should now blend into the green torso, with no white hand and no pencil visible. Do not add a replacement arm or accessory. Match the original fine plush fur, knitted stitches, warm soft studio lighting, colors and shadows. Same square framing, same subject registration as the input, no zoom or re-composition. Actual transparent background. This is an internal occlusion-repair plate: only the previously hidden patch of cardigan/fur will be used; the visible original face and original hand pixels will remain in the final animation.
```
