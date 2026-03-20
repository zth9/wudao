from __future__ import annotations

import asyncio
import base64
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .paths import CONTEXTS_DIR

BRIDGE_WORKER_PATH = Path(__file__).resolve().with_name("openviking_bridge_worker.py")
BRIDGE_TIMEOUT_SECONDS = 30
_DETECTED_PYTHON_BIN: str | None = None


@dataclass
class OpenVikingBridgeError(Exception):
    code: str
    message: str
    details: str | None = None

    def __str__(self) -> str:
        return self.message


def _get_python_bin() -> str:
    explicit = os.environ.get("OPENVIKING_PYTHON", "").strip()
    if explicit:
        return explicit

    global _DETECTED_PYTHON_BIN
    if _DETECTED_PYTHON_BIN:
        return _DETECTED_PYTHON_BIN

    base_executable = getattr(sys, "_base_executable", "")
    base_prefix_python = str(Path(sys.base_prefix) / "bin" / "python3") if getattr(sys, "base_prefix", "") else ""

    tried: set[str] = set()
    for candidate in (sys.executable, base_executable, base_prefix_python, "python3", "python"):
        if not candidate or candidate in tried:
            continue
        tried.add(candidate)
        if _python_supports_openviking(candidate):
            _DETECTED_PYTHON_BIN = candidate
            return candidate

    _DETECTED_PYTHON_BIN = sys.executable
    return _DETECTED_PYTHON_BIN


