from __future__ import annotations

import asyncio
import os
import subprocess
from typing import Any

import aiohttp

from .db import db
from .usage_utils import (
    decode_jwt_payload,
    extract_cookie_value,
    extract_error,
    format_kimi_window_label,
    format_refresh_by_timestamp_ms,
    format_refresh_by_unknown_raw,
    join_detail,
    normalize_bearer_token,
    normalize_cookie_header,
    parse_json_safe,
    parse_timestamp_ms,
    percent_from,
    quota_snapshot_from_detail,
    quota_snapshot_to_item,
    safe_count_detail,
    str_or_empty,
    to_number,
)

PROVIDER_LINKS = {
    "MiniMax": "https://platform.minimaxi.com/user-center/payment/coding-plan",
    "GLM": "https://bigmodel.cn/usercenter/glm-coding/usage",
    "Kimi": "https://www.kimi.com/code/console",
    "MiMo": "https://platform.xiaomimimo.com/console/plan-manage",
    "Codex": "https://chatgpt.com/codex/cloud/settings/analytics",
}
DEFAULT_TIME_ZONE = "Asia/Shanghai"
KIMI_SCOPE = "FEATURE_CODING"
_env_cache: dict[str, str] = {}


def _get_env(key: str) -> str:
    value = os.environ.get(key)
    if value:
        return value
    if key in _env_cache:
        return _env_cache[key]
    try:
        result = subprocess.run(
            ["fish", "-c", f"echo ${key}"],
            check=False,
            capture_output=True,
            text=True,
        )
        resolved = result.stdout.strip()
    except OSError:
        resolved = ""
    _env_cache[key] = resolved
    return resolved


def _provider_error(provider: str, error: str) -> dict[str, Any]:
    return {"provider": provider, "status": "error", "error": error, "url": PROVIDER_LINKS.get(provider, ""), "items": []}


def _provider_ok(provider: str, items: list[dict[str, Any]]) -> dict[str, Any]:
    return {"provider": provider, "status": "ok", "url": PROVIDER_LINKS.get(provider, ""), "items": items}


def _first_array(*candidates: Any) -> list[Any]:
    for candidate in candidates:
        if isinstance(candidate, list):
            return candidate
    return []


async def _fetch_json(provider: str, url: str, method: str = "GET", headers: dict[str, str] | None = None, body: Any = None) -> dict[str, Any]:
    timeout = aiohttp.ClientTimeout(total=8)
    connector = aiohttp.TCPConnector(ssl=False)
    try:
        async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
            async with session.request(method, url, headers=headers, json=body) as response:
                text = await response.text()
                data = parse_json_safe(text)
                if response.status >= 400:
                    fallback = extract_error(data) or f"HTTP {response.status}"
                    return {"error": _provider_error(provider, fallback)}
                return {"data": data}
    except asyncio.TimeoutError:
        return {"error": _provider_error(provider, "请求超时（8s）")}
    except Exception as exc:
        return {"error": _provider_error(provider, f"请求失败: {exc}")}


def _finalize(provider: str, result: dict[str, Any], parser) -> dict[str, Any]:
    if "error" in result:
        return result["error"]
    items = parser(result.get("data"))
    if not items:
        return _provider_error(provider, extract_error(result.get("data")) or "API 返回格式异常")
    return _provider_ok(provider, items)


# ---------------------------------------------------------------------------
# Adapter base class and registry
# ---------------------------------------------------------------------------

class UsageAdapter:
    provider_key: str = ""
    display_name: str = ""
    default_url: str = ""

    async def fetch(self, auth_token: str, cookie: str) -> dict[str, Any]:
        raise NotImplementedError


