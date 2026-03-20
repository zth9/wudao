from __future__ import annotations

import importlib
import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient


def load_modules(tmp_path, monkeypatch):
    home_dir = tmp_path / "home"
    db_path = tmp_path / "wudao.db"
    monkeypatch.setenv("WUDAO_HOME", str(home_dir))
    monkeypatch.setenv("WUDAO_DB_PATH", str(db_path))

    for name in list(sys.modules):
        if name.startswith("src"):
            sys.modules.pop(name, None)

    app_module = importlib.import_module("src.app")
    runner = importlib.import_module("src.agent_runtime.runner")
    return app_module, runner


def create_task(client: TestClient, title: str) -> str:
    response = client.post("/api/tasks", json={"title": title, "type": "feature"})
    assert response.status_code == 201
    return response.json()["id"]


def parse_sse_payloads(raw_text: str) -> list[dict[str, object]]:
    payloads: list[dict[str, object]] = []
    for line in raw_text.splitlines():
        trimmed = line.strip()
        if not trimmed.startswith("data:"):
            continue
        payloads.append(json.loads(trimmed[5:].strip()))
    return payloads


def test_agent_chat_thread_endpoint_returns_structured_snapshot(tmp_path, monkeypatch):
    app_module, runner = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "查看 Agent Thread")

    async def fake_next_agent_step(provider_id, *, system_messages, history, tool_schemas, tool_transcript):
        assert provider_id == "claude"
        assert history
        assert tool_schemas
        assert tool_transcript == []
        return {"type": "assistant_text", "content": "第一段第二段"}

    monkeypatch.setattr(runner, "next_agent_step", fake_next_agent_step)

    run_response = client.post(
        f"/api/tasks/{task_id}/agent-chat/runs",
        json={"message": "继续", "providerId": "claude"},
    )
    assert run_response.status_code == 200

    thread_response = client.get(f"/api/tasks/{task_id}/agent-chat/thread")
    assert thread_response.status_code == 200
    thread = thread_response.json()

    assert thread["task_id"] == task_id
    assert len(thread["runs"]) == 1
    assert thread["runs"][0]["status"] == "completed"
    assert [item["role"] for item in thread["messages"]] == ["user", "user", "assistant"]
    assert thread["messages"][0]["content_json"]["content"].startswith("[任务信息]")
    assert thread["messages"][1]["content_json"] == {"content": "继续"}
    assert thread["messages"][2]["content_json"] == {"content": "第一段第二段"}


def test_agent_chat_run_stream_emits_typed_events_and_projects_legacy_chat(tmp_path, monkeypatch):
    app_module, runner = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "跑 Agent Chat")

    async def fake_next_agent_step(provider_id, *, system_messages, history, tool_schemas, tool_transcript):
        assert provider_id == "claude"
        assert history[-1]["content"] == "继续"
        assert tool_transcript == []
        return {"type": "assistant_text", "content": "第一段第二段"}

    monkeypatch.setattr(runner, "next_agent_step", fake_next_agent_step)

    response = client.post(
        f"/api/tasks/{task_id}/agent-chat/runs",
        json={"message": "继续", "providerId": "claude"},
    )
    assert response.status_code == 200

    payloads = parse_sse_payloads(response.text)
    assert [payload["type"] for payload in payloads] == [
        "run.started",
        "message.completed",
        "message.completed",
        "message.delta",
        "message.completed",
        "run.completed",
    ]

    assistant_item_id = payloads[3]["itemId"]
    assert payloads[4]["item"]["id"] == assistant_item_id
    assert payloads[4]["item"]["content_json"] == {"content": "第一段第二段"}

    fetched = client.get(f"/api/tasks/{task_id}")
    history = json.loads(fetched.json()["chat_messages"])
    assert [item["role"] for item in history] == ["user", "user", "assistant"]
    assert history[1]["content"] == "继续"
    assert history[2]["content"] == "第一段第二段"


