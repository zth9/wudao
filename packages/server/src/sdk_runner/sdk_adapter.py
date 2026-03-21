"""SDK Adapter — converts Claude Agent SDK messages to internal SDK events.

This module wraps the Claude Agent SDK's query() function and transforms
its typed Message stream into a flat sequence of SDK event dicts suitable
for persistence in task_sdk_events and SSE delivery to the frontend.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


# ---------------------------------------------------------------------------
# Internal event helpers
# ---------------------------------------------------------------------------

def _evt(event_type: str, **payload: Any) -> dict[str, Any]:
    return {"event_type": event_type, "payload": payload}


# ---------------------------------------------------------------------------
# Message → Event converters
# ---------------------------------------------------------------------------

def convert_assistant_message(msg: Any) -> list[dict[str, Any]]:
    """Convert an AssistantMessage into a list of SDK events.

    An AssistantMessage contains a list of ContentBlocks:
    - TextBlock        → sdk.text_completed
    - ThinkingBlock    → sdk.thinking (optional, for observability)
    - ToolUseBlock     → sdk.tool_use
    - ToolResultBlock  → sdk.tool_result
    """
    events: list[dict[str, Any]] = []
    for block in getattr(msg, "content", []):
        cls_name = type(block).__name__

        if cls_name == "TextBlock":
            events.append(_evt("sdk.text_completed", text=block.text))

        elif cls_name == "ThinkingBlock":
            events.append(_evt("sdk.thinking", thinking=block.thinking))

        elif cls_name == "ToolUseBlock":
            events.append(_evt(
                "sdk.tool_use",
                tool_use_id=block.id,
                tool_name=block.name,
                input=block.input,
            ))

        elif cls_name == "ToolResultBlock":
            content = block.content
            if isinstance(content, list):
                text_parts = [
                    part.get("text", "") for part in content if isinstance(part, dict) and part.get("type") == "text"
                ]
                content = "\n".join(text_parts) if text_parts else str(content)
            events.append(_evt(
                "sdk.tool_result",
                tool_use_id=block.tool_use_id,
                content=content,
                is_error=bool(block.is_error),
            ))

    if hasattr(msg, "usage") and msg.usage:
        events.append(_evt("sdk.cost_update", usage=msg.usage))

    return events


def convert_system_message(msg: Any) -> list[dict[str, Any]]:
    """Convert a SystemMessage (or its subclasses) into SDK events."""
    cls_name = type(msg).__name__

    if cls_name == "TaskStartedMessage":
        return [_evt("sdk.progress", message=f"Task started: {msg.description}")]

    if cls_name == "TaskProgressMessage":
        payload: dict[str, Any] = {"message": msg.description}
        if hasattr(msg, "usage") and msg.usage:
            payload["usage"] = dict(msg.usage)
        if hasattr(msg, "last_tool_name") and msg.last_tool_name:
            payload["last_tool_name"] = msg.last_tool_name
        return [_evt("sdk.progress", **payload)]

    if cls_name == "TaskNotificationMessage":
        return [_evt(
            "sdk.progress",
            message=f"Task {msg.status}: {msg.summary}",
            status=msg.status,
        )]

    # Generic SystemMessage fallback
    return [_evt("sdk.progress", message=f"[{msg.subtype}]")]


def convert_result_message(msg: Any) -> list[dict[str, Any]]:
    """Convert a ResultMessage into SDK events."""
    events: list[dict[str, Any]] = []

    events.append(_evt(
        "sdk.cost_update",
        total_cost_usd=msg.total_cost_usd,
        duration_ms=msg.duration_ms,
        num_turns=msg.num_turns,
        is_error=msg.is_error,
        usage=msg.usage,
    ))

    if msg.result:
        events.append(_evt("sdk.text_completed", text=msg.result))

    return events


def convert_stream_event(msg: Any) -> list[dict[str, Any]]:
    """Convert a StreamEvent to a text delta if applicable."""
    event = getattr(msg, "event", {})
    if not isinstance(event, dict):
        return []

    event_type = event.get("type", "")
    if event_type == "content_block_delta":
        delta = event.get("delta", {})
        if delta.get("type") == "text_delta":
            return [_evt("sdk.text_delta", text=delta.get("text", ""))]
    return []


def convert_rate_limit_event(msg: Any) -> list[dict[str, Any]]:
    """Convert a RateLimitEvent into an SDK event."""
    info = getattr(msg, "rate_limit_info", None)
    if info is None:
        return []
    return [_evt("sdk.error", message=f"Rate limit: {info.status}", rate_limit=True)]


def convert_user_message(_msg: Any) -> list[dict[str, Any]]:
    """UserMessages in the SDK stream are echoes of tool results — skip."""
    return []


# ---------------------------------------------------------------------------
# Top-level dispatcher
# ---------------------------------------------------------------------------

_CONVERTERS: dict[str, Any] = {
    "AssistantMessage": convert_assistant_message,
    "UserMessage": convert_user_message,
    "SystemMessage": convert_system_message,
    "TaskStartedMessage": convert_system_message,
    "TaskProgressMessage": convert_system_message,
    "TaskNotificationMessage": convert_system_message,
    "ResultMessage": convert_result_message,
    "StreamEvent": convert_stream_event,
    "RateLimitEvent": convert_rate_limit_event,
}


def convert_sdk_message(msg: Any) -> list[dict[str, Any]]:
    """Convert any Claude Agent SDK Message into a list of internal SDK events.

    Returns an empty list for unrecognised message types (safe fallback).
    """
    cls_name = type(msg).__name__
    converter = _CONVERTERS.get(cls_name)
    if converter is None:
        return [_evt("sdk.progress", message=f"[unknown: {cls_name}]")]
    return converter(msg)


# ---------------------------------------------------------------------------
# Approval bridge dataclass
# ---------------------------------------------------------------------------

@dataclass
class ApprovalRequest:
    """Represents a pending permission request from the SDK."""

    approval_id: str
    tool_name: str
    tool_input: dict[str, Any]
