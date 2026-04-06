from __future__ import annotations

from pathlib import Path

from .paths import WUDAO_AGENT_MEMORY_FILE, WUDAO_USER_MEMORY_FILE


def _read_memory_file(path: Path) -> dict[str, str]:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        return {"content": "", "path": str(path)}

    return {"content": path.read_text(encoding="utf-8").replace("\r\n", "\n").rstrip("\n"), "path": str(path)}


def read_wudao_user_memory() -> dict[str, str]:
    return _read_memory_file(WUDAO_USER_MEMORY_FILE)


def read_wudao_agent_memory() -> dict[str, str]:
    return _read_memory_file(WUDAO_AGENT_MEMORY_FILE)


def get_wudao_user_memory_for_task_context() -> str | None:
    content = read_wudao_user_memory()["content"].strip()
    return content or None


def get_wudao_agent_memory_for_task_context() -> str | None:
    content = read_wudao_agent_memory()["content"].strip()
    return content or None


def _write_memory_file(path: Path, content: str) -> dict[str, str]:
    normalized = content.replace("\r\n", "\n").strip()
    path.parent.mkdir(parents=True, exist_ok=True)
    if normalized:
        path.write_text(normalized + "\n", encoding="utf-8")
    else:
        path.unlink(missing_ok=True)

    return {
        "content": normalized,
        "path": str(path),
    }


async def save_wudao_user_memory(content: str) -> dict[str, str]:
    return _write_memory_file(WUDAO_USER_MEMORY_FILE, content)


async def save_wudao_agent_memory(content: str) -> dict[str, str]:
    return _write_memory_file(WUDAO_AGENT_MEMORY_FILE, content)


def get_global_memory_system_messages() -> list[dict[str, str]]:
    messages: list[dict[str, str]] = []
    user_memory = get_wudao_user_memory_for_task_context()
    if user_memory:
        messages.append(
            {
                "role": "system",
                "content": f"[用户记忆]\n{user_memory}\n\n请将以上内容视为用户长期背景、个人情况与偏好。",
            }
        )

    agent_memory = get_wudao_agent_memory_for_task_context()
    if agent_memory:
        messages.append(
            {
                "role": "system",
                "content": f"[Wudao Agent 全局记忆]\n{agent_memory}\n\n请将以上内容视为系统长期工作方式、项目背景与默认约束。",
            }
        )

    return messages
