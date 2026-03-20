from __future__ import annotations

import base64
import json
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo


def to_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)) and value == value:
        return float(value)
    if isinstance(value, str) and value.strip():
        try:
            return float(value)
        except ValueError:
            return None
    return None


def clamp_percent(value: float) -> int:
    return max(0, min(100, round(value)))


def percent_from(value: Any, used: Any = None, total: Any = None) -> int:
    explicit = to_number(value)
    if explicit is not None:
        return clamp_percent(explicit)

    used_num = to_number(used)
    total_num = to_number(total)
    if used_num is None or total_num is None or total_num <= 0:
        return 0
    return clamp_percent((used_num * 100) / total_num)


def parse_json_safe(raw: str) -> Any:
    if not raw.strip():
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"raw": raw}


def normalize_bearer_token(raw: str) -> str:
    token = raw.strip()
    if not token:
        return ""
    if token.lower().startswith("authorization:"):
        token = token.split(":", 1)[1].strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    return token


def normalize_cookie_header(raw: str) -> str:
    cookie = raw.strip()
    if not cookie:
        return ""
    if cookie.lower().startswith("cookie:"):
        cookie = cookie.split(":", 1)[1].strip()
    return cookie


def extract_cookie_value(cookie_header: str, key: str) -> str:
    if not cookie_header:
        return ""
    for pair in cookie_header.split(";"):
        if "=" not in pair:
            continue
        cookie_key, value = pair.split("=", 1)
        if cookie_key.strip() != key:
            continue
        return value.strip()
    return ""


def decode_jwt_payload(token: str) -> dict[str, Any] | None:
    parts = token.split(".")
    if len(parts) < 2:
        return None
    base64_payload = parts[1].replace("-", "+").replace("_", "/")
    padded = base64_payload + ("=" * ((4 - len(base64_payload) % 4) % 4))
    try:
        decoded = base64.b64decode(padded).decode("utf-8")
        payload = json.loads(decoded)
    except Exception:
        return None
    return payload if isinstance(payload, dict) else None


def str_or_empty(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def extract_error(data: Any) -> str:
    if not isinstance(data, dict):
        return ""
    for key in ("msg", "message", "error", "error_message"):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value
    base_resp = data.get("base_resp")
    if isinstance(base_resp, dict):
        status_msg = base_resp.get("status_msg")
        if isinstance(status_msg, str):
            return status_msg
    return ""


def safe_count_detail(used: float | None, total: float | None, suffix: str = "") -> str:
    if used is None or total is None or total <= 0:
        return ""
    safe_used = max(0, min(total, used))
    base = f"{round(safe_used)}/{round(total)}"
    return f"{base} {suffix}".strip()


def join_detail(parts: list[str | None]) -> str | None:
    detail = " · ".join(part.strip() for part in parts if isinstance(part, str) and part.strip())
    return detail or None


def parse_timestamp_ms(value: Any) -> int | None:
    number = to_number(value)
    if number is not None and number > 0:
        if number > 1_000_000_000_000:
            return int(number)
        if number > 1_000_000_000:
            return int(number * 1000)
    if isinstance(value, str) and value.strip():
        try:
            return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp() * 1000)
        except ValueError:
            return None
    return None


def _format_duration_from_seconds(seconds: int) -> str:
    safe = max(0, int(seconds))
    hours = safe // 3600
    minutes = (safe % 3600) // 60
    secs = safe % 60
    if hours > 0:
        return f"{hours}h {minutes}m"
    if minutes > 0:
        return f"{minutes}m {secs}s"
    return f"{secs}s"


def format_refresh_by_timestamp_ms(reset_at_ms: int | None, time_zone: str, include_date: bool = False) -> str:
    if reset_at_ms is None:
        return ""
    remaining_seconds = int((reset_at_ms - int(datetime.now().timestamp() * 1000)) / 1000)
    if remaining_seconds <= 0:
        return ""

    value = datetime.fromtimestamp(reset_at_ms / 1000, tz=ZoneInfo(time_zone))
    clock = value.strftime("%Y-%m-%d %H:%M" if include_date else "%H:%M")
    remain = f"{_format_duration_from_seconds(remaining_seconds)}后刷新"
    return f"{clock} 刷新（{remain}）" if clock else remain


def format_refresh_by_unknown_raw(raw: Any, time_zone: str, include_date: bool = False) -> str:
    seconds = to_number(raw)
    if seconds is None or seconds <= 0:
        return ""
    if seconds > 100_000:
        seconds = seconds / 1000
    reset_at_ms = int(datetime.now().timestamp() * 1000 + seconds * 1000)
    return format_refresh_by_timestamp_ms(reset_at_ms, time_zone, include_date=include_date)


def format_kimi_window_label(window: Any) -> str:
    if not isinstance(window, dict):
        return "每5h额度"
    duration = to_number(window.get("duration"))
    unit = str_or_empty(window.get("timeUnit"))
    if duration is None or duration <= 0:
        return "每5h额度"
    if unit == "TIME_UNIT_MINUTE":
        if duration % 60 == 0:
            return f"每{round(duration / 60)}h额度"
        return f"每{round(duration)}m额度"
    if unit == "TIME_UNIT_HOUR":
        return f"每{round(duration)}h额度"
    if unit == "TIME_UNIT_DAY":
        return f"每{round(duration)}d额度"
    return "每5h额度"


def quota_snapshot_from_detail(detail: Any, fallback_total: Any = None) -> dict[str, Any]:
    if not isinstance(detail, dict):
        detail = {}
    total_value = to_number(detail.get("limit") or detail.get("total") or detail.get("quota") or fallback_total or 100)
    used_raw = to_number(detail.get("used") or detail.get("usage"))
    remaining_raw = to_number(detail.get("remaining") or detail.get("remain") or detail.get("left"))
    used_value = used_raw if used_raw is not None else (total_value - remaining_raw if total_value is not None and remaining_raw is not None else None)
    used_percent = (
        percent_from(None, used_value, total_value)
        if used_value is not None and total_value is not None and total_value > 0
        else clamp_percent(used_value)
        if used_value is not None
        else None
    )
    reset_at_ms = parse_timestamp_ms(detail.get("next_reset_time") or detail.get("nextResetTime") or detail.get("resetTime"))
    return {
        "usedPercent": used_percent,
        "usedValue": used_value,
        "totalValue": total_value,
        "resetAtMs": reset_at_ms,
    }


def quota_snapshot_to_item(label: str, snapshot: dict[str, Any], time_zone: str) -> dict[str, Any] | None:
    used_percent = snapshot.get("usedPercent")
    if used_percent is None:
        return None
    return {
        "label": label,
        "used": used_percent,
        "total": 100,
        "detail": join_detail(
            [
                safe_count_detail(snapshot.get("usedValue"), snapshot.get("totalValue")),
                format_refresh_by_timestamp_ms(snapshot.get("resetAtMs"), time_zone, include_date=True),
            ]
        ),
    }
