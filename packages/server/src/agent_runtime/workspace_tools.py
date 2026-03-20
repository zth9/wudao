from __future__ import annotations

import re
import subprocess
from pathlib import Path, PurePosixPath
from typing import Any

from ..paths import WORKSPACE_DIR
from ..task_claude_md import write_task_claude_md
from ..task_service import is_valid_task_id, persist_task_agent_doc

TASK_CONTEXT_FILE = "AGENTS.md"
MAX_LIST_ENTRIES = 200
MAX_READ_BYTES = 256 * 1024
MAX_READ_CHARS = 12_000
MAX_WRITE_CHARS = 200_000
MAX_SEARCH_RESULTS = 80
SENSITIVE_SEGMENTS = {".git"}
SENSITIVE_FILE_NAMES = {".env"}
SENSITIVE_SUFFIXES = {".pem", ".key", ".crt", ".p12", ".pfx"}


def _require_task_id(task_id: str) -> str:
    normalized = task_id.strip()
    if not is_valid_task_id(normalized):
        raise ValueError("task_id is invalid")
    return normalized


def _workspace_root(task_id: str) -> Path:
    root = (WORKSPACE_DIR / _require_task_id(task_id)).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _normalize_relative_path(raw_path: Any) -> str:
    if raw_path is None:
        return "."
    if not isinstance(raw_path, str):
        raise ValueError("path must be a string")
    pure = PurePosixPath(raw_path.strip().replace("\\", "/") or ".")
    if pure.is_absolute() or any(part == ".." for part in pure.parts):
        raise ValueError("path must be a relative path inside workspace")
    normalized = str(pure).strip() or "."
    return "." if normalized == "" else normalized


def _is_sensitive_relative_path(relative_path: str) -> bool:
    pure = PurePosixPath(relative_path)
    for part in pure.parts:
        if part in SENSITIVE_SEGMENTS:
            return True
    name = pure.name
    if name in SENSITIVE_FILE_NAMES:
        return True
    return any(name.endswith(suffix) for suffix in SENSITIVE_SUFFIXES)


def resolve_task_workspace_path(task_id: str, raw_path: Any = None) -> Path:
    workspace_root = _workspace_root(task_id)
    relative_path = _normalize_relative_path(raw_path)
    if _is_sensitive_relative_path(relative_path):
        raise ValueError("path points to a sensitive file")
    candidate = (workspace_root / relative_path).resolve(strict=False)
    if candidate != workspace_root and workspace_root not in candidate.parents:
        raise ValueError("path escapes task workspace")
    return candidate


def _to_workspace_relative_path(task_id: str, target: Path) -> str:
    root = _workspace_root(task_id)
    try:
        relative = target.relative_to(root)
    except ValueError:
        return "."
    rendered = relative.as_posix()
    return rendered or "."


def _build_artifact_update(path: str) -> dict[str, str] | None:
    if path != TASK_CONTEXT_FILE:
        return None
    return {
        "path": TASK_CONTEXT_FILE,
        "summary": "已同步 AGENTS.md 主产物",
    }


def _sync_task_context_artifact(task_id: str, relative_path: str, *, content: str | None = None) -> dict[str, str] | None:
    artifact = _build_artifact_update(relative_path)
    if artifact is None:
        return None

    ws_dir = _workspace_root(task_id)
    write_task_claude_md(ws_dir)

    if content is None:
        content = (ws_dir / TASK_CONTEXT_FILE).read_text(encoding="utf-8")
    persist_task_agent_doc(task_id, content, write_workspace=False)
    return artifact


def _read_text_file(path: Path) -> str:
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise RuntimeError(f"failed to read file: {exc}") from exc
    if len(raw) > MAX_READ_BYTES:
        raise RuntimeError("file is too large to read safely")
    if b"\x00" in raw:
        raise RuntimeError("binary file is not supported")
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise RuntimeError("file is not valid UTF-8 text") from exc


