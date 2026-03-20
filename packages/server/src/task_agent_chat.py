from __future__ import annotations

import json
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse

from .agent_runtime.runner import stream_task_agent_run
from .agent_runtime.thread_store import get_task_agent_thread
from .task_helpers import get_default_provider_id, parse_task_chat_messages
from .task_service import error_message, get_task_by_id, update_task_provider_binding


def _sse(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def register_task_agent_chat_routes(app: FastAPI) -> None:
    @app.get("/api/tasks/{task_id}/agent-chat/thread")
    async def get_agent_chat_thread(task_id: str) -> JSONResponse:
        task = get_task_by_id(task_id)
        if not task:
            return JSONResponse({"error": "Task not found"}, status_code=404)
        return JSONResponse(get_task_agent_thread(task_id))

    @app.post("/api/tasks/{task_id}/agent-chat/runs")
    async def create_agent_chat_run(task_id: str, request: Request):
        task = get_task_by_id(task_id)
        if not task:
            return JSONResponse({"error": "Task not found"}, status_code=404)

        body = await request.json()
        message = body.get("message")
        seed_message = body.get("seedMessage")
        if not isinstance(message, str):
            return JSONResponse({"error": "message is required"}, status_code=400)
        if seed_message is not None and not isinstance(seed_message, str):
            return JSONResponse({"error": "seedMessage must be a string"}, status_code=400)

        existing_history = parse_task_chat_messages(task.get("chat_messages"))
        normalized_message = message.strip()
        if not normalized_message and existing_history:
            return JSONResponse({"error": "message is required"}, status_code=400)

        requested_provider_id = update_task_provider_binding(task_id, body.get("providerId"), task.get("provider_id"))
        provider_id = requested_provider_id or task.get("provider_id") or get_default_provider_id()
        async def event_stream():
            try:
                async for event in stream_task_agent_run(
                    task,
                    task_id,
                    str(provider_id),
                    normalized_message,
                    seed_message=seed_message,
                ):
                    yield _sse(event)
            except Exception as exc:
                yield _sse({"type": "run.failed", "error": error_message(exc)})

        return StreamingResponse(event_stream(), media_type="text/event-stream")
