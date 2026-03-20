from __future__ import annotations

import base64
import json
import os
import sys
import traceback
from pathlib import Path
from typing import Any

from openviking_bridge_cli import (
    agent_memory_uri,
    detect_category,
    detect_scope,
    format_mtime,
    memory_roots,
    normalize_text,
    user_memory_uri,
    workspace_path,
)


class BridgeWorkerError(Exception):
    def __init__(self, code: str, message: str, details: str | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details


def emit(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def ok(result: Any) -> None:
    emit({"ok": True, "result": result})


def fail(code: str, message: str, details: str | None = None) -> None:
    emit({"ok": False, "error": {"code": code, "message": message, "details": details}})


def _decode_content(payload: dict[str, Any], *, field: str, error_code: str, error_message: str) -> str:
    raw = str(payload.get(field) or "")
    if not raw:
        return ""
    try:
        return base64.b64decode(raw).decode("utf-8")
    except Exception as exc:
        raise BridgeWorkerError(error_code, error_message, str(exc)) from exc


class OpenVikingBridgeWorker:
    def __init__(self) -> None:
        self._client = None

    def _ensure_client(self):
        if self._client is not None:
            return self._client
        try:
            import openviking as ov  # type: ignore
        except Exception as exc:
            raise BridgeWorkerError("import_failed", "Failed to import openviking", str(exc)) from exc

        client = ov.OpenViking(path=str(workspace_path()))
        client.initialize()
        self._client = client
        return client

    def close(self) -> None:
        if self._client is None:
            return
        try:
            self._client.close()
        finally:
            self._client = None

    def status(self) -> dict[str, Any]:
        self._ensure_client()
        return {
            "available": True,
            "mode": "embedded",
            "workspacePath": str(workspace_path()),
            "configPath": os.environ.get("OPENVIKING_CONFIG_FILE") or None,
            "pythonBin": sys.executable,
            "message": None,
        }

    def list_memories(self) -> dict[str, Any]:
        client = self._ensure_client()
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
                if entry.get("isDir") or not uri.endswith(".md") or name.startswith("."):
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

    def sync_user_memory(self, payload: dict[str, Any]) -> dict[str, Any]:
        content = _decode_content(
            payload,
            field="contentB64",
            error_code="invalid_user_memory_content",
            error_message="Failed to decode Wudao user memory content",
        )
        client = self._ensure_client()
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

    def sync_agent_memory(self, payload: dict[str, Any]) -> dict[str, Any]:
        content = _decode_content(
            payload,
            field="contentB64",
            error_code="invalid_agent_memory_content",
            error_message="Failed to decode Wudao agent memory content",
        )
        client = self._ensure_client()
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

    def handle(self, command: str, payload: dict[str, Any]) -> tuple[dict[str, Any], bool]:
        if command == "status":
            return self.status(), False
        if command == "list-memories":
            return self.list_memories(), False
        if command == "sync-user-memory":
            return self.sync_user_memory(payload), False
        if command == "sync-agent-memory":
            return self.sync_agent_memory(payload), False
        if command == "shutdown":
            return {"stopped": True}, True
        raise BridgeWorkerError("unknown_command", f"Unsupported command: {command}")


def main() -> None:
    worker = OpenVikingBridgeWorker()
    should_exit = False
    try:
        for raw in sys.stdin:
            line = raw.strip()
            if not line:
                continue

            try:
                request = json.loads(line)
            except json.JSONDecodeError as exc:
                fail("invalid_request", "OpenViking bridge worker received invalid JSON", str(exc))
                continue

            command = str(request.get("command") or "").strip()
            payload = request.get("payload")
            if not command:
                fail("invalid_request", "OpenViking bridge worker requires command")
                continue
            if payload is None:
                payload = {}
            if not isinstance(payload, dict):
                fail("invalid_request", "OpenViking bridge worker payload must be an object")
                continue

            try:
                result, should_exit = worker.handle(command, payload)
                ok(result)
            except BridgeWorkerError as exc:
                fail(exc.code, exc.message, exc.details)
            except Exception as exc:
                fail(
                    "worker_failed",
                    "OpenViking bridge worker request failed",
                    "\n".join(traceback.format_exception(exc)).strip(),
                )

            if should_exit:
                break
    finally:
        worker.close()


if __name__ == "__main__":
    main()
