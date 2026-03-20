from __future__ import annotations

from pathlib import Path

from .openviking_bridge import (
    OpenVikingBridgeError,
    sync_openviking_agent_memory,
    sync_openviking_user_memory,
)
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


async def save_wudao_user_memory(content: str) -> dict[str, str | bool | None]:
    normalized = content.replace("\r\n", "\n").strip()
    WUDAO_USER_MEMORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    if normalized:
        WUDAO_USER_MEMORY_FILE.write_text(normalized + "\n", encoding="utf-8")
    else:
        WUDAO_USER_MEMORY_FILE.unlink(missing_ok=True)

    mirrored = False
    mirrored_uri: str | None = None
    mirror_error: str | None = None
    try:
        result = await sync_openviking_user_memory(normalized)
        mirrored = bool(result.get("mirrored"))
        mirrored_uri = result.get("uri")
    except OpenVikingBridgeError as exc:
        mirror_error = exc.message
    except Exception as exc:  # pragma: no cover - runtime guard
        mirror_error = str(exc)

    return {
        "content": normalized,
        "path": str(WUDAO_USER_MEMORY_FILE),
        "mirrored": mirrored,
        "mirroredUri": mirrored_uri,
        "mirrorError": mirror_error,
    }


async def save_wudao_agent_memory(content: str) -> dict[str, str | bool | None]:
    normalized = content.replace("\r\n", "\n").strip()
    WUDAO_AGENT_MEMORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    if normalized:
        WUDAO_AGENT_MEMORY_FILE.write_text(normalized + "\n", encoding="utf-8")
    else:
        WUDAO_AGENT_MEMORY_FILE.unlink(missing_ok=True)

    mirrored = False
    mirrored_uri: str | None = None
    mirror_error: str | None = None
    try:
        result = await sync_openviking_agent_memory(normalized)
        mirrored = bool(result.get("mirrored"))
        mirrored_uri = result.get("uri")
    except OpenVikingBridgeError as exc:
        mirror_error = exc.message
    except Exception as exc:  # pragma: no cover - runtime guard
        mirror_error = str(exc)

    return {
        "content": normalized,
        "path": str(WUDAO_AGENT_MEMORY_FILE),
        "mirrored": mirrored,
        "mirroredUri": mirrored_uri,
        "mirrorError": mirror_error,
    }


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
