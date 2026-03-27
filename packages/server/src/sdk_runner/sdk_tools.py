"""SDK Tools — runner-specific invocation tools for the Agent Runtime."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Awaitable, Callable

from ..paths import WORKSPACE_DIR

SdkRunnerStartedCallback = Callable[[dict[str, Any]], Awaitable[None]]
DEFAULT_SDK_RUNNER_TIMEOUT_SECONDS = 20 * 60


@dataclass(frozen=True, slots=True)
class SdkRunnerToolDefinition:
    tool_name: str
    runner_type: str
    display_name: str
    description: str


SDK_RUNNER_TOOL_DEFINITIONS: tuple[SdkRunnerToolDefinition, ...] = (
    SdkRunnerToolDefinition(
        tool_name="invoke_claude_code_runner",
        runner_type="claude_code",
        display_name="Claude Code Runner",
        description=(
            "Invoke Claude Code Runner to execute a coding task in a target project directory. "
            "Use this when the user explicitly wants Claude Code / Claude Agent SDK to write code, "
            "fix bugs, add features, run tests, or perform coding work. "
            "The runner execution will be visible in the Agent Runner panel while this tool call is running. "
            "This tool waits for Claude Code Runner to finish and then returns its final execution summary. "
            "Do not use terminal_snapshot to inspect Claude Code Runner output; read this tool result instead."
        ),
    ),
)

SDK_RUNNER_TOOL_ALIASES = {
    "invoke_sdk_runner": "invoke_claude_code_runner",
}
SDK_RUN_TERMINAL_STATUSES = {"completed", "failed", "cancelled"}

_TOOL_DEFINITION_BY_NAME = {item.tool_name: item for item in SDK_RUNNER_TOOL_DEFINITIONS}


def _default_sdk_cwd(task_id: str) -> str:
    workspace_dir = (WORKSPACE_DIR / task_id).resolve()
    workspace_dir.mkdir(parents=True, exist_ok=True)
    return str(workspace_dir)


def normalize_sdk_runner_tool_name(tool_name: str) -> str:
    normalized = tool_name.strip()
    return SDK_RUNNER_TOOL_ALIASES.get(normalized, normalized)


def is_sdk_runner_tool_name(tool_name: str) -> bool:
    return normalize_sdk_runner_tool_name(tool_name) in _TOOL_DEFINITION_BY_NAME


def get_sdk_runner_tool_definition(tool_name: str) -> SdkRunnerToolDefinition | None:
    return _TOOL_DEFINITION_BY_NAME.get(normalize_sdk_runner_tool_name(tool_name))


def sdk_runner_known_tool_names() -> set[str]:
    return set(_TOOL_DEFINITION_BY_NAME) | set(SDK_RUNNER_TOOL_ALIASES)


def sdk_tools_prompt_schema() -> list[dict[str, Any]]:
    return [
        {
            "name": item.tool_name,
            "description": item.description,
            "inputSchema": {
                "type": "object",
                "properties": {
                    "prompt": {
                        "type": "string",
                        "description": f"The coding task instruction to send to {item.display_name}.",
                    },
                    "cwd": {
                        "type": "string",
                        "description": (
                            "Working directory for the runner. Defaults to the current task workspace. "
                            "Use an absolute path to target a different project."
                        ),
                    },
                    "timeoutSeconds": {
                        "type": "number",
                        "description": (
                            "Optional timeout for the runner execution. "
                            f"Defaults to {DEFAULT_SDK_RUNNER_TIMEOUT_SECONDS} seconds."
                        ),
                    },
                },
                "required": ["prompt"],
            },
        }
        for item in SDK_RUNNER_TOOL_DEFINITIONS
    ]


def _extract_last_event_payload(
    events: list[dict[str, Any]],
    event_type: str,
) -> dict[str, Any] | None:
    for event in reversed(events):
        if str(event.get("event_type") or "") != event_type:
            continue
        payload = event.get("payload_json")
        if isinstance(payload, dict):
            return payload
    return None


def _extract_final_runner_text(events: list[dict[str, Any]]) -> str:
    for event in reversed(events):
        if str(event.get("event_type") or "") != "sdk.text_completed":
            continue
        payload = event.get("payload_json")
        if not isinstance(payload, dict):
            continue
        text = str(payload.get("text") or "").strip()
        if text:
            return text
    return ""


def _render_runner_result_content(content: Any) -> str:
    if isinstance(content, str):
        return content.strip()
    if content is None:
        return ""
    if isinstance(content, dict):
        stdout = content.get("stdout")
        if isinstance(stdout, str) and stdout.strip():
            return stdout.strip()
        nested = content.get("content")
        nested_text = _render_runner_result_content(nested)
        if nested_text:
            return nested_text
        return json.dumps(content, ensure_ascii=False, indent=2).strip()
    if isinstance(content, list):
        text_parts = [
            str(item.get("text") or "").strip()
            for item in content
            if isinstance(item, dict) and str(item.get("type") or "") == "text"
        ]
        joined = "\n".join(part for part in text_parts if part)
        if joined:
            return joined
        return json.dumps(content, ensure_ascii=False, indent=2).strip()
    return str(content).strip()


def _extract_runner_tool_names(events: list[dict[str, Any]]) -> list[str]:
    names: list[str] = []
    for event in events:
        if str(event.get("event_type") or "") != "sdk.tool_use":
            continue
        payload = event.get("payload_json")
        if not isinstance(payload, dict):
            continue
        tool_name = str(payload.get("tool_name") or "").strip()
        if tool_name and tool_name not in names:
            names.append(tool_name)
    return names


def _extract_last_runner_tool_result(events: list[dict[str, Any]]) -> dict[str, Any] | None:
    tool_name_by_use_id: dict[str, str] = {}
    for event in events:
        if str(event.get("event_type") or "") != "sdk.tool_use":
            continue
        payload = event.get("payload_json")
        if not isinstance(payload, dict):
            continue
        tool_use_id = str(payload.get("tool_use_id") or "").strip()
        tool_name = str(payload.get("tool_name") or "").strip()
        if tool_use_id and tool_name:
            tool_name_by_use_id[tool_use_id] = tool_name

    for event in reversed(events):
        if str(event.get("event_type") or "") != "sdk.tool_result":
            continue
        payload = event.get("payload_json")
        if not isinstance(payload, dict) or bool(payload.get("is_error")):
            continue
        content = payload.get("content")
        rendered = _render_runner_result_content(content)
        if not rendered:
            continue
        tool_use_id = str(payload.get("tool_use_id") or "").strip()
        return {
            "tool_use_id": tool_use_id,
            "tool_name": tool_name_by_use_id.get(tool_use_id, ""),
            "content": content,
            "text": rendered,
        }
    return None


def _build_completed_run_summary(
    *,
    run: dict[str, Any],
    tool_name: str,
    events: list[dict[str, Any]],
) -> dict[str, Any]:
    final_text = _extract_final_runner_text(events)
    last_tool_result = _extract_last_runner_tool_result(events)
    summary_source = "sdk.text_completed"
    if not final_text and last_tool_result is not None:
        final_text = str(last_tool_result.get("text") or "").strip()
        summary_source = "sdk.tool_result"
    last_cost_update = _extract_last_event_payload(events, "sdk.cost_update") or {}
    tool_names = _extract_runner_tool_names(events)
    output: dict[str, Any] = {
        "ok": run.get("status") == "completed",
        "status": run.get("status") or "completed",
        "sdk_run_id": run["id"],
        "runner_type": run.get("runner_type") or "claude_code",
        "tool_name": tool_name,
        "cwd": run.get("cwd"),
        "prompt": run.get("prompt", ""),
        "final_text": final_text,
        "summary_source": summary_source if final_text else None,
        "tool_names": tool_names,
        "total_cost_usd": run.get("total_cost_usd", 0),
        "total_tokens": run.get("total_tokens", 0),
        "duration_ms": last_cost_update.get("duration_ms"),
        "num_turns": last_cost_update.get("num_turns"),
    }
    if last_tool_result is not None:
        output["last_tool_result"] = last_tool_result
    if final_text:
        output["message"] = "Claude Code Runner completed successfully."
    else:
        output["message"] = "Claude Code Runner completed successfully, but no final text summary was produced."
    return output


def _build_failed_run_summary(
    *,
    run: dict[str, Any],
    tool_name: str,
    error: str,
    timed_out: bool = False,
) -> dict[str, Any]:
    message = error.strip() or "Claude Code Runner failed."
    return {
        "ok": False,
        "status": run.get("status") or ("cancelled" if timed_out else "failed"),
        "sdk_run_id": run["id"],
        "runner_type": run.get("runner_type") or "claude_code",
        "tool_name": tool_name,
        "cwd": run.get("cwd"),
        "prompt": run.get("prompt", ""),
        "last_error": run.get("last_error") or message,
        "timed_out": timed_out,
        "error": message,
        "message": message,
    }


def summarize_sdk_run_result(
    run_id: str,
    *,
    tool_name: str = "invoke_claude_code_runner",
) -> dict[str, Any]:
    from .sdk_store import get_sdk_run, list_sdk_events

    run = get_sdk_run(run_id)
    if run is None:
        raise RuntimeError("SDK run not found")

    status = str(run.get("status") or "").strip()
    if status == "completed":
        return _build_completed_run_summary(
            run=run,
            tool_name=tool_name,
            events=list_sdk_events(run_id),
        )

    if status in {"failed", "cancelled"}:
        return _build_failed_run_summary(
            run=run,
            tool_name=tool_name,
            error=str(run.get("last_error") or f"Claude Code Runner {status}."),
            timed_out=False,
        )

    raise RuntimeError(f"SDK run {run_id} is still active")


async def _wait_for_sdk_run_completion(
    run_id: str,
    *,
    completion_future: asyncio.Future[dict[str, Any]],
    timeout_seconds: float,
) -> dict[str, Any]:
    from .sdk_store import get_sdk_run

    loop = asyncio.get_running_loop()
    deadline = loop.time() + float(timeout_seconds)
    poll_interval = 0.25

    while True:
        remaining = deadline - loop.time()
        if remaining <= 0:
            raise asyncio.TimeoutError

        try:
            return await asyncio.wait_for(
                asyncio.shield(completion_future),
                timeout=min(poll_interval, remaining),
            )
        except asyncio.TimeoutError:
            current_run = get_sdk_run(run_id)
            status = str(current_run.get("status") or "").strip() if current_run else ""
            if status not in SDK_RUN_TERMINAL_STATUSES:
                continue

            payload: dict[str, Any] = {"run_id": run_id, "status": status}
            if status == "failed" and current_run:
                last_error = str(current_run.get("last_error") or "").strip()
                if last_error:
                    payload["error"] = last_error
            return payload


async def invoke_sdk_runner_tool(
    task_id: str,
    input_data: dict[str, Any],
    *,
    agent_run_id: str | None = None,
    tool_name: str = "invoke_claude_code_runner",
    on_started: SdkRunnerStartedCallback | None = None,
) -> dict[str, Any]:
    """Execute a runner-specific SDK invocation tool."""
    definition = get_sdk_runner_tool_definition(tool_name)
    if definition is None:
        return {"ok": False, "error": f"unsupported sdk runner tool: {tool_name}"}

    prompt = input_data.get("prompt", "").strip()
    if not prompt:
        return {"ok": False, "error": "prompt is required"}

    cwd = input_data.get("cwd", "").strip()
    if not cwd:
        cwd = _default_sdk_cwd(task_id)
    else:
        cwd = str(Path(cwd).expanduser())

    timeout_seconds = input_data.get("timeoutSeconds")
    if timeout_seconds is None:
        timeout_seconds = DEFAULT_SDK_RUNNER_TIMEOUT_SECONDS
    elif not isinstance(timeout_seconds, (int, float)) or timeout_seconds <= 0:
        return {"ok": False, "error": "timeoutSeconds must be a positive number"}

    from .sdk_runner import registry, start_sdk_run
    from .sdk_store import get_sdk_run, list_sdk_events

    async def noop_emitter(_event: dict[str, Any]) -> None:
        return None

    completion_future: asyncio.Future[dict[str, Any]] = asyncio.get_running_loop().create_future()

    async def handle_tool_finished(payload: dict[str, Any]) -> None:
        if not completion_future.done():
            completion_future.set_result(payload)

    try:
        run = start_sdk_run(
            task_id=task_id,
            prompt=prompt,
            cwd=cwd,
            emitter=noop_emitter,
            agent_run_id=agent_run_id,
            runner_type=definition.runner_type,
            on_finished=handle_tool_finished,
        )
        started_payload = {
            "sdk_run_id": run["id"],
            "runner_type": definition.runner_type,
            "tool_name": definition.tool_name,
            "status": "running",
            "message": f"{definition.display_name} started and is now running.",
        }
        if on_started is not None:
            await on_started(started_payload)

        try:
            await _wait_for_sdk_run_completion(
                run["id"],
                completion_future=completion_future,
                timeout_seconds=float(timeout_seconds),
            )
        except asyncio.TimeoutError:
            registry.cancel(run["id"])
            try:
                await _wait_for_sdk_run_completion(
                    run["id"],
                    completion_future=completion_future,
                    timeout_seconds=5,
                )
            except asyncio.TimeoutError:
                pass
            current_run = get_sdk_run(run["id"]) or run
            return _build_failed_run_summary(
                run=current_run,
                tool_name=definition.tool_name,
                error=f"{definition.display_name} timed out after {int(timeout_seconds)} seconds.",
                timed_out=True,
            )

        return summarize_sdk_run_result(
            run["id"],
            tool_name=definition.tool_name,
        )
    except RuntimeError as exc:
        return {"ok": False, "error": str(exc)}
