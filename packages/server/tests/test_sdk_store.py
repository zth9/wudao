"""Tests for sdk_runner/sdk_store.py — CRUD for task_sdk_runs / task_sdk_events."""

from __future__ import annotations

import importlib
import sys


def load_store(tmp_path, monkeypatch):
    home_dir = tmp_path / "home"
    db_path = tmp_path / "wudao.db"
    monkeypatch.setenv("WUDAO_HOME", str(home_dir))
    monkeypatch.setenv("WUDAO_DB_PATH", str(db_path))

    for name in list(sys.modules):
        if name.startswith("src"):
            sys.modules.pop(name, None)

    app_module = importlib.import_module("src.app")
    sdk_store = importlib.import_module("src.sdk_runner.sdk_store")
    return app_module, sdk_store


def create_task(app_module, tmp_path, monkeypatch) -> str:
    from fastapi.testclient import TestClient

    client = TestClient(app_module.app)
    resp = client.post("/api/tasks", json={"title": "SDK Store Test", "type": "feature"})
    assert resp.status_code == 201
    return resp.json()["id"]


# ---------------------------------------------------------------------------
# SDK Runs
# ---------------------------------------------------------------------------

def test_create_and_get_sdk_run(tmp_path, monkeypatch):
    app_module, store = load_store(tmp_path, monkeypatch)
    task_id = create_task(app_module, tmp_path, monkeypatch)

    run = store.create_sdk_run(
        task_id,
        prompt="Fix the bug",
        cwd="/tmp",
        agent_run_id="agent-run-1",
        runner_type="claude_code",
    )
    assert run["task_id"] == task_id
    assert run["agent_run_id"] == "agent-run-1"
    assert run["runner_type"] == "claude_code"
    assert run["status"] == "pending"
    assert run["prompt"] == "Fix the bug"
    assert run["cwd"] == "/tmp"
    assert run["total_cost_usd"] == 0.0
    assert run["total_tokens"] == 0

    fetched = store.get_sdk_run(run["id"])
    assert fetched is not None
    assert fetched["id"] == run["id"]
    assert fetched["agent_run_id"] == "agent-run-1"
    assert fetched["runner_type"] == "claude_code"


def test_list_task_sdk_runs(tmp_path, monkeypatch):
    app_module, store = load_store(tmp_path, monkeypatch)
    task_id = create_task(app_module, tmp_path, monkeypatch)

    store.create_sdk_run(task_id, prompt="run 1")
    store.create_sdk_run(task_id, prompt="run 2")

    runs = store.list_task_sdk_runs(task_id)
    assert len(runs) == 2
    prompts = {r["prompt"] for r in runs}
    assert prompts == {"run 1", "run 2"}

    limited = store.list_task_sdk_runs(task_id, limit=1)
    assert len(limited) == 1


def test_update_sdk_run(tmp_path, monkeypatch):
    app_module, store = load_store(tmp_path, monkeypatch)
    task_id = create_task(app_module, tmp_path, monkeypatch)

    run = store.create_sdk_run(task_id, prompt="test")
    updated = store.update_sdk_run(
        run["id"],
        status="running",
        total_cost_usd=0.42,
        total_tokens=1500,
    )
    assert updated is not None
    assert updated["status"] == "running"
    assert updated["total_cost_usd"] == 0.42
    assert updated["total_tokens"] == 1500

    failed = store.update_sdk_run(run["id"], status="failed", last_error="CLI crashed")
    assert failed is not None
    assert failed["status"] == "failed"
    assert failed["last_error"] == "CLI crashed"


def test_update_nonexistent_run_returns_none(tmp_path, monkeypatch):
    _, store = load_store(tmp_path, monkeypatch)
    result = store.update_sdk_run("nonexistent-id", status="running")
    assert result is None


def test_delete_task_sdk_runs(tmp_path, monkeypatch):
    app_module, store = load_store(tmp_path, monkeypatch)
    task_id = create_task(app_module, tmp_path, monkeypatch)

    store.create_sdk_run(task_id, prompt="a")
    store.create_sdk_run(task_id, prompt="b")

    deleted = store.delete_task_sdk_runs(task_id)
    assert deleted == 2
    assert store.list_task_sdk_runs(task_id) == []


def test_create_sdk_run_for_missing_task_raises(tmp_path, monkeypatch):
    _, store = load_store(tmp_path, monkeypatch)
    import pytest

    with pytest.raises(RuntimeError, match="Task not found"):
        store.create_sdk_run("nonexistent-task", prompt="oops")


def test_invalid_status_raises(tmp_path, monkeypatch):
    app_module, store = load_store(tmp_path, monkeypatch)
    task_id = create_task(app_module, tmp_path, monkeypatch)
    import pytest

    with pytest.raises(ValueError, match="invalid"):
        store.create_sdk_run(task_id, prompt="x", status="bogus")


# ---------------------------------------------------------------------------
# SDK Events
# ---------------------------------------------------------------------------

def test_append_and_list_sdk_events(tmp_path, monkeypatch):
    app_module, store = load_store(tmp_path, monkeypatch)
    task_id = create_task(app_module, tmp_path, monkeypatch)
    run = store.create_sdk_run(task_id, prompt="test events")

    e1 = store.append_sdk_event(run["id"], event_type="sdk_run.started", payload_json={"prompt": "hi"})
    e2 = store.append_sdk_event(run["id"], event_type="sdk.text_delta", payload_json={"text": "Hello"})
    e3 = store.append_sdk_event(run["id"], event_type="sdk.tool_use", payload_json={"tool": "Read", "input": {}})

    assert e1["seq"] == 1
    assert e2["seq"] == 2
    assert e3["seq"] == 3

    events = store.list_sdk_events(run["id"])
    assert len(events) == 3
    assert events[0]["event_type"] == "sdk_run.started"
    assert events[1]["payload_json"]["text"] == "Hello"
    assert events[2]["event_type"] == "sdk.tool_use"


def test_list_sdk_events_with_limit(tmp_path, monkeypatch):
    app_module, store = load_store(tmp_path, monkeypatch)
    task_id = create_task(app_module, tmp_path, monkeypatch)
    run = store.create_sdk_run(task_id, prompt="limit test")

    for i in range(5):
        store.append_sdk_event(run["id"], event_type=f"evt_{i}")

    limited = store.list_sdk_events(run["id"], limit=3)
    assert len(limited) == 3
    assert limited[0]["seq"] == 1
    assert limited[2]["seq"] == 3


def test_append_event_for_missing_run_raises(tmp_path, monkeypatch):
    _, store = load_store(tmp_path, monkeypatch)
    import pytest

    with pytest.raises(RuntimeError, match="SDK run not found"):
        store.append_sdk_event("nonexistent-run", event_type="sdk.error")


def test_cascade_delete_removes_events(tmp_path, monkeypatch):
    app_module, store = load_store(tmp_path, monkeypatch)
    task_id = create_task(app_module, tmp_path, monkeypatch)
    run = store.create_sdk_run(task_id, prompt="cascade")

    store.append_sdk_event(run["id"], event_type="sdk_run.started")
    store.append_sdk_event(run["id"], event_type="sdk.text_delta")

    store.delete_task_sdk_runs(task_id)
    assert store.list_sdk_events(run["id"]) == []
