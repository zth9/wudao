from __future__ import annotations

import uuid
from typing import Any, AsyncGenerator, Awaitable, Callable

from ..memories import get_global_memory_system_messages
from ..task_service import error_message
from ..task_helpers import (
    build_task_chat_history,
    parse_task_chat_messages,
    persist_task_chat_history,
    persist_task_chat_result,
)
from . import model_adapter
from .thread_store import append_agent_message, create_agent_run, update_agent_run
from .tool_registry import execute_agent_tool, serialize_tool_schemas

Emitter = Callable[[dict[str, Any]], Awaitable[None]]
MAX_TOOL_ROUNDS = 8
TEXT_CHUNK_SIZE = 12

ToolExecutionResult = tuple[dict[str, Any], dict[str, Any] | None, str | None, bool]
NormalizedToolCall = tuple[str, dict[str, Any]]


def _chunk_text(text: str) -> list[str]:
    if len(text) <= TEXT_CHUNK_SIZE:
        return [text]
    return [text[index : index + TEXT_CHUNK_SIZE] for index in range(0, len(text), TEXT_CHUNK_SIZE)]


def _persist_assistant_text(
    task_id: str,
    run_id: str,
    text: str,
) -> dict[str, Any]:
    """持久化助手文本消息并返回消息对象。"""
    return append_agent_message(
        task_id,
        run_id,
        role="assistant",
        kind="text",
        status="completed",
        content_json={"content": text},
    )


def _assistant_text_from_step(step: dict[str, Any]) -> str:
    return str(step.get("assistantText") or "").strip()


def _normalize_tool_call(raw_tool_call: Any, *, field_name: str) -> NormalizedToolCall:
    if not isinstance(raw_tool_call, dict):
        raise RuntimeError(f"{field_name} must be an object")
    tool_name = str(raw_tool_call.get("toolName") or "").strip()
    tool_input = raw_tool_call.get("input") if isinstance(raw_tool_call.get("input"), dict) else {}
    return tool_name, tool_input


def _extract_tool_calls_from_step(step: dict[str, Any]) -> list[NormalizedToolCall] | None:
    step_type = step.get("type")

    if step_type == "tool_call":
        return [
            _normalize_tool_call(
                {
                    "toolName": step.get("toolName"),
                    "input": step.get("input"),
                },
                field_name="tool_call payload",
            )
        ]

    if step_type != "tool_calls":
        return None

    raw_tool_calls = step.get("toolCalls")
    if not isinstance(raw_tool_calls, list) or not raw_tool_calls:
        raise RuntimeError("tool_calls payload is empty")

    return [
        _normalize_tool_call(raw_tool_call, field_name="tool_calls item")
        for raw_tool_call in raw_tool_calls
    ]


def _final_response_from_step(step: dict[str, Any]) -> str:
    return str(step.get("content") or "").strip() or "未生成有效回复"


def _is_recoverable_tool_error(exc: Exception) -> bool:
    return isinstance(exc, (ValueError, RuntimeError))


def _persist_run_error(
    task_id: str,
    run_id: str,
    error: str,
) -> dict[str, Any]:
    return append_agent_message(
        task_id,
        run_id,
        role="assistant",
        kind="error",
        status="failed",
        content_json={"error": error},
    )


def _persist_completed_run_text(
    task_id: str,
    run_id: str,
    projected_history: list[dict[str, str]],
    assistant_message_id: str,
    full_response: str,
) -> dict[str, Any]:
    assistant_item = append_agent_message(
        task_id,
        run_id,
        role="assistant",
        kind="text",
        status="completed",
        content_json={"content": full_response},
        message_id=assistant_message_id,
    )
    persist_task_chat_result(task_id, projected_history, full_response)
    update_agent_run(run_id, status="completed", checkpoint_json=None, last_error=None)
    return assistant_item


