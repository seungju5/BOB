"""Read-only SmartThings device check. Run directly in a local terminal."""
import getpass
import json
import math
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import HTTPRedirectHandler, Request, build_opener

ORIGIN = "https://api.smartthings.com/v1"


class NoRedirect(HTTPRedirectHandler):
    # A bearer token must only reach the exact SmartThings origin.
    def redirect_request(self, *_args, **_kwargs):
        return None


def read(path, token):
    request = Request(ORIGIN + path, headers={"Authorization": "Bearer " + token, "Accept": "application/json"})
    with build_opener(NoRedirect()).open(request, timeout=15) as response:
        return json.load(response)


def main():
    if not sys.stdin.isatty():
        print("토큰이 노출되지 않도록 이 파일은 터미널에서 직접 실행해 주세요.")
        return 2
    token = getpass.getpass("SmartThings 테스트 토큰 (입력은 표시되지 않아요): ").strip()
    if not re.fullmatch(r"[A-Za-z0-9._~-]{20,4096}", token):
        print("토큰 형식을 확인해 주세요.")
        return 2
    stage = "기기 목록"
    try:
        listing = read("/devices", token)
        devices = listing.get("items", [])
        print(f"기기 목록 조회 성공 · HTTP 200 · {len(devices)}대")
        candidates = []
        for device in devices:
            device_id = device.get("deviceId")
            if not device_id or not re.fullmatch(r"[0-9a-fA-F-]{36}", device_id):
                continue
            for component in device.get("components", []):
                component_id = component.get("id")
                if component_id and any(capability.get("id") == "powerMeter" for capability in component.get("capabilities", [])):
                    raw_label = device.get("label") or device.get("name") or "이름 없는 플러그"
                    label = "".join(char for char in raw_label if char.isprintable())[:70]
                    candidates.append((label, device_id, component_id))
                    break
        if not candidates:
            print("전력 측정(powerMeter) 플러그가 없어요. SmartThings 앱에서 등록 여부와 지원 기능을 확인해 주세요.")
            return 1
        for i, (label, _, _) in enumerate(candidates, 1):
            print(f"{i}. {label}")
        selection = input("밥솥에 꽂은 플러그 번호: ").strip()
        if not selection.isdecimal() or len(selection) > 5 or not 1 <= int(selection) <= len(candidates):
            print("기기 번호를 확인해 주세요.")
            return 2
        _, device_id, component = candidates[int(selection) - 1]
        stage = "플러그 전력"
        status = read(f"/devices/{device_id}/components/{quote(component, safe='')}/capabilities/powerMeter/status", token)
        value = status.get("power", {}).get("value")
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            print("HTTP 200이지만 전력값을 확인할 수 없어요. 앱에서 기기 상태를 확인해 주세요.")
            return 1
        print("플러그 전력 직접 조회 성공 · HTTP 200")
        print("이 결과는 한 번의 직접 조회입니다. 앱의 장기 OAuth나 자동 신호 수신을 확인한 것은 아닙니다.")
        return 0
    except HTTPError as error:
        hint = {401: "토큰이 잘못됐거나 만료됐어요.", 403: "기기 읽기 권한을 확인해 주세요.", 404: "기기나 전력 측정 기능을 찾지 못했어요.", 429: "잠시 뒤 다시 시도해 주세요."}
        print(f"{stage} 확인 실패 · HTTP {error.code} · {hint.get(error.code, '잠시 뒤 다시 확인해 주세요.')}")
        return 1
    except (URLError, TimeoutError, OSError, ValueError, AttributeError):
        print(f"{stage} 결과를 확인하지 못했어요. 인터넷 연결과 SmartThings 앱에서 기기 상태를 확인해 주세요.")
        return 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (KeyboardInterrupt, EOFError):
        print("\n확인을 취소했어요.")
        sys.exit(2)