def _python_supports_openviking(python_bin: str) -> bool:
    try:
        completed = subprocess.run(
            [python_bin, "-c", "import openviking"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    except FileNotFoundError:
        return False
    except Exception:
        return False
    return completed.returncode == 0


def _get_config_path() -> str | None:
    raw = os.environ.get("OPENVIKING_CONFIG_FILE", "").strip()
    return raw or None


def _build_bridge_env() -> dict[str, str]:
    env = os.environ.copy()
    env["WUDAO_OPENVIKING_WORKSPACE"] = str(CONTEXTS_DIR)
    return env


def _parse_envelope(raw: str) -> dict[str, Any]:
    candidates = [raw.strip(), *[line.strip() for line in raw.splitlines() if line.strip()][::-1]]
    for candidate in candidates:
        if not candidate:
            continue
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue
    raise OpenVikingBridgeError("invalid_bridge_output", "OpenViking bridge returned invalid JSON", raw.strip() or None)


def _raise_from_envelope(parsed: dict[str, Any], fallback_message: str) -> None:
    error = parsed.get("error") or {}
    raise OpenVikingBridgeError(
        str(error.get("code") or "bridge_failed"),
        str(error.get("message") or fallback_message),
        str(error.get("details")) if error.get("details") else None,
    )


class _OpenVikingBridgeWorker:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._process: asyncio.subprocess.Process | None = None

    def _is_running(self) -> bool:
        return self._process is not None and self._process.returncode is None

    async def request(self, command: str, payload: dict[str, Any] | None = None, *, timeout_seconds: float = BRIDGE_TIMEOUT_SECONDS) -> Any:
        async with self._lock:
            last_error: OpenVikingBridgeError | None = None
            for _attempt in range(2):
                await self._ensure_process_locked()
                try:
                    return await self._send_request_locked(command, payload or {}, timeout_seconds=timeout_seconds)
                except OpenVikingBridgeError as exc:
                    last_error = exc
                    if not self._is_retryable(exc):
                        raise
                    await self._close_locked(force=True)

            if last_error is not None:
                raise last_error
            raise OpenVikingBridgeError("bridge_failed", "OpenViking bridge request failed")

    async def close(self) -> None:
        async with self._lock:
            await self._close_locked(force=False)

    async def _ensure_process_locked(self) -> None:
        if self._is_running():
            return

        self._process = await asyncio.create_subprocess_exec(
            _get_python_bin(),
            str(BRIDGE_WORKER_PATH),
            stdout=asyncio.subprocess.PIPE,
            stdin=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
            env=_build_bridge_env(),
        )

    async def _send_request_locked(self, command: str, payload: dict[str, Any], *, timeout_seconds: float) -> Any:
        process = self._process
        if process is None or process.returncode is not None or process.stdin is None or process.stdout is None:
            raise OpenVikingBridgeError("bridge_unavailable", "OpenViking bridge worker is not running")

        request_line = json.dumps({"command": command, "payload": payload}, ensure_ascii=False) + "\n"
        try:
            process.stdin.write(request_line.encode("utf-8"))
            await asyncio.wait_for(process.stdin.drain(), timeout=timeout_seconds)
        except (BrokenPipeError, ConnectionResetError) as exc:
            raise OpenVikingBridgeError("bridge_unavailable", "OpenViking bridge worker is unavailable", str(exc)) from exc
        except asyncio.TimeoutError as exc:
            raise OpenVikingBridgeError("bridge_timeout", "OpenViking bridge request timed out") from exc

        parsed = await self._read_response_locked(process, timeout_seconds=timeout_seconds)
        if not parsed.get("ok"):
            _raise_from_envelope(parsed, "OpenViking bridge request failed")
        return parsed.get("result")

    async def _read_response_locked(self, process: asyncio.subprocess.Process, *, timeout_seconds: float) -> dict[str, Any]:
        if process.stdout is None:
            raise OpenVikingBridgeError("bridge_unavailable", "OpenViking bridge worker has no stdout pipe")

        loop = asyncio.get_running_loop()
        deadline = loop.time() + timeout_seconds
        buffered_lines: list[str] = []

        while True:
            remaining = deadline - loop.time()
            if remaining <= 0:
                raise OpenVikingBridgeError(
                    "bridge_timeout",
                    "OpenViking bridge request timed out",
                    "\n".join(buffered_lines).strip() or None,
                )

            raw = await asyncio.wait_for(process.stdout.readline(), timeout=remaining)
            if not raw:
                raise OpenVikingBridgeError(
                    "bridge_eof",
                    "OpenViking bridge worker closed unexpectedly",
                    "\n".join(buffered_lines).strip() or None,
                )

            line = raw.decode("utf-8", errors="replace").strip()
            if not line:
                continue

            try:
                return _parse_envelope(line)
            except OpenVikingBridgeError:
                buffered_lines.append(line)
                continue

    async def _close_locked(self, *, force: bool) -> None:
        process = self._process
        self._process = None
        if process is None:
            return

        if process.returncode is None and not force and process.stdin is not None and process.stdout is not None:
            try:
                process.stdin.write(b'{"command":"shutdown","payload":{}}\n')
                await asyncio.wait_for(process.stdin.drain(), timeout=1)
                await self._read_response_locked(process, timeout_seconds=1)
            except Exception:
                force = True

        if process.returncode is None and force:
            process.kill()

        try:
            await asyncio.wait_for(process.wait(), timeout=1)
        except asyncio.TimeoutError:
            if process.returncode is None:
                process.kill()
                await process.wait()

    def _is_retryable(self, exc: OpenVikingBridgeError) -> bool:
        return exc.code in {"bridge_timeout", "bridge_eof", "bridge_unavailable", "invalid_bridge_output"}


_bridge_worker = _OpenVikingBridgeWorker()


async def close_openviking_bridge() -> None:
    await _bridge_worker.close()


async def _run_bridge(command: str, payload: dict[str, Any] | None = None, *, timeout_seconds: float = BRIDGE_TIMEOUT_SECONDS) -> Any:
    return await _bridge_worker.request(command, payload, timeout_seconds=timeout_seconds)


async def get_openviking_status(*, timeout_seconds: float = BRIDGE_TIMEOUT_SECONDS) -> dict[str, Any]:
    try:
        return await _run_bridge("status", timeout_seconds=timeout_seconds)
    except Exception as exc:
        return {
            "available": False,
            "mode": "embedded",
            "workspacePath": str(CONTEXTS_DIR),
            "configPath": _get_config_path(),
            "pythonBin": _get_python_bin(),
            "message": str(exc),
        }


async def list_openviking_memories() -> dict[str, Any]:
    return await _run_bridge("list-memories")


async def sync_openviking_agent_memory(content: str) -> dict[str, Any]:
    return await _run_bridge(
        "sync-agent-memory",
        {"contentB64": base64.b64encode(content.encode("utf-8")).decode("ascii")},
    )


async def sync_openviking_user_memory(content: str) -> dict[str, Any]:
    return await _run_bridge(
        "sync-user-memory",
        {"contentB64": base64.b64encode(content.encode("utf-8")).decode("ascii")},
    )
