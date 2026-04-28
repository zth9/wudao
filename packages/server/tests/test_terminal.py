from __future__ import annotations

import asyncio
import importlib
import json
import signal
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

def load_terminal(tmp_path, monkeypatch):
    home_dir = tmp_path / "home"
    db_path = tmp_path / "wudao.db"
    monkeypatch.setenv("WUDAO_HOME", str(home_dir))
    monkeypatch.setenv("WUDAO_DB_PATH", str(db_path))

    for name in list(sys.modules):
        if name.startswith("src"):
            sys.modules.pop(name, None)

    return importlib.import_module("src.terminal")


def make_session(terminal_module):
    return terminal_module.TerminalSession(
        id="session-1",
        provider_id="claude",
        permission_mode="bypassPermissions",
        task_id="2026-03-10-1",
        cli_session_id="cli-1",
        process=SimpleNamespace(pid=321),
        master_fd=99,
        cols=80,
        rows=24,
        cwd="/tmp/session-1",
    )


def test_decode_terminal_chunk_handles_split_utf8_sequence(tmp_path, monkeypatch):
    terminal_module = load_terminal(tmp_path, monkeypatch)
    session = make_session(terminal_module)
    word = "问题".encode("utf-8")

    first = terminal_module._decode_terminal_chunk(session, word[:4])
    second = terminal_module._decode_terminal_chunk(session, word[4:])

    assert first == "问"
    assert second == "题"


def test_trim_terminal_buffer_skips_orphaned_control_sequence_prefix(tmp_path, monkeypatch):
    terminal_module = load_terminal(tmp_path, monkeypatch)
    buffer = "hello\x1b[Bworld"
    max_chars = len(buffer) - buffer.index("[")

    trimmed = terminal_module._trim_terminal_buffer(buffer, max_chars=max_chars)

    assert trimmed == "world"


def test_resize_skips_duplicate_terminal_size(tmp_path, monkeypatch):
    terminal_module = load_terminal(tmp_path, monkeypatch)
    manager = terminal_module.TerminalManager()
    session = make_session(terminal_module)
    manager.sessions[session.id] = session
    calls: list[tuple[int, int, int]] = []
    signals: list[int] = []

    monkeypatch.setattr(terminal_module, "_set_winsize", lambda fd, rows, cols: calls.append((fd, rows, cols)))
    monkeypatch.setattr(manager, "_notify_terminal_resized", lambda process: signals.append(process.pid))

    manager.resize(session.id, 80, 24)

    assert calls == []
    assert signals == []


def test_resize_updates_winsize_and_notifies_process_group(tmp_path, monkeypatch):
    terminal_module = load_terminal(tmp_path, monkeypatch)
    manager = terminal_module.TerminalManager()
    session = make_session(terminal_module)
    manager.sessions[session.id] = session
    calls: list[tuple[int, int, int]] = []
    signals: list[int] = []

    monkeypatch.setattr(terminal_module, "_set_winsize", lambda fd, rows, cols: calls.append((fd, rows, cols)))
    monkeypatch.setattr(manager, "_notify_terminal_resized", lambda process: signals.append(process.pid))

    manager.resize(session.id, 120, 30)

    assert calls == [(99, 30, 120)]
    assert signals == [321]
    assert session.cols == 120
    assert session.rows == 30


def test_resolve_resume_behavior_rejects_invalid_codex_session(tmp_path, monkeypatch):
    terminal_module = load_terminal(tmp_path, monkeypatch)
    monkeypatch.setattr(terminal_module, "_has_codex_session", lambda session_id: False)

    resolved = terminal_module._resolve_resume_behavior("openai", "backend-session-1")

    assert resolved == {
        "resumeSessionId": None,
        "resumeLatest": False,
        "invalidRequestedResume": True,
    }


def test_close_session_terminates_process_group(tmp_path, monkeypatch):
    terminal_module = load_terminal(tmp_path, monkeypatch)
    manager = terminal_module.TerminalManager()
    calls: list[tuple[int, signal.Signals]] = []
    closed_fds: list[int] = []

    class FakeProcess:
        def __init__(self) -> None:
            self.pid = 321
            self._poll = None
            self.wait_calls = 0

        def poll(self):
            return self._poll

        def wait(self, timeout=None):
            self.wait_calls += 1
            if self.wait_calls == 1:
                raise subprocess.TimeoutExpired(cmd="codex", timeout=timeout)
            self._poll = -signal.SIGKILL
            return self._poll

        def terminate(self):
            raise AssertionError("terminate should not be used when killpg succeeds")

        def kill(self):
            raise AssertionError("kill should not be used when killpg succeeds")

    session = make_session(terminal_module)
    session.process = FakeProcess()
    manager.sessions[session.id] = session

    monkeypatch.setattr(terminal_module.os, "getpgid", lambda pid: 654)
    monkeypatch.setattr(terminal_module.os, "killpg", lambda pgid, sig: calls.append((pgid, sig)))
    monkeypatch.setattr(terminal_module.os, "close", lambda fd: closed_fds.append(fd))

    asyncio.run(manager.close_session(session.id))

    assert calls == [(654, signal.SIGTERM), (654, signal.SIGKILL)]
    assert closed_fds == [99]
    assert session.id not in manager.sessions


