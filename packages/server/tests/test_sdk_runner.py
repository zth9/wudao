"""Tests for sdk_runner.py (ProcessRegistry) and sdk_approval.py (ApprovalManager)."""

from __future__ import annotations

import asyncio
import importlib
import sys
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
    approval_mod = importlib.import_module("src.sdk_runner.sdk_approval")
    return runner_mod, approval_mod


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
    runner_mod, _ = load_modules(tmp_path, monkeypatch)
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
    runner_mod, _ = load_modules(tmp_path, monkeypatch)
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
    runner_mod, _ = load_modules(tmp_path, monkeypatch)
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
    runner_mod, _ = load_modules(tmp_path, monkeypatch)
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
    runner_mod, _ = load_modules(tmp_path, monkeypatch)
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


# ---------------------------------------------------------------------------
# ApprovalManager tests
# ---------------------------------------------------------------------------

def test_approval_resolve_approved(tmp_path, monkeypatch):
    _, approval_mod = load_modules(tmp_path, monkeypatch)
    mgr = approval_mod.ApprovalManager()

    async def go():
        async def approve_later():
            await asyncio.sleep(0.05)
            pending = mgr.list_pending_for_run("run-1")
            assert len(pending) == 1
            mgr.resolve(pending[0].approval_id, approved=True)

        asyncio.get_event_loop().create_task(approve_later())
        result = await mgr.request_approval(
            sdk_run_id="run-1", tool_name="Bash", tool_input={"command": "echo hi"},
        )
        assert result is True

    _run(go())


def test_approval_resolve_denied(tmp_path, monkeypatch):
    _, approval_mod = load_modules(tmp_path, monkeypatch)
    mgr = approval_mod.ApprovalManager()

    async def go():
        async def deny_later():
            await asyncio.sleep(0.05)
            pending = mgr.list_pending_for_run("run-1")
            mgr.resolve(pending[0].approval_id, approved=False)

        asyncio.get_event_loop().create_task(deny_later())
        result = await mgr.request_approval(
            sdk_run_id="run-1", tool_name="Bash", tool_input={},
        )
        assert result is False

    _run(go())


def test_approval_timeout(tmp_path, monkeypatch):
    _, approval_mod = load_modules(tmp_path, monkeypatch)
    original_timeout = approval_mod.APPROVAL_TIMEOUT_SECONDS
    approval_mod.APPROVAL_TIMEOUT_SECONDS = 0.1

    mgr = approval_mod.ApprovalManager()

    async def go():
        result = await mgr.request_approval(
            sdk_run_id="run-1", tool_name="Bash", tool_input={},
        )
        assert result is False

    try:
        _run(go())
    finally:
        approval_mod.APPROVAL_TIMEOUT_SECONDS = original_timeout


def test_approval_cancel_all_for_run(tmp_path, monkeypatch):
    _, approval_mod = load_modules(tmp_path, monkeypatch)
    mgr = approval_mod.ApprovalManager()

    async def go():
        results = []

        async def request_and_record(name: str):
            r = await mgr.request_approval(
                sdk_run_id="run-1", tool_name=name, tool_input={},
            )
            results.append((name, r))

        t1 = asyncio.get_event_loop().create_task(request_and_record("Bash"))
        t2 = asyncio.get_event_loop().create_task(request_and_record("Write"))

        await asyncio.sleep(0.05)
        count = mgr.cancel_all_for_run("run-1")
        assert count == 2

        await asyncio.gather(t1, t2)
        assert all(r is False for _, r in results)

    _run(go())


def test_approval_resolve_nonexistent(tmp_path, monkeypatch):
    _, approval_mod = load_modules(tmp_path, monkeypatch)
    mgr = approval_mod.ApprovalManager()
    assert mgr.resolve("nonexistent", approved=True) is False
