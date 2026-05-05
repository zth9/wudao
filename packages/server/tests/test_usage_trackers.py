from __future__ import annotations

import importlib
import sys
from pathlib import Path

from fastapi.testclient import TestClient


def load_app(tmp_path, monkeypatch):
    home_dir = tmp_path / "home"
    db_path = tmp_path / "wudao.db"
    monkeypatch.setenv("WUDAO_HOME", str(home_dir))
    monkeypatch.setenv("WUDAO_DB_PATH", str(db_path))

    for name in list(sys.modules):
        if name.startswith("src"):
            sys.modules.pop(name, None)

    module = importlib.import_module("src.app")
    return module


def test_usage_trackers_seeded_on_init(tmp_path, monkeypatch):
    module = load_app(tmp_path, monkeypatch)
    client = TestClient(module.app)

    resp = client.get("/api/usage-trackers")
    assert resp.status_code == 200
    trackers = resp.json()
    assert len(trackers) >= 5

    providers = {t["provider"] for t in trackers}
    assert "minimax" in providers
    assert "glm" in providers
    assert "kimi" in providers
    assert "mimo" in providers
    assert "codex" in providers


def test_usage_tracker_crud(tmp_path, monkeypatch):
    module = load_app(tmp_path, monkeypatch)
    client = TestClient(module.app)

    trackers_before = client.get("/api/usage-trackers").json()

    created = client.post(
        "/api/usage-trackers",
        json={"provider": "minimax", "name": "My MiniMax", "auth_token": "test-token"},
    )
    assert created.status_code == 201
    tracker = created.json()
    assert tracker["provider"] == "minimax"
    assert tracker["name"] == "My MiniMax"
    assert tracker["auth_token"] == "test-token"
    assert tracker["enabled"] == 1

    updated = client.put(
        f"/api/usage-trackers/{tracker['id']}",
        json={"name": "My MiniMax Updated", "cookie": "new-cookie"},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "My MiniMax Updated"
    assert updated.json()["cookie"] == "new-cookie"

    fetched = client.get(f"/api/usage-trackers/{tracker['id']}" if False else "/api/usage-trackers")
    assert fetched.status_code == 200
    found = [t for t in fetched.json() if t["id"] == tracker["id"]]
    assert len(found) == 1
    assert found[0]["name"] == "My MiniMax Updated"

    deleted = client.delete(f"/api/usage-trackers/{tracker['id']}")
    assert deleted.status_code == 200
    assert deleted.json()["ok"] is True

    deleted_again = client.delete(f"/api/usage-trackers/{tracker['id']}")
    assert deleted_again.status_code == 404


def test_usage_tracker_unique_constraint(tmp_path, monkeypatch):
    module = load_app(tmp_path, monkeypatch)
    client = TestClient(module.app)

    client.post("/api/usage-trackers", json={"provider": "codex", "name": "Test Codex"})
    duplicate = client.post("/api/usage-trackers", json={"provider": "codex", "name": "Test Codex"})
    assert duplicate.status_code == 409


def test_usage_tracker_reorder(tmp_path, monkeypatch):
    module = load_app(tmp_path, monkeypatch)
    client = TestClient(module.app)

    trackers = client.get("/api/usage-trackers").json()
    assert len(trackers) >= 2

    ids = [t["id"] for t in trackers]
    reordered = client.put("/api/usage-trackers/order", json={"ids": list(reversed(ids))})
    assert reordered.status_code == 200
    result_ids = [t["id"] for t in reordered.json()]
    assert result_ids == list(reversed(ids))


def test_usage_tracker_reorder_invalid_ids(tmp_path, monkeypatch):
    module = load_app(tmp_path, monkeypatch)
    client = TestClient(module.app)

    resp = client.put("/api/usage-trackers/order", json={"ids": ["fake-id"]})
    assert resp.status_code == 400


def test_usage_endpoint_returns_tracker_fields(tmp_path, monkeypatch):
    module = load_app(tmp_path, monkeypatch)
    client = TestClient(module.app)

    trackers = client.get("/api/usage-trackers").json()
    codex_tracker = next((t for t in trackers if t["provider"] == "codex"), None)
    assert codex_tracker is not None

    client.put(
        f"/api/usage-trackers/{codex_tracker['id']}",
        json={"auth_token": "fake-token-for-test"},
    )

    resp = client.get("/api/usage")
    assert resp.status_code == 200
    usage_data = resp.json()

    codex_usage = next((u for u in usage_data if u.get("provider") == "Codex"), None)
    assert codex_usage is not None
    assert "tracker_id" in codex_usage
    assert "tracker_name" in codex_usage
    assert codex_usage["tracker_id"] == codex_tracker["id"]
    assert codex_usage["tracker_name"] == codex_tracker["name"]


def test_usage_tracker_create_validation(tmp_path, monkeypatch):
    module = load_app(tmp_path, monkeypatch)
    client = TestClient(module.app)

    resp = client.post("/api/usage-trackers", json={"provider": "", "name": "Test"})
    assert resp.status_code == 400

    resp = client.post("/api/usage-trackers", json={"provider": "codex", "name": ""})
    assert resp.status_code == 400


def test_usage_tracker_update_not_found(tmp_path, monkeypatch):
    module = load_app(tmp_path, monkeypatch)
    client = TestClient(module.app)

    resp = client.put("/api/usage-trackers/nonexistent-id", json={"name": "Test"})
    assert resp.status_code == 404


def test_migration_from_providers(tmp_path, monkeypatch):
    home_dir = tmp_path / "home"
    db_path = tmp_path / "wudao.db"
    monkeypatch.setenv("WUDAO_HOME", str(home_dir))
    monkeypatch.setenv("WUDAO_DB_PATH", str(db_path))

    for name in list(sys.modules):
        if name.startswith("src"):
            sys.modules.pop(name, None)

    db_module = importlib.import_module("src.db")
    test_db = db_module.DatabaseManager(db_path)
    test_db.execute(
        "UPDATE providers SET usage_auth_token = 'test-minimax-token' WHERE id = 'minimax'"
    )
    test_db.execute(
        "UPDATE providers SET usage_cookie = 'test-kimi-cookie' WHERE id = 'kimi'"
    )
    del test_db

    for name in list(sys.modules):
        if name.startswith("src"):
            sys.modules.pop(name, None)

    module = importlib.import_module("src.app")
    client = TestClient(module.app)

    trackers = client.get("/api/usage-trackers").json()

    minimax_tracker = next((t for t in trackers if t["provider"] == "minimax"), None)
    assert minimax_tracker is not None
    assert minimax_tracker["auth_token"] == "test-minimax-token"

    kimi_tracker = next((t for t in trackers if t["provider"] == "kimi"), None)
    assert kimi_tracker is not None
    assert kimi_tracker["cookie"] == "test-kimi-cookie"


def test_provider_crud_still_works(tmp_path, monkeypatch):
    module = load_app(tmp_path, monkeypatch)
    client = TestClient(module.app)

    created = client.post(
        "/api/settings",
        json={"name": "Test", "endpoint": "https://test.com", "model": "test-model"},
    )
    assert created.status_code == 201

    updated = client.put(
        f"/api/settings/{created.json()['id']}",
        json={"usage_auth_token": "legacy-token", "usage_cookie": "legacy-cookie"},
    )
    assert updated.status_code == 200
    assert updated.json()["usage_auth_token"] == "legacy-token"


def test_curl_command_crud(tmp_path, monkeypatch):
    module = load_app(tmp_path, monkeypatch)
    client = TestClient(module.app)

    trackers = client.get("/api/usage-trackers").json()
    codex_tracker = next(t for t in trackers if t["provider"] == "codex")
    assert codex_tracker["curl_command"] is None

    curl_text = "curl 'https://chatgpt.com/backend-api/wham/usage' -H 'authorization: Bearer test-jwt-token'"
    updated = client.put(
        f"/api/usage-trackers/{codex_tracker['id']}",
        json={"curl_command": curl_text, "cookie": "test-cookie"},
    )
    assert updated.status_code == 200
    assert updated.json()["curl_command"] == curl_text

    trackers_after = client.get("/api/usage-trackers").json()
    codex_after = next(t for t in trackers_after if t["provider"] == "codex")
    assert codex_after["curl_command"] == curl_text
    assert codex_after["cookie"] == "test-cookie"


def test_parse_curl_command():
    from src.usage_utils import parse_curl_command

    curl = (
        "curl 'https://chatgpt.com/backend-api/wham/usage' \\\n"
        "  -H 'accept: */*' \\\n"
        "  -H 'authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6IjE5MzQ0.test-token' \\\n"
        "  -H 'oai-device-id: 5c1dbf54-ca94-456d-9d00-0dbe51c0cab9' \\\n"
        "  -b 'oai-did=device123; session=abc'"
    )
    result = parse_curl_command(curl)

    assert result["url"] == "https://chatgpt.com/backend-api/wham/usage"
    assert result["auth_token"] == "eyJhbGciOiJSUzI1NiIsImtpZCI6IjE5MzQ0.test-token"
    assert result["cookie"] == "oai-did=device123; session=abc"
    assert result["headers"]["oai-device-id"] == "5c1dbf54-ca94-456d-9d00-0dbe51c0cab9"
    assert "authorization" not in result["headers"]

    # Empty input
    assert parse_curl_command("") == {}
    assert parse_curl_command("  ") == {}
