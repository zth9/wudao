from __future__ import annotations

import os
from pathlib import Path

WUDAO_HOME = Path(os.environ.get("WUDAO_HOME", str(Path.home() / ".wudao"))).expanduser()
WORKSPACE_DIR = WUDAO_HOME / "workspace"
PROFILE_DIR = WUDAO_HOME / "profile"
WUDAO_AGENT_MEMORY_FILE = PROFILE_DIR / "wudao-agent-memory.md"
WUDAO_USER_MEMORY_FILE = PROFILE_DIR / "user-memory.md"


def ensure_runtime_dirs() -> None:
    for directory in (WORKSPACE_DIR, PROFILE_DIR):
        directory.mkdir(parents=True, exist_ok=True)
