from __future__ import annotations

import asyncio
import codecs
import json
import os
import select
import shutil
import signal
import struct
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from fastapi import WebSocket

from .claude_session_store import has_persisted_claude_session
from .paths import WORKSPACE_DIR
from .task_claude_md import generate_task_claude_md
from .task_service import is_valid_task_id
from .terminal_utils import (
    build_pty_env,
    build_terminal_command,
    parse_ws_message,
    resolve_permission_mode,
    should_auto_send_initial_input,
)

MAX_BUFFER_CHARS = 200_000
SNAPSHOT_TRIM_LOOKBACK_CHARS = 8_192
FIXED_PROVIDER_IDS = {"openai", "gemini"}
CODEX_SESSIONS_ROOT = Path.home() / ".codex" / "sessions"
GEMINI_TMP_ROOT = Path.home() / ".gemini" / "tmp"


def _resolve_claude_cli_path() -> str:
    candidates = [
        os.environ.get("CLAUDE_CLI_PATH"),
        str(Path.home() / ".local" / "bin" / "claude"),
        "/opt/homebrew/bin/claude",
        "/usr/local/bin/claude",
        shutil.which("claude"),
    ]
    for candidate in candidates:
        if not candidate:
            continue
        if os.access(candidate, os.X_OK):
            return candidate
    return "claude"


CLAUDE_CLI_PATH = _resolve_claude_cli_path()
PROVIDER_CLI = {
    "kimi": "kimi",
    "glm": "glm",
    "minimax": "minimax",
    "qwen": "qwen",
    "openai": "codex",
    "gemini": "gemini",
    "claude": CLAUDE_CLI_PATH,
}


def _provider_uses_fixed_session_store(provider_id: str) -> bool:
    return provider_id in FIXED_PROVIDER_IDS


def _supports_generated_cli_session_id(provider_id: str) -> bool:
    return not _provider_uses_fixed_session_store(provider_id)


def _find_file_recursive(root: Path, matcher, max_depth: int) -> bool:
    def walk(current: Path, depth: int) -> bool:
        if depth > max_depth or not current.exists():
            return False
        try:
            entries = list(current.iterdir())
        except OSError:
            return False
        for entry in entries:
            if entry.is_file() and matcher(entry):
                return True
            if entry.is_dir() and walk(entry, depth + 1):
                return True
        return False

    return walk(root, 0)


def _has_codex_session(session_id: str) -> bool:
    if not session_id.strip():
        return False
    return _find_file_recursive(CODEX_SESSIONS_ROOT, lambda entry: entry.name.endswith(f"-{session_id}.jsonl"), 4)


def _read_codex_session_meta(path: Path) -> dict[str, str] | None:
    try:
        first_line = path.read_text(encoding="utf-8").splitlines()[0]
    except (OSError, IndexError):
        return None
    try:
        parsed = json.loads(first_line)
    except json.JSONDecodeError:
        return None
    if parsed.get("type") != "session_meta":
        return None
    payload = parsed.get("payload")
    if not isinstance(payload, dict):
        return None
    session_id = payload.get("id")
    cwd = payload.get("cwd")
    if not isinstance(session_id, str) or not session_id.strip():
        return None
    if not isinstance(cwd, str) or not cwd.strip():
        return None
    return {"id": session_id.strip(), "cwd": cwd.strip()}


def _list_process_group_pids(process: subprocess.Popen[Any]) -> list[int]:
    try:
        pgid = os.getpgid(process.pid)
    except (ProcessLookupError, OSError, AttributeError):
        return []

    try:
        output = subprocess.check_output(["ps", "-axo", "pid=,pgid="], text=True)
    except Exception:
        return []

    pids: list[int] = []
    for line in output.splitlines():
        parts = line.strip().split()
        if len(parts) != 2:
            continue
        try:
            pid = int(parts[0])
            row_pgid = int(parts[1])
        except ValueError:
            continue
        if row_pgid == pgid:
            pids.append(pid)
    return pids


