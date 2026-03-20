from __future__ import annotations

import base64
import json
from datetime import datetime, timezone
from typing import Any

from .db import db

DUE_AT_NULL_SORT_KEY = "9999-12-31T23:59:59.999Z"
TASK_SORT_FIELDS = {"updated_at", "created_at", "priority", "due_at"}


class InvalidInputError(ValueError):
    pass


def _parse_integer(value: Any, field: str) -> int:
    if isinstance(value, bool):
        raise InvalidInputError(f"{field} must be an integer")
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip() and value.strip().lstrip("-").isdigit():
        return int(value.strip())
    raise InvalidInputError(f"{field} must be an integer")


def is_task_sort_field(value: str) -> bool:
    return value in TASK_SORT_FIELDS


def parse_bounded_integer(value: Any, min_value: int, max_value: int, field: str) -> int | None:
    if value is None:
        return None
    parsed = _parse_integer(value, field)
    if parsed < min_value or parsed > max_value:
        raise InvalidInputError(f"{field} must be between {min_value} and {max_value}")
    return parsed


def parse_pagination_limit(value: Any, fallback: int = 20, max_value: int = 100) -> int:
    if value is None:
        return fallback
    parsed = _parse_integer(value, "limit")
    if parsed <= 0:
        raise InvalidInputError("limit must be a positive integer")
    return min(parsed, max_value)


def parse_due_at(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise InvalidInputError("due_at must be null or a valid ISO date string")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise InvalidInputError("due_at must be null or a valid ISO date string") from exc
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def to_due_at_sort_key(due_at: str | None) -> str:
    return due_at or DUE_AT_NULL_SORT_KEY


def encode_task_cursor(cursor: dict[str, Any]) -> str:
    raw = json.dumps(cursor, ensure_ascii=False).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_task_cursor(raw: str | None, sort: str) -> dict[str, Any] | None:
    if not raw:
        return None
    try:
        padded = raw + ("=" * ((4 - len(raw) % 4) % 4))
        parsed = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
    except Exception as exc:
        raise InvalidInputError("cursor is invalid") from exc
    if not isinstance(parsed, dict):
        raise InvalidInputError("cursor is invalid")
    if parsed.get("sort") != sort:
        raise InvalidInputError("cursor sort does not match request sort")
    if not isinstance(parsed.get("id"), str) or not parsed["id"]:
        raise InvalidInputError("cursor is invalid")
    priority = parse_bounded_integer(parsed.get("priority"), 0, 4, "cursor.priority")
    if priority is None:
        raise InvalidInputError("cursor is invalid")
    if not isinstance(parsed.get("updated_at"), str) or not isinstance(parsed.get("due_key"), str):
        raise InvalidInputError("cursor is invalid")
    return {
        "sort": sort,
        "id": parsed["id"],
        "updated_at": parsed["updated_at"],
        "created_at": parsed.get("created_at") or "",
        "priority": priority,
        "due_key": parsed["due_key"],
    }


def parse_json_or(raw: str | None, fallback: Any) -> Any:
    if not raw:
        return fallback
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return fallback


def parse_session_ids(raw: str | None) -> list[str]:
    parsed = parse_json_or(raw, [])
    if not isinstance(parsed, list):
        return []
    return [item for item in parsed if isinstance(item, str) and item]


def parse_session_names(raw: str | None) -> dict[str, str]:
    parsed = parse_json_or(raw, {})
    if not isinstance(parsed, dict):
        return {}
    return {key: value for key, value in parsed.items() if isinstance(value, str)}


def parse_session_providers(raw: str | None) -> dict[str, str]:
    parsed = parse_json_or(raw, {})
    if not isinstance(parsed, dict):
        return {}
    normalized: dict[str, str] = {}
    for key, value in parsed.items():
        if isinstance(value, str) and value.strip():
            normalized[key] = value.strip()
    return normalized


def parse_task_chat_messages(raw: str | None) -> list[dict[str, str]]:
    parsed = parse_json_or(raw, [])
    if not isinstance(parsed, list):
        return []
    messages: list[dict[str, str]] = []
    for message in parsed:
        if not isinstance(message, dict):
            continue
        role = message.get("role")
        if role not in {"user", "assistant"}:
            continue
        messages.append({"role": role, "content": message.get("content") if isinstance(message.get("content"), str) else ""})
    return messages


def get_default_provider_id() -> str:
    row = db.query_one("SELECT id FROM providers WHERE is_default = 1")
    return str(row["id"]) if row and isinstance(row.get("id"), str) else "claude"


def build_task_chat_history(task: dict[str, Any], message: str, seed_message: str | None = None) -> list[dict[str, str]]:
    history = parse_task_chat_messages(task.get("chat_messages"))
    if not history:
        history.append(
            {
                "role": "user",
                "content": (
                    seed_message.strip()
                    if isinstance(seed_message, str) and seed_message.strip()
                    else f"[任务信息]\n标题：{task['title']}\n类型：{task['type']}\n初步意图：{task.get('context') or '无'}\n\n请先理解任务，并通过对话逐步补齐生成产物所需的信息。"
                ),
            }
        )
    normalized_message = message.strip()
    if normalized_message:
        history.append({"role": "user", "content": normalized_message})
    return history


def build_task_chat_messages(history: list[dict[str, str]], system_messages: list[dict[str, str]] | None = None) -> list[dict[str, str]]:
    return [*(system_messages or []), *history]


def persist_task_chat_history(task_id: str, history: list[dict[str, str]]) -> None:
    db.execute(
        "UPDATE tasks SET chat_messages = ?, updated_at = datetime('now') WHERE id = ?",
        (json.dumps(history, ensure_ascii=False), task_id),
    )


def persist_task_chat_result(task_id: str, history: list[dict[str, str]], full_response: str) -> None:
    history.append({"role": "assistant", "content": full_response})
    persist_task_chat_history(task_id, history)
