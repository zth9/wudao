from __future__ import annotations

import importlib
import json
import sqlite3
import sys
from pathlib import Path

from fastapi.testclient import TestClient


def load_app(tmp_path, monkeypatch, *, home_dir: Path | None = None, db_path: Path | None = None, set_db_path: bool = True):
    if home_dir is None:
        home_dir = tmp_path / "home"
    monkeypatch.setenv("WUDAO_HOME", str(home_dir))
    if set_db_path:
        if db_path is None:
            db_path = tmp_path / "wudao.db"
        monkeypatch.setenv("WUDAO_DB_PATH", str(db_path))
    else:
        monkeypatch.delenv("WUDAO_DB_PATH", raising=False)

    for name in list(sys.modules):
        if name.startswith("src"):
            sys.modules.pop(name, None)

    module = importlib.import_module("src.app")
    return module


def test_health_and_seeded_settings(tmp_path, monkeypatch):
    module = load_app(tmp_path, monkeypatch)
    client = TestClient(module.app)

    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json() == {"status": "ok", "db": True}

    providers = client.get("/api/settings")
    assert providers.status_code == 200
    items = providers.json()
    by_id = {item["id"]: item for item in items}
    assert "claude" in by_id
    assert "openai" in by_id
    assert by_id["claude"]["endpoint"] == ""
    assert by_id["claude"]["model"] == ""
    assert by_id["claude"]["api_key"] is None
    assert by_id["openai"]["endpoint"] == ""
    assert by_id["openai"]["model"] == ""
    assert by_id["openai"]["api_key"] is None


def test_provider_crud_and_reorder(tmp_path, monkeypatch):
    module = load_app(tmp_path, monkeypatch)
    client = TestClient(module.app)

    created = client.post(
        "/api/settings",
        json={
            "name": "Test Provider",
            "endpoint": "https://example.com/v1",
            "model": "test-model",
            "is_default": False,
        },
    )
    assert created.status_code == 201
    provider = created.json()

    updated = client.put(f"/api/settings/{provider['id']}", json={"is_default": True, "model": "updated-model"})
    assert updated.status_code == 200
    assert updated.json()["model"] == "updated-model"

    listed = client.get("/api/settings")
    ids = [item["id"] for item in listed.json()]
    reordered = client.put("/api/settings/order", json={"ids": list(reversed(ids))})
    assert reordered.status_code == 200
    assert [item["id"] for item in reordered.json()] == list(reversed(ids))

    deleted = client.delete(f"/api/settings/{provider['id']}")
    assert deleted.status_code == 200
    assert deleted.json() == {"ok": True}


def test_default_provider_selection_persists_across_restart(tmp_path, monkeypatch):
    first_module = load_app(tmp_path, monkeypatch)
    first_client = TestClient(first_module.app)

    updated = first_client.put("/api/settings/openai", json={"is_default": True})
    assert updated.status_code == 200
    assert updated.json()["is_default"] == 1

    reloaded_module = load_app(tmp_path, monkeypatch)
    reloaded_client = TestClient(reloaded_module.app)

    providers = reloaded_client.get("/api/settings")
    assert providers.status_code == 200
    default_ids = [item["id"] for item in providers.json() if item["is_default"] == 1]
    assert default_ids == ["openai"]


def test_app_creates_missing_database_parent_for_explicit_db_path(tmp_path, monkeypatch):
    db_path = tmp_path / "missing" / "db" / "wudao.db"
    assert not db_path.parent.exists()

    module = load_app(tmp_path, monkeypatch, db_path=db_path)
    client = TestClient(module.app)

    health = client.get("/api/health")
    assert health.status_code == 200
    assert db_path.exists()


def test_app_uses_wudao_home_for_default_database_path(tmp_path, monkeypatch):
    home_dir = tmp_path / "custom-home"
    db_path = home_dir / "wudao.db"
    assert not db_path.parent.exists()

    module = load_app(tmp_path, monkeypatch, home_dir=home_dir, set_db_path=False)
    client = TestClient(module.app)

    health = client.get("/api/health")
    assert health.status_code == 200
    assert db_path.exists()


