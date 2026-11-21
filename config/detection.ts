// 판단 기준값. 코드에 숫자를 직접 쓰지 말고 여기서 가져다 쓴다.
// (가정) 표시는 밥솥 실측 전 초기값이다. 실측 후 확정하고 adr.md에 근거를 남긴다.

export const DETECTION = {
  /** 전력값 수신 간격(분). SmartThings 폴링 주기와 맞춘다. (미확정) */
  READING_INTERVAL_MIN: 1,
  /** 이 간격보다 길게 값이 비면 구간을 끊는다. */
  MAX_READING_GAP_MIN: 3,

  /** 취사로 보는 최소 전력(W). 2026-11-21 화면(전력 해석) 기준 700W 이상으로 통일 (ADR-014). */
  COOK_MIN_WATTS: 700,
  /** 취사로 인정하는 최소 지속 시간(분). 순간 서지와 구분하려고 15분 (ADR-014, 가정). */
  COOK_MIN_MINUTES: 15,
  /** 고전력 구간 사이가 이 시간(분) 이하로 끊기면 한 번의 취사로 합친다. (가정) */
  COOK_MERGE_GAP_MIN: 3,

  /** 보온 상태 전력 범위(W). 화면 기준 20~70W, 20W 미만은 절전 대기 (ADR-014, 미확정: 실측). */
  KEEP_WARM_MIN_WATTS: 20,
  KEEP_WARM_MAX_WATTS: 70,
  /** 보온 상태로 인정하는 최소 지속 시간(분). */
  KEEP_WARM_MIN_MINUTES: 10,

  /** 보온 기준선 대비 이 값(W) 이상 오르면 뚜껑 열림으로 본다. 자연 히터 사이클보다 커야 한다. (미확정: 실측) */
  LID_OPEN_DELTA_WATTS: 60,
  /** 이 시간(분) 안에 연달아 생긴 상승은 한 번의 열림으로 본다. (가정) */
  LID_OPEN_DEBOUNCE_MIN: 10,
} as const;

export const ALERT_DEFAULTS = {
  /** 연속 결식 N끼 (기능정의서 기본값) */
  MISSED_MEALS_THRESHOLD: 2,
  /** 공복시간 주의: 마지막 활동 후 시간 */
  FASTING_HOURS: 48,
  /** 건강 위험 신고: 마지막 활동 후 시간 */
  EMERGENCY_HOURS: 72,
  /** 플러그 미수신 시 기기 확인 알림까지 시간 (가정) */
  DEVICE_OFFLINE_HOURS: 2,
} as const;

/** 원시 전력값 보존 한도(시간). 판정 안 된 값도 이 시간이 지나면 삭제한다. */
export const RAW_RETENTION_HOURS = 24;
