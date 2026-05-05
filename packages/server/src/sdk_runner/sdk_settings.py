from __future__ import annotations

from typing import Any

from ..db import db

AGENT_RUNNER_SETTING_ID = "default"
AGENT_RUNNER_TYPES = {"claude_sdk"}


def _serialize_settings(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "runner_type": str(row.get("runner_type") or "claude_sdk"),
        "provider_id": row.get("provider_id"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def get_agent_runner_settings() -> dict[str, Any]:
    row = db.query_one(
        "SELECT * FROM agent_runner_settings WHERE id = ?",
        (AGENT_RUNNER_SETTING_ID,),
    )
    if row is None:
        db.execute(
            """
            INSERT INTO agent_runner_settings (id, runner_type, provider_id)
            VALUES (?, 'claude_sdk', NULL)
            """,
            (AGENT_RUNNER_SETTING_ID,),
        )
        row = db.query_one(
            "SELECT * FROM agent_runner_settings WHERE id = ?",
            (AGENT_RUNNER_SETTING_ID,),
        )
    if row is None:
        raise RuntimeError("Failed to load Agent Runner settings")
    return _serialize_settings(row)


def update_agent_runner_settings(
    *,
    runner_type: str | None = None,
    provider_id: str | None = None,
) -> dict[str, Any]:
    normalized_runner_type = (runner_type or "claude_sdk").strip()
    if normalized_runner_type not in AGENT_RUNNER_TYPES:
        raise ValueError(f"unsupported agent runner type: {normalized_runner_type}")

    normalized_provider_id = provider_id.strip() if isinstance(provider_id, str) else None
    if normalized_provider_id:
        provider = db.query_one("SELECT id FROM providers WHERE id = ?", (normalized_provider_id,))
        if provider is None:
            raise ValueError("agent runner provider not found")
    else:
        normalized_provider_id = None

    get_agent_runner_settings()
    db.execute(
        """
        UPDATE agent_runner_settings
        SET runner_type = ?, provider_id = ?, updated_at = datetime('now')
        WHERE id = ?
        """,
        (normalized_runner_type, normalized_provider_id, AGENT_RUNNER_SETTING_ID),
    )
    return get_agent_runner_settings()


def resolve_agent_runner_provider_id(fallback_provider_id: str | None) -> str | None:
    settings = get_agent_runner_settings()
    configured_provider_id = settings.get("provider_id")
    if isinstance(configured_provider_id, str) and configured_provider_id.strip():
        return configured_provider_id.strip()
    return fallback_provider_id


def resolve_agent_runner_type() -> str:
    settings = get_agent_runner_settings()
    runner_type = str(settings.get("runner_type") or "claude_sdk").strip()
    if runner_type not in AGENT_RUNNER_TYPES:
        raise RuntimeError(f"unsupported agent runner type: {runner_type}")
    return runner_type
