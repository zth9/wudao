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
    thread_store = importlib.import_module("src.agent_runtime.thread_store")
    sdk_store = importlib.import_module("src.sdk_runner.sdk_store")
    return app_module, runner, thread_store, sdk_store


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


def start_run_and_collect_events(client: TestClient, task_id: str, payload: dict[str, object]) -> list[dict[str, object]]:
    start_response = client.post(
        f"/api/tasks/{task_id}/agent-chat/runs",
        json=payload,
    )
    assert start_response.status_code == 200
    run_id = start_response.json()["runId"]
    event_response = client.get(f"/api/tasks/{task_id}/agent-chat/runs/{run_id}/events")
    assert event_response.status_code == 200
    return parse_sse_payloads(event_response.text)


def test_agent_chat_thread_endpoint_returns_structured_snapshot(tmp_path, monkeypatch):
    app_module, runner, _, _ = load_modules(tmp_path, monkeypatch)
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
    app_module, runner, _, _ = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "跑 Agent Chat")

    async def fake_next_agent_step(provider_id, *, system_messages, history, tool_schemas, tool_transcript):
        assert provider_id == "claude"
        assert history[-1]["content"] == "继续"
        assert tool_transcript == []
        return {"type": "assistant_text", "content": "第一段第二段"}

    monkeypatch.setattr(runner, "next_agent_step", fake_next_agent_step)

    payloads = start_run_and_collect_events(
        client,
        task_id,
        {"message": "继续", "providerId": "claude"},
    )
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
    app_module, runner, _, _ = load_modules(tmp_path, monkeypatch)
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

    payloads = start_run_and_collect_events(
        client,
        task_id,
        {"message": "看看当前目录", "providerId": "claude"},
    )
    assert [payload["type"] for payload in payloads] == [
        "run.started",
        "message.completed",
        "message.completed",
        "message.completed",
        "tool.started",
        "message.completed",
        "message.completed",
        "tool.completed",
        "message.delta",
        "message.completed",
        "run.completed",
    ]
    assert payloads[3]["item"]["kind"] == "tool_call"
    assert payloads[3]["item"]["status"] == "streaming"
    assert payloads[5]["item"]["kind"] == "tool_call"
    assert payloads[5]["item"]["status"] == "completed"
    assert payloads[6]["item"]["kind"] == "tool_result"
    assert payloads[6]["item"]["content_json"]["toolName"] == "workspace_list"
    assert payloads[6]["item"]["content_json"]["output"]["entries"][0]["name"] == "README.md"

    thread = client.get(f"/api/tasks/{task_id}/agent-chat/thread").json()
    assert [item["kind"] for item in thread["messages"]] == ["text", "text", "tool_call", "tool_result", "text"]
    assert thread["messages"][3]["content_json"]["output"]["entries"][0]["path"] == "README.md"


def test_agent_chat_run_syncs_agents_artifact_when_write_tool_updates_agents_md(tmp_path, monkeypatch):
    app_module, runner, _, _ = load_modules(tmp_path, monkeypatch)
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

    payloads = start_run_and_collect_events(
        client,
        task_id,
        {"message": "更新 AGENTS", "providerId": "claude"},
    )
    assert [payload["type"] for payload in payloads] == [
        "run.started",
        "message.completed",
        "message.completed",
        "message.completed",
        "tool.started",
        "message.completed",
        "message.completed",
        "tool.completed",
        "message.completed",
        "artifact.updated",
        "message.delta",
        "message.completed",
        "run.completed",
    ]
    assert payloads[6]["item"]["kind"] == "tool_result"
    assert payloads[8]["item"]["kind"] == "artifact"
    assert payloads[9] == {
        "type": "artifact.updated",
        "path": "AGENTS.md",
        "summary": "已同步 AGENTS.md 主产物",
    }

    fetched = client.get(f"/api/tasks/{task_id}").json()
    assert fetched["agent_doc"] == "# Done\n同步完成\n"

    thread = client.get(f"/api/tasks/{task_id}/agent-chat/thread").json()
    assert [item["kind"] for item in thread["messages"]] == ["text", "text", "tool_call", "tool_result", "artifact", "text"]


