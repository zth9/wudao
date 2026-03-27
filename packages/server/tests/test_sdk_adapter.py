"""Tests for sdk_runner/sdk_adapter.py — SDK message to internal event conversion."""

from __future__ import annotations

import importlib
import sys
from dataclasses import dataclass, field
from typing import Any


def load_adapter(tmp_path, monkeypatch):
    monkeypatch.setenv("WUDAO_HOME", str(tmp_path / "home"))
    monkeypatch.setenv("WUDAO_DB_PATH", str(tmp_path / "wudao.db"))
    for name in list(sys.modules):
        if name.startswith("src"):
            sys.modules.pop(name, None)
    importlib.import_module("src.app")
    return importlib.import_module("src.sdk_runner.sdk_adapter")


# ---------------------------------------------------------------------------
# Fake SDK types (mimic claude_agent_sdk.types structure)
# ---------------------------------------------------------------------------

@dataclass
class TextBlock:
    text: str

@dataclass
class ThinkingBlock:
    thinking: str
    signature: str = ""

@dataclass
class ToolUseBlock:
    id: str
    name: str
    input: dict[str, Any] = field(default_factory=dict)

@dataclass
class ToolResultBlock:
    tool_use_id: str
    content: Any = None
    is_error: bool = False

@dataclass
class AssistantMessage:
    content: list = field(default_factory=list)
    model: str = "claude-opus-4-6"
    usage: dict[str, Any] | None = None

@dataclass
class UserMessage:
    content: str | list = ""
    uuid: str | None = None
    parent_tool_use_id: str | None = None
    tool_use_result: dict[str, Any] | None = None

@dataclass
class SystemMessage:
    subtype: str = "init"
    data: dict[str, Any] = field(default_factory=dict)

@dataclass
class TaskStartedMessage(SystemMessage):
    task_id: str = ""
    description: str = ""
    uuid: str = ""
    session_id: str = ""

@dataclass
class TaskProgressMessage(SystemMessage):
    task_id: str = ""
    description: str = ""
    usage: dict[str, Any] = field(default_factory=dict)
    uuid: str = ""
    session_id: str = ""
    last_tool_name: str | None = None

@dataclass
class TaskNotificationMessage(SystemMessage):
    task_id: str = ""
    status: str = "completed"
    output_file: str = ""
    summary: str = ""
    uuid: str = ""
    session_id: str = ""

@dataclass
class ResultMessage:
    subtype: str = "result"
    duration_ms: int = 1000
    duration_api_ms: int = 800
    is_error: bool = False
    num_turns: int = 3
    session_id: str = "s1"
    total_cost_usd: float = 0.42
    usage: dict[str, Any] | None = None
    result: str | None = None

@dataclass
class StreamEvent:
    uuid: str = "u1"
    session_id: str = "s1"
    event: dict[str, Any] = field(default_factory=dict)

@dataclass
class RateLimitInfo:
    status: str = "rejected"

@dataclass
class RateLimitEvent:
    rate_limit_info: RateLimitInfo = field(default_factory=RateLimitInfo)
    uuid: str = "u1"
    session_id: str = "s1"


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_convert_assistant_text_block(tmp_path, monkeypatch):
    adapter = load_adapter(tmp_path, monkeypatch)
    msg = AssistantMessage(content=[TextBlock(text="Hello world")])
    events = adapter.convert_sdk_message(msg)
    assert len(events) == 1
    assert events[0]["event_type"] == "sdk.text_completed"
    assert events[0]["payload"]["text"] == "Hello world"


def test_convert_assistant_tool_use_and_result(tmp_path, monkeypatch):
    adapter = load_adapter(tmp_path, monkeypatch)
    msg = AssistantMessage(content=[
        ToolUseBlock(id="tu1", name="Read", input={"file_path": "/tmp/a.py"}),
        ToolResultBlock(tool_use_id="tu1", content="file content here"),
    ])
    events = adapter.convert_sdk_message(msg)
    assert len(events) == 2
    assert events[0]["event_type"] == "sdk.tool_use"
    assert events[0]["payload"]["tool_name"] == "Read"
    assert events[1]["event_type"] == "sdk.tool_result"
    assert events[1]["payload"]["content"] == "file content here"


def test_convert_assistant_thinking_block(tmp_path, monkeypatch):
    adapter = load_adapter(tmp_path, monkeypatch)
    msg = AssistantMessage(content=[ThinkingBlock(thinking="Let me think...")])
    events = adapter.convert_sdk_message(msg)
    assert len(events) == 1
    assert events[0]["event_type"] == "sdk.thinking"


def test_convert_assistant_with_usage(tmp_path, monkeypatch):
    adapter = load_adapter(tmp_path, monkeypatch)
    msg = AssistantMessage(
        content=[TextBlock(text="Hi")],
        usage={"input_tokens": 100, "output_tokens": 50},
    )
    events = adapter.convert_sdk_message(msg)
    assert len(events) == 2
    assert events[1]["event_type"] == "sdk.cost_update"
    assert events[1]["payload"]["usage"]["input_tokens"] == 100


def test_convert_plain_user_message_returns_empty(tmp_path, monkeypatch):
    adapter = load_adapter(tmp_path, monkeypatch)
    events = adapter.convert_sdk_message(UserMessage(content="echo"))
    assert events == []


