from __future__ import annotations

import json
import os
import shutil
from typing import Any

PermissionMode = str
VALID_PERMISSION_MODES = {"default", "plan", "bypassPermissions"}
DEFAULT_PERMISSION_MODE = "bypassPermissions"
DEFAULT_FISH_PATH = shutil.which("fish") or "/usr/local/bin/fish"


def resolve_permission_mode(permission_mode: str | None) -> PermissionMode:
    return permission_mode if permission_mode in VALID_PERMISSION_MODES else DEFAULT_PERMISSION_MODE


def should_auto_send_initial_input(buffer: str) -> bool:
    return ">" in buffer or "$" in buffer


def parse_ws_message(raw: str) -> dict[str, Any] | None:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict) or not isinstance(parsed.get("type"), str):
        return None
    return parsed


def _build_fixed_provider_command(provider_id: str, resume_session_id: str | None = None, resume_latest: bool = False) -> str | None:
    if provider_id == "openai":
        if resume_session_id:
            return f"codex --yolo resume {resume_session_id}"
        if resume_latest:
            return "codex --yolo resume --last"
        return "codex --yolo"
    if provider_id == "gemini":
        if resume_session_id:
            return f"gemini --yolo --resume {resume_session_id}"
        if resume_latest:
            return "gemini --yolo --resume latest"
        return "gemini --yolo"
    return None


def build_terminal_command(
    provider_id: str,
    permission_mode: str | None,
    provider_cli: dict[str, str],
    claude_cli_path: str,
    has_persisted_claude_session,
    resume_session_id: str | None = None,
    resume_latest: bool = False,
    cli_session_id: str | None = None,
    fish_path: str | None = None,
) -> list[str]:
    fixed_command = _build_fixed_provider_command(provider_id, resume_session_id, resume_latest)
    if fixed_command:
        return [fish_path or DEFAULT_FISH_PATH, "-c", fixed_command]

    mode = resolve_permission_mode(permission_mode)
    cli = provider_cli.get(provider_id)
    has_provider_cli = bool(cli)
    should_resume = bool(
        resume_session_id
        and (provider_id != "claude" and has_provider_cli or has_persisted_claude_session(resume_session_id))
    )

    effective_session_id = resume_session_id if resume_session_id and not should_resume else cli_session_id
    resume_args = ["--resume", resume_session_id] if resume_session_id and should_resume else []
    session_id_args = ["--session-id", effective_session_id] if not should_resume and effective_session_id else []

    if not cli:
        return [claude_cli_path, "--permission-mode", mode, *resume_args, *session_id_args]
    if provider_id == "claude":
        return [cli, "--permission-mode", mode, *resume_args, *session_id_args]

    extra = ""
    if resume_session_id:
        extra = f" --resume {resume_session_id}"
    elif cli_session_id:
        extra = f" --session-id {cli_session_id}"
    return [fish_path or DEFAULT_FISH_PATH, "-c", f"{cli} --permission-mode {mode}{extra}"]


def build_pty_env(base_env: dict[str, str] | None = None) -> dict[str, str]:
    env = dict(base_env or os.environ)
    env["LANG"] = "C.UTF-8"
    env["LC_ALL"] = "C.UTF-8"
    env["LC_CTYPE"] = "C.UTF-8"
    env.pop("CLAUDECODE", None)
    return env