def test_app_repairs_runtime_tables_still_referencing_tasks_legacy_migration(tmp_path, monkeypatch):
    db_path = tmp_path / "broken-runtime.db"
    conn = sqlite3.connect(str(db_path))
    conn.executescript(
        """
        CREATE TABLE tasks (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('feature','bugfix','investigation','exploration','refactor','learning')),
          status TEXT NOT NULL DEFAULT 'execution' CHECK (status IN ('execution','done')),
          context TEXT,
          agent_doc TEXT,
          chat_messages TEXT NOT NULL DEFAULT '[]',
          status_log TEXT NOT NULL DEFAULT '[]',
          session_ids TEXT NOT NULL DEFAULT '[]',
          session_names TEXT NOT NULL DEFAULT '{}',
          session_providers TEXT NOT NULL DEFAULT '{}',
          priority INTEGER NOT NULL DEFAULT 2 CHECK (priority BETWEEN 0 AND 4),
          due_at TEXT,
          provider_id TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        INSERT INTO tasks (
          id, title, type, status, context, agent_doc, chat_messages, status_log,
          session_ids, session_names, session_providers, priority, due_at,
          provider_id, created_at, updated_at
        )
        VALUES (
          '2026-04-02-1', '修复坏外键', 'feature', 'execution', 'ctx', NULL, '[]', '[]',
          '[]', '{}', '{}', 2, NULL, 'claude', '2026-04-02 00:00:00', '2026-04-02 00:00:00'
        );

        CREATE TABLE task_agent_runs (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES "tasks_legacy_migration"(id) ON DELETE CASCADE,
          provider_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'running'
            CHECK (status IN ('running','waiting_approval','completed','failed','cancelled')),
          checkpoint_json TEXT,
          last_error TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE task_agent_messages (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES "tasks_legacy_migration"(id) ON DELETE CASCADE,
          run_id TEXT NOT NULL REFERENCES task_agent_runs(id) ON DELETE CASCADE,
          seq INTEGER NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('system','user','assistant','tool')),
          kind TEXT NOT NULL CHECK (kind IN ('text','tool_call','tool_result','approval','artifact','error')),
          status TEXT NOT NULL DEFAULT 'completed'
            CHECK (status IN ('streaming','completed','failed','waiting_approval')),
          content_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          UNIQUE (task_id, seq)
        );

        CREATE TABLE task_sdk_runs (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES "tasks_legacy_migration"(id) ON DELETE CASCADE,
          agent_run_id TEXT,
          runner_type TEXT NOT NULL DEFAULT 'claude_code',
          status TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending','running','completed','failed','cancelled')),
          prompt TEXT NOT NULL DEFAULT '',
          cwd TEXT,
          total_cost_usd REAL NOT NULL DEFAULT 0,
          total_tokens INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE task_sdk_events (
          id TEXT PRIMARY KEY,
          sdk_run_id TEXT NOT NULL REFERENCES task_sdk_runs(id) ON DELETE CASCADE,
          seq INTEGER NOT NULL,
          event_type TEXT NOT NULL,
          payload_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE (sdk_run_id, seq)
        );

        CREATE TABLE task_items (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          title TEXT NOT NULL,
          done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
          sort_order INTEGER NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (task_id) REFERENCES "tasks_legacy_migration"(id) ON DELETE CASCADE
        );

        INSERT INTO task_agent_runs (
          id, task_id, provider_id, status, checkpoint_json, last_error, created_at, updated_at
        )
        VALUES (
          'legacy-run-1', '2026-04-02-1', 'claude', 'completed', NULL, NULL,
          '2026-04-02 00:00:00', '2026-04-02 00:00:00'
        );

        INSERT INTO task_agent_messages (
          id, task_id, run_id, seq, role, kind, status, content_json, created_at, updated_at
        )
        VALUES (
          'legacy-msg-1', '2026-04-02-1', 'legacy-run-1', 1, 'assistant', 'text', 'completed',
          '{"content":"旧消息"}', '2026-04-02 00:00:00', '2026-04-02 00:00:00'
        );

        INSERT INTO task_sdk_runs (
          id, task_id, agent_run_id, runner_type, status, prompt, cwd,
          total_cost_usd, total_tokens, last_error, created_at, updated_at
        )
        VALUES (
          'legacy-sdk-1', '2026-04-02-1', 'legacy-run-1', 'claude_code', 'completed', '旧 runner', '/tmp/demo',
          0.1, 12, NULL, '2026-04-02 00:00:00', '2026-04-02 00:00:00'
        );

        INSERT INTO task_sdk_events (
          id, sdk_run_id, seq, event_type, payload_json, created_at
        )
        VALUES (
          'legacy-sdk-event-1', 'legacy-sdk-1', 1, 'sdk.text_completed', '{"text":"旧事件"}',
          '2026-04-02 00:00:00'
        );

        INSERT INTO task_items (id, task_id, title, done, sort_order, created_at)
        VALUES ('legacy-item-1', '2026-04-02-1', '旧待办', 0, 1, '2026-04-02 00:00:00');
        """
    )
    conn.commit()
    conn.close()

    module = load_app(tmp_path, monkeypatch, db_path=db_path)
    client = TestClient(module.app)
    db_module = importlib.import_module("src.db")
    thread_store = importlib.import_module("src.agent_runtime.thread_store")
    sdk_store = importlib.import_module("src.sdk_runner.sdk_store")
    runner = importlib.import_module("src.agent_runtime.runner")

    assert {row["table"] for row in db_module.db.query_all("PRAGMA foreign_key_list(task_agent_runs)")} == {"tasks"}
    assert {row["table"] for row in db_module.db.query_all("PRAGMA foreign_key_list(task_agent_messages)")} == {
        "task_agent_runs",
        "tasks",
    }
    assert {row["table"] for row in db_module.db.query_all("PRAGMA foreign_key_list(task_sdk_runs)")} == {"tasks"}
    assert {row["table"] for row in db_module.db.query_all("PRAGMA foreign_key_list(task_items)")} == {"tasks"}

    assert thread_store.get_agent_run("legacy-run-1")["task_id"] == "2026-04-02-1"
    thread = thread_store.get_task_agent_thread("2026-04-02-1")
    assert [item["id"] for item in thread["messages"]] == ["legacy-msg-1"]
    assert sdk_store.get_sdk_run("legacy-sdk-1")["task_id"] == "2026-04-02-1"
    assert [item["id"] for item in sdk_store.list_sdk_events("legacy-sdk-1")] == ["legacy-sdk-event-1"]

    async def fake_next_agent_step(provider_id, *, system_messages, history, tool_schemas, tool_transcript):
        return {"type": "assistant_text", "content": "修复后可以继续对话。"}

    monkeypatch.setattr(runner, "next_agent_step", fake_next_agent_step)

    run_response = client.post(
        "/api/tasks/2026-04-02-1/agent-chat/runs",
        json={"message": "继续", "providerId": "claude"},
    )
    assert run_response.status_code == 200
    run_id = run_response.json()["runId"]

    event_response = client.get(f"/api/tasks/2026-04-02-1/agent-chat/runs/{run_id}/events")
    assert event_response.status_code == 200
    assert '"type": "run.completed"' in event_response.text


