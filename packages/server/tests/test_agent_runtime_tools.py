from __future__ import annotations

import asyncio
import importlib
import sys
from types import SimpleNamespace

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
    workspace_tools = importlib.import_module("src.agent_runtime.workspace_tools")
    terminal_tools = importlib.import_module("src.agent_runtime.terminal_tools")
    tool_registry = importlib.import_module("src.agent_runtime.tool_registry")
    terminal_module = importlib.import_module("src.terminal")
    return app_module, workspace_tools, terminal_tools, tool_registry, terminal_module, home_dir


def create_task(client: TestClient, title: str) -> str:
    response = client.post("/api/tasks", json={"title": title, "type": "feature"})
    assert response.status_code == 201
    return response.json()["id"]


def test_workspace_tools_list_read_and_search_inside_task_workspace(tmp_path, monkeypatch):
    app_module, workspace_tools, _, _, _, home_dir = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "只读 workspace")

    ws_dir = home_dir / "workspace" / task_id
    docs_dir = ws_dir / "docs"
    docs_dir.mkdir(parents=True, exist_ok=True)
    (ws_dir / "AGENTS.md").write_text("# Task\nhello agent\n", encoding="utf-8")
    (docs_dir / "notes.txt").write_text("first line\nsecond line\nkeyword\n", encoding="utf-8")

    listing = workspace_tools.list_workspace_entries(task_id, ".")
    assert listing["path"] == "."
    assert [entry["name"] for entry in listing["entries"]] == ["AGENTS.md", "docs"]

    content = workspace_tools.read_workspace_file(task_id, "docs/notes.txt", start_line=2, end_line=3)
    assert content["path"] == "docs/notes.txt"
    assert content["content"] == "second line\nkeyword"
    assert content["truncated"] is False

    search = workspace_tools.search_workspace_text(task_id, "keyword")
    assert search["query"] == "keyword"
    assert search["matches"] == [
        {
            "path": "docs/notes.txt",
            "line": 3,
            "content": "keyword",
        }
    ]


def test_workspace_tools_reject_escape_and_sensitive_paths(tmp_path, monkeypatch):
    app_module, workspace_tools, _, _, _, home_dir = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "保护 workspace")

    ws_dir = home_dir / "workspace" / task_id
    ws_dir.mkdir(parents=True, exist_ok=True)
    (ws_dir / ".env").write_text("TOKEN=secret\n", encoding="utf-8")

    with pytest.raises(ValueError, match="relative path"):
        workspace_tools.read_workspace_file(task_id, "../outside.txt")

    with pytest.raises(ValueError, match="sensitive"):
        workspace_tools.read_workspace_file(task_id, ".env")


def test_terminal_snapshot_reads_only_task_owned_live_sessions(tmp_path, monkeypatch):
    app_module, _, terminal_tools, _, terminal_module, _ = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "读取终端快照")
    other_task_id = create_task(client, "其他任务")

    session = SimpleNamespace(
        id="runtime-session-1",
        task_id=task_id,
        cli_session_id="cli-session-1",
        provider_id="claude",
        buffer="hello from task",
        closed=False,
    )
    foreign = SimpleNamespace(
        id="runtime-session-2",
        task_id=other_task_id,
        cli_session_id="cli-session-2",
        provider_id="claude",
        buffer="foreign task",
        closed=False,
    )
    terminal_module.terminal_manager.sessions = {
        session.id: session,
        foreign.id: foreign,
    }

    snapshot = terminal_tools.get_terminal_snapshot(task_id)
    assert snapshot["sessions"] == [
        {
            "sessionId": "runtime-session-1",
            "cliSessionId": "cli-session-1",
            "providerId": "claude",
            "preview": "hello from task",
            "truncated": False,
        }
    ]

    with pytest.raises(ValueError, match="does not belong to task"):
        terminal_tools.get_terminal_snapshot(task_id, session_id="runtime-session-2")


def test_task_read_context_registered_and_executable(tmp_path, monkeypatch):
    app_module, _, _, tool_registry, _, _ = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    current_task_id = create_task(client, "当前任务")
    target_task_id = create_task(client, "目标任务")
    workspace_root = tmp_path / "home" / "workspace" / target_task_id
    workspace_root.mkdir(parents=True, exist_ok=True)
    (workspace_root / "AGENTS.md").write_text("# 目标任务\n约束一\n约束二\n", encoding="utf-8")

    tool_names = [item["name"] for item in tool_registry.serialize_tool_schemas()]
    assert "task_read_context" in tool_names

    result = asyncio.run(
        tool_registry.execute_agent_tool(
            current_task_id,
            "task_read_context",
            {"taskId": target_task_id, "startLine": 1, "endLine": 2},
        )
    )

    assert result["taskId"] == target_task_id
    assert result["content"] == "# 目标任务\n约束一"