class MinimaxAdapter(UsageAdapter):
    provider_key = "minimax"
    display_name = "MiniMax"
    default_url = "https://platform.minimaxi.com/user-center/payment/coding-plan"

    async def fetch(self, auth_token: str, cookie: str) -> dict[str, Any]:
        provider = self.display_name
        token = normalize_bearer_token(auth_token or _get_env("MINIMAX_AUTH_TOKEN"))
        cookie_str = normalize_cookie_header(cookie or _get_env("MINIMAX_COOKIE"))
        if not token and not cookie_str:
            return _provider_error(provider, "MINIMAX_AUTH_TOKEN / MINIMAX_COOKIE 未设置")

        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if cookie_str:
            headers["cookie"] = cookie_str

        result = await _fetch_json(provider, "https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains", headers=headers)

        def parse(data: Any) -> list[dict[str, Any]]:
            remains = _first_array((data or {}).get("model_remains"), ((data or {}).get("data") or {}).get("model_remains"))
            if not remains:
                return []
            detail = remains[0] or {}
            total = to_number(detail.get("current_interval_total_count") or detail.get("currentIntervalTotalCount") or detail.get("total_count"))
            usage_like = to_number(detail.get("current_interval_usage_count") or detail.get("currentIntervalUsageCount") or detail.get("used_count"))
            remains_like = to_number(detail.get("current_interval_remains_count") or detail.get("currentIntervalRemainsCount") or detail.get("remaining_count"))
            if total is None or total <= 0:
                return []
            remaining = remains_like if remains_like is not None else usage_like
            if remaining is None:
                return []
            used = total - max(0, min(total, remaining))
            refresh = format_refresh_by_unknown_raw(detail.get("remains_time") or detail.get("remainsTime") or detail.get("remaining_time"), _get_env("MINIMAX_TIMEZONE") or DEFAULT_TIME_ZONE, include_date=True)
            return [{"label": "Coding Plan", "used": percent_from(None, used, total), "total": 100, "detail": join_detail([safe_count_detail(used, total, "次"), refresh])}]

        return _finalize(provider, result, parse)


class GlmAdapter(UsageAdapter):
    provider_key = "glm"
    display_name = "GLM"
    default_url = "https://bigmodel.cn/usercenter/glm-coding/usage"

    async def fetch(self, auth_token: str, cookie: str) -> dict[str, Any]:
        provider = self.display_name
        cookie_str = cookie or _get_env("GLM_COOKIE")
        auth = auth_token or _get_env("GLM_AUTH_TOKEN")
        if not cookie_str:
            return _provider_error(provider, "GLM_COOKIE 未设置")

        headers = {"accept": "application/json", "cookie": cookie_str}
        if auth:
            headers["authorization"] = f"Bearer {auth}"

        result = await _fetch_json(provider, "https://bigmodel.cn/api/monitor/usage/quota/limit", headers=headers)

        def parse(data: Any) -> list[dict[str, Any]]:
            limits = _first_array(((data or {}).get("data") or {}).get("limits"))
            if not limits:
                return []
            time_zone = _get_env("GLM_TIMEZONE") or DEFAULT_TIME_ZONE
            items: list[dict[str, Any]] = []
            tokens_limit = next((item for item in limits if item.get("type") == "TOKENS_LIMIT"), None)
            if tokens_limit:
                refresh = format_refresh_by_timestamp_ms(parse_timestamp_ms(tokens_limit.get("nextResetTime") or tokens_limit.get("next_reset_time")), time_zone, include_date=True)
                items.append({"label": "每5h额度", "used": percent_from(tokens_limit.get("percentage"), tokens_limit.get("usage"), tokens_limit.get("currentValue")), "total": 100, "detail": join_detail([refresh])})

            time_limit = next((item for item in limits if item.get("type") == "TIME_LIMIT"), None)
            if time_limit:
                refresh = format_refresh_by_timestamp_ms(parse_timestamp_ms(time_limit.get("nextResetTime") or time_limit.get("next_reset_time")), time_zone, include_date=True)
                items.append(
                    {
                        "label": "MCP/月",
                        "used": percent_from(time_limit.get("percentage"), time_limit.get("currentValue"), time_limit.get("usage")),
                        "total": 100,
                        "detail": join_detail([safe_count_detail(to_number(time_limit.get("currentValue")), to_number(time_limit.get("usage"))), refresh]),
                    }
                )
            return items

        return _finalize(provider, result, parse)