def test_agent_chat_run_executes_read_only_tools_and_persists_timeline(tmp_path, monkeypatch):
    app_module, runner = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "列出 workspace")
    workspace_root = Path(tmp_path) / "home" / "workspace" / task_id
    workspace_root.mkdir(parents=True, exist_ok=True)
    (workspace_root / "README.md").write_text("hello\nworld\n", encoding="utf-8")

    responses = iter(
        [
            {"type": "tool_call", "toolName": "workspace_list", "input": {"path": "."}},
            {"type": "assistant_text", "content": "目录已列出"},
        ]
    )

    async def fake_next_agent_step(provider_id, *, system_messages, history, tool_schemas, tool_transcript):
        assert provider_id == "claude"
        assert tool_schemas
        return next(responses)

    monkeypatch.setattr(runner, "next_agent_step", fake_next_agent_step)

    response = client.post(
        f"/api/tasks/{task_id}/agent-chat/runs",
        json={"message": "看看当前目录", "providerId": "claude"},
    )
    assert response.status_code == 200

    payloads = parse_sse_payloads(response.text)
    assert [payload["type"] for payload in payloads] == [
        "run.started",
        "message.completed",
        "message.completed",
        "message.completed",
        "tool.started",
        "message.completed",
        "tool.completed",
        "message.delta",
        "message.completed",
        "run.completed",
    ]
    assert payloads[3]["item"]["kind"] == "tool_call"
    assert payloads[5]["item"]["kind"] == "tool_result"
    assert payloads[5]["item"]["content_json"]["toolName"] == "workspace_list"
    assert payloads[5]["item"]["content_json"]["output"]["entries"][0]["name"] == "README.md"

    thread = client.get(f"/api/tasks/{task_id}/agent-chat/thread").json()
    assert [item["kind"] for item in thread["messages"]] == ["text", "text", "tool_call", "tool_result", "text"]
    assert thread["messages"][3]["content_json"]["output"]["entries"][0]["path"] == "README.md"


def test_agent_chat_run_syncs_agents_artifact_when_write_tool_updates_agents_md(tmp_path, monkeypatch):
    app_module, runner = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "同步主产物")
    workspace_root = Path(tmp_path) / "home" / "workspace" / task_id
    workspace_root.mkdir(parents=True, exist_ok=True)

    responses = iter(
        [
            {
                "type": "tool_call",
                "toolName": "workspace_write_file",
                "input": {"path": "AGENTS.md", "content": "# Done\n同步完成\n"},
            },
            {"type": "assistant_text", "content": "主产物已同步"},
        ]
    )

    async def fake_next_agent_step(provider_id, *, system_messages, history, tool_schemas, tool_transcript):
        return next(responses)

    monkeypatch.setattr(runner, "next_agent_step", fake_next_agent_step)

    response = client.post(
        f"/api/tasks/{task_id}/agent-chat/runs",
        json={"message": "更新 AGENTS", "providerId": "claude"},
    )
    assert response.status_code == 200

    payloads = parse_sse_payloads(response.text)
    assert [payload["type"] for payload in payloads] == [
        "run.started",
        "message.completed",
        "message.completed",
        "message.completed",
        "tool.started",
        "message.completed",
        "tool.completed",
        "message.completed",
        "artifact.updated",
        "message.delta",
        "message.completed",
        "run.completed",
    ]
    assert payloads[7]["item"]["kind"] == "artifact"
    assert payloads[8] == {
        "type": "artifact.updated",
        "path": "AGENTS.md",
        "summary": "已同步 AGENTS.md 主产物",
    }

    fetched = client.get(f"/api/tasks/{task_id}").json()
    assert fetched["agent_doc"] == "# Done\n同步完成\n"

    thread = client.get(f"/api/tasks/{task_id}/agent-chat/thread").json()
    assert [item["kind"] for item in thread["messages"]] == ["text", "text", "tool_call", "tool_result", "artifact", "text"]


def test_agent_chat_run_marks_failed_run_and_keeps_legacy_projection_consistent(tmp_path, monkeypatch):
    app_module, runner = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "处理 Agent Chat 失败")

    async def fake_next_agent_step(provider_id, *, system_messages, history, tool_schemas, tool_transcript):
        assert provider_id == "claude"
        assert history
        raise RuntimeError("stream exploded")

    monkeypatch.setattr(runner, "next_agent_step", fake_next_agent_step)

    response = client.post(
        f"/api/tasks/{task_id}/agent-chat/runs",
        json={"message": "继续", "providerId": "claude"},
    )
    assert response.status_code == 200

    payloads = parse_sse_payloads(response.text)
    assert [payload["type"] for payload in payloads] == [
        "run.started",
        "message.completed",
        "message.completed",
        "message.completed",
        "run.failed",
    ]

    failed_item = payloads[3]["item"]
    assert failed_item["kind"] == "error"
    assert failed_item["status"] == "failed"
    assert failed_item["content_json"] == {"error": "stream exploded"}

    thread = client.get(f"/api/tasks/{task_id}/agent-chat/thread").json()
    assert thread["runs"][0]["status"] == "failed"
    assert thread["runs"][0]["last_error"] == "stream exploded"

    history = json.loads(client.get(f"/api/tasks/{task_id}").json()["chat_messages"])
    assert [item["role"] for item in history] == ["user", "user"]
    assert history[-1]["content"] == "继续"
