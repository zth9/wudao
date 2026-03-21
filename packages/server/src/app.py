from __future__ import annotations

from contextlib import asynccontextmanager
import json
import subprocess
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, Request, Response, UploadFile, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from .db import db
from .logger import logger
from .memories import (
    OpenVikingBridgeError,
    get_global_memory_system_messages,
    read_wudao_agent_memory,
    read_wudao_user_memory,
    save_wudao_agent_memory,
    save_wudao_user_memory,
)
from .openviking_bridge import close_openviking_bridge, get_openviking_status, list_openviking_memories
from .path_guard import resolve_allowed_open_path
from .paths import PROFILE_DIR, WORKSPACE_DIR, ensure_runtime_dirs
from .task_claude_md import write_task_claude_md
from .task_helpers import (
    DUE_AT_NULL_SORT_KEY,
    InvalidInputError,
    build_task_chat_history,
    build_task_chat_messages,
    decode_task_cursor,
    encode_task_cursor,
    get_default_provider_id,
    is_task_sort_field,
    parse_bounded_integer,
    parse_due_at,
    parse_pagination_limit,
    parse_task_chat_messages,
    persist_task_chat_history,
    persist_task_chat_result,
    to_due_at_sort_key,
)
from .task_agent_chat import register_task_agent_chat_routes
from .task_sdk_runner import register_sdk_runner_routes
from .task_service import (
    append_status_log,
    error_message,
    generate_and_persist_task_docs,
    get_task_by_id,
    get_task_stats_summary,
    link_task_session,
    next_task_id,
    normalize_task_status,
    parse_task_input,
    to_task_response,
    update_task_provider_binding,
    validate_transition,
)
from .terminal import terminal_manager
from .time_utils import normalize_stored_utc_datetime
from .usage_adapters import fetch_all_providers
from .llm import LlmApiError, stream_chat


def _llm_error_status(err: Exception) -> int | None:
    return err.status if isinstance(err, LlmApiError) and 400 <= err.status < 600 else None


def _parse_status_input(value: Any) -> str:
    return "done" if value == "done" else "execution"


def _parse_status_filter(value: str | None) -> str | None:
    if not value:
        return None
    if value == "done":
        return "done"
    if value in {"execution", "active"}:
        return "execution"
    return None


def _get_priority_level_sql_direction(order: str) -> str:
    return "ASC" if order == "DESC" else "DESC"


def _get_priority_level_cursor_operator(order: str) -> str:
    return ">" if order == "DESC" else "<"


def _get_order_by_sql(sort: str, order: str) -> str:
    inverse = "DESC" if order == "ASC" else "ASC"
    due_expr = f"COALESCE(t.due_at, '{DUE_AT_NULL_SORT_KEY}')"
    if sort == "updated_at":
        return f"t.updated_at {order}, t.id {order}"
    if sort == "created_at":
        return f"t.created_at {order}, t.id {order}"
    if sort == "priority":
        return f"t.priority {_get_priority_level_sql_direction(order)}, t.updated_at DESC, t.id DESC"
    if sort == "due_at":
        return f"{due_expr} {order}, t.updated_at {inverse}, t.id {inverse}"
    return "t.updated_at DESC, t.id DESC"


def _apply_cursor_filter(where: list[str], params: list[Any], sort: str, order: str, cursor: dict[str, Any] | None) -> None:
    if not cursor:
        return
    op = "<" if order == "DESC" else ">"
    inverse = ">" if order == "DESC" else "<"
    due_expr = f"COALESCE(t.due_at, '{DUE_AT_NULL_SORT_KEY}')"

    if sort == "updated_at":
        where.append("(t.updated_at {} ? OR (t.updated_at = ? AND t.id {} ?))".format(op, op))
        params.extend([cursor["updated_at"], cursor["updated_at"], cursor["id"]])
    elif sort == "created_at":
        where.append("(t.created_at {} ? OR (t.created_at = ? AND t.id {} ?))".format(op, op))
        params.extend([cursor["created_at"], cursor["created_at"], cursor["id"]])
    elif sort == "priority":
        priority_op = _get_priority_level_cursor_operator(order)
        where.append("(t.priority {} ? OR (t.priority = ? AND (t.updated_at < ? OR (t.updated_at = ? AND t.id < ?))))".format(priority_op))
        params.extend([cursor["priority"], cursor["priority"], cursor["updated_at"], cursor["updated_at"], cursor["id"]])
    else:
        where.append(f"({due_expr} {op} ? OR ({due_expr} = ? AND (t.updated_at {inverse} ? OR (t.updated_at = ? AND t.id {inverse} ?))))")
        params.extend([cursor["due_key"], cursor["due_key"], cursor["updated_at"], cursor["updated_at"], cursor["id"]])


