from __future__ import annotations

import json
import logging
import os
from typing import Any

from ..logger import logger

DEFAULT_MAX_DEBUG_LOG_CHARS = 20000
DEFAULT_TEXT_PREVIEW_CHARS = 800
DEFAULT_SUMMARY_ITEMS = 6


def _max_debug_log_chars() -> int:
    raw = os.environ.get("WUDAO_AGENT_DEBUG_LOG_MAX_CHARS")
    if raw is None:
        return DEFAULT_MAX_DEBUG_LOG_CHARS
    try:
        return max(0, int(raw))
    except ValueError:
        return DEFAULT_MAX_DEBUG_LOG_CHARS


def _text_preview_chars() -> int:
    raw = os.environ.get("WUDAO_AGENT_DEBUG_TEXT_PREVIEW_CHARS")
    if raw is None:
        return DEFAULT_TEXT_PREVIEW_CHARS
    try:
        return max(0, int(raw))
    except ValueError:
        return DEFAULT_TEXT_PREVIEW_CHARS


def _safe_json(value: Any) -> str:
    try:
        rendered = json.dumps(value, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        rendered = str(value)

    max_chars = _max_debug_log_chars()
    if max_chars > 0 and len(rendered) > max_chars:
        return f"{rendered[:max_chars]}...<truncated {len(rendered) - max_chars} chars>"
    return rendered


def debug_text(value: Any) -> dict[str, Any]:
    text = "" if value is None else str(value)
    limit = _text_preview_chars()
    truncated = limit > 0 and len(text) > limit
    return {
        "preview": f"{text[:limit]}...<truncated {len(text) - limit} chars>" if truncated else text,
        "length": len(text),
        "truncated": truncated,
    }


def debug_value_summary(value: Any, *, depth: int = 2) -> Any:
    if isinstance(value, str):
        return debug_text(value)
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, dict):
        keys = [str(key) for key in value.keys()]
        if depth <= 0:
            return {"type": "object", "keys": keys, "size": len(value)}
        fields: dict[str, Any] = {}
        for index, (key, item) in enumerate(value.items()):
            if index >= DEFAULT_SUMMARY_ITEMS:
                break
            fields[str(key)] = debug_value_summary(item, depth=depth - 1)
        return {
            "type": "object",
            "keys": keys,
            "size": len(value),
            "fields": fields,
        }
    if isinstance(value, (list, tuple)):
        return {
            "type": "array",
            "length": len(value),
            "items": [
                debug_value_summary(item, depth=depth - 1)
                for item in list(value)[:DEFAULT_SUMMARY_ITEMS]
            ] if depth > 0 else [],
        }
    return debug_text(value)


def agent_debug_log(event: str, **fields: Any) -> None:
    if not logger.isEnabledFor(logging.DEBUG):
        return
    logger.debug("agent_runtime.%s %s", event, _safe_json(fields))
