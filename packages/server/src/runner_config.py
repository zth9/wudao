"""Agent Runner configuration — global defaults for the agent_runner tool."""

from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse

from .db import db

DEFAULT_RUNNER_CONFIG: dict[str, Any] = {
    "runner_type": "claude_code",
    "provider_id": None,
    "model_override": None,
}


def get_runner_config() -> dict[str, Any]:
    row = db.query_one("SELECT * FROM agent_runner_config WHERE id = 1")
    if row is None:
        return {**DEFAULT_RUNNER_CONFIG}
    return {
        "runner_type": str(row.get("runner_type") or "claude_code"),
        "provider_id": row.get("provider_id"),
        "model_override": row.get("model_override"),
    }


def set_runner_config(
    *,
    runner_type: str | None = None,
    provider_id: str | None = None,
    model_override: str | None = None,
) -> dict[str, Any]:
    existing = db.query_one("SELECT id FROM agent_runner_config WHERE id = 1")
    if existing:
        db.execute(
            """
            UPDATE agent_runner_config
            SET runner_type = ?, provider_id = ?, model_override = ?, updated_at = datetime('now')
            WHERE id = 1
            """,
            (runner_type or "claude_code", provider_id, model_override),
        )
    else:
        db.execute(
            """
            INSERT INTO agent_runner_config (id, runner_type, provider_id, model_override)
            VALUES (1, ?, ?, ?)
            """,
            (runner_type or "claude_code", provider_id, model_override),
        )
    return get_runner_config()


def register_runner_config_routes(app: Any) -> None:
    @app.get("/api/runner-config")
    async def get_runner_config_route(_request: Request) -> JSONResponse:
        return JSONResponse(get_runner_config())

    @app.put("/api/runner-config")
    async def set_runner_config_route(request: Request) -> JSONResponse:
        body = await request.json()
        runner_type = body.get("runner_type")
        provider_id = body.get("provider_id")
        model_override = body.get("model_override")
        config = set_runner_config(
            runner_type=str(runner_type) if runner_type is not None else None,
            provider_id=str(provider_id) if provider_id else None,
            model_override=str(model_override) if model_override else None,
        )
        return JSONResponse(config)
