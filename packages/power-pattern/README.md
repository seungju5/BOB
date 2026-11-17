# 전력 패턴 분석 모듈

앱 내부에서 사용할 수 있는, 화면과 독립된 연구용 계산 모듈입니다. `research/prism.mjs`의 `classifyPower()`와 `research/tracker.mjs`의 `createStateTracker()`가 계산을 담당하고, `index.mjs`는 검토용 입력·합성 시나리오 어댑터입니다. 네트워크·DB·파일 저장·알림 발송을 하지 않으며 기존 `lib/judge`나 운영 기준값을 바꾸지 않습니다.

2026-11-17 사용자 결정에 따라 별도 분석 화면은 앱 메뉴에서 제외했고, 예전 `/power` 주소는 기존 로그인·온보딩·홈 진입 과정을 재사용합니다. 완성된 화면은 `codex/power-signature-20261117`의 `ed08360`에 보관합니다. 계산 함수와 검사는 계속 유지하지만, 이것이 SmartThings 실측 수신이나 자동 알림 활성화를 뜻하지는 않습니다.

- `getPowerScenarios()` — 원본 v0.2의 합성 시나리오 8개를 계산합니다. 실제 가구 자료가 아닙니다.
- `parsePowerInput(text)` — 원본 단일 구간 입력 계약의 JSON을 검사하고 추적기를 **한 번만** 실행합니다. 최대 2 MiB, 2,000개 구간이며 임의로 잘라서 성공 처리하지 않습니다. 오류는 안전한 한국어 `PowerInputError.message`로 제공합니다.
- `sampleJSON` — 가족 이름·밥솥 모델·실측 보정값을 포함하지 않는 합성 예제입니다.

불러온 자료는 `source:'imported'`, `privacy:'local-only'`, `analysisMode:'single-window'`입니다. `frames`는 한 개이며 `candidateState`와 연속 확인 후 `state`를 구별합니다. 긴 과거 창을 한 번 넣었다고 이후의 새 관측이 만들어지지 않습니다. `result`의 이유·실제 계산값·추적 단계와 `metadata`의 원본 입력을 로컬 검토용으로 유지합니다. 호출 UI는 화면을 벗어나거나 자료를 지울 때 참조를 해제하고 서버·브라우저 영구 저장소에 보내지 않아야 합니다.

SmartThings `powerMeter` 순간값이나 변경 이벤트를 `complete:true`인 1분 평균으로 변환하지 않습니다. `meanW`는 해당 전체 구간을 관측한 시간 평균, `maxW`는 실제 관측한 최고치여야 합니다. 모르는 최고치를 평균으로 채우지 않습니다. 누락은 `null`, 오프라인·불확실은 `UNKNOWN`이며 식사·건강·알림으로 해석하지 않습니다. 구간·기기·미래·겹침·오차·관측률의 의미 검사는 원본 분류기가 수행합니다. 표시용 행은 이 검사에 통과한 구간만 사용하고 빈 구간을 잇거나 보간하지 않습니다.

모든 출력은 `modeConfirmed:false`, `confidence:null`, `eligibleForNotification:false`입니다. 원본 예시 기준은 미보정 합성값이며 실기기 정확도나 신뢰확률을 뜻하지 않습니다. 이번 공개 어댑터는 연속 샘플 재생을 지원하지 않습니다.

원본은 `output/bapmunna-power-prism-v2-20261117`의 모듈 5개와 검사 파일 5개를 바이트 변경 없이 `research/`에 복사했습니다. `provenance.json`에 원본 SHA-256을 기록했고 어댑터 검사에서 대조합니다. 원본 연구 README의 실제 가구·모델 목록은 포함하지 않았습니다.

```sh
node --test packages/power-pattern/research/*.test.mjs packages/power-pattern/adapter.test.mjs
```