def test_task_crud_stats_and_session_linking(tmp_path, monkeypatch):
    module = load_app(tmp_path, monkeypatch)
    client = TestClient(module.app)

    created = client.post(
        "/api/tasks",
        json={"title": "迁移后端", "type": "refactor", "context": "改成 Python", "priority": 1},
    )
    assert created.status_code == 201
    task = created.json()
    assert task["status"] == "execution"

    task_id = task["id"]
    fetched = client.get(f"/api/tasks/{task_id}")
    assert fetched.status_code == 200
    assert fetched.json()["title"] == "迁移后端"

    linked = client.patch(
        f"/api/tasks/{task_id}/sessions",
        json={"sessionId": "session-1", "sessionName": "主终端", "providerId": "claude"},
    )
    assert linked.status_code == 200
    assert "session-1" in linked.json()["session_ids"]

    runtime_link = client.patch(
        f"/api/tasks/{task_id}/sessions",
        json={"sessionId": "runtime-openai-1", "sessionName": "Reviewer codex", "providerId": "openai"},
    )
    assert runtime_link.status_code == 200

    replaced = client.patch(
        f"/api/tasks/{task_id}/sessions",
        json={
            "sessionId": "codex-cli-1",
            "sessionName": "Reviewer codex",
            "providerId": "openai",
            "replaceSessionIds": ["runtime-openai-1"],
        },
    )
    assert replaced.status_code == 200
    replaced_body = replaced.json()
    assert "runtime-openai-1" not in json.loads(replaced_body["session_ids"])
    assert "codex-cli-1" in json.loads(replaced_body["session_ids"])
    assert "runtime-openai-1" not in json.loads(replaced_body["session_names"])
    assert json.loads(replaced_body["session_names"])["codex-cli-1"] == "Reviewer codex"
    assert "runtime-openai-1" not in json.loads(replaced_body["session_providers"])
    assert json.loads(replaced_body["session_providers"])["codex-cli-1"] == "openai"

    updated = client.put(f"/api/tasks/{task_id}", json={"status": "done", "priority": 0})
    assert updated.status_code == 200
    assert updated.json()["status"] == "done"

    stats = client.get("/api/tasks/stats")
    assert stats.status_code == 200
    assert stats.json()["done"] == 1
    assert stats.json()["high_priority"] == 0

    deleted = client.delete(f"/api/tasks/{task_id}")
    assert deleted.status_code == 200
    assert deleted.json()["ok"] is True


