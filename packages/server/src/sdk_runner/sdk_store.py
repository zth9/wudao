"""Agent Runner persistence layer — CRUD for task_sdk_runs / task_sdk_events."""

from __future__ import annotations

import json
import uuid
from typing import Any

from ..db import db
from ..time_utils import normalize_stored_utc_datetime

SDK_RUN_STATUSES = {"pending", "running", "completed", "failed", "cancelled"}
SDK_RUNNER_TYPES = {"claude_code", "codex"}
_UNSET = object()


def _require(value: str, field: str) -> str:
    v = value.strip()
    if not v:
        raise ValueError(f"{field} is required")
    return v


def _validate_status(value: str, *, field: str) -> str:
    v = _require(value, field)
    if v not in SDK_RUN_STATUSES:
        raise ValueError(f"invalid {field}: {v}")
    return v


def _validate_runner_type(value: str, *, field: str = "runner_type") -> str:
    v = _require(value, field)
    if v not in SDK_RUNNER_TYPES:
        raise ValueError(f"invalid {field}: {v}")
    return v


def _dump_json(value: Any) -> str:
    if value is None:
        return "{}"
    return json.dumps(value, ensure_ascii=False)


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


def _serialize_run(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "task_id": row["task_id"],
        "agent_run_id": row.get("agent_run_id"),
        "runner_type": row.get("runner_type") or "claude_code",
        "status": row["status"],
        "prompt": row.get("prompt", ""),
        "cwd": row.get("cwd"),
        "total_cost_usd": float(row.get("total_cost_usd") or 0),
        "total_tokens": int(row.get("total_tokens") or 0),
        "last_error": row.get("last_error"),
        "created_at": normalize_stored_utc_datetime(row.get("created_at")) or row.get("created_at"),
        "updated_at": normalize_stored_utc_datetime(row.get("updated_at")) or row.get("updated_at"),
    }


def _serialize_event(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "sdk_run_id": row["sdk_run_id"],
        "seq": int(row["seq"]),
        "event_type": row["event_type"],
        "payload_json": _load_json(row.get("payload_json")),
        "created_at": normalize_stored_utc_datetime(row.get("created_at")) or row.get("created_at"),
    }


# ---------------------------------------------------------------------------
# SDK Runs
# ---------------------------------------------------------------------------

def get_sdk_run(run_id: str) -> dict[str, Any] | None:
    row = db.query_one("SELECT * FROM task_sdk_runs WHERE id = ?", (_require(run_id, "run_id"),))
    return _serialize_run(row) if row else None


def list_task_sdk_runs(task_id: str, *, limit: int | None = None) -> list[dict[str, Any]]:
    tid = _require(task_id, "task_id")
    sql = "SELECT * FROM task_sdk_runs WHERE task_id = ? ORDER BY created_at ASC, id ASC"
    params: list[Any] = [tid]
    if limit is not None:
        if limit <= 0:
            raise ValueError("limit must be positive")
        sql += " LIMIT ?"
        params.append(limit)
    return [_serialize_run(r) for r in db.query_all(sql, tuple(params))]


def create_sdk_run(
    task_id: str,
    *,
    prompt: str = "",
    cwd: str | None = None,
    agent_run_id: str | None = None,
    runner_type: str = "claude_code",
    status: str = "pending",
    run_id: str | None = None,
) -> dict[str, Any]:
    tid = _require(task_id, "task_id")
    st = _validate_status(status, field="run status")
    rt = _validate_runner_type(runner_type)
    rid = _require(run_id, "run_id") if run_id else str(uuid.uuid4())

    if not _task_exists(tid):
        raise RuntimeError("Task not found")

    db.execute(
        """
        INSERT INTO task_sdk_runs (id, task_id, agent_run_id, runner_type, status, prompt, cwd)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (rid, tid, agent_run_id, rt, st, prompt, cwd),
    )
    created = get_sdk_run(rid)
    if created is None:
        raise RuntimeError("Failed to create SDK run")
    return created


def update_sdk_run(
    run_id: str,
    *,
    status: str | object = _UNSET,
    total_cost_usd: float | object = _UNSET,
    total_tokens: int | object = _UNSET,
    last_error: str | None | object = _UNSET,
) -> dict[str, Any] | None:
    rid = _require(run_id, "run_id")
    assignments: list[str] = []
    params: list[Any] = []

    if status is not _UNSET:
        assignments.append("status = ?")
        params.append(_validate_status(str(status), field="run status"))
    if total_cost_usd is not _UNSET:
        assignments.append("total_cost_usd = ?")
        params.append(float(total_cost_usd))  # type: ignore[arg-type]
    if total_tokens is not _UNSET:
        assignments.append("total_tokens = ?")
        params.append(int(total_tokens))  # type: ignore[arg-type]
    if last_error is not _UNSET:
        assignments.append("last_error = ?")
        params.append(last_error.strip() if isinstance(last_error, str) and last_error.strip() else None)

    if not assignments:
        return get_sdk_run(rid)

    assignments.append("updated_at = datetime('now')")
    params.append(rid)
    cursor = db.execute(
        f"UPDATE task_sdk_runs SET {', '.join(assignments)} WHERE id = ?",
        tuple(params),
    )
    if cursor.rowcount == 0:
        return None
    return get_sdk_run(rid)


def delete_task_sdk_runs(task_id: str) -> int:
    tid = _require(task_id, "task_id")
    cursor = db.execute("DELETE FROM task_sdk_runs WHERE task_id = ?", (tid,))
    return cursor.rowcount


# ---------------------------------------------------------------------------
# SDK Events
# ---------------------------------------------------------------------------

def list_sdk_events(sdk_run_id: str, *, limit: int | None = None) -> list[dict[str, Any]]:
    rid = _require(sdk_run_id, "sdk_run_id")
    sql = "SELECT * FROM task_sdk_events WHERE sdk_run_id = ? ORDER BY seq ASC, id ASC"
    params: list[Any] = [rid]
    if limit is not None:
        if limit <= 0:
            raise ValueError("limit must be positive")
        sql += " LIMIT ?"
        params.append(limit)
    return [_serialize_event(r) for r in db.query_all(sql, tuple(params))]


def append_sdk_event(
    sdk_run_id: str,
    *,
    event_type: str,
    payload_json: Any = None,
    event_id: str | None = None,
) -> dict[str, Any]:
    rid = _require(sdk_run_id, "sdk_run_id")
    etype = _require(event_type, "event_type")
    eid = _require(event_id, "event_id") if event_id else str(uuid.uuid4())

    with db.locked_connection() as conn:
        run = conn.execute("SELECT id FROM task_sdk_runs WHERE id = ?", (rid,)).fetchone()
        if run is None:
            raise RuntimeError("SDK run not found")

        seq_row = conn.execute(
            "SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM task_sdk_events WHERE sdk_run_id = ?",
            (rid,),
        ).fetchone()
        next_seq = int(seq_row["next_seq"] if seq_row is not None else 1)

        conn.execute(
            """
            INSERT INTO task_sdk_events (id, sdk_run_id, seq, event_type, payload_json)
            VALUES (?, ?, ?, ?, ?)
            """,
            (eid, rid, next_seq, etype, _dump_json(payload_json)),
        )

    row = db.query_one("SELECT * FROM task_sdk_events WHERE id = ?", (eid,))
    if row is None:
        raise RuntimeError("Failed to create SDK event")
    return _serialize_event(row)
