from __future__ import annotations

from typing import Any

SDK_RUNNER_WAIT_CHECKPOINT_TYPE = "sdk_runner_wait"


def build_sdk_runner_wait_checkpoint(
    *,
    tool_name: str,
    tool_input: dict[str, Any],
    tool_call_message_id: str,
    sdk_run_id: str | None = None,
) -> dict[str, Any]:
    checkpoint: dict[str, Any] = {
        "type": SDK_RUNNER_WAIT_CHECKPOINT_TYPE,
        "tool_name": tool_name,
        "tool_input": tool_input,
        "tool_call_message_id": tool_call_message_id,
    }
    if sdk_run_id:
        checkpoint["sdk_run_id"] = sdk_run_id
    return checkpoint


def extract_checkpoint_sdk_run_id(
    checkpoint: Any,
    *,
    tool_call_message_id: str,
    tool_name: str,
) -> str:
    if not isinstance(checkpoint, dict):
        return ""
    if checkpoint.get("type") != SDK_RUNNER_WAIT_CHECKPOINT_TYPE:
        return ""
    if str(checkpoint.get("tool_call_message_id") or "") != tool_call_message_id:
        return ""
    if str(checkpoint.get("tool_name") or "") != tool_name:
        return ""
    return str(checkpoint.get("sdk_run_id") or "").strip()