def test_sdk_runner_tool_registry_exposes_runner_specific_tool_name(tmp_path, monkeypatch):
    app_module, _, _, tool_registry, _, _ = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    current_task_id = create_task(client, "Agent Runner 工具名")

    del app_module
    del current_task_id

    tool_names = [item["name"] for item in tool_registry.serialize_tool_schemas()]
    assert "invoke_claude_code_runner" in tool_names
    assert "invoke_sdk_runner" not in tool_names


def test_invoke_claude_code_runner_defaults_to_task_workspace_and_links_agent_run(tmp_path, monkeypatch):
    app_module, _, _, tool_registry, _, home_dir = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "Agent Runner 默认目录")
    workspace_dir = home_dir / "workspace" / task_id

    sdk_runner = importlib.import_module("src.sdk_runner.sdk_runner")
    sdk_store = importlib.import_module("src.sdk_runner.sdk_store")
    captured: dict[str, object] = {}

    def fake_start_sdk_run(*, task_id: str, prompt: str, cwd: str, emitter, agent_run_id: str | None = None, runner_type: str = "claude_code", system_prompt: str | None = None, on_finished=None):
        captured["task_id"] = task_id
        captured["prompt"] = prompt
        captured["cwd"] = cwd
        captured["agent_run_id"] = agent_run_id
        captured["runner_type"] = runner_type
        captured["system_prompt"] = system_prompt
        if on_finished is not None:
            asyncio.get_running_loop().create_task(on_finished({"run_id": "sdk-run-1", "status": "completed"}))
        return {"id": "sdk-run-1", "prompt": prompt, "cwd": cwd, "runner_type": runner_type}

    monkeypatch.setattr(sdk_runner, "start_sdk_run", fake_start_sdk_run)
    monkeypatch.setattr(
        sdk_store,
        "get_sdk_run",
        lambda run_id: {
            "id": run_id,
            "status": "completed",
            "runner_type": "claude_code",
            "cwd": str(workspace_dir),
            "prompt": "请在当前任务 workspace 内执行最小测试",
            "total_cost_usd": 0.12,
            "total_tokens": 321,
        },
    )
    monkeypatch.setattr(
        sdk_store,
        "list_sdk_events",
        lambda run_id: [
            {"event_type": "sdk.tool_use", "payload_json": {"tool_name": "Write"}},
            {"event_type": "sdk.text_completed", "payload_json": {"text": "测试已通过"}},
            {"event_type": "sdk.cost_update", "payload_json": {"duration_ms": 5000, "num_turns": 3}},
        ],
    )

    result = asyncio.run(
        tool_registry.execute_agent_tool(
            task_id,
            "invoke_claude_code_runner",
            {"prompt": "请在当前任务 workspace 内执行最小测试"},
            agent_run_id="agent-run-123",
        )
    )

    assert result["ok"] is True
    assert result["sdk_run_id"] == "sdk-run-1"
    assert result["status"] == "completed"
    assert result["final_text"] == "测试已通过"
    assert result["tool_names"] == ["Write"]
    assert result["duration_ms"] == 5000
    assert captured == {
        "task_id": task_id,
        "prompt": "请在当前任务 workspace 内执行最小测试",
        "cwd": str(workspace_dir),
        "agent_run_id": "agent-run-123",
        "runner_type": "claude_code",
        "system_prompt": None,
    }
    assert workspace_dir.is_dir()


def test_legacy_invoke_sdk_runner_alias_still_executes_claude_code_runner(tmp_path, monkeypatch):
    app_module, _, _, tool_registry, _, _ = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "Agent Runner 兼容别名")

    sdk_runner = importlib.import_module("src.sdk_runner.sdk_runner")
    sdk_store = importlib.import_module("src.sdk_runner.sdk_store")
    captured: dict[str, object] = {}

    def fake_start_sdk_run(*, task_id: str, prompt: str, cwd: str, emitter, agent_run_id: str | None = None, runner_type: str = "claude_code", system_prompt: str | None = None, on_finished=None):
        captured["task_id"] = task_id
        captured["prompt"] = prompt
        captured["runner_type"] = runner_type
        if on_finished is not None:
            asyncio.get_running_loop().create_task(on_finished({"run_id": "sdk-run-legacy", "status": "completed"}))
        return {"id": "sdk-run-legacy", "prompt": prompt, "cwd": cwd, "runner_type": runner_type}

    monkeypatch.setattr(sdk_runner, "start_sdk_run", fake_start_sdk_run)
    monkeypatch.setattr(
        sdk_store,
        "get_sdk_run",
        lambda run_id: {
            "id": run_id,
            "status": "completed",
            "runner_type": "claude_code",
            "cwd": "/tmp/demo",
            "prompt": "兼容旧工具名",
            "total_cost_usd": 0,
            "total_tokens": 0,
        },
    )
    monkeypatch.setattr(sdk_store, "list_sdk_events", lambda run_id: [])

    result = asyncio.run(
        tool_registry.execute_agent_tool(
            task_id,
            "invoke_sdk_runner",
            {"prompt": "兼容旧工具名"},
        )
    )

    assert result["ok"] is True
    assert result["sdk_run_id"] == "sdk-run-legacy"
    assert result["tool_name"] == "invoke_claude_code_runner"
    assert result["runner_type"] == "claude_code"
    assert result["status"] == "completed"
    assert captured["runner_type"] == "claude_code"


