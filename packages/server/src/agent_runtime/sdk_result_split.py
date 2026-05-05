from __future__ import annotations

from typing import Any, NamedTuple

from ..sdk_runner.sdk_tools import is_sdk_runner_tool_name

SDK_RESULT_SPLIT_MARKER = "final_text_split"

_SDK_DISPLAY_OUTPUT_KEYS = {
    "ok",
    "status",
    "sdk_run_id",
    "runner_type",
    "tool_name",
    "cwd",
    "tool_names",
    "total_cost_usd",
    "total_tokens",
    "duration_ms",
    "num_turns",
    "message",
}


class SplitSdkRunnerResult(NamedTuple):
    display_output: dict[str, Any]
    final_text: str


def split_sdk_runner_result_for_display(tool_name: str, output: Any) -> SplitSdkRunnerResult | None:
    if not isinstance(output, dict) or not is_sdk_runner_tool_name(tool_name):
        return None
    if output.get("ok") is not True:
        return None

    final_text = str(output.get("final_text") or "").strip()
    if not final_text:
        return None

    display_output = {
        key: output[key]
        for key in _SDK_DISPLAY_OUTPUT_KEYS
        if key in output
    }
    display_output[SDK_RESULT_SPLIT_MARKER] = True
    return SplitSdkRunnerResult(display_output=display_output, final_text=final_text)