def _list_open_paths_for_pid(pid: int) -> list[Path]:
    try:
        output = subprocess.check_output(
            ["lsof", "-nP", "-a", "-p", str(pid), "-Fn"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        return []
    paths: list[Path] = []
    for line in output.splitlines():
        if not line.startswith("n"):
            continue
        raw = line[1:].strip()
        if not raw.startswith("/"):
            continue
        paths.append(Path(raw))
    return paths


def _discover_codex_cli_session_id(
    process: subprocess.Popen[Any],
    cwd: Path,
    timeout_seconds: float = 3.0,
    poll_interval_seconds: float = 0.1,
) -> str | None:
    expected_cwd = str(cwd)
    deadline = time.monotonic() + timeout_seconds

    while time.monotonic() < deadline:
        for pid in _list_process_group_pids(process):
            for path in _list_open_paths_for_pid(pid):
                if path.suffix != ".jsonl":
                    continue
                if not str(path).startswith(f"{CODEX_SESSIONS_ROOT}{os.sep}"):
                    continue
                meta = _read_codex_session_meta(path)
                if meta and meta["cwd"] == expected_cwd:
                    return meta["id"]
        time.sleep(poll_interval_seconds)

    return None


def _find_codex_session_ids_for_cwd(cwd: Path) -> list[str]:
    if not CODEX_SESSIONS_ROOT.exists():
        return []

    expected_cwd = str(cwd)
    matches: list[tuple[float, str]] = []
    for path in CODEX_SESSIONS_ROOT.rglob("*.jsonl"):
        meta = _read_codex_session_meta(path)
        if not meta or meta["cwd"] != expected_cwd:
            continue
        try:
            mtime = path.stat().st_mtime
        except OSError:
            mtime = 0.0
        matches.append((mtime, meta["id"]))

    matches.sort(key=lambda item: item[0], reverse=True)
    unique_ids: list[str] = []
    seen = set()
    for _, session_id in matches:
        if session_id in seen:
            continue
        seen.add(session_id)
        unique_ids.append(session_id)
    return unique_ids


def _recover_codex_resume_session_id_for_task(task_id: str | None) -> str | None:
    if not task_id or not is_valid_task_id(task_id):
        return None
    session_ids = _find_codex_session_ids_for_cwd(WORKSPACE_DIR / task_id)
    return session_ids[0] if len(session_ids) == 1 else None


def _resolve_fixed_provider_cli_session_id(
    provider_id: str,
    process: subprocess.Popen[Any],
    cwd: Path,
    timeout_seconds: float = 3.0,
) -> str | None:
    if provider_id == "openai":
        return _discover_codex_cli_session_id(process, cwd, timeout_seconds=timeout_seconds)
    if provider_id == "gemini":
        return _discover_gemini_cli_session_id(process, timeout_seconds=timeout_seconds)
    return None


def _is_gemini_session_file(path: Path) -> bool:
    return path.name.startswith("session-") and path.name.endswith(".json") and f"{os.sep}chats{os.sep}" in str(path)


def _read_gemini_session_meta(path: Path) -> dict[str, str] | None:
    if not _is_gemini_session_file(path):
        return None
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    session_id = parsed.get("sessionId")
    if not isinstance(session_id, str) or not session_id.strip():
        return None
    return {"id": session_id.strip()}


def _discover_gemini_cli_session_id(
    process: subprocess.Popen[Any],
    timeout_seconds: float = 3.0,
    poll_interval_seconds: float = 0.1,
) -> str | None:
    deadline = time.monotonic() + timeout_seconds

    while time.monotonic() < deadline:
        for pid in _list_process_group_pids(process):
            for path in _list_open_paths_for_pid(pid):
                if not str(path).startswith(f"{GEMINI_TMP_ROOT}{os.sep}"):
                    continue
                meta = _read_gemini_session_meta(path)
                if meta:
                    return meta["id"]
        time.sleep(poll_interval_seconds)

    return None


def _has_gemini_session(session_id: str) -> bool:
    if not session_id.strip():
        return False

    def matcher(path: Path) -> bool:
        if not _is_gemini_session_file(path):
            return False
        try:
            content = path.read_text(encoding="utf-8")
        except OSError:
            return False
        if session_id not in content:
            return False
        meta = _read_gemini_session_meta(path)
        return bool(meta and meta["id"] == session_id)

    return _find_file_recursive(GEMINI_TMP_ROOT, matcher, 4)


def _resolve_resume_behavior(provider_id: str, requested_resume_session_id: str | None) -> dict[str, Any]:
    candidate = (requested_resume_session_id or "").strip()
    if not candidate:
        return {"resumeSessionId": None, "resumeLatest": False, "invalidRequestedResume": False}
    if provider_id == "openai":
        if _has_codex_session(candidate):
            return {"resumeSessionId": candidate, "resumeLatest": False, "invalidRequestedResume": False}
        return {"resumeSessionId": None, "resumeLatest": False, "invalidRequestedResume": True}
    if provider_id == "gemini":
        if _has_gemini_session(candidate):
            return {"resumeSessionId": candidate, "resumeLatest": False, "invalidRequestedResume": False}
        return {"resumeSessionId": None, "resumeLatest": False, "invalidRequestedResume": True}
    return {"resumeSessionId": candidate, "resumeLatest": False, "invalidRequestedResume": False}


def _set_winsize(fd: int, rows: int, cols: int) -> None:
    import fcntl
    import termios

    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))


