import type { SmartThingsConnection } from "@/lib/firebase/smartthings";

export type DisplayStage = SmartThingsConnection["stage"] | "checking" | "consent_required";

export const stageCopy: Record<DisplayStage, { title: string; detail: string }> = {
  checking: { title: "기기 상태를 확인하고 있어요", detail: "내 밥뭇나 계정에 저장된 연결을 확인하고 있어요." },
  consent_required: { title: "먼저 어르신의 동의를 확인해 주세요", detail: "어떤 기기 정보를 쓸지 함께 읽고, 설정의 ‘기기’에서 동의 확인을 저장해 주세요." },
  setup_required: { title: "삼성 기기 연결을 준비하고 있어요", detail: "지금은 SmartThings 앱에 우리 집 스마트플러그를 등록해 둘 수 있어요." },
  read_error: { title: "기기 상태를 확인하지 못했어요", detail: "잠시 후 연결 상태를 다시 확인해 주세요." },
  disconnected: { title: "삼성 계정 연결하기", detail: "밥솥에 쓰는 플러그를 SmartThings 앱에 등록한 뒤, 여기서 삼성 계정을 연결해 주세요." },
  choose_device: { title: "밥솥에 꽂은 플러그를 골라 주세요", detail: "삼성 계정의 허용을 확인했어요. 전력을 측정할 수 있는 플러그 중 하나를 골라요." },
  subscribing: { title: "플러그의 자동 알림을 연결하고 있어요", detail: "플러그는 선택됐어요. 기기 알림 받기가 끝나지 않았다면 같은 플러그로 다시 시도할 수 있어요." },
  connected: { title: "플러그가 연결됐어요", detail: "직접 전력을 조회하거나 플러그가 자동으로 보낸 신호의 도착 시각을 확인해 보세요." },
  reconnect_required: { title: "삼성 계정을 다시 연결해 주세요", detail: "삼성 화면에서 밥뭇나에 허용할 기기와 ‘기기 읽기’ 권한을 다시 확인해 주세요. 밥뭇나에서는 정확한 허용 종료일을 확인할 수 없어요." },
};

export function deviceStageCopy(stage: DisplayStage, isVirtual?: boolean) {
  if (stage === "connected" && isVirtual) {
    return { title: "테스트 플러그가 연결됐어요", detail: "측정 신호와 시각은 삼성 가상 기기의 기록이에요." };
  }
  return stageCopy[stage];
}

const errorCopy: Record<string, string> = {
  unclassified_device: "기기 종류를 확인할 수 없어요. 실물 밥솥 플러그를 선택해 주세요.",
  setup_required: "삼성 기기 연결을 준비하고 있어요. 잠시 후 상태를 다시 확인해 주세요.",
  login_required: "밥뭇나 로그인 시간이 지났어요. 내 계정으로 다시 로그인해 주세요.",
  verified_email_required: "밥뭇나 이메일 인증을 마친 뒤 다시 시도해 주세요.",
  consent_required: "설정의 기기 메뉴에서 어르신의 정보 이용 동의를 다시 확인해 주세요.",
  consent_updated: "삼성 연결 동의 안내가 바뀌었어요. 새 안내가 반영된 화면에서 내용을 읽고 다시 연결해 주세요.",
  permission_required: "삼성에서 기기 읽기를 허용했는지 확인해 주세요.",
  plan_required: "삼성에서 이 연결을 허용하지 않았어요. 밥뭇나 운영팀의 확인이 필요해요.",
  pilot_invite_required: "지금은 초대받은 가구만 밥솥을 새로 연결할 수 있어요. 참여를 원하시면 밥뭇나 운영팀에 문의해 주세요.",
  invalid_authorization: "삼성 로그인 주소를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
  storage_unavailable: "이 브라우저에 연결 진행 상태를 잠시 보관할 수 없어요. Safari 또는 Chrome의 일반 탭에서 다시 시도해 주세요.",
  attempt_cancelled: "이 연결 요청은 종료됐어요. 원할 때 다시 시작해 주세요.",
  already_connected: "이미 삼성 연결이 있어요. 연결 상태를 새로 확인해 주세요.",
  choose_device: "먼저 밥솥에 사용하는 스마트플러그를 선택해 주세요.",
  disconnect_first: "다른 플러그를 쓰려면 기존 연결을 먼저 해제해 주세요.",
  power_not_supported: "이 기기는 전력 측정을 제공하지 않아요. 다른 플러그를 선택해 주세요.",
  test_device: "삼성에 가상 기기로 등록된 플러그예요. 밥솥이 꽂힌 실물 플러그에서 알림을 켜 주세요.",
  power_notice_required: "실물 밥솥 플러그에서 취사 신호 알림을 먼저 켜 주세요.",
  ambiguous_meter: "이 기기에서 밥솥 전력계 한 개를 구분할 수 없어요. 밥솥에 연결한 단일 전력 측정 플러그를 선택해 주세요.",
  device_missing: "삼성에서 그 기기를 찾지 못했어요. SmartThings 앱에서 확인해 주세요.",
  check_later: "방금 확인했어요. 30초 후 다시 시도해 주세요.",
  rate_limited: "삼성에 요청이 많아요. 조금 뒤 다시 시도해 주세요.",
  reconnect_required: "삼성의 허용을 다시 확인해야 해요. 삼성 계정을 다시 연결해 주세요.",
  timeout: "확인이 늦어지고 있어요. 연결 상태를 다시 확인한 후에 진행해 주세요.",
};

export function smartThingsErrorMessage(code: string) {
  return Object.hasOwn(errorCopy, code) ? errorCopy[code] : "요청 결과를 확인하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.";
}

const date = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });
export function formatDeviceTime(value: number) { return date.format(value); }

export function callbackMessage(result: string | null) {
  switch (result) {
    case "connected": return "삼성 화면에서 돌아왔어요. 아래에서 내 계정의 연결 상태를 확인하세요.";
    case "cancelled": return "삼성 연결을 취소했어요. 원할 때 다시 시작할 수 있어요.";
    case "disconnect_first": return errorCopy.disconnect_first;
    case "pilot_invite_required": return errorCopy.pilot_invite_required;
    case "failed": return "삼성 연결을 마치지 못했어요. 아래에서 연결 상태를 확인한 뒤 다시 시도해 주세요.";
    default: return "";
  }
}
