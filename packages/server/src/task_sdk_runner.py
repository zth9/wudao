"""Agent Runner routes — SSE event streaming, approval, cancellation."""

from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse

from .sdk_runner.sdk_store import get_sdk_run, list_task_sdk_runs, list_sdk_events
from .sdk_runner.sdk_runner import registry
from .sdk_runner.sdk_approval import approval_manager
from .task_service import get_task_by_id


def _sse(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def register_sdk_runner_routes(app: FastAPI) -> None:

    @app.get("/api/tasks/{task_id}/sdk-runner/runs")
    async def list_sdk_runs(task_id: str) -> JSONResponse:
        task = get_task_by_id(task_id)
        if not task:
            return JSONResponse({"error": "Task not found"}, status_code=404)
        runs = list_task_sdk_runs(task_id)
        return JSONResponse({"runs": runs})

    @app.get("/api/tasks/{task_id}/sdk-runner/{run_id}/events")
    async def stream_sdk_events(task_id: str, run_id: str, request: Request):
        task = get_task_by_id(task_id)
        if not task:
            return JSONResponse({"error": "Task not found"}, status_code=404)
        run = get_sdk_run(run_id)
        if not run or run["task_id"] != task_id:
            return JSONResponse({"error": "SDK run not found"}, status_code=404)

        async def event_stream():
            # First replay persisted events
            events = list_sdk_events(run_id)
            for evt in events:
                yield _sse({"type": evt["event_type"], "run_id": run_id, **evt["payload_json"]})

            # If run already finished, close stream
            current = get_sdk_run(run_id)
            if current and current["status"] in ("completed", "failed", "cancelled"):
                yield _sse({"type": f"sdk_run.{current['status']}", "run_id": run_id})
                return

            # Poll for new events while run is active
            last_seq = events[-1]["seq"] if events else 0
            while not await request.is_disconnected():
                await asyncio.sleep(0.3)
                new_events = list_sdk_events(run_id)
                for evt in new_events:
                    if evt["seq"] > last_seq:
                        yield _sse({"type": evt["event_type"], "run_id": run_id, **evt["payload_json"]})
                        last_seq = evt["seq"]

                current = get_sdk_run(run_id)
                if current and current["status"] in ("completed", "failed", "cancelled"):
                    yield _sse({"type": f"sdk_run.{current['status']}", "run_id": run_id})
                    return

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    @app.post("/api/tasks/{task_id}/sdk-runner/{run_id}/approve")
    async def approve_sdk_action(task_id: str, run_id: str, request: Request) -> JSONResponse:
        task = get_task_by_id(task_id)
        if not task:
            return JSONResponse({"error": "Task not found"}, status_code=404)
        run = get_sdk_run(run_id)
        if not run or run["task_id"] != task_id:
            return JSONResponse({"error": "SDK run not found"}, status_code=404)

        body = await request.json()
        approval_id = body.get("approval_id", "")
        approved = body.get("approved", False)

        if not approval_id:
            return JSONResponse({"error": "approval_id is required"}, status_code=400)

        ok = approval_manager.resolve(approval_id, approved=bool(approved))
        if not ok:
            return JSONResponse({"error": "Approval not found or already resolved"}, status_code=404)

        return JSONResponse({"ok": True})

    @app.post("/api/tasks/{task_id}/sdk-runner/{run_id}/cancel")
    async def cancel_sdk_run(task_id: str, run_id: str) -> JSONResponse:
        task = get_task_by_id(task_id)
        if not task:
            return JSONResponse({"error": "Task not found"}, status_code=404)
        run = get_sdk_run(run_id)
        if not run or run["task_id"] != task_id:
            return JSONResponse({"error": "SDK run not found"}, status_code=404)

        cancelled = registry.cancel(run_id)
        if not cancelled:
            return JSONResponse({"error": "Run is not active"}, status_code=409)

        approval_manager.cancel_all_for_run(run_id)
        return JSONResponse({"ok": True})