def _slice_text_content(
    text: str,
    *,
    start_line: int | None = None,
    end_line: int | None = None,
) -> dict[str, Any]:
    if start_line is not None and start_line <= 0:
        raise ValueError("start_line must be positive")
    if end_line is not None and end_line <= 0:
        raise ValueError("end_line must be positive")
    if start_line is not None and end_line is not None and end_line < start_line:
        raise ValueError("end_line must be greater than or equal to start_line")

    lines = text.splitlines()
    total_lines = len(lines)
    start_index = (start_line - 1) if start_line is not None else 0
    end_index = end_line if end_line is not None else total_lines
    selected = lines[start_index:end_index]
    content = "\n".join(selected)
    truncated = len(content) > MAX_READ_CHARS
    if truncated:
        content = content[:MAX_READ_CHARS]

    return {
        "content": content,
        "startLine": start_index + 1 if selected else start_line or 1,
        "endLine": start_index + len(selected),
        "totalLines": total_lines,
        "truncated": truncated,
    }


def list_workspace_entries(task_id: str, raw_path: Any = None) -> dict[str, Any]:
    target = resolve_task_workspace_path(task_id, raw_path)
    if not target.exists():
        raise RuntimeError("path not found")
    if not target.is_dir():
        raise RuntimeError("path must be a directory")

    entries: list[dict[str, Any]] = []
    truncated = False
    for index, entry in enumerate(sorted(target.iterdir(), key=lambda item: item.name.lower())):
        relative_entry = _to_workspace_relative_path(task_id, entry)
        if _is_sensitive_relative_path(relative_entry):
            continue
        if len(entries) >= MAX_LIST_ENTRIES:
            truncated = True
            break
        entries.append(
            {
                "name": entry.name,
                "path": relative_entry,
                "type": "dir" if entry.is_dir() else "file",
                "size": entry.stat().st_size if entry.is_file() else None,
            }
        )

    return {
        "path": _to_workspace_relative_path(task_id, target),
        "entries": entries,
        "truncated": truncated,
    }


def read_workspace_file(
    task_id: str,
    raw_path: Any,
    *,
    start_line: int | None = None,
    end_line: int | None = None,
) -> dict[str, Any]:
    target = resolve_task_workspace_path(task_id, raw_path)
    if not target.exists():
        raise RuntimeError("path not found")
    if not target.is_file():
        raise RuntimeError("path must be a file")

    text = _read_text_file(target)
    sliced = _slice_text_content(text, start_line=start_line, end_line=end_line)

    return {
        "path": _to_workspace_relative_path(task_id, target),
        **sliced,
    }


def search_workspace_text(task_id: str, query: str, raw_path: Any = None) -> dict[str, Any]:
    normalized_query = query.strip() if isinstance(query, str) else ""
    if not normalized_query:
        raise ValueError("query is required")
    try:
        pattern = re.compile(normalized_query)
    except re.error as exc:
        raise ValueError("query must be a valid regular expression") from exc

    target = resolve_task_workspace_path(task_id, raw_path)
    if not target.exists():
        raise RuntimeError("path not found")

    root = target if target.is_dir() else target.parent
    matches: list[dict[str, Any]] = []
    truncated = False
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        relative = _to_workspace_relative_path(task_id, path)
        if _is_sensitive_relative_path(relative):
            continue
        try:
            text = _read_text_file(path)
        except RuntimeError:
            continue
        for line_no, line in enumerate(text.splitlines(), start=1):
            if pattern.search(line):
                if len(matches) >= MAX_SEARCH_RESULTS:
                    truncated = True
                    break
                matches.append({"path": relative, "line": line_no, "content": line})
        if truncated:
            break

    return {
        "query": normalized_query,
        "path": _to_workspace_relative_path(task_id, target),
        "matches": matches,
        "truncated": truncated,
    }


