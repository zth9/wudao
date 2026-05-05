from __future__ import annotations

import asyncio
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
from ..sdk_runner.sdk_tools import is_sdk_runner_tool_name
from . import model_adapter
from .debug_logging import agent_debug_log, debug_text, debug_value_summary
from .sdk_runner_checkpoint import build_sdk_runner_wait_checkpoint
from .sdk_result_split import split_sdk_runner_result_for_display
from .thread_store import append_agent_message, create_agent_run, update_agent_message, update_agent_run
from .tool_registry import execute_agent_tool, serialize_tool_schemas

Emitter = Callable[[dict[str, Any]], Awaitable[None]]
MAX_TOOL_ROUNDS = 8

NormalizedToolCall = tuple[str, dict[str, Any]]


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


def _build_tool_call_content(
    tool_name: str,
    tool_input: dict[str, Any],
    *,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    content = {
        "toolName": tool_name,
        "input": tool_input,
    }
    if metadata:
        content.update(metadata)
    return content


def _update_tool_call_message(
    call_item: dict[str, Any],
    *,
    status: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    content_json = call_item.get("content_json")
    existing_content = content_json if isinstance(content_json, dict) else {}
    existing_input = existing_content.get("input")
    next_metadata = {
        key: value
        for key, value in existing_content.items()
        if key not in {"toolName", "input"}
    }
    if metadata:
        next_metadata.update(metadata)
    updated = update_agent_message(
        call_item["id"],
        status=status,
        content_json=_build_tool_call_content(
            str(existing_content.get("toolName") or "tool"),
            existing_input if isinstance(existing_input, dict) else {},
            metadata=next_metadata or None,
        ),
    )
    return updated or call_item


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
    provider_id: str,
    tool_name: str,
    tool_input: dict[str, Any],
    tool_transcript: list[dict[str, Any]],
) -> AsyncGenerator[dict[str, Any], None]:
    """执行工具并 yield 事件；致命失败会终止 run，可恢复失败会回流为 failed tool_result。"""
    agent_debug_log(
        "tool.start",
        task_id=task_id,
        run_id=run_id,
        provider_id=provider_id,
        tool_name=tool_name,
        tool_input_summary=debug_value_summary(tool_input),
    )
    call_item = append_agent_message(
        task_id,
        run_id,
        role="assistant",
        kind="tool_call",
        status="streaming",
        content_json=_build_tool_call_content(tool_name, tool_input),
    )
    sdk_runner_checkpoint_active = is_sdk_runner_tool_name(tool_name)
    if sdk_runner_checkpoint_active:
        update_agent_run(
            run_id,
            checkpoint_json=build_sdk_runner_wait_checkpoint(
                tool_name=tool_name,
                tool_input=tool_input,
                tool_call_message_id=call_item["id"],
            ),
        )

    yield {"type": "message.completed", "item": call_item}
    yield {"type": "tool.started", "item": call_item}

    progress_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

    async def handle_tool_progress(metadata: dict[str, Any]) -> None:
        nonlocal call_item
        agent_debug_log(
            "tool.progress",
            task_id=task_id,
            run_id=run_id,
            provider_id=provider_id,
            tool_name=tool_name,
            metadata_summary=debug_value_summary(metadata),
        )
        call_item = _update_tool_call_message(
            call_item,
            status="streaming",
            metadata=metadata,
        )
        if sdk_runner_checkpoint_active:
            sdk_run_id = str(metadata.get("sdk_run_id") or "").strip()
            update_agent_run(
                run_id,
                checkpoint_json=build_sdk_runner_wait_checkpoint(
                    tool_name=tool_name,
                    tool_input=tool_input,
                    tool_call_message_id=call_item["id"],
                    sdk_run_id=sdk_run_id or None,
                ),
            )
        await progress_queue.put({"type": "message.completed", "item": call_item})

    tool_task = asyncio.create_task(
        execute_agent_tool(
            task_id,
            tool_name,
            tool_input,
            agent_run_id=run_id,
            provider_id=provider_id,
            on_started=handle_tool_progress,
        )
    )

    while not tool_task.done():
        queue_task = asyncio.create_task(progress_queue.get())
        done, pending = await asyncio.wait(
            {tool_task, queue_task},
            return_when=asyncio.FIRST_COMPLETED,
        )
        if queue_task in done:
            yield queue_task.result()
        else:
            queue_task.cancel()
        for pending_task in pending:
            if pending_task is queue_task:
                pending_task.cancel()

    while not progress_queue.empty():
        yield await progress_queue.get()

    try:
        output = await tool_task
    except Exception as exc:
        err = error_message(exc)
        agent_debug_log(
            "tool.exception",
            task_id=task_id,
            run_id=run_id,
            provider_id=provider_id,
            tool_name=tool_name,
            error=err,
            recoverable=_is_recoverable_tool_error(exc),
        )
        call_item = _update_tool_call_message(call_item, status="failed")
        yield {"type": "message.completed", "item": call_item}
        if _is_recoverable_tool_error(exc):
            result_item = _build_failed_tool_result(task_id, run_id, tool_name, err)
            if sdk_runner_checkpoint_active:
                update_agent_run(run_id, checkpoint_json=None)
            yield {"type": "message.completed", "item": result_item}
            yield {"type": "tool.completed", "item": result_item}
            tool_transcript.extend([
                {"type": "tool_call", "toolName": tool_name, "input": tool_input},
                {"type": "tool_result", "toolName": tool_name, "output": result_item["content_json"]["output"]},
            ])
            return
        failed_item = _persist_tool_error(task_id, run_id, tool_name, err)
        update_agent_run(run_id, status="failed", checkpoint_json=None, last_error=err)
        yield {"type": "message.completed", "item": failed_item}
        yield {"type": "run.failed", "runId": run_id, "error": err}
        return

    result_status = "failed" if isinstance(output, dict) and output.get("ok") is False else "completed"
    agent_debug_log(
        "tool.output",
        task_id=task_id,
        run_id=run_id,
        provider_id=provider_id,
        tool_name=tool_name,
        status=result_status,
        output_summary=debug_value_summary(output),
    )
    call_item = _update_tool_call_message(call_item, status=result_status)
    yield {"type": "message.completed", "item": call_item}

    split_result = split_sdk_runner_result_for_display(tool_name, output)
    result_output = split_result.display_output if split_result else output
    result_item = append_agent_message(
        task_id,
        run_id,
        role="tool",
        kind="tool_result",
        status=result_status,
        content_json={"toolName": tool_name, "output": result_output},
    )
    if sdk_runner_checkpoint_active:
        update_agent_run(run_id, checkpoint_json=None)
    yield {"type": "message.completed", "item": result_item}
    yield {"type": "tool.completed", "item": result_item}

    if split_result:
        agent_debug_log(
            "assistant.tool_final_text",
            task_id=task_id,
            run_id=run_id,
            provider_id=provider_id,
            tool_name=tool_name,
            content=debug_text(split_result.final_text),
        )
        text_item = append_agent_message(
            task_id,
            run_id,
            role="assistant",
            kind="text",
            status="completed",
            content_json={"content": split_result.final_text},
        )
        yield {"type": "message.completed", "item": text_item}

    if is_sdk_runner_tool_name(tool_name):
        compact_output: dict[str, Any] = {"ok": output.get("ok"), "final_text": str(output.get("final_text") or "")}
        if not output.get("ok"):
            compact_output["error"] = str(output.get("error") or "")
        tool_transcript.append({"type": "tool_call", "toolName": tool_name, "input": tool_input})
        tool_transcript.append({"type": "tool_result", "toolName": tool_name, "output": compact_output})
    else:
        tool_transcript.extend([
            {"type": "tool_call", "toolName": tool_name, "input": tool_input},
            {"type": "tool_result", "toolName": tool_name, "output": output},
        ])


async def _execute_tool_call_sequence(
    task_id: str,
    run_id: str,
    provider_id: str,
    tool_calls: list[NormalizedToolCall],
    tool_transcript: list[dict[str, Any]],
) -> AsyncGenerator[dict[str, Any], None]:
    for tool_name, tool_input in tool_calls:
        async for event in _process_tool_execution(
            task_id,
            run_id,
            provider_id,
            tool_name,
            tool_input,
            tool_transcript,
        ):
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
            agent_debug_log(
                "loop.step_start",
                task_id=task_id,
                run_id=run_id,
                provider_id=provider_id,
                history_count=len(history),
                projected_history_count=len(projected_history),
                latest_user_prompt=next(
                    (
                        debug_text(item.get("content", ""))
                        for item in reversed(history)
                        if item.get("role") == "user"
                    ),
                    None,
                ),
                system_message_count=len(effective_system_messages or []),
                tool_transcript_count=len(tool_transcript),
                tool_transcript_summary=[
                    {
                        "type": item.get("type"),
                        "toolName": item.get("toolName"),
                    }
                    for item in tool_transcript
                ],
            )

            assistant_message_id = str(uuid.uuid4())
            step: dict[str, Any] | None = None

            async for event in model_adapter.stream_next_agent_step(
                provider_id,
                system_messages=effective_system_messages,
                history=history,
                tool_schemas=tool_schemas,
                tool_transcript=tool_transcript,
            ):
                if event["type"] == "delta":
                    yield {"type": "message.delta", "itemId": assistant_message_id, "delta": event["text"]}
                elif event["type"] == "complete":
                    step = event["step"]

            if step is None:
                raise RuntimeError("stream_next_agent_step did not yield a step")

            tool_calls = _extract_tool_calls_from_step(step)
            if tool_calls is None:
                full_response = _final_response_from_step(step)
                agent_debug_log(
                    "assistant.final_response",
                    task_id=task_id,
                    run_id=run_id,
                    provider_id=provider_id,
                    content=debug_text(full_response),
                    degraded=step.get("degraded"),
                )
                assistant_item = _persist_completed_run_text(
                    task_id,
                    run_id,
                    projected_history,
                    assistant_message_id,
                    full_response,
                )
                yield {"type": "message.completed", "item": assistant_item}
                agent_debug_log(
                    "run.completed",
                    task_id=task_id,
                    run_id=run_id,
                    provider_id=provider_id,
                )
                yield {"type": "run.completed", "runId": run_id}
                return

            assistant_text = _assistant_text_from_step(step)
            if assistant_text:
                agent_debug_log(
                    "assistant.intermediate_text",
                    task_id=task_id,
                    run_id=run_id,
                    provider_id=provider_id,
                    content=debug_text(assistant_text),
                )
                assistant_item = _persist_assistant_text(task_id, run_id, assistant_text)
                yield {"type": "message.completed", "item": assistant_item}

            step_failed = False
            async for event in _execute_tool_call_sequence(task_id, run_id, provider_id, tool_calls, tool_transcript):
                yield event
                if event["type"] == "run.failed":
                    step_failed = True
            if step_failed:
                return

        raise RuntimeError("tool round limit exceeded")
    except Exception as exc:
        err = error_message(exc)
        agent_debug_log(
            "run.failed",
            task_id=task_id,
            run_id=run_id,
            provider_id=provider_id,
            error=err,
        )
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
    agent_debug_log(
        "run.started",
        task_id=task_id,
        run_id=run["id"],
        provider_id=provider_id,
        message=debug_text(message),
        seed_message=debug_text(seed_message) if seed_message is not None else None,
        existing_history_count=len(existing_history),
        new_history_count=len(new_history_items),
    )
    yield {"type": "run.started", "runId": run["id"], "run": run}

    for item in new_history_items:
        agent_debug_log(
            "user.message",
            task_id=task_id,
            run_id=run["id"],
            provider_id=provider_id,
            role=item["role"],
            content=debug_text(item["content"]),
        )
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
