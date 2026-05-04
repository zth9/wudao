from __future__ import annotations

import asyncio
import importlib
import sys
from pathlib import Path

from fastapi.testclient import TestClient
import pytest


def load_modules(tmp_path, monkeypatch):
    home_dir = tmp_path / "home"
    db_path = tmp_path / "wudao.db"
    monkeypatch.setenv("WUDAO_HOME", str(home_dir))
    monkeypatch.setenv("WUDAO_DB_PATH", str(db_path))

    for name in list(sys.modules):
        if name.startswith("src"):
            sys.modules.pop(name, None)

    app_module = importlib.import_module("src.app")
    workspace_tools = importlib.import_module("src.agent_runtime.workspace_tools")
    return app_module, workspace_tools


def create_task(client: TestClient, title: str) -> str:
    response = client.post("/api/tasks", json={"title": title, "type": "feature"})
    assert response.status_code == 201
    return response.json()["id"]


def test_workspace_tools_list_read_and_search_inside_task_workspace(tmp_path, monkeypatch):
    app_module, workspace_tools = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "读 workspace")
    workspace_root = Path(tmp_path) / "home" / "workspace" / task_id
    workspace_root.mkdir(parents=True, exist_ok=True)
    (workspace_root / "README.md").write_text("hello\nwudao agent\n", encoding="utf-8")
    (workspace_root / "nested").mkdir()

    listed = asyncio.run(workspace_tools.workspace_list_tool(task_id, {"path": "."}))
    assert listed["entries"][0]["name"] == "nested"
    assert listed["entries"][1]["name"] == "README.md"

    read = asyncio.run(workspace_tools.workspace_read_file_tool(task_id, {"path": "README.md"}))
    assert read["content"] == "hello\nwudao agent"

    search = asyncio.run(workspace_tools.workspace_search_text_tool(task_id, {"query": "wudao"}))
    assert search["matches"][0]["path"] == "README.md"
    assert search["matches"][0]["line"] == 2


def test_workspace_tools_reject_path_escape(tmp_path, monkeypatch):
    app_module, workspace_tools = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "禁止越权")
    workspace_root = Path(tmp_path) / "home" / "workspace" / task_id
    workspace_root.mkdir(parents=True, exist_ok=True)

    with pytest.raises(ValueError, match="relative path inside workspace"):
        workspace_tools.resolve_task_workspace_path(task_id, "../outside.txt")


def test_workspace_tools_write_and_patch_files_inside_workspace(tmp_path, monkeypatch):
    app_module, workspace_tools = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "写 workspace")
    workspace_root = Path(tmp_path) / "home" / "workspace" / task_id
    workspace_root.mkdir(parents=True, exist_ok=True)

    written = workspace_tools.write_workspace_file(task_id, "docs/note.txt", "hello\nworld\n")
    assert written == {
        "path": "docs/note.txt",
        "created": True,
        "bytesWritten": len("hello\nworld\n".encode("utf-8")),
        "lineCount": 2,
    }
    assert (workspace_root / "docs" / "note.txt").read_text(encoding="utf-8") == "hello\nworld\n"

    patched = workspace_tools.apply_workspace_patch(
        task_id,
        """diff --git a/docs/note.txt b/docs/note.txt
index 94954ab..c0d0fb4 100644
--- a/docs/note.txt
+++ b/docs/note.txt
@@ -1,2 +1,2 @@
 hello
-world
+wudao
""",
    )
    assert patched["paths"] == ["docs/note.txt"]
    assert patched["pathCount"] == 1
    assert (workspace_root / "docs" / "note.txt").read_text(encoding="utf-8") == "hello\nwudao\n"