def test_agent_chat_run_recovers_from_tool_error_and_finishes_turn(tmp_path, monkeypatch):
    app_module, runner, _, _ = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "recover from tool error")

    call_count = 0

    async def fake_next_agent_step(provider_id, *, system_messages, history, tool_schemas, tool_transcript):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return {"type": "tool_call", "toolName": "task_read_context", "input": {"taskId": "current"}}

        assert tool_transcript == [
            {"type": "tool_call", "toolName": "task_read_context", "input": {"taskId": "current"}},
            {
                "type": "tool_result",
                "toolName": "task_read_context",
                "output": {"ok": False, "error": "task_id is invalid"},
            },
        ]
        return {"type": "assistant_text", "content": "先告诉我这个报错的出现环境和复现步骤。"}

    monkeypatch.setattr(runner, "next_agent_step", fake_next_agent_step)

    payloads = start_run_and_collect_events(
        client,
        task_id,
        {"message": "", "providerId": "claude"},
    )
    assert payloads[0]["type"] == "run.started"
    assert payloads[1]["item"]["role"] == "user"
    assert payloads[2]["item"]["kind"] == "tool_call"
    assert payloads[2]["item"]["status"] == "streaming"
    assert payloads[4]["item"]["kind"] == "tool_call"
    assert payloads[4]["item"]["status"] == "failed"
    assert payloads[5]["item"]["kind"] == "tool_result"
    assert payloads[5]["item"]["status"] == "failed"
    assert payloads[5]["item"]["content_json"] == {
        "toolName": "task_read_context",
        "output": {"ok": False, "error": "task_id is invalid"},
    }
    assert payloads[-1] == {"type": "run.completed", "runId": payloads[0]["runId"]}
    assert all(payload["type"] != "run.failed" for payload in payloads)

    thread = client.get(f"/api/tasks/{task_id}/agent-chat/thread").json()
    assert thread["runs"][0]["status"] == "completed"
    assert thread["runs"][0]["last_error"] is None

    history = json.loads(client.get(f"/api/tasks/{task_id}").json()["chat_messages"])
    assert history[-1] == {"role": "assistant", "content": "先告诉我这个报错的出现环境和复现步骤。"}


def test_agent_chat_run_feeds_completed_claude_code_result_back_into_model(tmp_path, monkeypatch):
    app_module, runner, _, _ = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "Claude Code 完成后继续回答")

    step_count = 0

    async def fake_next_agent_step(provider_id, *, system_messages, history, tool_schemas, tool_transcript):
        nonlocal step_count
        step_count += 1
        if step_count == 1:
            return {
                "type": "tool_call",
                "toolName": "invoke_claude_code_runner",
                "input": {"prompt": "获取当前时间"},
            }

        assert tool_transcript == [
            {"type": "tool_call", "toolName": "invoke_claude_code_runner", "input": {"prompt": "获取当前时间"}},
            {
                "type": "tool_result",
                "toolName": "invoke_claude_code_runner",
                "output": {
                    "ok": True,
                    "status": "completed",
                    "sdk_run_id": "sdk-run-time",
                    "runner_type": "claude_code",
                    "tool_name": "invoke_claude_code_runner",
                    "cwd": "/tmp/demo",
                    "prompt": "获取当前时间",
                    "final_text": "Sun Mar 22 09:00:00 CST 2026",
                    "summary_source": "sdk.tool_result",
                    "tool_names": ["Bash"],
                    "total_cost_usd": 0.01,
                    "total_tokens": 12,
                    "duration_ms": 900,
                    "num_turns": 1,
                    "last_tool_result": {
                        "tool_use_id": "toolu_1",
                        "tool_name": "Bash",
                        "content": "Sun Mar 22 09:00:00 CST 2026",
                        "text": "Sun Mar 22 09:00:00 CST 2026",
                    },
                    "message": "Claude Code Runner completed successfully.",
                },
            },
        ]
        return {"type": "assistant_text", "content": "当前时间是 Sun Mar 22 09:00:00 CST 2026。"}

    async def fake_execute_agent_tool(task_id, tool_name, input_data, *, agent_run_id=None, on_started=None):
        assert tool_name == "invoke_claude_code_runner"
        assert input_data == {"prompt": "获取当前时间"}
        if on_started is not None:
            await on_started(
                {
                    "sdk_run_id": "sdk-run-time",
                    "runner_type": "claude_code",
                    "tool_name": "invoke_claude_code_runner",
                    "status": "running",
                    "message": "Claude Code Runner started and is now running.",
                }
            )
        return {
            "ok": True,
            "status": "completed",
            "sdk_run_id": "sdk-run-time",
            "runner_type": "claude_code",
            "tool_name": "invoke_claude_code_runner",
            "cwd": "/tmp/demo",
            "prompt": "获取当前时间",
            "final_text": "Sun Mar 22 09:00:00 CST 2026",
            "summary_source": "sdk.tool_result",
            "tool_names": ["Bash"],
            "total_cost_usd": 0.01,
            "total_tokens": 12,
            "duration_ms": 900,
            "num_turns": 1,
            "last_tool_result": {
                "tool_use_id": "toolu_1",
                "tool_name": "Bash",
                "content": "Sun Mar 22 09:00:00 CST 2026",
                "text": "Sun Mar 22 09:00:00 CST 2026",
            },
            "message": "Claude Code Runner completed successfully.",
        }

    monkeypatch.setattr(runner, "next_agent_step", fake_next_agent_step)
    monkeypatch.setattr(runner, "execute_agent_tool", fake_execute_agent_tool)

    payloads = start_run_and_collect_events(
        client,
        task_id,
        {"message": "现在几点", "providerId": "claude"},
    )

    payload_types = [payload["type"] for payload in payloads]
    assert payload_types[:9] == [
        "run.started",
        "message.completed",
        "message.completed",
        "message.completed",
        "tool.started",
        "message.completed",
        "message.completed",
        "message.completed",
        "tool.completed",
    ]
    assert payload_types[-2:] == ["message.completed", "run.completed"]
    assert payload_types.count("message.delta") >= 1
    assert payloads[3]["item"]["kind"] == "tool_call"
    assert payloads[3]["item"]["status"] == "streaming"
    assert payloads[5]["item"]["kind"] == "tool_call"
    assert payloads[5]["item"]["content_json"]["sdk_run_id"] == "sdk-run-time"
    assert payloads[6]["item"]["kind"] == "tool_call"
    assert payloads[6]["item"]["status"] == "completed"
    assert payloads[7]["item"]["kind"] == "tool_result"
    assert payloads[7]["item"]["content_json"]["output"]["final_text"] == "Sun Mar 22 09:00:00 CST 2026"
    assert payloads[-2]["item"]["content_json"]["content"] == "当前时间是 Sun Mar 22 09:00:00 CST 2026。"

    thread = client.get(f"/api/tasks/{task_id}/agent-chat/thread").json()
    assert [item["kind"] for item in thread["messages"]] == ["text", "text", "tool_call", "tool_result", "text"]
    assert thread["messages"][2]["content_json"]["sdk_run_id"] == "sdk-run-time"
    assert thread["messages"][3]["content_json"]["output"]["final_text"] == "Sun Mar 22 09:00:00 CST 2026"
    assert thread["messages"][4]["content_json"]["content"] == "当前时间是 Sun Mar 22 09:00:00 CST 2026。"

    history = json.loads(client.get(f"/api/tasks/{task_id}").json()["chat_messages"])
    assert history[-1] == {"role": "assistant", "content": "当前时间是 Sun Mar 22 09:00:00 CST 2026。"}


