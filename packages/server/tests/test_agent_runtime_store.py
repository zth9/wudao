from __future__ import annotations

import importlib
import sys

from fastapi.testclient import TestClient
import pytest


def load_modules(tmp_path, monkeypatch):
    home_dir = tmp_path / "home"
    db_path = tmp_path / "wudao.db"
    monkeypatch.setenv("WUDAO_HOME", str(home_dir))
    monkeypatch.setenv("WUDAO_DB_PATH", str(db_path))

    for name in list(sys.modules):
        if name.startswith("src"):
            sys.modules.pop(name, None)

    app_module = importlib.import_module("src.app")
    thread_store = importlib.import_module("src.agent_runtime.thread_store")
    db_module = importlib.import_module("src.db")
    return app_module, thread_store, db_module


def create_task(client: TestClient, title: str) -> str:
    response = client.post("/api/tasks", json={"title": title, "type": "feature"})
    assert response.status_code == 201
    return response.json()["id"]


def test_agent_runtime_tables_are_initialized(tmp_path, monkeypatch):
    _, _, db_module = load_modules(tmp_path, monkeypatch)

    run_table = db_module.db.query_one(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'task_agent_runs'"
    )
    message_table = db_module.db.query_one(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'task_agent_messages'"
    )

    assert run_table == {"name": "task_agent_runs"}
    assert message_table == {"name": "task_agent_messages"}


def test_agent_runtime_store_persists_runs_and_thread_messages(tmp_path, monkeypatch):
    app_module, thread_store, _ = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "搭 Agent Runtime")

    created_run = thread_store.create_agent_run(
        task_id,
        "claude",
        run_id="run-1",
        checkpoint_json={"cursor": 1},
    )
    assert created_run["id"] == "run-1"
    assert created_run["status"] == "running"
    assert created_run["checkpoint_json"] == {"cursor": 1}
    assert created_run["last_error"] is None

    waiting_run = thread_store.update_agent_run(
        "run-1",
        status="waiting_approval",
        checkpoint_json={"tool": "workspace_read_file"},
        last_error="需要审批",
    )
    assert waiting_run is not None
    assert waiting_run["status"] == "waiting_approval"
    assert waiting_run["checkpoint_json"] == {"tool": "workspace_read_file"}
    assert waiting_run["last_error"] == "需要审批"

    first = thread_store.append_agent_message(
        task_id,
        "run-1",
        role="user",
        kind="text",
        status="completed",
        content_json={"content": "先列一下 workspace"},
        message_id="msg-1",
    )
    second = thread_store.append_agent_message(
        task_id,
        "run-1",
        role="assistant",
        kind="tool_call",
        status="completed",
        content_json={"toolName": "workspace_list"},
        message_id="msg-2",
    )
    third = thread_store.append_agent_message(
        task_id,
        "run-1",
        role="tool",
        kind="tool_result",
        status="completed",
        content_json={"entries": ["AGENTS.md"]},
        message_id="msg-3",
    )

    assert [first["seq"], second["seq"], third["seq"]] == [1, 2, 3]
    assert third["content_json"] == {"entries": ["AGENTS.md"]}

    thread = thread_store.get_task_agent_thread(task_id)
    assert [run["id"] for run in thread["runs"]] == ["run-1"]
    assert [item["id"] for item in thread["messages"]] == ["msg-1", "msg-2", "msg-3"]
    assert thread["messages"][1]["kind"] == "tool_call"
    assert thread["messages"][2]["content_json"] == {"entries": ["AGENTS.md"]}


def test_agent_runtime_store_rejects_cross_task_message_append(tmp_path, monkeypatch):
    app_module, thread_store, _ = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "任务一")
    other_task_id = create_task(client, "任务二")

    thread_store.create_agent_run(task_id, "claude", run_id="run-1")

    with pytest.raises(ValueError, match="does not belong to task"):
        thread_store.append_agent_message(
            other_task_id,
            "run-1",
            role="assistant",
            kind="text",
            content_json={"content": "越权"},
        )


def test_agent_runtime_store_cascades_with_task_deletion(tmp_path, monkeypatch):
    app_module, thread_store, _ = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "清理 Agent Runtime 数据")

    thread_store.create_agent_run(task_id, "claude", run_id="run-1")
    thread_store.append_agent_message(
        task_id,
        "run-1",
        role="assistant",
        kind="text",
        content_json={"content": "hello"},
        message_id="msg-1",
    )

    deleted = client.delete(f"/api/tasks/{task_id}")
    assert deleted.status_code == 200

    assert thread_store.get_agent_run("run-1") is None
    assert thread_store.list_task_agent_messages(task_id) == []
