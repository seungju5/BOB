// 판단 기준값. 코드에 숫자를 직접 쓰지 말고 여기서 가져다 쓴다.
// (가정) 표시는 밥솥 실측 전 초기값이다. 실측 후 확정하고 adr.md에 근거를 남긴다.
import cookerCriteria from "../server/smartthings/power-criteria.json";

export const COOKER_RECORD_DAYS = cookerCriteria.mealRecordDays;

export const DETECTION = {
  /** 동의한 밥솥 전용 플러그를 삼성에 다시 조회하는 간격(분). */
  POWER_CHECK_INTERVAL_MIN: cookerCriteria.checkIntervalMinutes,
  /** 1분 해상도 입력으로 보온 구간을 계산할 때 한 표본이 차지하는 시간. */
  READING_INTERVAL_MIN: cookerCriteria.readingIntervalMinutes,
  /** 표본 수신 공백과 보온 연속성을 판단하는 간격. */
  MAX_READING_GAP_MIN: cookerCriteria.maxGapMinutes,

  /** 밥솥 플러그에서 한 번이라도 이 전력(W) 이상을 관측하면 취사 신호다. */
  COOK_MIN_WATTS: cookerCriteria.highWatts,
  /** 직전 취사 기준 이상 표본부터 이 시간(분)까지의 후속 표본은 같은 취사 신호로 센다. */
  COOK_MERGE_GAP_MIN: cookerCriteria.mergeGapMinutes,

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