class KimiAdapter(UsageAdapter):
    provider_key = "kimi"
    display_name = "Kimi"
    default_url = "https://www.kimi.com/code/console"

    def _resolve_auth(self, auth_token: str, cookie: str) -> dict[str, str]:
        cookie_str = normalize_cookie_header(cookie or _get_env("KIMI_COOKIE"))
        auth = normalize_bearer_token(auth_token or _get_env("KIMI_AUTH_TOKEN"))
        cookie_token = normalize_bearer_token(extract_cookie_value(cookie_str, "kimi-auth"))

        token = next((candidate for candidate in [cookie_token, auth] if candidate and not candidate.startswith("sk-")), "")

        if not token and not cookie_str:
            return {"token": "", "cookie": "", "error": "KIMI_AUTH_TOKEN / KIMI_COOKIE 未设置（需使用浏览器 kimi-auth JWT）"}

        if not token and cookie_str and not cookie_token:
            return {"token": "", "cookie": cookie_str, "error": "KIMI_COOKIE 缺少 kimi-auth 字段，且未提供独立的 KIMI_AUTH_TOKEN"}

        return {"token": token, "cookie": cookie_str}

    async def fetch(self, auth_token: str, cookie: str) -> dict[str, Any]:
        provider = self.display_name
        auth = self._resolve_auth(auth_token, cookie)
        if auth.get("error"):
            return _provider_error(provider, auth["error"])

        token = auth["token"]
        cookie_str = auth["cookie"]
        jwt_payload = decode_jwt_payload(token) if token else None
        time_zone = _get_env("KIMI_TIMEZONE") or DEFAULT_TIME_ZONE

        headers = {
            "accept": "*/*",
            "Content-Type": "application/json",
            "connect-protocol-version": "1",
            "origin": "https://www.kimi.com",
            "referer": "https://www.kimi.com/code/console",
            "r-timezone": time_zone,
            "x-language": _get_env("KIMI_LANGUAGE") or "zh-CN",
            "x-msh-platform": "web",
            "x-msh-version": "1.0.0",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if cookie_str:
            headers["cookie"] = cookie_str
        elif token:
            headers["cookie"] = f"kimi-auth={token}"

        if jwt_payload:
            device_id = _get_env("KIMI_DEVICE_ID") or str_or_empty(jwt_payload.get("device_id")) or str_or_empty(jwt_payload.get("deviceId"))
            session_id = _get_env("KIMI_MSH_SESSION_ID") or _get_env("KIMI_SESSION_ID") or str_or_empty(jwt_payload.get("ssid")) or str_or_empty(jwt_payload.get("sessionId"))
            traffic_id = _get_env("KIMI_TRAFFIC_ID") or str_or_empty(jwt_payload.get("sub")) or str_or_empty(jwt_payload.get("userId"))
            if device_id:
                headers["x-msh-device-id"] = device_id
            if session_id:
                headers["x-msh-session-id"] = session_id
            if traffic_id:
                headers["x-traffic-id"] = traffic_id

        result = await _fetch_json(
            provider,
            "https://www.kimi.com/apiv2/kimi.gateway.billing.v1.BillingService/GetUsages",
            method="POST",
            headers=headers,
            body={"scope": [KIMI_SCOPE]},
        )

        def parse(data: Any) -> list[dict[str, Any]]:
            usages = _first_array(((data or {}).get("data") or {}).get("usages"), (data or {}).get("usages"))
            if not usages:
                return []
            usage = next((item for item in usages if item.get("scope") == KIMI_SCOPE or item.get("feature") == KIMI_SCOPE), usages[0])
            items: list[dict[str, Any]] = []
            weekly_snapshot = quota_snapshot_from_detail(usage.get("detail") or {}, 100)
            weekly = quota_snapshot_to_item("每周额度", weekly_snapshot, time_zone)
            if weekly:
                items.append(weekly)

            windows = _first_array(usage.get("limits"))
            five_hour_window = next(
                (
                    window
                    for window in windows
                    if str_or_empty((window.get("window") or {}).get("timeUnit")) == "TIME_UNIT_MINUTE"
                    and to_number((window.get("window") or {}).get("duration")) == 300
                ),
                windows[0] if windows else None,
            )
            if five_hour_window:
                window_item = quota_snapshot_to_item(
                    format_kimi_window_label(five_hour_window.get("window")),
                    quota_snapshot_from_detail(five_hour_window.get("detail") or {}, weekly_snapshot.get("totalValue") or 100),
                    time_zone,
                )
                if window_item:
                    items.insert(0, window_item)
            return items

        return _finalize(provider, result, parse)


class MimoAdapter(UsageAdapter):
    provider_key = "mimo"
    display_name = "MiMo"
    default_url = "https://platform.xiaomimimo.com/console/plan-manage"

    async def fetch(self, auth_token: str, cookie: str) -> dict[str, Any]:
        provider = self.display_name
        cookie_str = normalize_cookie_header(cookie or _get_env("MIMO_COOKIE"))
        if not cookie_str:
            return _provider_error(provider, "MIMO_COOKIE 未设置")

        headers = {
            "accept": "*/*",
            "accept-language": "zh",
            "content-type": "application/json",
            "x-timezone": _get_env("MIMO_TIMEZONE") or DEFAULT_TIME_ZONE,
            "cookie": cookie_str,
        }

        result = await _fetch_json(
            provider,
            "https://platform.xiaomimimo.com/api/v1/tokenPlan/usage",
            headers=headers,
        )

        def parse(data: Any) -> list[dict[str, Any]]:
            items: list[dict[str, Any]] = []
            usage_data = (data or {}).get("data") or {}

            usage_items = _first_array((usage_data.get("usage") or {}).get("items"))
            plan_item = next(
                (item for item in usage_items if item.get("name") == "plan_total_token"),
                usage_items[0] if usage_items else None,
            )
            if plan_item:
                used = to_number(plan_item.get("used"))
                limit = to_number(plan_item.get("limit"))
                if limit is not None and limit > 0:
                    items.append({
                        "label": "套餐额度",
                        "used": percent_from(None, used, limit),
                        "total": 100,
                        "detail": safe_count_detail(used, limit, "tokens"),
                    })

            month_items = _first_array((usage_data.get("monthUsage") or {}).get("items"))
            month_item = next(
                (item for item in month_items if item.get("name") == "month_total_token"),
                month_items[0] if month_items else None,
            )
            if month_item:
                used = to_number(month_item.get("used"))
                limit = to_number(month_item.get("limit"))
                if limit is not None and limit > 0:
                    items.append({
                        "label": "月度用量",
                        "used": percent_from(None, used, limit),
                        "total": 100,
                        "detail": safe_count_detail(used, limit, "tokens"),
                    })

            return items

        return _finalize(provider, result, parse)


class CodexAdapter(UsageAdapter):
    provider_key = "codex"
    display_name = "Codex"
    default_url = "https://chatgpt.com/codex/cloud/settings/analytics"

    async def fetch(self, auth_token: str, cookie: str) -> dict[str, Any]:
        provider = self.display_name
        if not auth_token:
            return _provider_error(provider, "Codex 认证 Token 未设置")

        headers = {
            "accept": "*/*",
            "authorization": f"Bearer {auth_token}",
        }
        if cookie:
            headers["cookie"] = cookie

        result = await _fetch_json(
            provider,
            "https://chatgpt.com/backend-api/wham/usage",
            headers=headers,
        )

        def parse(data: Any) -> list[dict[str, Any]]:
            rate_limit = (data or {}).get("rate_limit")
            if not rate_limit:
                return []
            items: list[dict[str, Any]] = []

            primary = rate_limit.get("primary_window")
            if primary:
                used_percent = to_number(primary.get("used_percent"))
                if used_percent is not None:
                    reset_at = parse_timestamp_ms(primary.get("reset_at"))
                    refresh = format_refresh_by_timestamp_ms(reset_at, DEFAULT_TIME_ZONE, include_date=True)
                    items.append({
                        "label": "每5h额度",
                        "used": used_percent,
                        "total": 100,
                        "detail": join_detail([refresh]),
                    })

            secondary = rate_limit.get("secondary_window")
            if secondary:
                used_percent = to_number(secondary.get("used_percent"))
                if used_percent is not None:
                    reset_at = parse_timestamp_ms(secondary.get("reset_at"))
                    refresh = format_refresh_by_timestamp_ms(reset_at, DEFAULT_TIME_ZONE, include_date=True)
                    items.append({
                        "label": "每周额度",
                        "used": used_percent,
                        "total": 100,
                        "detail": join_detail([refresh]),
                    })

            return items

        return _finalize(provider, result, parse)


ADAPTERS: dict[str, UsageAdapter] = {
    "minimax": MinimaxAdapter(),
    "glm": GlmAdapter(),
    "kimi": KimiAdapter(),
    "mimo": MimoAdapter(),
    "codex": CodexAdapter(),
}


async def fetch_all_trackers() -> list[dict[str, Any]]:
    trackers = db.query_all(
        "SELECT id, provider, name, auth_token, cookie, url FROM usage_trackers WHERE enabled = 1 ORDER BY sort_order ASC, created_at ASC"
    )
    if not trackers:
        return []

    async def _fetch_one(tracker: dict[str, Any]) -> dict[str, Any]:
        adapter = ADAPTERS.get(tracker["provider"])
        if not adapter:
            return {
                "tracker_id": tracker["id"],
                "tracker_name": tracker["name"],
                "provider": tracker["provider"],
                "status": "error",
                "error": f"未知的供应商类型: {tracker['provider']}",
                "url": tracker.get("url") or "",
                "items": [],
            }

        result = await adapter.fetch(
            str_or_empty(tracker.get("auth_token")),
            str_or_empty(tracker.get("cookie")),
        )
        result["tracker_id"] = tracker["id"]
        result["tracker_name"] = tracker["name"]
        if tracker.get("url"):
            result["url"] = tracker["url"]
        return result

    return list(await asyncio.gather(*[_fetch_one(t) for t in trackers]))


async def fetch_all_providers() -> list[dict[str, Any]]:
    return await fetch_all_trackers()