async def _execute_single_tool(
    task_id: str,
    run_id: str,
    tool_name: str,
    tool_input: dict[str, Any],
) -> ToolExecutionResult:
    """执行单个工具调用并持久化结果。

    返回 (call_item, result_item, error, fatal)：
    - 成功时返回 (call_item, result_item, None, False)
    - 可恢复失败时返回 (call_item, failed_result_item, error_message, False)
    - 致命失败时返回 (call_item, None, error_message, True)
    """
    call_item = append_agent_message(
        task_id,
        run_id,
        role="assistant",
        kind="tool_call",
        status="completed",
        content_json={"toolName": tool_name, "input": tool_input},
    )

    try:
        output = await execute_agent_tool(task_id, tool_name, tool_input, agent_run_id=run_id)
    except Exception as exc:
        err = error_message(exc)
        if _is_recoverable_tool_error(exc):
            return call_item, _build_failed_tool_result(task_id, run_id, tool_name, err), err, False
        return call_item, None, err, True

    result_item = append_agent_message(
        task_id,
        run_id,
        role="tool",
        kind="tool_result",
        status="completed",
        content_json={"toolName": tool_name, "output": output},
    )
    return call_item, result_item, None, False


def _persist_tool_error(
    task_id: str,
    run_id: str,
    tool_name: str,
    error: str,
) -> dict[str, Any]:
    """持久化工具执行错误消息。"""
    return append_agent_message(
        task_id,
        run_id,
        role="assistant",
        kind="error",
        status="failed",
        content_json={"toolName": tool_name, "error": error},
    )


def _build_failed_tool_result(
    task_id: str,
    run_id: str,
    tool_name: str,
    error: str,
) -> dict[str, Any]:
    return append_agent_message(
        task_id,
        run_id,
        role="tool",
        kind="tool_result",
        status="failed",
        content_json={
            "toolName": tool_name,
            "output": {
                "ok": False,
                "error": error,
            },
        },
    )


def _extract_artifact_updates(output: Any) -> list[dict[str, str]]:
    if not isinstance(output, dict):
        return []

    raw_updates = output.get("artifactsUpdated")
    if not isinstance(raw_updates, list):
        return []

    artifact_updates: list[dict[str, str]] = []
    for raw_item in raw_updates:
        if not isinstance(raw_item, dict):
            continue
        path = str(raw_item.get("path") or "").strip()
        if not path:
            continue
        artifact_updates.append(
            {
                "path": path,
                "summary": str(raw_item.get("summary") or "").strip(),
            }
        )
    return artifact_updates


async def next_agent_step(
    provider_id: str,
    *,
    system_messages: list[dict[str, str]] | None,
    history: list[dict[str, str]],
    tool_schemas: list[dict[str, Any]],
    tool_transcript: list[dict[str, Any]],
) -> dict[str, Any]:
    return await model_adapter.next_agent_step(
        provider_id,
        system_messages=system_messages,
        history=history,
        tool_schemas=tool_schemas,
        tool_transcript=tool_transcript,
    )


async def _process_tool_execution(
    task_id: str,
    run_id: str,
    tool_name: str,
    tool_input: dict[str, Any],
    tool_transcript: list[dict[str, Any]],
) -> AsyncGenerator[dict[str, Any], None]:
    """执行工具并 yield 事件；致命失败会终止 run，可恢复失败会回流为 failed tool_result。"""
    call_item, result_item, error, fatal = await _execute_single_tool(task_id, run_id, tool_name, tool_input)

    yield {"type": "message.completed", "item": call_item}
    yield {"type": "tool.started", "item": call_item}

    if fatal:
        failed_item = _persist_tool_error(task_id, run_id, tool_name, error)
        update_agent_run(run_id, status="failed", checkpoint_json=None, last_error=error)
        yield {"type": "message.completed", "item": failed_item}
        yield {"type": "run.failed", "runId": run_id, "error": error}
        return

    if result_item is None:
        fallback_error = error or "tool execution failed"
        failed_item = _persist_tool_error(task_id, run_id, tool_name, fallback_error)
        update_agent_run(run_id, status="failed", checkpoint_json=None, last_error=fallback_error)
        yield {"type": "message.completed", "item": failed_item}
        yield {"type": "run.failed", "runId": run_id, "error": fallback_error}
        return

    yield {"type": "message.completed", "item": result_item}
    yield {"type": "tool.completed", "item": result_item}

    for artifact in _extract_artifact_updates(result_item["content_json"]["output"]):
        artifact_item = append_agent_message(
            task_id,
            run_id,
            role="assistant",
            kind="artifact",
            status="completed",
            content_json=artifact,
        )
        yield {"type": "message.completed", "item": artifact_item}
        yield {"type": "artifact.updated", **artifact}

    tool_transcript.extend([
        {"type": "tool_call", "toolName": tool_name, "input": tool_input},
        {"type": "tool_result", "toolName": tool_name, "output": result_item["content_json"]["output"]},
    ])


