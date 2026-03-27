from __future__ import annotations

import json
import uuid
from typing import Any

from ..db import db
from ..time_utils import normalize_stored_utc_datetime

RUN_STATUSES = {"running", "waiting_approval", "completed", "failed", "cancelled"}
MESSAGE_ROLES = {"system", "user", "assistant", "tool"}
MESSAGE_KINDS = {"text", "tool_call", "tool_result", "approval", "artifact", "error"}
MESSAGE_STATUSES = {"streaming", "completed", "failed", "waiting_approval"}
_UNSET = object()


def _require_non_empty_string(value: str, field: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError(f"{field} is required")
    return normalized


def _validate_status(value: str, *, field: str, allowed: set[str]) -> str:
    normalized = _require_non_empty_string(value, field)
    if normalized not in allowed:
        raise ValueError(f"invalid {field}: {normalized}")
    return normalized


def _dump_json(value: Any, *, field: str) -> str | None:
    if value is None:
        return None
    try:
        return json.dumps(value, ensure_ascii=False)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field} must be JSON serializable") from exc


def _load_json(value: Any) -> Any:
    if value is None or not isinstance(value, str):
        return value
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def _task_exists(task_id: str) -> bool:
    row = db.query_one("SELECT 1 AS ok FROM tasks WHERE id = ?", (task_id,))
    return bool(row and row.get("ok") == 1)


def _serialize_run(run: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": run["id"],
        "task_id": run["task_id"],
        "provider_id": run["provider_id"],
        "status": run["status"],
        "checkpoint_json": _load_json(run.get("checkpoint_json")),
        "last_error": run.get("last_error"),
        "created_at": normalize_stored_utc_datetime(run.get("created_at")) or run.get("created_at"),
        "updated_at": normalize_stored_utc_datetime(run.get("updated_at")) or run.get("updated_at"),
    }


def _serialize_message(message: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": message["id"],
        "task_id": message["task_id"],
        "run_id": message["run_id"],
        "seq": int(message["seq"]),
        "role": message["role"],
        "kind": message["kind"],
        "status": message["status"],
        "content_json": _load_json(message.get("content_json")),
        "created_at": normalize_stored_utc_datetime(message.get("created_at")) or message.get("created_at"),
        "updated_at": normalize_stored_utc_datetime(message.get("updated_at")) or message.get("updated_at"),
    }


def get_agent_run(run_id: str) -> dict[str, Any] | None:
    normalized_run_id = _require_non_empty_string(run_id, "run_id")
    row = db.query_one("SELECT * FROM task_agent_runs WHERE id = ?", (normalized_run_id,))
    return _serialize_run(row) if row else None


def list_task_agent_runs(task_id: str, *, limit: int | None = None) -> list[dict[str, Any]]:
    normalized_task_id = _require_non_empty_string(task_id, "task_id")
    sql = "SELECT * FROM task_agent_runs WHERE task_id = ? ORDER BY created_at ASC, id ASC"
    params: list[Any] = [normalized_task_id]
    if limit is not None:
        if limit <= 0:
            raise ValueError("limit must be positive")
        sql += " LIMIT ?"
        params.append(limit)
    return [_serialize_run(row) for row in db.query_all(sql, tuple(params))]