def _make_terminal_decoder() -> Any:
    return codecs.getincrementaldecoder("utf-8")(errors="replace")


def _decode_terminal_chunk(session: TerminalSession, data: bytes, *, final: bool = False) -> str:
    return str(session.decoder.decode(data, final=final))


def _find_safe_terminal_cut_index(buffer: str, minimum_index: int) -> int:
    if minimum_index <= 0:
        return 0
    minimum_index = min(minimum_index, len(buffer))
    index = 0
    state = "normal"

    while index < len(buffer):
        if state == "normal":
            if index >= minimum_index:
                return index
            if buffer[index] == "\x1b":
                state = "escape"
            index += 1
            continue

        if state == "escape":
            if index >= len(buffer):
                break
            marker = buffer[index]
            index += 1
            if marker == "[":
                state = "csi"
            elif marker == "]":
                state = "osc"
            elif marker in "PX^_":
                state = "st"
            else:
                state = "normal"
            continue

        if state == "csi":
            while index < len(buffer):
                marker = buffer[index]
                index += 1
                if "@" <= marker <= "~":
                    state = "normal"
                    break
            continue

        if state == "osc":
            while index < len(buffer):
                marker = buffer[index]
                index += 1
                if marker == "\x07":
                    state = "normal"
                    break
                if marker == "\x1b":
                    state = "osc_st"
                    break
            continue

        if state == "osc_st":
            if index < len(buffer) and buffer[index] == "\\":
                index += 1
                state = "normal"
            else:
                state = "osc"
            continue

        if state == "st":
            while index < len(buffer):
                marker = buffer[index]
                index += 1
                if marker == "\x1b":
                    state = "st_esc"
                    break
            continue

        if state == "st_esc":
            if index < len(buffer) and buffer[index] == "\\":
                index += 1
                state = "normal"
            else:
                state = "st"
            continue

    return minimum_index


def _trim_terminal_buffer(buffer: str, max_chars: int = MAX_BUFFER_CHARS) -> str:
    if len(buffer) <= max_chars:
        return buffer

    overflow = len(buffer) - max_chars
    lookback_start = max(0, overflow - SNAPSHOT_TRIM_LOOKBACK_CHARS)
    candidate = buffer[lookback_start:]
    minimum_index = overflow - lookback_start
    safe_index = _find_safe_terminal_cut_index(candidate, minimum_index)
    trimmed = candidate[safe_index:]

    if len(trimmed) <= max_chars:
        return trimmed
    return trimmed[-max_chars:]


@dataclass
class TerminalSession:
    id: str
    provider_id: str
    permission_mode: str
    task_id: str | None
    cli_session_id: str | None
    process: subprocess.Popen[Any]
    master_fd: int
    cols: int
    rows: int
    cwd: str
    buffer: str = ""
    ws: WebSocket | None = None
    pending_input: str | None = None
    reader_thread: threading.Thread | None = None
    closed: bool = False
    write_lock: threading.Lock = field(default_factory=threading.Lock)
    decoder: Any = field(default_factory=_make_terminal_decoder)


