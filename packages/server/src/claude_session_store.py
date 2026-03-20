from __future__ import annotations

import re
from pathlib import Path

CLAUDE_PROJECTS_DIR = Path.home() / ".claude" / "projects"
SESSION_ID_PATTERN = re.compile(r"^[a-f0-9-]{36}$")


def has_persisted_claude_session(session_id: str) -> bool:
    if not SESSION_ID_PATTERN.fullmatch(session_id):
        return False

    file_name = f"{session_id}.jsonl"
    try:
        for entry in CLAUDE_PROJECTS_DIR.iterdir():
            if not entry.is_dir():
                continue
            if (entry / file_name).exists():
                return True
    except OSError:
        return False
    return False
