"""SDK Tools — runner-specific invocation tools for the Agent Runtime."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ..paths import WORKSPACE_DIR


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
            "The runner execution will be visible in the SDK Runner panel. "
            "Returns the sdk_run_id which the frontend uses to subscribe to live events."
        ),
    ),
)

SDK_RUNNER_TOOL_ALIASES = {
    "invoke_sdk_runner": "invoke_claude_code_runner",
}

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
                },
                "required": ["prompt"],
            },
        }
        for item in SDK_RUNNER_TOOL_DEFINITIONS
    ]


async def invoke_sdk_runner_tool(
    task_id: str,
    input_data: dict[str, Any],
    *,
    agent_run_id: str | None = None,
    tool_name: str = "invoke_claude_code_runner",
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

    from .sdk_runner import start_sdk_run

    collected_events: list[dict[str, Any]] = []

    async def noop_emitter(event: dict[str, Any]) -> None:
        collected_events.append(event)

    try:
        run = start_sdk_run(
            task_id=task_id,
            prompt=prompt,
            cwd=cwd,
            emitter=noop_emitter,
            agent_run_id=agent_run_id,
            runner_type=definition.runner_type,
        )
        return {
            "ok": True,
            "sdk_run_id": run["id"],
            "runner_type": definition.runner_type,
            "tool_name": definition.tool_name,
            "message": f"{definition.display_name} started. Executing: {prompt[:100]}",
        }
    except RuntimeError as exc:
        return {"ok": False, "error": str(exc)}