def test_task_chat_stream_persists_messages(tmp_path, monkeypatch):
    module = load_app(tmp_path, monkeypatch)
    client = TestClient(module.app)

    created = client.post("/api/tasks", json={"title": "任务聊天", "type": "feature"})
    task_id = created.json()["id"]

    async def fake_stream_chat(provider_id, messages):
        assert provider_id
        assert messages
        yield "第一段"
        yield "第二段"

    monkeypatch.setattr(module, "stream_chat", fake_stream_chat)

    response = client.post(f"/api/tasks/{task_id}/chat", json={"message": "继续", "providerId": "claude"})
    assert response.status_code == 200
    text = response.text
    assert '"delta": "第一段"' in text
    assert '"done": true' in text

    fetched = client.get(f"/api/tasks/{task_id}")
    history = json.loads(fetched.json()["chat_messages"])
    assert history[-1]["role"] == "assistant"
    assert history[-1]["content"] == "第一段第二段"


def test_task_parse_supports_openai_responses_delta_stream(tmp_path, monkeypatch):
    module = load_app(tmp_path, monkeypatch)
    client = TestClient(module.app)
    llm_module = importlib.import_module("src.llm")
    module.db.execute(
        "UPDATE providers SET endpoint = ?, model = ? WHERE id = 'openai'",
        ("https://example.com/v1", "gpt-5"),
    )

    class DummyStreamResponse:
        status_code = 200

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def aread(self) -> bytes:
            return b""

        async def aiter_lines(self):
            yield 'data: {"type":"response.output_text.delta","delta":"{\\"title\\":\\"修复 OpenAI 任务解析\\",\\"type\\":\\"bugfix\\",\\"context\\":\\"兼容 Responses API 流式文本输出\\"}"}'
            yield "data: [DONE]"

    class DummyAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        def stream(self, method, endpoint, headers=None, json=None):
            return DummyStreamResponse()

    monkeypatch.setattr(llm_module.httpx, "AsyncClient", DummyAsyncClient)

    response = client.post(
        "/api/tasks/parse",
        json={"input": "修复新建任务时选择 openai 供应商的报错", "providerId": "openai"},
    )
    assert response.status_code == 200
    assert response.json() == {
        "title": "修复 OpenAI 任务解析",
        "type": "bugfix",
        "context": "兼容 Responses API 流式文本输出",
    }


