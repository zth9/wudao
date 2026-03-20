from __future__ import annotations

import base64
import json
import os
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def emit(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.flush()


def ok(result: Any) -> None:
    emit({"ok": True, "result": result})


def fail(code: str, message: str, details: str | None = None, exit_code: int = 1) -> None:
    emit({"ok": False, "error": {"code": code, "message": message, "details": details}})
    raise SystemExit(exit_code)


def normalize_text(value: str, limit: int | None = None) -> str:
    compact = " ".join(value.strip().split())
    if limit is not None and len(compact) > limit:
        return compact[: limit - 1] + "…"
    return compact


def detect_scope(uri: str) -> str:
    return "agent" if uri.startswith("viking://agent/") else "user"


def detect_category(uri: str, scope: str) -> str:
    marker = "/memories/"
    if marker not in uri:
        return "memory"
    rest = uri.split(marker, 1)[1].strip()
    first = rest.split("/", 1)[0].strip()
    if not first:
        return "patterns" if scope == "agent" else "profile"
    if first.endswith(".md"):
        return Path(first).stem
    return first


def format_mtime(raw: Any) -> str | None:
    if raw in (None, ""):
        return None
    try:
        dt = datetime.fromtimestamp(float(raw), tz=timezone.utc)
    except Exception:
        return None
    return dt.isoformat().replace("+00:00", "Z")


def workspace_path() -> Path:
    raw = os.environ.get("WUDAO_OPENVIKING_WORKSPACE") or str(Path.home() / ".wudao" / "contexts")
    path = Path(raw).expanduser().resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path


def load_openviking():
    try:
        import openviking as ov  # type: ignore
    except Exception as exc:  # pragma: no cover - runtime guard
        fail("import_failed", "Failed to import openviking", str(exc))
    return ov


def create_client():
    ov = load_openviking()
    client = ov.SyncOpenViking(path=str(workspace_path()))
    client.initialize()
    return client


def memory_roots(client) -> tuple[str, str]:
    local_client = client._async_client._client
    user = local_client.service.user
    return (
        f"viking://user/{user.user_space_name()}/memories/",
        f"viking://agent/{user.agent_space_name()}/memories/",
    )


def user_memory_uri(client) -> str:
    user_root, _agent_root = memory_roots(client)
    return f"{user_root}profile.md"


def agent_memory_uri(client) -> str:
    _user_root, agent_root = memory_roots(client)
    return f"{agent_root}patterns/wudao-agent-memory.md"


def sync_user_memory() -> dict[str, Any]:
    raw = os.environ.get("WUDAO_USER_MEMORY_CONTENT_B64", "")
    try:
        content = base64.b64decode(raw).decode("utf-8") if raw else ""
    except Exception as exc:
        fail("invalid_user_memory_content", "Failed to decode Wudao user memory content", str(exc))

    client = create_client()
    try:
        local_client = client._async_client._client
        ctx = local_client._ctx
        service = local_client.service
        uri = user_memory_uri(client)

        from openviking_cli.utils import run_async  # type: ignore

        run_async(service.initialize_user_directories(ctx))

        if content.strip():
            run_async(service.viking_fs.write_file(uri, content.strip() + "\n", ctx=ctx))
            return {"mirrored": True, "uri": uri}

        try:
            client.rm(uri, recursive=False)
        except Exception:
            pass
        return {"mirrored": True, "uri": None}
    finally:
        client.close()


def sync_agent_memory() -> dict[str, Any]:
    raw = os.environ.get("WUDAO_AGENT_MEMORY_CONTENT_B64", "")
    try:
        content = base64.b64decode(raw).decode("utf-8") if raw else ""
    except Exception as exc:
        fail("invalid_agent_memory_content", "Failed to decode Wudao agent memory content", str(exc))

    client = create_client()
    try:
        local_client = client._async_client._client
        ctx = local_client._ctx
        service = local_client.service
        uri = agent_memory_uri(client)

        from openviking_cli.utils import run_async  # type: ignore

        run_async(service.initialize_agent_directories(ctx))

        if content.strip():
            run_async(service.viking_fs.write_file(uri, content.strip() + "\n", ctx=ctx))
            return {"mirrored": True, "uri": uri}

        try:
            client.rm(uri, recursive=False)
        except Exception:
            pass
        return {"mirrored": True, "uri": None}
    finally:
        client.close()


def list_memory_items() -> dict[str, Any]:
    client = create_client()
    try:
        items: list[dict[str, Any]] = []
        for root_uri in memory_roots(client):
            try:
                entries = client.ls(root_uri, recursive=True, simple=False)
            except Exception:
                continue

            for entry in entries:
                uri = str(entry.get("uri") or "")
                if not uri:
                    continue
                name = str(entry.get("name") or Path(uri).name)
                if entry.get("isDir"):
                    continue
                if not uri.endswith(".md"):
                    continue
                if name.startswith("."):
                    continue

                try:
                    content = str(client.read(uri) or "")
                except Exception:
                    content = ""

                scope = detect_scope(uri)
                items.append(
                    {
                        "uri": uri,
                        "title": Path(uri).stem,
                        "scope": scope,
                        "category": detect_category(uri, scope),
                        "preview": normalize_text(content, 220),
                        "content": content.strip(),
                        "updatedAt": format_mtime(entry.get("mtime")),
                        "size": int(entry.get("size")) if entry.get("size") not in (None, "") else None,
                    }
                )

        items.sort(key=lambda item: item.get("updatedAt") or "", reverse=True)
        return {
            "workspacePath": str(workspace_path()),
            "total": len(items),
            "items": items,
        }
    finally:
        client.close()


def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else "status"
    config_path = os.environ.get("OPENVIKING_CONFIG_FILE")
    python_bin = sys.executable

    if command == "status":
        client = None
        try:
            client = create_client()
            ok(
                {
                    "available": True,
                    "mode": "embedded",
                    "workspacePath": str(workspace_path()),
                    "configPath": config_path,
                    "pythonBin": python_bin,
                    "message": None,
                }
            )
        except SystemExit:
            raise
        except Exception as exc:
            fail("status_failed", "Failed to initialize OpenViking", str(exc))
        finally:
            if client is not None:
                client.close()
        return

    if command == "list-memories":
        try:
            ok(list_memory_items())
        except SystemExit:
            raise
        except Exception as exc:
            fail("list_memories_failed", "Failed to list OpenViking memories", "\n".join(traceback.format_exception(exc)).strip())
        return

    if command == "sync-user-memory":
        try:
            ok(sync_user_memory())
        except SystemExit:
            raise
        except Exception as exc:
            fail("sync_user_memory_failed", "Failed to sync Wudao user memory", "\n".join(traceback.format_exception(exc)).strip())
        return

    if command == "sync-agent-memory":
        try:
            ok(sync_agent_memory())
        except SystemExit:
            raise
        except Exception as exc:
            fail("sync_agent_memory_failed", "Failed to sync Wudao agent memory", "\n".join(traceback.format_exception(exc)).strip())
        return

    fail("unknown_command", f"Unsupported command: {command}")


if __name__ == "__main__":
    main()
