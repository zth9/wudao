from __future__ import annotations

import os
from pathlib import Path

from .paths import CONTEXTS_DIR, PROFILE_DIR, WORKSPACE_DIR

REPO_ROOT = Path(__file__).resolve().parents[3]
REPO_WORKSPACE_DIR = REPO_ROOT / "workspace"


def _expand_home_path(input_path: str) -> Path:
    return Path(os.path.expanduser(input_path)).resolve()


def _normalize_path(input_path: str) -> Path:
    resolved = _expand_home_path(input_path)
    try:
        return resolved.resolve(strict=True)
    except FileNotFoundError:
        return resolved


def _is_sub_path(target: Path, root: Path) -> bool:
    try:
        target.relative_to(root)
        return True
    except ValueError:
        return False


def get_allowed_open_roots() -> list[Path]:
    roots = [
        REPO_ROOT.resolve(),
        REPO_WORKSPACE_DIR.resolve(),
        WORKSPACE_DIR.resolve(),
        PROFILE_DIR.resolve(),
        CONTEXTS_DIR.resolve(),
    ]
    unique: list[Path] = []
    for root in roots:
        if root not in unique:
            unique.append(root)
    return unique


def resolve_allowed_open_path(raw_path: object) -> dict[str, object]:
    if not isinstance(raw_path, str) or not raw_path.strip():
        return {"ok": False, "status": 400, "error": "path is required"}

    resolved = _normalize_path(raw_path.strip())
    if not any(_is_sub_path(resolved, root) for root in get_allowed_open_roots()):
        return {"ok": False, "status": 403, "error": "path is outside allowed roots"}

    if not resolved.exists():
        return {"ok": False, "status": 404, "error": "path not found"}

    return {"ok": True, "path": str(resolved)}