def test_user_memory_and_open_path(tmp_path, monkeypatch):
    module = load_app(tmp_path, monkeypatch)
    client = TestClient(module.app)

    async def fake_save_user_memory(content):
        return {
            "content": content,
            "path": str(Path(tmp_path) / "home" / "profile" / "user-memory.md"),
            "mirrored": True,
            "mirroredUri": "viking://user/profile.md",
            "mirrorError": None,
        }

    monkeypatch.setattr(module, "save_wudao_user_memory", fake_save_user_memory)

    updated = client.put("/api/contexts/user-memory", json={"content": "长期偏好"})
    assert updated.status_code == 200
    assert updated.json()["mirrored"] is True

    opened: list[list[str]] = []

    class DummyPopen:
        def __init__(self, args, *unused, **kwargs):
            opened.append(args)

    monkeypatch.setattr(module.subprocess, "Popen", DummyPopen)
    allowed_path = Path(tmp_path) / "home" / "workspace" / "demo"
    allowed_path.mkdir(parents=True, exist_ok=True)

    open_resp = client.post("/api/open-path", json={"path": str(allowed_path)})
    assert open_resp.status_code == 200
    assert open_resp.json() == {"ok": True}
    assert opened and opened[0][0] == "open"


def test_terminal_websocket_list(tmp_path, monkeypatch):
    module = load_app(tmp_path, monkeypatch)
    client = TestClient(module.app)

    with client.websocket_connect("/ws/terminal") as ws:
        ws.send_text(json.dumps({"type": "list"}))
        payload = json.loads(ws.receive_text())

    assert payload["type"] == "sessions"
    assert payload["sessions"] == []


def test_terminal_websocket_rejects_invalid_codex_resume_id(tmp_path, monkeypatch):
    module = load_app(tmp_path, monkeypatch)
    client = TestClient(module.app)
    terminal_module = importlib.import_module("src.terminal")

    monkeypatch.setattr(terminal_module, "_has_codex_session", lambda session_id: False)
    monkeypatch.setattr(terminal_module, "_has_any_codex_session", lambda: True)

    def fail_popen(*args, **kwargs):
        raise AssertionError("subprocess.Popen should not be called for invalid resume requests")

    monkeypatch.setattr(terminal_module.subprocess, "Popen", fail_popen)

    with client.websocket_connect("/ws/terminal") as ws:
        ws.send_text(json.dumps({
            "type": "create",
            "providerId": "openai",
            "resumeSessionId": "backend-session-1",
            "clientRef": "local-1",
        }))
        payload = json.loads(ws.receive_text())

    assert payload == {
        "type": "error",
        "message": "Session not found or no longer recoverable",
        "clientRef": "local-1",
    }


def test_terminal_websocket_create_returns_discovered_codex_cli_session_id(tmp_path, monkeypatch):
    module = load_app(tmp_path, monkeypatch)
    client = TestClient(module.app)
    terminal_module = importlib.import_module("src.terminal")

    class DummyProcess:
        pid = 321

        def poll(self):
            return None

    class DummyThread:
        def __init__(self, *args, **kwargs):
            pass

        def start(self):
            return None

    monkeypatch.setattr(terminal_module.subprocess, "Popen", lambda *args, **kwargs: DummyProcess())
    monkeypatch.setattr(terminal_module.os, "openpty", lambda: (11, 12))
    monkeypatch.setattr(terminal_module.os, "close", lambda fd: None)
    monkeypatch.setattr(terminal_module, "_set_winsize", lambda fd, rows, cols: None)
    monkeypatch.setattr(terminal_module, "generate_task_claude_md", lambda task_id, cwd: None)
    monkeypatch.setattr(terminal_module, "_resolve_fixed_provider_cli_session_id", lambda provider_id, process, cwd: "actual-codex-session-id")
    monkeypatch.setattr(terminal_module.threading, "Thread", DummyThread)

    with client.websocket_connect("/ws/terminal") as ws:
        ws.send_text(json.dumps({
            "type": "create",
            "providerId": "openai",
            "taskId": "2026-03-10-1",
            "clientRef": "local-1",
        }))
        payload = json.loads(ws.receive_text())

    assert payload["type"] == "created"
    assert payload["clientRef"] == "local-1"
    assert payload["cliSessionId"] == "actual-codex-session-id"