def test_convert_user_message_tool_use_result_metadata(tmp_path, monkeypatch):
    adapter = load_adapter(tmp_path, monkeypatch)
    msg = UserMessage(
        content="command finished",
        parent_tool_use_id="toolu_123",
        tool_use_result={
            "content": {
                "stdout": "done",
                "exit_code": 0,
            },
            "is_error": False,
        },
    )
    events = adapter.convert_sdk_message(msg)
    assert len(events) == 1
    assert events[0]["event_type"] == "sdk.tool_result"
    assert events[0]["payload"] == {
        "tool_use_id": "toolu_123",
        "content": {
            "stdout": "done",
            "exit_code": 0,
        },
        "is_error": False,
    }


def test_convert_user_message_tool_result_block(tmp_path, monkeypatch):
    adapter = load_adapter(tmp_path, monkeypatch)
    msg = UserMessage(content=[
        ToolResultBlock(
            tool_use_id="toolu_456",
            content=[{"type": "text", "text": "line 1"}, {"type": "text", "text": "line 2"}],
            is_error=False,
        ),
    ])
    events = adapter.convert_sdk_message(msg)
    assert len(events) == 1
    assert events[0]["event_type"] == "sdk.tool_result"
    assert events[0]["payload"] == {
        "tool_use_id": "toolu_456",
        "content": "line 1\nline 2",
        "is_error": False,
    }


def test_convert_task_started(tmp_path, monkeypatch):
    adapter = load_adapter(tmp_path, monkeypatch)
    msg = TaskStartedMessage(subtype="task_started", data={}, description="Adding feature")
    events = adapter.convert_sdk_message(msg)
    assert len(events) == 1
    assert events[0]["event_type"] == "sdk.progress"
    assert "Adding feature" in events[0]["payload"]["message"]


def test_convert_task_progress(tmp_path, monkeypatch):
    adapter = load_adapter(tmp_path, monkeypatch)
    msg = TaskProgressMessage(
        subtype="task_progress", data={},
        description="Writing code",
        usage={"total_tokens": 500, "tool_uses": 3, "duration_ms": 2000},
        last_tool_name="Write",
    )
    events = adapter.convert_sdk_message(msg)
    assert len(events) == 1
    assert events[0]["payload"]["last_tool_name"] == "Write"


def test_convert_task_notification(tmp_path, monkeypatch):
    adapter = load_adapter(tmp_path, monkeypatch)
    msg = TaskNotificationMessage(
        subtype="task_notification", data={},
        status="completed", summary="All done",
    )
    events = adapter.convert_sdk_message(msg)
    assert len(events) == 1
    assert "completed" in events[0]["payload"]["message"]


def test_convert_result_message(tmp_path, monkeypatch):
    adapter = load_adapter(tmp_path, monkeypatch)
    msg = ResultMessage(total_cost_usd=0.55, result="Feature added successfully")
    events = adapter.convert_sdk_message(msg)
    assert len(events) == 2
    assert events[0]["event_type"] == "sdk.cost_update"
    assert events[0]["payload"]["total_cost_usd"] == 0.55
    assert events[1]["event_type"] == "sdk.text_completed"
    assert events[1]["payload"]["text"] == "Feature added successfully"


def test_convert_result_message_no_result_text(tmp_path, monkeypatch):
    adapter = load_adapter(tmp_path, monkeypatch)
    msg = ResultMessage(result=None)
    events = adapter.convert_sdk_message(msg)
    assert len(events) == 1
    assert events[0]["event_type"] == "sdk.cost_update"


def test_convert_stream_event_text_delta(tmp_path, monkeypatch):
    adapter = load_adapter(tmp_path, monkeypatch)
    msg = StreamEvent(event={
        "type": "content_block_delta",
        "delta": {"type": "text_delta", "text": "chunk"},
    })
    events = adapter.convert_sdk_message(msg)
    assert len(events) == 1
    assert events[0]["event_type"] == "sdk.text_delta"
    assert events[0]["payload"]["text"] == "chunk"


def test_convert_stream_event_non_text_returns_empty(tmp_path, monkeypatch):
    adapter = load_adapter(tmp_path, monkeypatch)
    msg = StreamEvent(event={"type": "content_block_start"})
    events = adapter.convert_sdk_message(msg)
    assert events == []


def test_convert_rate_limit_event(tmp_path, monkeypatch):
    adapter = load_adapter(tmp_path, monkeypatch)
    msg = RateLimitEvent(rate_limit_info=RateLimitInfo(status="rejected"))
    events = adapter.convert_sdk_message(msg)
    assert len(events) == 1
    assert events[0]["event_type"] == "sdk.error"
    assert events[0]["payload"]["rate_limit"] is True


def test_convert_unknown_message_type(tmp_path, monkeypatch):
    adapter = load_adapter(tmp_path, monkeypatch)

    class UnknownMsg:
        pass

    events = adapter.convert_sdk_message(UnknownMsg())
    assert len(events) == 1
    assert events[0]["event_type"] == "sdk.progress"
    assert "unknown" in events[0]["payload"]["message"]


def test_convert_tool_result_with_list_content(tmp_path, monkeypatch):
    adapter = load_adapter(tmp_path, monkeypatch)
    msg = AssistantMessage(content=[
        ToolResultBlock(
            tool_use_id="tu1",
            content=[{"type": "text", "text": "line 1"}, {"type": "text", "text": "line 2"}],
        ),
    ])
    events = adapter.convert_sdk_message(msg)
    assert len(events) == 1
    assert events[0]["payload"]["content"] == "line 1\nline 2"