def test_list_sessions_refreshes_unresolved_fixed_provider_session_ids(tmp_path, monkeypatch):
    terminal_module = load_terminal(tmp_path, monkeypatch)
    manager = terminal_module.TerminalManager()
    session = make_session(terminal_module)
    session.provider_id = "openai"
    session.cli_session_id = None
    manager.sessions[session.id] = session

    monkeypatch.setattr(
        terminal_module,
        "_resolve_fixed_provider_cli_session_id",
        lambda provider_id, process, cwd, timeout_seconds=1.0: "resolved-session-id",
    )

    sessions = manager.list_sessions()

    assert sessions == [
        {
            "id": "session-1",
            "cliSessionId": "resolved-session-id",
            "providerId": "openai",
            "permissionMode": "bypassPermissions",
            "taskId": "2026-03-10-1",
        }
    ]
    assert session.cli_session_id == "resolved-session-id"


def test_list_sessions_refreshes_unresolved_gemini_session_ids(tmp_path, monkeypatch):
    terminal_module = load_terminal(tmp_path, monkeypatch)
    manager = terminal_module.TerminalManager()
    session = make_session(terminal_module)
    session.provider_id = "gemini"
    session.cli_session_id = None
    manager.sessions[session.id] = session

    monkeypatch.setattr(
        terminal_module,
        "_resolve_fixed_provider_cli_session_id",
        lambda provider_id, process, cwd, timeout_seconds=1.0: "gemini-session-id",
    )

    sessions = manager.list_sessions()

    assert sessions == [
        {
            "id": "session-1",
            "cliSessionId": "gemini-session-id",
            "providerId": "gemini",
            "permissionMode": "bypassPermissions",
            "taskId": "2026-03-10-1",
        }
    ]
    assert session.cli_session_id == "gemini-session-id"


def test_discover_codex_cli_session_id_from_process_group(tmp_path, monkeypatch):
    terminal_module = load_terminal(tmp_path, monkeypatch)
    sessions_root = tmp_path / "sessions"
    session_file = sessions_root / "2026" / "03" / "10" / "rollout-2026-03-10T10-00-00-actual-session-id.jsonl"
    session_file.parent.mkdir(parents=True, exist_ok=True)
    session_file.write_text(
        json_line({
            "type": "session_meta",
            "payload": {
                "id": "actual-session-id",
                "cwd": "/tmp/codex-task",
            },
        }),
        encoding="utf-8",
    )

    monkeypatch.setattr(terminal_module, "CODEX_SESSIONS_ROOT", sessions_root)
    monkeypatch.setattr(terminal_module.os, "getpgid", lambda pid: 777)

    def fake_check_output(args, text=True, stderr=None):
        if args[0] == "ps":
            return "101 777\n102 777\n"
        if args[0] == "lsof":
            return f"p102\nn{session_file}\n"
        raise AssertionError(f"Unexpected command: {args}")

    monkeypatch.setattr(terminal_module.subprocess, "check_output", fake_check_output)
    monkeypatch.setattr(terminal_module.time, "sleep", lambda seconds: None)

    process = SimpleNamespace(pid=321)
    session_id = terminal_module._discover_codex_cli_session_id(process, Path("/tmp/codex-task"), timeout_seconds=0.2)

    assert session_id == "actual-session-id"


def test_discover_gemini_cli_session_id_from_process_group(tmp_path, monkeypatch):
    terminal_module = load_terminal(tmp_path, monkeypatch)
    gemini_root = tmp_path / ".gemini" / "tmp"
    session_file = gemini_root / "workspace" / "chats" / "session-123.json"
    session_file.parent.mkdir(parents=True, exist_ok=True)
    session_file.write_text(
        json.dumps(
            {
                "sessionId": "gemini-session-id",
                "title": "demo",
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(terminal_module, "GEMINI_TMP_ROOT", gemini_root)
    monkeypatch.setattr(terminal_module.os, "getpgid", lambda pid: 888)

    def fake_check_output(args, text=True, stderr=None):
        if args[0] == "ps":
            return "201 888\n202 888\n"
        if args[0] == "lsof":
            return f"p202\nn{session_file}\n"
        raise AssertionError(f"Unexpected command: {args}")

    monkeypatch.setattr(terminal_module.subprocess, "check_output", fake_check_output)
    monkeypatch.setattr(terminal_module.time, "sleep", lambda seconds: None)

    process = SimpleNamespace(pid=654)
    session_id = terminal_module._discover_gemini_cli_session_id(process, timeout_seconds=0.2)

    assert session_id == "gemini-session-id"


def test_recover_codex_resume_session_id_for_task_returns_unique_workspace_match(tmp_path, monkeypatch):
    terminal_module = load_terminal(tmp_path, monkeypatch)
    home_dir = tmp_path / "home"
    workspace_dir = home_dir / "workspace" / "2026-03-10-1"
    workspace_dir.mkdir(parents=True, exist_ok=True)

    sessions_root = home_dir / ".codex" / "sessions"
    session_file = sessions_root / "2026" / "03" / "10" / "rollout-2026-03-10T10-00-00-actual-session-id.jsonl"
    session_file.parent.mkdir(parents=True, exist_ok=True)
    session_file.write_text(
        json_line({
            "type": "session_meta",
            "payload": {
                "id": "actual-session-id",
                "cwd": str(workspace_dir),
            },
        }),
        encoding="utf-8",
    )

    monkeypatch.setattr(terminal_module, "CODEX_SESSIONS_ROOT", sessions_root)
    monkeypatch.setattr(terminal_module, "WORKSPACE_DIR", home_dir / "workspace")

    assert terminal_module._recover_codex_resume_session_id_for_task("2026-03-10-1") == "actual-session-id"


def json_line(payload: dict[str, object]) -> str:
    return json.dumps(payload, ensure_ascii=False) + "\n"