class TerminalManager:
    def __init__(self) -> None:
        self.sessions: dict[str, TerminalSession] = {}
        self._lock = threading.RLock()

    def _append_buffer(self, session: TerminalSession, chunk: str) -> None:
        session.buffer = _trim_terminal_buffer(session.buffer + chunk)

    def _queue_output(self, session: TerminalSession, loop: asyncio.AbstractEventLoop, text: str) -> None:
        if not text:
            return
        self._append_buffer(session, text)
        asyncio.run_coroutine_threadsafe(
            self._send_to_session(session, {"type": "output", "sessionId": session.id, "data": text}),
            loop,
        )

    async def _send_to_session(self, session: TerminalSession, payload: dict[str, Any]) -> None:
        if session.ws is None:
            return
        try:
            await session.ws.send_text(json.dumps(payload, ensure_ascii=False))
        except Exception:
            session.ws = None

    def _signal_process_group(self, process: subprocess.Popen[Any], sig: signal.Signals) -> bool:
        try:
            pgid = os.getpgid(process.pid)
        except (ProcessLookupError, OSError, AttributeError):
            return False
        try:
            os.killpg(pgid, sig)
        except (ProcessLookupError, OSError):
            return False
        return True

    def _terminate_process(self, process: subprocess.Popen[Any]) -> int:
        exit_code = process.poll()
        if exit_code is not None:
            return int(exit_code)

        if not self._signal_process_group(process, signal.SIGTERM):
            try:
                process.terminate()
            except Exception:
                pass
        try:
            return int(process.wait(timeout=1))
        except Exception:
            pass

        if not self._signal_process_group(process, signal.SIGKILL):
            try:
                process.kill()
            except Exception:
                pass
        try:
            return int(process.wait(timeout=1))
        except Exception:
            return -1

    def _reader_loop(self, session: TerminalSession, loop: asyncio.AbstractEventLoop) -> None:
        try:
            while not session.closed:
                ready, _, _ = select.select([session.master_fd], [], [], 0.2)
                if not ready:
                    if session.process.poll() is not None:
                        break
                    continue
                try:
                    data = os.read(session.master_fd, 4096)
                except OSError:
                    break
                if not data:
                    break
                text = _decode_terminal_chunk(session, data)
                self._queue_output(session, loop, text)
                if session.pending_input and should_auto_send_initial_input(session.buffer):
                    pending = session.pending_input
                    session.pending_input = None
                    def delayed_write() -> None:
                        current = self.sessions.get(session.id)
                        if current and not current.closed and pending:
                            self.write_input(session.id, pending + "\r")
                    loop.call_later(0.3, delayed_write)
        finally:
            trailing_text = _decode_terminal_chunk(session, b"", final=True)
            self._queue_output(session, loop, trailing_text)
            exit_code = session.process.poll()
            if exit_code is None:
                exit_code = self._terminate_process(session.process)
            asyncio.run_coroutine_threadsafe(
                self._send_to_session(session, {"type": "exit", "sessionId": session.id, "exitCode": exit_code}),
                loop,
            )
            with self._lock:
                self.sessions.pop(session.id, None)
            session.closed = True
            try:
                os.close(session.master_fd)
            except OSError:
                pass

    async def close_session(self, session_id: str) -> None:
        with self._lock:
            session = self.sessions.get(session_id)
            if not session:
                return
            session.closed = True
            session.ws = None
        self._terminate_process(session.process)
        try:
            os.close(session.master_fd)
        except OSError:
            pass
        with self._lock:
            self.sessions.pop(session_id, None)

    async def close_all_sessions(self) -> None:
        with self._lock:
            session_ids = list(self.sessions.keys())
        for session_id in session_ids:
            await self.close_session(session_id)

    def _refresh_fixed_provider_session_id(self, session: TerminalSession, timeout_seconds: float = 1.0) -> None:
        if session.closed or session.cli_session_id or session.provider_id not in FIXED_PROVIDER_IDS:
            return
        resolved = _resolve_fixed_provider_cli_session_id(
            session.provider_id,
            session.process,
            Path(session.cwd),
            timeout_seconds=timeout_seconds,
        )
        if resolved:
            session.cli_session_id = resolved

    def close_sessions_by_task_id(self, task_id: str) -> int:
        session_ids = []
        with self._lock:
            for session in self.sessions.values():
                if session.task_id == task_id:
                    session_ids.append(session.id)
        for session_id in session_ids:
            asyncio.create_task(self.close_session(session_id))
        return len(session_ids)

    def list_sessions(self) -> list[dict[str, Any]]:
        with self._lock:
            sessions = list(self.sessions.values())
        for session in sessions:
            self._refresh_fixed_provider_session_id(session)
        return [
            {
                "id": session.id,
                "cliSessionId": session.cli_session_id,
                "providerId": session.provider_id,
                "permissionMode": session.permission_mode,
                "taskId": session.task_id,
            }
            for session in sessions
        ]

    def list_task_snapshots(
        self,
        task_id: str,
        *,
        linked_session_id: str | None = None,
        max_chars: int = 4000,
    ) -> list[dict[str, Any]]:
        max_chars = max(200, max_chars)
        with self._lock:
            sessions = [session for session in self.sessions.values() if session.task_id == task_id and not session.closed]
        snapshots: list[dict[str, Any]] = []
        for session in sessions:
            linked_ids = {session.id}
            if session.cli_session_id:
                linked_ids.add(session.cli_session_id)
            if linked_session_id and linked_session_id not in linked_ids:
                continue
            snapshots.append(
                {
                    "sessionId": session.id,
                    "cliSessionId": session.cli_session_id,
                    "providerId": session.provider_id,
                    "preview": session.buffer[-max_chars:],
                    "truncated": len(session.buffer) > max_chars,
                }
            )
        return snapshots

    def write_input(self, session_id: str, data: str) -> None:
        with self._lock:
            session = self.sessions.get(session_id)
        if not session or session.closed:
            return
        with session.write_lock:
            os.write(session.master_fd, data.encode("utf-8"))

    def _notify_terminal_resized(self, process: subprocess.Popen[Any]) -> None:
        self._signal_process_group(process, signal.SIGWINCH)

    def resize(self, session_id: str, cols: int, rows: int) -> None:
        cols = max(int(cols), 1)
        rows = max(int(rows), 1)
        with self._lock:
            session = self.sessions.get(session_id)
            if not session or session.closed:
                return
            if session.cols == cols and session.rows == rows:
                return
            session.cols = cols
            session.rows = rows
            master_fd = session.master_fd
            process = session.process
        _set_winsize(master_fd, rows, cols)
        self._notify_terminal_resized(process)

    async def handle_websocket(self, websocket: WebSocket) -> None:
        await websocket.accept()
        session_id: str | None = None
        loop = asyncio.get_running_loop()

        try:
            while True:
                raw = await websocket.receive_text()
                message = parse_ws_message(raw)
                if not message:
                    continue
                msg_type = message["type"]

                if msg_type == "create":
                    provider_id = str(message.get("providerId") or "kimi")
                    permission_mode = message.get("permissionMode") if isinstance(message.get("permissionMode"), str) else None
                    task_id = message.get("taskId") if isinstance(message.get("taskId"), str) else None
                    initial_input = message.get("initialInput") if isinstance(message.get("initialInput"), str) else None
                    requested_resume_session_id = message.get("resumeSessionId") if isinstance(message.get("resumeSessionId"), str) else None
                    client_ref = message.get("clientRef") if isinstance(message.get("clientRef"), str) else None
                    resolved_resume = _resolve_resume_behavior(provider_id, requested_resume_session_id)
                    if resolved_resume["invalidRequestedResume"] and provider_id == "openai":
                        recovered_resume_session_id = _recover_codex_resume_session_id_for_task(task_id)
                        if recovered_resume_session_id:
                            resolved_resume = {
                                "resumeSessionId": recovered_resume_session_id,
                                "resumeLatest": False,
                                "invalidRequestedResume": False,
                            }

                    if resolved_resume["invalidRequestedResume"]:
                        await websocket.send_text(
                            json.dumps(
                                {
                                    "type": "error",
                                    "message": "Session not found or no longer recoverable",
                                    "clientRef": client_ref,
                                },
                                ensure_ascii=False,
                            )
                        )
                        continue
                    resume_session_id = resolved_resume["resumeSessionId"]
                    resume_latest = resolved_resume["resumeLatest"]
                    cli_session_id = resume_session_id or (str(uuid.uuid4()) if _supports_generated_cli_session_id(provider_id) else None)
                    mode = resolve_permission_mode(permission_mode)
                    cmd = build_terminal_command(
                        provider_id=provider_id,
                        permission_mode=permission_mode,
                        resume_session_id=resume_session_id,
                        resume_latest=resume_latest,
                        cli_session_id=cli_session_id,
                        provider_cli=PROVIDER_CLI,
                        claude_cli_path=CLAUDE_CLI_PATH,
                        has_persisted_claude_session=has_persisted_claude_session,
                    )

                    cwd = Path.home()
                    if task_id and is_valid_task_id(task_id):
                        task_dir = WORKSPACE_DIR / task_id
                        task_dir.mkdir(parents=True, exist_ok=True)
                        cwd = task_dir
                        generate_task_claude_md(task_id, cwd)

                    master_fd, slave_fd = os.openpty()
                    cols = int(message.get("cols") or 120)
                    rows = int(message.get("rows") or 30)
                    _set_winsize(slave_fd, rows, cols)

                    try:
                        process = subprocess.Popen(
                            cmd,
                            stdin=slave_fd,
                            stdout=slave_fd,
                            stderr=slave_fd,
                            cwd=str(cwd),
                            env=build_pty_env(),
                            start_new_session=True,
                            close_fds=True,
                        )
                    except Exception as exc:
                        os.close(master_fd)
                        os.close(slave_fd)
                        await websocket.send_text(json.dumps({"type": "error", "message": f"Failed to start terminal: {exc}", "clientRef": client_ref}, ensure_ascii=False))
                        continue
                    finally:
                        try:
                            os.close(slave_fd)
                        except OSError:
                            pass

                    resolved_cli_session_id = cli_session_id
                    if provider_id in FIXED_PROVIDER_IDS and not resume_session_id:
                        resolved_cli_session_id = (
                            _resolve_fixed_provider_cli_session_id(provider_id, process, cwd)
                            or cli_session_id
                        )

                    created_session_id = str(uuid.uuid4())
                    session = TerminalSession(
                        id=created_session_id,
                        provider_id=provider_id,
                        permission_mode=mode,
                        task_id=task_id,
                        cli_session_id=resolved_cli_session_id,
                        process=process,
                        master_fd=master_fd,
                        cols=cols,
                        rows=rows,
                        cwd=str(cwd),
                        ws=websocket,
                        pending_input=initial_input,
                    )
                    reader_thread = threading.Thread(target=self._reader_loop, args=(session, loop), daemon=True)
                    session.reader_thread = reader_thread
                    with self._lock:
                        self.sessions[created_session_id] = session
                    session_id = created_session_id
                    reader_thread.start()

                    await websocket.send_text(json.dumps({"type": "created", "sessionId": created_session_id, "cliSessionId": resolved_cli_session_id, "clientRef": client_ref}, ensure_ascii=False))
                    continue

                if msg_type == "attach":
                    requested_id = str(message.get("sessionId") or "")
                    with self._lock:
                        session = self.sessions.get(requested_id)
                    if not session:
                        await websocket.send_text(json.dumps({"type": "error", "sessionId": requested_id, "message": "Session not found"}, ensure_ascii=False))
                        continue
                    session.ws = websocket
                    session_id = requested_id
                    await websocket.send_text(json.dumps({"type": "attached", "sessionId": requested_id}, ensure_ascii=False))
                    if session.buffer:
                        await websocket.send_text(json.dumps({"type": "snapshot", "sessionId": requested_id, "data": session.buffer}, ensure_ascii=False))
                    continue

                if msg_type == "input":
                    target_id = str(message.get("sessionId") or session_id or "")
                    data = message.get("data")
                    if target_id and isinstance(data, str):
                        self.write_input(target_id, data)
                    continue

                if msg_type == "resize":
                    target_id = str(message.get("sessionId") or session_id or "")
                    cols = int(message.get("cols") or 120)
                    rows = int(message.get("rows") or 30)
                    if target_id:
                        self.resize(target_id, cols, rows)
                    continue

                if msg_type == "list":
                    await websocket.send_text(json.dumps({"type": "sessions", "sessions": self.list_sessions()}, ensure_ascii=False))
                    continue

                if msg_type == "close":
                    requested_id = str(message.get("sessionId") or "")
                    if requested_id:
                        await self.close_session(requested_id)
                        if session_id == requested_id:
                            session_id = None
                    continue
        except Exception:
            pass
        finally:
            with self._lock:
                for session in self.sessions.values():
                    if session.ws is websocket:
                        session.ws = None


terminal_manager = TerminalManager()
