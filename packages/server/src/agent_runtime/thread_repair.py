from __future__ import annotations

import json
import uuid
from typing import Any

from ..db import db
from ..sdk_runner.sdk_tools import is_sdk_runner_tool_name, summarize_sdk_run_result


def _load_json(value: Any) -> Any:
    if value is None or not isinstance(value, str):
        return value
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def repair_orphaned_sdk_runner_tool_calls(task_id: str) -> int:
    """Repair stale streaming sdk-runner tool calls for a task.

    This handles historical/aborted runs where the sdk run already reached a
    terminal state but the corresponding task_agent_messages never received the
    final tool_result.
    """
    candidate_rows = db.query_all(
        """
        SELECT m.id, m.run_id, m.seq, m.content_json, ar.status AS agent_run_status
        FROM task_agent_messages m
        JOIN task_agent_runs ar ON ar.id = m.run_id
        WHERE m.task_id = ? AND m.kind = 'tool_call' AND m.status = 'streaming'
        ORDER BY m.seq ASC
        """,
        (task_id,),
    )

    repaired = 0
    for row in candidate_rows:
        content = _load_json(row.get("content_json"))
        if not isinstance(content, dict):
            continue
        tool_name = str(content.get("toolName") or "").strip()
        sdk_run_id = str(content.get("sdk_run_id") or "").strip()
        if not sdk_run_id or not is_sdk_runner_tool_name(tool_name):
            continue

        try:
            output = summarize_sdk_run_result(sdk_run_id, tool_name=tool_name)
        except RuntimeError:
            continue

        result_status = "failed" if isinstance(output, dict) and output.get("ok") is False else "completed"
        tool_call_id = str(row["id"])
        run_id = str(row["run_id"])
        insert_seq = int(row["seq"]) + 1

        with db.locked_connection() as conn:
            existing_result = conn.execute(
                """
                SELECT id FROM task_agent_messages
                WHERE run_id = ? AND kind = 'tool_result' AND seq > ?
                ORDER BY seq ASC LIMIT 1
                """,
                (run_id, int(row["seq"])),
            ).fetchone()

            conn.execute(
                """
                UPDATE task_agent_messages
                SET status = ?, content_json = ?, updated_at = datetime('now')
                WHERE id = ?
                """,
                (
                    result_status,
                    json.dumps(
                        {
                            "toolName": tool_name,
                            "input": content.get("input", {}),
                            "sdk_run_id": sdk_run_id,
                        },
                        ensure_ascii=False,
                    ),
                    tool_call_id,
                ),
            )

            if existing_result is None:
                later_rows = conn.execute(
                    """
                    SELECT id, seq FROM task_agent_messages
                    WHERE task_id = ? AND seq >= ?
                    ORDER BY seq DESC
                    """,
                    (task_id, insert_seq),
                ).fetchall()
                for later_row in later_rows:
                    conn.execute(
                        "UPDATE task_agent_messages SET seq = ?, updated_at = datetime('now') WHERE id = ?",
                        (int(later_row["seq"]) + 1, str(later_row["id"])),
                    )

                conn.execute(
                    """
                    INSERT INTO task_agent_messages (id, task_id, run_id, seq, role, kind, status, content_json)
                    VALUES (?, ?, ?, ?, 'tool', 'tool_result', ?, ?)
                    """,
                    (
                        str(uuid.uuid4()),
                        task_id,
                        run_id,
                        insert_seq,
                        result_status,
                        json.dumps(
                            {
                                "toolName": tool_name,
                                "output": output,
                            },
                            ensure_ascii=False,
                        ),
                    ),
                )

            if result_status == "completed":
                conn.execute(
                    """
                    UPDATE task_agent_runs
                    SET status = 'completed', last_error = NULL, updated_at = datetime('now')
                    WHERE id = ? AND status = 'running'
                    """,
                    (run_id,),
                )
            else:
                conn.execute(
                    """
                    UPDATE task_agent_runs
                    SET status = 'failed', last_error = ?, updated_at = datetime('now')
                    WHERE id = ? AND status = 'running'
                    """,
                    (str(output.get("error") or output.get("last_error") or "SDK runner failed"), run_id),
                )

        repaired += 1

    return repaired