def test_terminal_websocket_restore_recovers_broken_codex_runtime_id_from_workspace_session(tmp_path, monkeypatch):
    module = load_app(tmp_path, monkeypatch)
    client = TestClient(module.app)
    terminal_module = importlib.import_module("src.terminal")

    created = client.post("/api/tasks", json={"title": "恢复 Codex", "type": "feature"})
    task_id = created.json()["id"]
    workspace_dir = Path(tmp_path) / "home" / "workspace" / task_id
    session_file = Path(tmp_path) / "home" / ".codex" / "sessions" / "2026" / "03" / "10" / "rollout-2026-03-10T10-00-00-actual-codex-session-id.jsonl"
    session_file.parent.mkdir(parents=True, exist_ok=True)
    session_file.write_text(
        json.dumps(
            {
                "type": "session_meta",
                "payload": {
                    "id": "actual-codex-session-id",
                    "cwd": str(workspace_dir),
                },
            },
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    class DummyProcess:
        pid = 321

        def poll(self):
            return None

    class DummyThread:
        def __init__(self, *args, **kwargs):
            pass

        def start(self):
            return None

    monkeypatch.setattr(terminal_module, "_has_codex_session", lambda session_id: False)
    monkeypatch.setattr(terminal_module, "CODEX_SESSIONS_ROOT", Path(tmp_path) / "home" / ".codex" / "sessions")
    monkeypatch.setattr(terminal_module.subprocess, "Popen", lambda *args, **kwargs: DummyProcess())
    monkeypatch.setattr(terminal_module.os, "openpty", lambda: (11, 12))
    monkeypatch.setattr(terminal_module.os, "close", lambda fd: None)
    monkeypatch.setattr(terminal_module, "_set_winsize", lambda fd, rows, cols: None)
    monkeypatch.setattr(terminal_module, "generate_task_claude_md", lambda task_id, cwd: None)
    monkeypatch.setattr(terminal_module.threading, "Thread", DummyThread)

    with client.websocket_connect("/ws/terminal") as ws:
        ws.send_text(json.dumps({
            "type": "create",
            "providerId": "openai",
            "taskId": task_id,
            "resumeSessionId": "broken-runtime-id",
            "clientRef": "local-1",
        }))
        payload = json.loads(ws.receive_text())

    assert payload["type"] == "created"
    assert payload["cliSessionId"] == "actual-codex-session-id"


def test_app_shutdown_closes_terminal_sessions(tmp_path, monkeypatch):
    module = load_app(tmp_path, monkeypatch)
    called: list[str] = []

    async def fake_close_all_sessions():
        called.append("terminal")

    async def fake_close_openviking_bridge():
        called.append("openviking")

    monkeypatch.setattr(module.terminal_manager, "close_all_sessions", fake_close_all_sessions)
    monkeypatch.setattr(module, "close_openviking_bridge", fake_close_openviking_bridge)

    with TestClient(module.app):
        pass

    assert called == ["openviking", "terminal"]


def test_app_startup_warms_openviking_bridge(tmp_path, monkeypatch):
    module = load_app(tmp_path, monkeypatch)
    called: list[bool] = []

    async def fake_get_openviking_status(*args, **kwargs):
        called.append(True)
        return {
            "available": True,
            "mode": "embedded",
            "workspacePath": str(Path(tmp_path) / "home" / "contexts"),
            "configPath": None,
            "pythonBin": "python3",
            "message": None,
        }

    monkeypatch.setattr(module, "get_openviking_status", fake_get_openviking_status)

    with TestClient(module.app):
        pass

    assert called == [True]
