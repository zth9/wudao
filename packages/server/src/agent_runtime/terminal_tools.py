from __future__ import annotations

from typing import Any

from ..terminal import terminal_manager
from ..task_service import is_valid_task_id

MAX_TERMINAL_CHARS = 8000


def get_terminal_snapshot(
    task_id: str,
    *,
    session_id: str | None = None,
    limit_chars: int = 4000,
) -> dict[str, Any]:
    normalized_task_id = task_id.strip()
    if not is_valid_task_id(normalized_task_id):
        raise ValueError("task_id is invalid")

    snapshots = terminal_manager.list_task_snapshots(
        normalized_task_id,
        linked_session_id=session_id.strip() if isinstance(session_id, str) else None,
        max_chars=max(200, min(int(limit_chars), MAX_TERMINAL_CHARS)),
    )
    normalized_sessions = [
        {
            "sessionId": item["sessionId"],
            "cliSessionId": item.get("cliSessionId"),
            "providerId": item["providerId"],
            "preview": item["preview"],
            "truncated": item["truncated"],
        }
        for item in snapshots
    ]
    if session_id and not normalized_sessions:
        raise ValueError(f"session {session_id} does not belong to task {normalized_task_id}")
    return {"taskId": normalized_task_id, "sessions": normalized_sessions}


async def terminal_snapshot_tool(
    task_id: str,
    input_data: dict[str, Any],
    *,
    agent_run_id: str | None = None,
) -> dict[str, Any]:
    del agent_run_id
    linked_session_id = input_data.get("sessionId")
    if linked_session_id is not None and not isinstance(linked_session_id, str):
        raise ValueError("sessionId must be a string")

    max_chars = input_data.get("maxChars")
    if max_chars is None:
        resolved_max_chars = 4000
    else:
        try:
            resolved_max_chars = int(max_chars)
        except (TypeError, ValueError) as exc:
            raise ValueError("maxChars must be an integer") from exc
    resolved_max_chars = max(200, min(resolved_max_chars, MAX_TERMINAL_CHARS))
    snapshot = get_terminal_snapshot(
        task_id,
        session_id=linked_session_id.strip() if isinstance(linked_session_id, str) else None,
        limit_chars=resolved_max_chars,
    )
    return {"snapshots": snapshot["sessions"], "count": len(snapshot["sessions"])}


def terminal_tools_prompt_schema() -> list[dict[str, Any]]:
    return [
        {
            "name": "terminal_snapshot",
            "description": "读取当前任务已关联终端的最近输出，只读。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "sessionId": {"type": "string", "description": "可选，指定某个已关联的 session id"},
                    "maxChars": {"type": "integer", "minimum": 200, "maximum": MAX_TERMINAL_CHARS},
                },
                "additionalProperties": False,
            },
        }
    ]
