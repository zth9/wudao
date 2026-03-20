from __future__ import annotations

from pathlib import Path

from .db import db
from .logger import logger
from .paths import WORKSPACE_DIR

AGENTS_FILE = "AGENTS.md"
COMPAT_AGENT_FILES = ("CLAUDE.md", "GEMINI.md")
AGENTS_LINK_TARGET = f"./{AGENTS_FILE}"


def write_task_claude_md(cwd: str | Path) -> None:
    cwd_path = Path(cwd)
    cwd_path.mkdir(parents=True, exist_ok=True)

    for compat_file in COMPAT_AGENT_FILES:
        compat_path = cwd_path / compat_file
        if compat_path.exists() or compat_path.is_symlink():
            compat_path.unlink(missing_ok=True)
        compat_path.symlink_to(AGENTS_LINK_TARGET)


def generate_task_claude_md(task_id: str, cwd: str | Path) -> None:
    try:
        resolved = Path(cwd).resolve()
        if resolved != WORKSPACE_DIR.resolve() and WORKSPACE_DIR.resolve() not in resolved.parents:
            return

        task = db.query_one("SELECT title FROM tasks WHERE id = ?", (task_id,))
        if not task:
            return

        if not (resolved / AGENTS_FILE).exists():
            return

        write_task_claude_md(resolved)
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.error("Failed to generate compatibility agent links for task %s: %s", task_id, exc)
