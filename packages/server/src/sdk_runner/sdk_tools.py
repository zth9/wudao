"""SDK Tools — invoke_sdk_runner tool for the Agent Runtime."""

from __future__ import annotations

import os
from typing import Any

from ..paths import WUDAO_HOME


def sdk_tools_prompt_schema() -> list[dict[str, Any]]:
    return [
        {
            "name": "invoke_sdk_runner",
            "description": (
                "Invoke Claude Code SDK to execute a coding task in a target project directory. "
                "Use this when the user asks you to write code, fix bugs, add features, run tests, "
                "or perform any coding task that benefits from a full AI coding agent. "
                "The SDK execution will be visible in the SDK Runner panel. "
                "Returns the sdk_run_id which the frontend uses to subscribe to live events."
            ),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "prompt": {
                        "type": "string",
                        "description": "The coding task instruction to send to Claude Code SDK.",
                    },
                    "cwd": {
                        "type": "string",
                        "description": (
                            "Working directory for the SDK. Defaults to the wudao project root. "
                            "Use an absolute path to target a different project."
                        ),
                    },
                },
                "required": ["prompt"],
            },
        }
    ]


async def invoke_sdk_runner_tool(task_id: str, input_data: dict[str, Any]) -> dict[str, Any]:
    """Execute the invoke_sdk_runner tool.

    This creates an SDK run record and starts the background asyncio task.
    The actual SDK execution happens asynchronously; this tool returns immediately
    with the sdk_run_id so the frontend can subscribe to its event stream.
    """
    prompt = input_data.get("prompt", "").strip()
    if not prompt:
        return {"ok": False, "error": "prompt is required"}

    cwd = input_data.get("cwd", "").strip()
    if not cwd:
        # Default to wudao project root
        cwd = str(WUDAO_HOME.parent) if WUDAO_HOME.exists() else os.getcwd()

    from .sdk_runner import start_sdk_run

    # Create a no-op emitter for now; the SSE route will attach its own subscriber
    collected_events: list[dict[str, Any]] = []

    async def noop_emitter(event: dict[str, Any]) -> None:
        collected_events.append(event)

    try:
        run = start_sdk_run(
            task_id=task_id,
            prompt=prompt,
            cwd=cwd,
            emitter=noop_emitter,
        )
        return {
            "ok": True,
            "sdk_run_id": run["id"],
            "message": f"SDK run started. Executing: {prompt[:100]}",
        }
    except RuntimeError as exc:
        return {"ok": False, "error": str(exc)}
