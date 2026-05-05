from __future__ import annotations

import uuid
from typing import Any

from .db import db


def list_trackers() -> list[dict[str, Any]]:
    return db.query_all("SELECT * FROM usage_trackers ORDER BY sort_order ASC, created_at ASC")


def get_tracker(tracker_id: str) -> dict[str, Any] | None:
    return db.query_one("SELECT * FROM usage_trackers WHERE id = ?", (tracker_id,))


def create_tracker(data: dict[str, Any]) -> dict[str, Any]:
    provider = data.get("provider", "").strip()
    name = data.get("name", "").strip()
    if not provider or not name:
        raise ValueError("provider and name are required")

    existing = db.query_one(
        "SELECT 1 AS ok FROM usage_trackers WHERE provider = ? AND name = ?",
        (provider, name),
    )
    if existing:
        raise ValueError(f"tracker with provider={provider} and name={name} already exists")

    next_sort = db.query_one("SELECT COALESCE(MAX(sort_order), 0) + 1 AS v FROM usage_trackers")
    sort_order = int(next_sort["v"] if next_sort else 1)

    tracker_id = str(uuid.uuid4())
    db.execute(
        """
        INSERT INTO usage_trackers (id, provider, name, auth_token, cookie, curl_command, url, sort_order, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            tracker_id,
            provider,
            name,
            data.get("auth_token"),
            data.get("cookie"),
            data.get("curl_command"),
            data.get("url"),
            sort_order,
            1 if data.get("enabled", True) else 0,
        ),
    )
    return db.query_one("SELECT * FROM usage_trackers WHERE id = ?", (tracker_id,))


def update_tracker(tracker_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
    existing = get_tracker(tracker_id)
    if not existing:
        return None

    provider = data.get("provider", existing["provider"])
    name = data.get("name", existing["name"])

    if (provider != existing["provider"] or name != existing["name"]):
        conflict = db.query_one(
            "SELECT 1 AS ok FROM usage_trackers WHERE provider = ? AND name = ? AND id != ?",
            (provider, name, tracker_id),
        )
        if conflict:
            raise ValueError(f"tracker with provider={provider} and name={name} already exists")

    db.execute(
        """
        UPDATE usage_trackers
        SET provider = ?, name = ?, auth_token = ?, cookie = ?, curl_command = ?, url = ?, enabled = ?
        WHERE id = ?
        """,
        (
            provider,
            name,
            data.get("auth_token", existing.get("auth_token")),
            data.get("cookie", existing.get("cookie")),
            data.get("curl_command", existing.get("curl_command")),
            data.get("url", existing.get("url")),
            1 if data.get("enabled", existing.get("enabled", 1)) else 0,
            tracker_id,
        ),
    )
    return get_tracker(tracker_id)


def delete_tracker(tracker_id: str) -> bool:
    cursor = db.execute("DELETE FROM usage_trackers WHERE id = ?", (tracker_id,))
    return cursor.rowcount > 0


def reorder_trackers(ids: list[str]) -> list[dict[str, Any]]:
    existing_rows = db.query_all("SELECT id FROM usage_trackers ORDER BY sort_order ASC, created_at ASC")
    existing_ids = [str(row["id"]) for row in existing_rows]

    if len(existing_ids) != len(ids) or set(ids) != set(existing_ids):
        raise ValueError("ids must include all trackers without duplicates")

    with db.locked_connection() as conn:
        for idx, tracker_id in enumerate(ids, start=1):
            conn.execute("UPDATE usage_trackers SET sort_order = ? WHERE id = ?", (idx, tracker_id))

    return list_trackers()
