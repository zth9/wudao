"""Tests for sdk_runner.py (ProcessRegistry)."""

from __future__ import annotations

import asyncio
import importlib
import sys
from types import SimpleNamespace
from typing import Any

from fastapi.testclient import TestClient


def load_modules(tmp_path, monkeypatch):
    monkeypatch.setenv("WUDAO_HOME", str(tmp_path / "home"))
    monkeypatch.setenv("WUDAO_DB_PATH", str(tmp_path / "wudao.db"))
    for name in list(sys.modules):
        if name.startswith("src"):
            sys.modules.pop(name, None)
    importlib.import_module("src.app")
    runner_mod = importlib.import_module("src.sdk_runner.sdk_runner")
    return runner_mod


def _run(coro):
    """Run an async coroutine in a fresh event loop."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def create_task_id() -> str:
    app_module = importlib.import_module("src.app")
    client = TestClient(app_module.app)
    response = client.post("/api/tasks", json={"title": "Agent Runner Test", "type": "feature"})
    assert response.status_code == 201
    return response.json()["id"]


# ---------------------------------------------------------------------------
# ProcessRegistry tests
# ---------------------------------------------------------------------------

def test_registry_register_and_active(tmp_path, monkeypatch):
    runner_mod = load_modules(tmp_path, monkeypatch)
    reg = runner_mod.ProcessRegistry()

    async def go():
        async def noop():
            await asyncio.sleep(100)

        task = asyncio.get_event_loop().create_task(noop())
        reg.register("run-1", task)

        assert reg.is_running("run-1")
        assert "run-1" in reg.active_run_ids

        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    _run(go())


def test_registry_cancel(tmp_path, monkeypatch):
    runner_mod = load_modules(tmp_path, monkeypatch)
    reg = runner_mod.ProcessRegistry()

    async def go():
        async def noop():
            await asyncio.sleep(100)

        task = asyncio.get_event_loop().create_task(noop())
        reg.register("run-2", task)

        assert reg.cancel("run-2") is True
        assert reg.cancel("nonexistent") is False

        try:
            await task
        except asyncio.CancelledError:
            pass

    _run(go())


def test_registry_shutdown(tmp_path, monkeypatch):
    runner_mod = load_modules(tmp_path, monkeypatch)
    reg = runner_mod.ProcessRegistry()

    async def go():
        async def long_task():
            await asyncio.sleep(100)

        t1 = asyncio.get_event_loop().create_task(long_task())
        t2 = asyncio.get_event_loop().create_task(long_task())
        reg.register("r1", t1)
        reg.register("r2", t2)

        count = await reg.shutdown()
        assert count == 2
        assert reg.active_run_ids == []

    _run(go())


def test_registry_has_active_run_for_task(tmp_path, monkeypatch):
    runner_mod = load_modules(tmp_path, monkeypatch)
    reg = runner_mod.ProcessRegistry()

    async def go():
        async def noop():
            await asyncio.sleep(100)

        task = asyncio.get_event_loop().create_task(noop())
        reg.register("run-x", task)

        fake_get = lambda rid: {"task_id": "task-123"} if rid == "run-x" else None
        assert reg.has_active_run_for_task("task-123", _get_run=fake_get) == "run-x"
        assert reg.has_active_run_for_task("task-other", _get_run=fake_get) is None

        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    _run(go())


def test_start_sdk_run_allows_multiple_active_runs_for_same_task(tmp_path, monkeypatch):
    runner_mod = load_modules(tmp_path, monkeypatch)
    task_id = create_task_id()
    test_registry = runner_mod.ProcessRegistry()
    monkeypatch.setattr(runner_mod, "registry", test_registry)

    async def fake_run_sdk_query(**kwargs):
        await asyncio.sleep(100)

    monkeypatch.setattr(runner_mod, "run_sdk_query", fake_run_sdk_query)

    async def go():
        async def noop_emitter(_event: dict[str, Any]) -> None:
            return None

        first = runner_mod.start_sdk_run(
            task_id=task_id,
            prompt="first run",
            cwd="/tmp",
            emitter=noop_emitter,
        )
        second = runner_mod.start_sdk_run(
            task_id=task_id,
            prompt="second run",
            cwd="/tmp",
            emitter=noop_emitter,
        )

        assert first["id"] != second["id"]
        assert len(test_registry.active_run_ids) == 2

        await test_registry.shutdown()

    _run(go())


def test_run_sdk_query_uses_selected_provider_for_claude_sdk_env(tmp_path, monkeypatch):
    runner_mod = load_modules(tmp_path, monkeypatch)
    app_module = importlib.import_module("src.app")
    sdk_store = importlib.import_module("src.sdk_runner.sdk_store")
    client = TestClient(app_module.app)
    task_id = create_task_id()
    provider_response = client.post(
        "/api/settings",
        json={
            "name": "Custom Claude",
            "endpoint": "https://gateway.example.com/anthropic/v1/messages",
            "api_key": "Bearer custom-token-123",
            "model": "claude-sonnet-custom",
        },
    )
    assert provider_response.status_code == 201
    provider_id = provider_response.json()["id"]

    run = sdk_store.create_sdk_run(
        task_id,
        prompt="use selected provider",
        cwd="/tmp/demo",
        run_id="sdk-run-provider-env",
    )
    captured: dict[str, Any] = {}

    class FakeClaudeAgentOptions:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

    async def fake_query(*, prompt, options):
        captured["prompt"] = prompt
        captured["options"] = options
        if False:
            yield None

    monkeypatch.setitem(
        sys.modules,
        "claude_agent_sdk",
        SimpleNamespace(query=fake_query, ClaudeAgentOptions=FakeClaudeAgentOptions),
    )

    async def go():
        async def noop_emitter(_event: dict[str, Any]) -> None:
            return None

        await runner_mod.run_sdk_query(
            run_id=run["id"],
            task_id=task_id,
            prompt="use selected provider",
            cwd="/tmp/demo",
            emitter=noop_emitter,
            provider_id=provider_id,
        )

    _run(go())

    options = captured["options"]
    assert captured["prompt"] == "use selected provider"
    assert options.model == "claude-sonnet-custom"
    assert options.env == {
        "ANTHROPIC_BASE_URL": "https://gateway.example.com/anthropic",
        "ANTHROPIC_API_KEY": "",
        "ANTHROPIC_AUTH_TOKEN": "custom-token-123",
    }
    assert sdk_store.get_sdk_run(run["id"])["status"] == "completed"