def _get_task_with_stats(task_id: str) -> dict[str, Any] | None:
    return db.query_one("SELECT * FROM tasks WHERE id = ?", (task_id,))


def _provider_exists(provider_id: str) -> bool:
    row = db.query_one("SELECT 1 AS ok FROM providers WHERE id = ?", (provider_id,))
    return bool(row and row.get("ok") == 1)


def _nullable_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    return trimmed or None


def _list_providers() -> list[dict[str, Any]]:
    return db.query_all("SELECT * FROM providers ORDER BY sort_order ASC, created_at ASC")


def _next_provider_sort_order() -> int:
    row = db.query_one("SELECT COALESCE(MAX(sort_order), 0) + 1 AS v FROM providers")
    return int(row["v"] if row else 1)


async def _warm_openviking_on_startup() -> None:
    status = await get_openviking_status(timeout_seconds=5)
    if status.get("available"):
        logger.info("OpenViking embedded worker ready: %s", status.get("workspacePath"))
        return
    logger.warning("OpenViking embedded worker unavailable during startup: %s", status.get("message") or "unknown error")


def create_app() -> FastAPI:
    ensure_runtime_dirs()
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        try:
            await _warm_openviking_on_startup()
            yield
        finally:
            from .sdk_runner.sdk_runner import registry as sdk_registry
            from .sdk_runner.sdk_approval import approval_manager
            await sdk_registry.shutdown()
            approval_manager.clear()
            await close_openviking_bridge()
            await terminal_manager.close_all_sessions()

    app = FastAPI(lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    async def health() -> dict[str, Any]:
        row = db.query_one("SELECT 1 AS ok")
        return {"status": "ok", "db": bool(row and row["ok"] == 1)}

    @app.get("/api/settings")
    async def list_settings() -> list[dict[str, Any]]:
        return _list_providers()

    @app.get("/api/settings/{provider_id}")
    async def get_setting(provider_id: str) -> dict[str, Any]:
        provider = db.query_one("SELECT * FROM providers WHERE id = ?", (provider_id,))
        if not provider:
            raise HTTPException(status_code=404, detail="Provider not found")
        return provider

    @app.post("/api/settings")
    async def create_setting(request: Request) -> JSONResponse:
        body = await request.json()
        if not body.get("name") or not body.get("endpoint") or not body.get("model"):
            return JSONResponse({"error": "name, endpoint, model are required"}, status_code=400)
        if body.get("is_default"):
            db.execute("UPDATE providers SET is_default = 0")
        provider_id = str(uuid.uuid4())
        db.execute(
            """
            INSERT INTO providers (id, name, endpoint, api_key, usage_auth_token, usage_cookie, model, is_default, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                provider_id,
                body["name"],
                body["endpoint"],
                _nullable_string(body.get("api_key")),
                _nullable_string(body.get("usage_auth_token")),
                _nullable_string(body.get("usage_cookie")),
                body["model"],
                1 if body.get("is_default") else 0,
                _next_provider_sort_order(),
            ),
        )
        provider = db.query_one("SELECT * FROM providers WHERE id = ?", (provider_id,))
        return JSONResponse(provider, status_code=201)

    @app.put("/api/settings/order")
    async def reorder_settings(request: Request) -> JSONResponse:
        body = await request.json()
        ids = body.get("ids")
        if not isinstance(ids, list) or not ids or any(not isinstance(item, str) or not item.strip() for item in ids) or len(set(ids)) != len(ids):
            return JSONResponse({"error": "ids must be a non-empty string array without duplicates"}, status_code=400)

        existing_ids = [row["id"] for row in db.query_all("SELECT id FROM providers ORDER BY sort_order ASC, created_at ASC")]
        if len(existing_ids) != len(ids):
            return JSONResponse({"error": "ids must include all providers"}, status_code=400)
        if any(item not in set(existing_ids) for item in ids):
            return JSONResponse({"error": "ids contains unknown provider"}, status_code=400)

        with db.locked_connection() as conn:
            for idx, item in enumerate(ids, start=1):
                conn.execute("UPDATE providers SET sort_order = ? WHERE id = ?", (idx, item))
        return JSONResponse(_list_providers())

    @app.put("/api/settings/{provider_id}")
    async def update_setting(provider_id: str, request: Request) -> JSONResponse:
        existing = db.query_one("SELECT * FROM providers WHERE id = ?", (provider_id,))
        if not existing:
            return JSONResponse({"error": "Provider not found"}, status_code=404)

        body = await request.json()
        if body.get("is_default"):
            db.execute("UPDATE providers SET is_default = 0")

        db.execute(
            """
            UPDATE providers
            SET name = ?, endpoint = ?, api_key = ?, usage_auth_token = ?, usage_cookie = ?, model = ?, is_default = ?
            WHERE id = ?
            """,
            (
                body.get("name", existing["name"]),
                body.get("endpoint", existing["endpoint"]),
                _nullable_string(body["api_key"]) if "api_key" in body else existing.get("api_key"),
                _nullable_string(body["usage_auth_token"]) if "usage_auth_token" in body else existing.get("usage_auth_token"),
                _nullable_string(body["usage_cookie"]) if "usage_cookie" in body else existing.get("usage_cookie"),
                body.get("model", existing["model"]),
                1 if body.get("is_default", existing["is_default"]) else 0,
                provider_id,
            ),
        )
        return JSONResponse(db.query_one("SELECT * FROM providers WHERE id = ?", (provider_id,)))

    @app.delete("/api/settings/{provider_id}")
    async def delete_setting(provider_id: str) -> JSONResponse:
        cursor = db.execute("DELETE FROM providers WHERE id = ?", (provider_id,))
        if cursor.rowcount == 0:
            return JSONResponse({"error": "Provider not found"}, status_code=404)
        return JSONResponse({"ok": True})

    @app.get("/api/usage")
    async def usage() -> list[dict[str, Any]]:
        return await fetch_all_providers()

    async def _get_current_avatar_file() -> Path | None:
        for file in PROFILE_DIR.iterdir():
            if file.name.startswith("avatar."):
                return file
        return None

    @app.get("/api/profile/avatar")
    async def get_avatar() -> Response:
        avatar_path = await _get_current_avatar_file()
        if not avatar_path or not avatar_path.exists():
            raise HTTPException(status_code=404, detail="Not Found")
        ext = avatar_path.suffix.lower()
        content_type = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
        }.get(ext, "application/octet-stream")
        return Response(content=avatar_path.read_bytes(), media_type=content_type, headers={"Cache-Control": "no-cache"})

    @app.post("/api/profile/avatar")
    async def upload_avatar(file: UploadFile = File(...)) -> dict[str, Any]:
        for existing in PROFILE_DIR.iterdir():
            if existing.name.startswith("avatar."):
                existing.unlink(missing_ok=True)
        ext = Path(file.filename or "avatar.png").suffix or ".png"
        path = PROFILE_DIR / f"avatar{ext}"
        content = await file.read()
        path.write_bytes(content)
        return {"ok": True, "url": f"/api/profile/avatar?t={int(Path(path).stat().st_mtime_ns)}"}

    @app.get("/api/contexts/status")
    async def contexts_status() -> dict[str, Any]:
        return await get_openviking_status()

    @app.get("/api/contexts/memories")
    async def contexts_memories() -> JSONResponse:
        try:
            return JSONResponse(await list_openviking_memories())
        except OpenVikingBridgeError as exc:
            return JSONResponse({"error": exc.message, "code": exc.code, "details": exc.details}, status_code=503)
        except Exception:
            return JSONResponse({"error": "Failed to load OpenViking memories"}, status_code=500)

    @app.get("/api/contexts/user-memory")
    async def get_user_memory() -> dict[str, Any]:
        return read_wudao_user_memory()

    @app.put("/api/contexts/user-memory")
    async def update_user_memory(request: Request) -> JSONResponse:
        body = await request.json()
        if not isinstance(body.get("content"), str):
            return JSONResponse({"error": "content is required"}, status_code=400)
        return JSONResponse(await save_wudao_user_memory(body["content"]))

    @app.get("/api/contexts/agent-memory")
    async def get_agent_memory() -> dict[str, Any]:
        return read_wudao_agent_memory()

    @app.put("/api/contexts/agent-memory")
    async def update_agent_memory(request: Request) -> JSONResponse:
        body = await request.json()
        if not isinstance(body.get("content"), str):
            return JSONResponse({"error": "content is required"}, status_code=400)
        return JSONResponse(await save_wudao_agent_memory(body["content"]))

    @app.post("/api/open-path")
    async def open_path(request: Request) -> JSONResponse:
        body = await request.json()
        resolution = resolve_allowed_open_path(body.get("path"))
        if not resolution.get("ok"):
            return JSONResponse({"error": resolution["error"]}, status_code=int(resolution["status"]))
        subprocess.Popen(["open", str(resolution["path"])])
        return JSONResponse({"ok": True})

    @app.get("/api/tasks")
    async def list_tasks(request: Request) -> JSONResponse:
        try:
            status = _parse_status_filter(request.query_params.get("status"))
            sort = request.query_params.get("sort") or "updated_at"
            if not is_task_sort_field(sort):
                return JSONResponse({"error": "sort must be one of updated_at, created_at, priority, due_at"}, status_code=400)
            order = "ASC" if request.query_params.get("order", "").upper() == "ASC" else "DESC"
            priority = parse_bounded_integer(request.query_params.get("priority"), 0, 4, "priority")
            limit = parse_pagination_limit(request.query_params.get("limit"), 20, 100)
            cursor = decode_task_cursor(request.query_params.get("cursor"), sort)

            where: list[str] = []
            params: list[Any] = []
            if status:
                where.append("t.status = ?")
                params.append(status)
            if priority is not None:
                where.append("t.priority = ?")
                params.append(priority)
            _apply_cursor_filter(where, params, sort, order, cursor)

            where_sql = f"WHERE {' AND '.join(where)}" if where else ""
            rows = db.query_all(
                f"""
                SELECT t.* FROM tasks t
                {where_sql}
                ORDER BY {_get_order_by_sql(sort, order)}
                LIMIT ?
                """,
                (*params, limit + 1),
            )

            has_more = len(rows) > limit
            items = rows[:limit] if has_more else rows
            last = items[-1] if items else None
            next_cursor = (
                encode_task_cursor(
                    {
                        "sort": sort,
                        "id": last["id"],
                        "updated_at": last["updated_at"],
                        "created_at": last["created_at"],
                        "priority": last["priority"],
                        "due_key": to_due_at_sort_key(last.get("due_at")),
                    }
                )
                if has_more and last
                else None
            )
            return JSONResponse({"items": [to_task_response(item) for item in items], "page": {"next_cursor": next_cursor, "has_more": has_more, "sort": sort, "limit": limit}})
        except InvalidInputError as exc:
            return JSONResponse({"error": str(exc)}, status_code=400)
        except Exception as exc:
            logger.error("Task list error: %s", exc)
            return JSONResponse({"error": f"查询失败: {error_message(exc)}"}, status_code=500)

    @app.get("/api/tasks/stats")
    async def task_stats() -> JSONResponse:
        try:
            return JSONResponse(get_task_stats_summary())
        except Exception as exc:
            logger.error("Task stats error: %s", exc)
            return JSONResponse({"error": f"统计查询失败: {error_message(exc)}"}, status_code=500)

    @app.post("/api/tasks/parse")
    async def task_parse(request: Request) -> JSONResponse:
        body = await request.json()
        if not isinstance(body.get("input"), str) or not body["input"].strip():
            return JSONResponse({"error": "input is required"}, status_code=400)
        try:
            return JSONResponse(await parse_task_input(body["input"], body.get("providerId")))
        except Exception as exc:
            llm_status = _llm_error_status(exc if isinstance(exc, Exception) else Exception(str(exc)))
            return JSONResponse({"error": f"解析失败: {error_message(exc)}"}, status_code=llm_status or 500)

    @app.get("/api/tasks/{task_id}")
    async def get_task(task_id: str) -> JSONResponse:
        row = _get_task_with_stats(task_id)
        if not row:
            return JSONResponse({"error": "Task not found"}, status_code=404)
        return JSONResponse(to_task_response(row))

    @app.post("/api/tasks")
    async def create_task(request: Request) -> JSONResponse:
        body = await request.json()
        title = body.get("title")
        task_type = body.get("type")
        if not title or not task_type:
            return JSONResponse({"error": "title and type are required"}, status_code=400)
        try:
            priority = parse_bounded_integer(body.get("priority"), 0, 4, "priority")
            due_at = parse_due_at(body["due_at"]) if "due_at" in body else None
            task_id = next_task_id()
            db.execute(
                """
                INSERT INTO tasks (id, title, type, status, context, priority, due_at, provider_id)
                VALUES (?, ?, ?, 'execution', ?, ?, ?, ?)
                """,
                (task_id, title, task_type, body.get("context"), priority if priority is not None else 2, due_at, body.get("provider_id")),
            )
            (WORKSPACE_DIR / task_id).mkdir(parents=True, exist_ok=True)
            created = _get_task_with_stats(task_id)
            return JSONResponse(to_task_response(created) if created else None, status_code=201)
        except InvalidInputError as exc:
            return JSONResponse({"error": str(exc)}, status_code=400)
        except Exception as exc:
            logger.error("Task create error: %s", exc)
            return JSONResponse({"error": f"创建失败: {error_message(exc)}"}, status_code=500)

    @app.put("/api/tasks/{task_id}")
    async def update_task(task_id: str, request: Request) -> JSONResponse:
        existing = get_task_by_id(task_id)
        if not existing:
            return JSONResponse({"error": "Task not found"}, status_code=404)
        body = await request.json()
        try:
            priority = parse_bounded_integer(body.get("priority"), 0, 4, "priority") if "priority" in body else None
            due_at = parse_due_at(body["due_at"]) if "due_at" in body else existing.get("due_at")

            old_status = normalize_task_status(existing.get("status"))
            new_status = _parse_status_input(body["status"]) if "status" in body else old_status
            new_status_log = existing.get("status_log")
            if "status" in body and new_status != old_status:
                if not validate_transition(old_status, new_status):
                    return JSONResponse({"error": f'不允许从 "{old_status}" 转换到 "{new_status}"'}, status_code=400)
                new_status_log = append_status_log(existing.get("status_log"), {"from": old_status, "to": new_status, "reason": "", "triggered_by": "user"})

            cursor = db.execute(
                """
                UPDATE tasks
                SET title = ?, type = ?, status = ?, context = ?, agent_doc = ?, priority = ?, due_at = ?, provider_id = ?, status_log = ?, updated_at = datetime('now')
                WHERE id = ? AND status = ?
                """,
                (
                    body.get("title", existing["title"]),
                    body.get("type", existing["type"]),
                    new_status,
                    body["context"] if "context" in body else existing.get("context"),
                    body["agent_doc"] if "agent_doc" in body else existing.get("agent_doc"),
                    priority if priority is not None else existing.get("priority"),
                    due_at,
                    body["provider_id"] if "provider_id" in body else existing.get("provider_id"),
                    new_status_log,
                    task_id,
                    existing["status"],
                ),
            )
            if cursor.rowcount == 0:
                return JSONResponse({"error": "状态已变化，请刷新后重试"}, status_code=409)
            updated = _get_task_with_stats(task_id)
            return JSONResponse(to_task_response(updated) if updated else None)
        except InvalidInputError as exc:
            return JSONResponse({"error": str(exc)}, status_code=400)
        except Exception as exc:
            logger.error("Task update error: %s", exc)
            return JSONResponse({"error": f"更新失败: {error_message(exc)}"}, status_code=500)

    @app.patch("/api/tasks/{task_id}/sessions")
    async def patch_task_sessions(task_id: str, request: Request) -> JSONResponse:
        existing = get_task_by_id(task_id)
        if not existing:
            return JSONResponse({"error": "Task not found"}, status_code=404)
        body = await request.json()
        raw_session_id = body.get("sessionId")
        if not isinstance(raw_session_id, str) or not raw_session_id.strip():
            return JSONResponse({"error": "sessionId is required"}, status_code=400)
        updated = link_task_session(
            task_id,
            {
                "sessionId": raw_session_id.strip(),
                "sessionName": body.get("sessionName"),
                "providerId": body.get("providerId"),
                "replaceSessionIds": body.get("replaceSessionIds"),
            },
        )
        return JSONResponse(updated)

    @app.delete("/api/tasks/{task_id}")
    async def delete_task(task_id: str) -> JSONResponse:
        existing = db.query_one("SELECT id FROM tasks WHERE id = ?", (task_id,))
        if not existing:
            return JSONResponse({"error": "Task not found"}, status_code=404)
        # Clean up SDK runner processes for this task
        from .sdk_runner.sdk_runner import registry as sdk_registry
        from .sdk_runner.sdk_store import list_task_sdk_runs
        for run in list_task_sdk_runs(task_id):
            sdk_registry.cancel(run["id"])
        closed_sessions = terminal_manager.close_sessions_by_task_id(task_id)
        db.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        return JSONResponse({"ok": True, "closedSessions": closed_sessions})

    @app.post("/api/tasks/{task_id}/open-workspace")
    async def open_workspace(task_id: str) -> JSONResponse:
        ws_dir = WORKSPACE_DIR / task_id
        ws_dir.mkdir(parents=True, exist_ok=True)
        task = get_task_by_id(task_id)
        if task and isinstance(task.get("agent_doc"), str) and task["agent_doc"].strip():
            (ws_dir / "AGENTS.md").write_text(task["agent_doc"], encoding="utf-8")
            write_task_claude_md(ws_dir)
        subprocess.Popen(["open", str(ws_dir)])
        return JSONResponse({"ok": True})

    @app.post("/api/tasks/{task_id}/generate-docs")
    async def generate_docs(task_id: str, request: Request) -> JSONResponse:
        body = await request.json()
        try:
            return JSONResponse(await generate_and_persist_task_docs(task_id, body.get("providerId")))
        except Exception as exc:
            if error_message(exc) == "Task not found":
                return JSONResponse({"error": "Task not found"}, status_code=404)
            llm_status = _llm_error_status(exc if isinstance(exc, Exception) else Exception(str(exc)))
            return JSONResponse({"error": f"生成文档失败: {error_message(exc)}"}, status_code=llm_status or 500)

    @app.post("/api/tasks/{task_id}/chat")
    async def task_chat(task_id: str, request: Request) -> Response:
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

        normalized_message = message.strip()
        has_existing_history = len(parse_task_chat_messages(task.get("chat_messages"))) > 0
        if not normalized_message and has_existing_history:
            return JSONResponse({"error": "message is required"}, status_code=400)

        requested_provider_id = update_task_provider_binding(task_id, body.get("providerId"), task.get("provider_id"))
        history = build_task_chat_history(task, normalized_message, seed_message=seed_message)
        if len(history) > len(parse_task_chat_messages(task.get("chat_messages"))):
            persist_task_chat_history(task_id, history)
        provider_id = requested_provider_id or task.get("provider_id") or get_default_provider_id()
        messages = build_task_chat_messages(history, get_global_memory_system_messages())

        async def event_stream():
            full_response = ""
            try:
                async for delta in stream_chat(str(provider_id), messages):
                    full_response += delta
                    yield f"data: {json.dumps({'delta': delta}, ensure_ascii=False)}\n\n"
                persist_task_chat_result(task_id, history, full_response)
                yield f"data: {json.dumps({'done': True}, ensure_ascii=False)}\n\n"
            except Exception as exc:
                yield f"data: {json.dumps({'error': error_message(exc)}, ensure_ascii=False)}\n\n"

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    register_task_agent_chat_routes(app)
    register_sdk_runner_routes(app)

    @app.websocket("/ws/terminal")
    async def terminal_ws(websocket: WebSocket) -> None:
        await terminal_manager.handle_websocket(websocket)

    return app


app = create_app()