def test_thread_endpoint_repairs_orphaned_completed_sdk_runner_tool_call(tmp_path, monkeypatch):
    app_module, _, thread_store, sdk_store = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "修复孤儿 runner 工具调用")

    run = thread_store.create_agent_run(task_id, "openai", run_id="agent-run-1")
    thread_store.append_agent_message(
        task_id,
        run["id"],
        role="user",
        kind="text",
        status="completed",
        content_json={"content": "再试一次"},
        message_id="user-msg-1",
    )
    thread_store.append_agent_message(
        task_id,
        run["id"],
        role="assistant",
        kind="text",
        status="completed",
        content_json={"content": "我再试一次，用 cc 获取当前时间。"},
        message_id="assistant-msg-1",
    )
    thread_store.append_agent_message(
        task_id,
        run["id"],
        role="assistant",
        kind="tool_call",
        status="streaming",
        content_json={
            "toolName": "invoke_claude_code_runner",
            "input": {"prompt": "print current time", "timeoutSeconds": 120},
            "sdk_run_id": "sdk-run-1",
        },
        message_id="tool-call-1",
    )

    sdk_store.create_sdk_run(
        task_id,
        prompt="print current time",
        cwd="/tmp/demo",
        agent_run_id=run["id"],
        runner_type="claude_code",
        status="completed",
        run_id="sdk-run-1",
    )
    sdk_store.append_sdk_event(
        "sdk-run-1",
        event_type="sdk.tool_use",
        payload_json={"tool_name": "Bash"},
    )
    sdk_store.append_sdk_event(
        "sdk-run-1",
        event_type="sdk.text_completed",
        payload_json={"text": "Sunday, March 22, 2026 — 01:08:18 CST"},
    )
    sdk_store.append_sdk_event(
        "sdk-run-1",
        event_type="sdk.cost_update",
        payload_json={"duration_ms": 11730, "num_turns": 2},
    )

    response = client.get(f"/api/tasks/{task_id}/agent-chat/thread")
    assert response.status_code == 200
    thread = response.json()

    assert thread["runs"][0]["status"] == "completed"
    assert [item["kind"] for item in thread["messages"]] == ["text", "text", "tool_call", "tool_result"]
    assert thread["messages"][2]["status"] == "completed"
    assert thread["messages"][2]["content_json"]["sdk_run_id"] == "sdk-run-1"
    assert thread["messages"][3]["status"] == "completed"
    assert thread["messages"][3]["content_json"]["output"]["sdk_run_id"] == "sdk-run-1"
    assert thread["messages"][3]["content_json"]["output"]["final_text"] == "Sunday, March 22, 2026 — 01:08:18 CST"


def test_agent_chat_run_marks_failed_run_and_keeps_legacy_projection_consistent(tmp_path, monkeypatch):
    app_module, runner, _, _ = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "处理 Agent Chat 失败")

    async def fake_next_agent_step(provider_id, *, system_messages, history, tool_schemas, tool_transcript):
        assert provider_id == "claude"
        assert history
        raise RuntimeError("stream exploded")

    monkeypatch.setattr(runner, "next_agent_step", fake_next_agent_step)

    payloads = start_run_and_collect_events(
        client,
        task_id,
        {"message": "继续", "providerId": "claude"},
    )
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