def create_agent_run(
    task_id: str,
    provider_id: str,
    *,
    status: str = "running",
    checkpoint_json: Any = None,
    last_error: str | None = None,
    run_id: str | None = None,
) -> dict[str, Any]:
    normalized_task_id = _require_non_empty_string(task_id, "task_id")
    normalized_provider_id = _require_non_empty_string(provider_id, "provider_id")
    normalized_status = _validate_status(status, field="run status", allowed=RUN_STATUSES)
    normalized_run_id = _require_non_empty_string(run_id, "run_id") if isinstance(run_id, str) else str(uuid.uuid4())

    if not _task_exists(normalized_task_id):
        raise RuntimeError("Task not found")

    db.execute(
        """
        INSERT INTO task_agent_runs (id, task_id, provider_id, status, checkpoint_json, last_error)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            normalized_run_id,
            normalized_task_id,
            normalized_provider_id,
            normalized_status,
            _dump_json(checkpoint_json, field="checkpoint_json"),
            last_error.strip() if isinstance(last_error, str) and last_error.strip() else None,
        ),
    )
    created = get_agent_run(normalized_run_id)
    if created is None:
        raise RuntimeError("Failed to create agent run")
    return created


def update_agent_run(
    run_id: str,
    *,
    status: str | object = _UNSET,
    checkpoint_json: Any = _UNSET,
    last_error: str | None | object = _UNSET,
) -> dict[str, Any] | None:
    normalized_run_id = _require_non_empty_string(run_id, "run_id")
    assignments: list[str] = []
    params: list[Any] = []

    if status is not _UNSET:
        assignments.append("status = ?")
        params.append(_validate_status(str(status), field="run status", allowed=RUN_STATUSES))
    if checkpoint_json is not _UNSET:
        assignments.append("checkpoint_json = ?")
        params.append(_dump_json(checkpoint_json, field="checkpoint_json"))
    if last_error is not _UNSET:
        assignments.append("last_error = ?")
        params.append(last_error.strip() if isinstance(last_error, str) and last_error.strip() else None)

    if not assignments:
        return get_agent_run(normalized_run_id)

    assignments.append("updated_at = datetime('now')")
    params.append(normalized_run_id)
    cursor = db.execute(
        f"UPDATE task_agent_runs SET {', '.join(assignments)} WHERE id = ?",
        tuple(params),
    )
    if cursor.rowcount == 0:
        return None
    return get_agent_run(normalized_run_id)


def list_task_agent_messages(task_id: str, *, limit: int | None = None) -> list[dict[str, Any]]:
    normalized_task_id = _require_non_empty_string(task_id, "task_id")
    sql = "SELECT * FROM task_agent_messages WHERE task_id = ? ORDER BY seq ASC, id ASC"
    params: list[Any] = [normalized_task_id]
    if limit is not None:
        if limit <= 0:
            raise ValueError("limit must be positive")
        sql += " LIMIT ?"
        params.append(limit)
    return [_serialize_message(row) for row in db.query_all(sql, tuple(params))]


def get_agent_message(message_id: str) -> dict[str, Any] | None:
    normalized_message_id = _require_non_empty_string(message_id, "message_id")
    row = db.query_one("SELECT * FROM task_agent_messages WHERE id = ?", (normalized_message_id,))
    return _serialize_message(row) if row else None


def append_agent_message(
    task_id: str,
    run_id: str,
    *,
    role: str,
    kind: str,
    status: str = "completed",
    content_json: Any = None,
    message_id: str | None = None,
) -> dict[str, Any]:
    normalized_task_id = _require_non_empty_string(task_id, "task_id")
    normalized_run_id = _require_non_empty_string(run_id, "run_id")
    normalized_role = _validate_status(role, field="message role", allowed=MESSAGE_ROLES)
    normalized_kind = _validate_status(kind, field="message kind", allowed=MESSAGE_KINDS)
    normalized_status = _validate_status(status, field="message status", allowed=MESSAGE_STATUSES)
    normalized_message_id = (
        _require_non_empty_string(message_id, "message_id") if isinstance(message_id, str) else str(uuid.uuid4())
    )

    if not _task_exists(normalized_task_id):
        raise RuntimeError("Task not found")

    with db.locked_connection() as conn:
        run = conn.execute(
            "SELECT id, task_id FROM task_agent_runs WHERE id = ?",
            (normalized_run_id,),
        ).fetchone()
        if run is None:
            raise RuntimeError("Agent run not found")
        if str(run["task_id"]) != normalized_task_id:
            raise ValueError(f"run {normalized_run_id} does not belong to task {normalized_task_id}")

        seq_row = conn.execute(
            "SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM task_agent_messages WHERE task_id = ?",
            (normalized_task_id,),
        ).fetchone()
        next_seq = int(seq_row["next_seq"] if seq_row is not None else 1)

        conn.execute(
            """
            INSERT INTO task_agent_messages (id, task_id, run_id, seq, role, kind, status, content_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                normalized_message_id,
                normalized_task_id,
                normalized_run_id,
                next_seq,
                normalized_role,
                normalized_kind,
                normalized_status,
                _dump_json(content_json if content_json is not None else {}, field="content_json"),
            ),
        )

    row = db.query_one("SELECT * FROM task_agent_messages WHERE id = ?", (normalized_message_id,))
    if row is None:
        raise RuntimeError("Failed to create agent message")
    return _serialize_message(row)


def update_agent_message(
    message_id: str,
    *,
    status: str | object = _UNSET,
    content_json: Any = _UNSET,
) -> dict[str, Any] | None:
    normalized_message_id = _require_non_empty_string(message_id, "message_id")
    assignments: list[str] = []
    params: list[Any] = []

    if status is not _UNSET:
        assignments.append("status = ?")
        params.append(_validate_status(str(status), field="message status", allowed=MESSAGE_STATUSES))
    if content_json is not _UNSET:
        assignments.append("content_json = ?")
        params.append(_dump_json(content_json if content_json is not None else {}, field="content_json"))

    if not assignments:
        return get_agent_message(normalized_message_id)

    assignments.append("updated_at = datetime('now')")
    params.append(normalized_message_id)
    cursor = db.execute(
        f"UPDATE task_agent_messages SET {', '.join(assignments)} WHERE id = ?",
        tuple(params),
    )
    if cursor.rowcount == 0:
        return None
    return get_agent_message(normalized_message_id)


def get_task_agent_thread(task_id: str) -> dict[str, Any]:
    normalized_task_id = _require_non_empty_string(task_id, "task_id")
    return {
        "task_id": normalized_task_id,
        "runs": list_task_agent_runs(normalized_task_id),
        "messages": list_task_agent_messages(normalized_task_id),
    }