def write_workspace_file(
    task_id: str,
    raw_path: Any,
    content: Any,
    *,
    create_directories: bool = True,
) -> dict[str, Any]:
    if not isinstance(content, str):
        raise ValueError("content must be a string")
    if len(content) > MAX_WRITE_CHARS:
        raise ValueError("content is too large")

    target = resolve_task_workspace_path(task_id, raw_path)
    existed = target.exists()
    if existed and target.is_dir():
        raise RuntimeError("path must be a file")

    if create_directories:
        target.parent.mkdir(parents=True, exist_ok=True)
    elif not target.parent.exists():
        raise RuntimeError("parent directory does not exist")

    try:
        target.write_text(content, encoding="utf-8")
    except OSError as exc:
        raise RuntimeError(f"failed to write file: {exc}") from exc

    relative_path = _to_workspace_relative_path(task_id, target)
    artifact = _sync_task_context_artifact(task_id, relative_path, content=content)

    result = {
        "path": _to_workspace_relative_path(task_id, target),
        "created": not existed,
        "bytesWritten": len(content.encode("utf-8")),
        "lineCount": len(content.splitlines()),
    }
    if artifact is not None:
        result["artifactsUpdated"] = [artifact]
    return result


def _normalize_patch_path_token(raw_token: str) -> str | None:
    token = raw_token.strip()
    if not token or token == "/dev/null":
        return None
    if token.startswith(("a/", "b/")) and len(token) > 2:
        token = token[2:]
    return _normalize_relative_path(token)


def _extract_patch_paths(patch_text: str) -> list[str]:
    paths: list[str] = []
    for line in patch_text.splitlines():
        if line.startswith("diff --git "):
            parts = line.split()
            if len(parts) >= 4:
                for token in parts[2:4]:
                    normalized = _normalize_patch_path_token(token)
                    if normalized and normalized not in paths:
                        paths.append(normalized)
            continue
        if line.startswith(("--- ", "+++ ")):
            normalized = _normalize_patch_path_token(line[4:])
            if normalized and normalized not in paths:
                paths.append(normalized)
    return paths


def _run_git_apply(workspace_root: Path, patch_text: str, *, check_only: bool, strip_count: int) -> subprocess.CompletedProcess[str]:
    args = ["git", "apply", "--recount", f"-p{strip_count}"]
    if check_only:
        args.append("--check")
    return subprocess.run(
        args,
        cwd=str(workspace_root),
        input=patch_text,
        text=True,
        capture_output=True,
        check=False,
    )


def apply_workspace_patch(task_id: str, patch_text: Any) -> dict[str, Any]:
    if not isinstance(patch_text, str) or not patch_text.strip():
        raise ValueError("patch must be a non-empty string")
    if len(patch_text) > MAX_WRITE_CHARS:
        raise ValueError("patch is too large")

    workspace_root = _workspace_root(task_id)
    touched_paths = _extract_patch_paths(patch_text)
    if not touched_paths:
        raise ValueError("patch does not contain any valid file path")

    preexisting_paths: dict[str, bool] = {}
    for relative_path in touched_paths:
        resolve_task_workspace_path(task_id, relative_path)
        preexisting_paths[relative_path] = (workspace_root / relative_path).exists()

    applied_strip_count: int | None = None
    last_error = "patch validation failed"
    for strip_count in (1, 0):
        checked = _run_git_apply(workspace_root, patch_text, check_only=True, strip_count=strip_count)
        if checked.returncode == 0:
            applied_strip_count = strip_count
            break
        last_error = (checked.stderr or checked.stdout or last_error).strip()

    if applied_strip_count is None:
        raise RuntimeError(last_error)

    applied = _run_git_apply(workspace_root, patch_text, check_only=False, strip_count=applied_strip_count)
    if applied.returncode != 0:
        raise RuntimeError((applied.stderr or applied.stdout or "failed to apply patch").strip())

    artifact_updates = [
        artifact
        for artifact in (
            _sync_task_context_artifact(task_id, relative_path)
            for relative_path in touched_paths
        )
        if artifact is not None
    ]

    result = {
        "paths": touched_paths,
        "pathCount": len(touched_paths),
        "created": [path for path in touched_paths if not preexisting_paths.get(path, False)],
    }
    if artifact_updates:
        result["artifactsUpdated"] = artifact_updates
    return result


def read_task_context(
    raw_target_task_id: Any,
    *,
    start_line: int | None = None,
    end_line: int | None = None,
) -> dict[str, Any]:
    target_task_id = _require_task_id(str(raw_target_task_id or ""))
    context_path = resolve_task_workspace_path(target_task_id, TASK_CONTEXT_FILE)
    if not context_path.exists() or not context_path.is_file():
        raise RuntimeError("task context not found")

    text = _read_text_file(context_path)

    sliced = _slice_text_content(text, start_line=start_line, end_line=end_line)
    return {
        "taskId": target_task_id,
        "path": TASK_CONTEXT_FILE,
        **sliced,
    }