def test_invoke_claude_code_runner_falls_back_to_last_tool_result_when_final_text_missing(tmp_path, monkeypatch):
    app_module, _, _, tool_registry, _, _ = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "Agent Runner 摘要回退")

    sdk_runner = importlib.import_module("src.sdk_runner.sdk_runner")
    sdk_store = importlib.import_module("src.sdk_runner.sdk_store")

    def fake_start_sdk_run(*, task_id: str, prompt: str, cwd: str, emitter, agent_run_id: str | None = None, runner_type: str = "claude_code", system_prompt: str | None = None, on_finished=None):
        if on_finished is not None:
            asyncio.get_running_loop().create_task(on_finished({"run_id": "sdk-run-fallback", "status": "completed"}))
        return {"id": "sdk-run-fallback", "prompt": prompt, "cwd": cwd, "runner_type": runner_type}

    monkeypatch.setattr(sdk_runner, "start_sdk_run", fake_start_sdk_run)
    monkeypatch.setattr(
        sdk_store,
        "get_sdk_run",
        lambda run_id: {
            "id": run_id,
            "status": "completed",
            "runner_type": "claude_code",
            "cwd": "/tmp/demo",
            "prompt": "获取当前时间",
            "total_cost_usd": 0.01,
            "total_tokens": 12,
        },
    )
    monkeypatch.setattr(
        sdk_store,
        "list_sdk_events",
        lambda run_id: [
            {"event_type": "sdk.tool_use", "payload_json": {"tool_use_id": "toolu_1", "tool_name": "Bash"}},
            {"event_type": "sdk.tool_result", "payload_json": {"tool_use_id": "toolu_1", "content": "Sun Mar 22 09:00:00 CST 2026", "is_error": False}},
            {"event_type": "sdk.cost_update", "payload_json": {"duration_ms": 900, "num_turns": 1}},
        ],
    )

    result = asyncio.run(
        tool_registry.execute_agent_tool(
            task_id,
            "invoke_claude_code_runner",
            {"prompt": "获取当前时间"},
        )
    )

    assert result["ok"] is True
    assert result["sdk_run_id"] == "sdk-run-fallback"
    assert result["final_text"] == "Sun Mar 22 09:00:00 CST 2026"
    assert result["summary_source"] == "sdk.tool_result"
    assert result["last_tool_result"] == {
        "tool_use_id": "toolu_1",
        "tool_name": "Bash",
        "content": "Sun Mar 22 09:00:00 CST 2026",
        "text": "Sun Mar 22 09:00:00 CST 2026",
    }


def test_invoke_claude_code_runner_recovers_when_completion_callback_is_missing(tmp_path, monkeypatch):
    app_module, _, _, tool_registry, _, _ = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "Agent Runner 完成回调兜底")

    sdk_runner = importlib.import_module("src.sdk_runner.sdk_runner")
    sdk_store = importlib.import_module("src.sdk_runner.sdk_store")

    def fake_start_sdk_run(*, task_id: str, prompt: str, cwd: str, emitter, agent_run_id: str | None = None, runner_type: str = "claude_code", system_prompt: str | None = None, on_finished=None):
        run = sdk_store.create_sdk_run(
            task_id,
            prompt=prompt,
            cwd=cwd,
            agent_run_id=agent_run_id,
            runner_type=runner_type,
            run_id="sdk-run-no-callback",
        )

        async def complete_later() -> None:
            await asyncio.sleep(0.05)
            sdk_store.append_sdk_event(
                "sdk-run-no-callback",
                event_type="sdk.tool_use",
                payload_json={"tool_use_id": "toolu_1", "tool_name": "Bash"},
            )
            sdk_store.append_sdk_event(
                "sdk-run-no-callback",
                event_type="sdk.tool_result",
                payload_json={
                    "tool_use_id": "toolu_1",
                    "content": "Sun Mar 22 09:00:00 CST 2026",
                    "is_error": False,
                },
            )
            sdk_store.update_sdk_run(
                "sdk-run-no-callback",
                status="completed",
                total_cost_usd=0.02,
                total_tokens=16,
            )

        asyncio.get_running_loop().create_task(complete_later())
        return run

    monkeypatch.setattr(sdk_runner, "start_sdk_run", fake_start_sdk_run)

    result = asyncio.run(
        tool_registry.execute_agent_tool(
            task_id,
            "invoke_claude_code_runner",
            {"prompt": "获取当前时间", "timeoutSeconds": 2},
            agent_run_id="agent-run-456",
        )
    )

    assert result["ok"] is True
    assert result["status"] == "completed"
    assert result["sdk_run_id"] == "sdk-run-no-callback"
    assert result["final_text"] == "Sun Mar 22 09:00:00 CST 2026"
    assert result["summary_source"] == "sdk.tool_result"
