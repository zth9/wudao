from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

DEFAULT_TIME_ZONE = "Asia/Shanghai"


def format_date_in_timezone(date_input: datetime | str | int | float, time_zone: str = DEFAULT_TIME_ZONE) -> str:
    if isinstance(date_input, datetime):
        value = date_input
    elif isinstance(date_input, (int, float)):
        value = datetime.fromtimestamp(date_input)
    else:
        value = datetime.fromisoformat(str(date_input).replace("Z", "+00:00"))

    local_value = value.astimezone(ZoneInfo(time_zone))
    return local_value.strftime("%Y-%m-%d")


def get_current_date_in_default_time_zone(now: datetime | None = None) -> str:
    value = now or datetime.now(tz=ZoneInfo(DEFAULT_TIME_ZONE))
    return format_date_in_timezone(value, DEFAULT_TIME_ZONE)


def normalize_stored_utc_datetime(raw: str | None) -> str | None:
    if not raw:
        return None
    if len(raw) == 19 and "T" not in raw and raw.count(":") == 2:
        return raw.replace(" ", "T") + "Z"
    if len(raw) == 19 and "T" in raw:
        return raw + "Z"
    return raw