async def workspace_list_tool(task_id: str, input_data: dict[str, Any]) -> dict[str, Any]:
    return list_workspace_entries(task_id, input_data.get("path"))


async def workspace_read_file_tool(task_id: str, input_data: dict[str, Any]) -> dict[str, Any]:
    return read_workspace_file(
        task_id,
        input_data.get("path"),
        start_line=int(input_data["startLine"]) if input_data.get("startLine") is not None else None,
        end_line=int(input_data["endLine"]) if input_data.get("endLine") is not None else None,
    )


async def workspace_search_text_tool(task_id: str, input_data: dict[str, Any]) -> dict[str, Any]:
    return search_workspace_text(task_id, str(input_data.get("query") or ""), input_data.get("path"))


async def workspace_write_file_tool(task_id: str, input_data: dict[str, Any]) -> dict[str, Any]:
    return write_workspace_file(
        task_id,
        input_data.get("path"),
        input_data.get("content"),
        create_directories=bool(input_data.get("createDirectories", True)),
    )


async def workspace_apply_patch_tool(task_id: str, input_data: dict[str, Any]) -> dict[str, Any]:
    return apply_workspace_patch(task_id, input_data.get("patch"))


async def task_read_context_tool(task_id: str, input_data: dict[str, Any]) -> dict[str, Any]:
    del task_id
    return read_task_context(
        input_data.get("taskId"),
        start_line=int(input_data["startLine"]) if input_data.get("startLine") is not None else None,
        end_line=int(input_data["endLine"]) if input_data.get("endLine") is not None else None,
    )


def workspace_tools_prompt_schema() -> list[dict[str, Any]]:
    return [
        {
            "name": "workspace_list",
            "description": "列出任务 workspace 下某个目录的文件与子目录。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "相对 workspace 的目录路径，默认根目录"},
                },
                "additionalProperties": False,
            },
        },
        {
            "name": "workspace_read_file",
            "description": "读取 workspace 内 UTF-8 文本文件，可按行截断。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "相对 workspace 的文件路径"},
                    "startLine": {"type": "integer", "minimum": 1},
                    "endLine": {"type": "integer", "minimum": 1},
                },
                "required": ["path"],
                "additionalProperties": False,
            },
        },
        {
            "name": "workspace_search_text",
            "description": "在 workspace 内搜索文本并返回命中行。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "搜索关键词，按正则表达式匹配"},
                    "path": {"type": "string", "description": "可选，相对 workspace 的搜索根目录"},
                },
                "required": ["query"],
                "additionalProperties": False,
            },
        },
        {
            "name": "workspace_write_file",
            "description": "直接写入或新建 workspace 文本文件。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "相对 workspace 的文件路径"},
                    "content": {"type": "string", "description": "写入的完整 UTF-8 文本内容"},
                    "createDirectories": {"type": "boolean", "description": "父目录不存在时是否自动创建，默认 true"},
                },
                "required": ["path", "content"],
                "additionalProperties": False,
            },
        },
        {
            "name": "workspace_apply_patch",
            "description": "对 workspace 文件应用 unified diff patch，可修改现有文件或创建新文件。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "patch": {"type": "string", "description": "完整的 unified diff patch 文本"},
                },
                "required": ["patch"],
                "additionalProperties": False,
            },
        },
        {
            "name": "task_read_context",
            "description": "按任务 ID 读取该任务的主上下文 AGENTS.md，可按行截断。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "taskId": {"type": "string", "description": "目标任务 ID"},
                    "startLine": {"type": "integer", "minimum": 1},
                    "endLine": {"type": "integer", "minimum": 1},
                },
                "required": ["taskId"],
                "additionalProperties": False,
            },
        },
    ]


def render_tool_result_for_prompt(tool_name: str, output: dict[str, Any]) -> str:
    return f"[tool_result:{tool_name}]\n{output}"