async def _execute_tool_call_sequence(
    task_id: str,
    run_id: str,
    tool_calls: list[NormalizedToolCall],
    tool_transcript: list[dict[str, Any]],
) -> AsyncGenerator[dict[str, Any], None]:
    for tool_name, tool_input in tool_calls:
        async for event in _process_tool_execution(task_id, run_id, tool_name, tool_input, tool_transcript):
            yield event
            if event["type"] == "run.failed":
                return


async def run_agent_loop(
    *,
    task_id: str,
    run_id: str,
    provider_id: str,
    history: list[dict[str, str]],
    projected_history: list[dict[str, str]],
    system_messages: list[dict[str, str]] | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    tool_schemas = serialize_tool_schemas()
    tool_transcript: list[dict[str, Any]] = []
    effective_system_messages = system_messages if system_messages is not None else get_global_memory_system_messages()

    try:
        for _ in range(MAX_TOOL_ROUNDS):
            step = await next_agent_step(
                provider_id,
                system_messages=effective_system_messages,
                history=history,
                tool_schemas=tool_schemas,
                tool_transcript=tool_transcript,
            )

            tool_calls = _extract_tool_calls_from_step(step)
            if tool_calls is None:
                full_response = _final_response_from_step(step)
                assistant_message_id = str(uuid.uuid4())
                for delta in _chunk_text(full_response):
                    yield {"type": "message.delta", "itemId": assistant_message_id, "delta": delta}
                assistant_item = _persist_completed_run_text(
                    task_id,
                    run_id,
                    projected_history,
                    assistant_message_id,
                    full_response,
                )
                yield {"type": "message.completed", "item": assistant_item}
                yield {"type": "run.completed", "runId": run_id}
                return

            assistant_text = _assistant_text_from_step(step)
            if assistant_text:
                assistant_item = _persist_assistant_text(task_id, run_id, assistant_text)
                yield {"type": "message.completed", "item": assistant_item}

            step_failed = False
            async for event in _execute_tool_call_sequence(task_id, run_id, tool_calls, tool_transcript):
                yield event
                if event["type"] == "run.failed":
                    step_failed = True
            if step_failed:
                return

        raise RuntimeError("tool round limit exceeded")
    except Exception as exc:
        err = error_message(exc)
        failed_item = _persist_run_error(task_id, run_id, err)
        update_agent_run(run_id, status="failed", checkpoint_json=None, last_error=err)
        yield {"type": "message.completed", "item": failed_item}
        yield {"type": "run.failed", "runId": run_id, "error": err}


async def run_agent_chat(
    *,
    task_id: str,
    run_id: str,
    provider_id: str,
    projected_history: list[dict[str, str]],
    messages: list[dict[str, str]],
    emit: Emitter,
) -> None:
    history = [message for message in messages if message.get("role") in {"user", "assistant"}]
    system_messages = [message for message in messages if message.get("role") == "system"]
    async for event in run_agent_loop(
        task_id=task_id,
        run_id=run_id,
        provider_id=provider_id,
        history=history,
        projected_history=projected_history,
        system_messages=system_messages,
    ):
        await emit(event)


async def stream_task_agent_run(
    task: dict[str, Any],
    task_id: str,
    provider_id: str,
    message: str,
    *,
    seed_message: str | None = None,
):
    existing_history = parse_task_chat_messages(task.get("chat_messages"))
    history = build_task_chat_history(task, message, seed_message=seed_message)
    projected_history = [*existing_history]
    new_history_items = history[len(existing_history) :]

    run = create_agent_run(task_id, provider_id)
    yield {"type": "run.started", "runId": run["id"], "run": run}

    for item in new_history_items:
        persisted = append_agent_message(
            task_id,
            run["id"],
            role=item["role"],
            kind="text",
            status="completed",
            content_json={"content": item["content"]},
        )
        projected_history.append({"role": item["role"], "content": item["content"]})
        yield {"type": "message.completed", "item": persisted}

    if new_history_items:
        persist_task_chat_history(task_id, projected_history)

    async for event in run_agent_loop(
        task_id=task_id,
        run_id=run["id"],
        provider_id=provider_id,
        history=history,
        projected_history=projected_history,
        system_messages=get_global_memory_system_messages(),
    ):
        yield event
