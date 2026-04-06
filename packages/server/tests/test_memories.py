from __future__ import annotations

import asyncio
import importlib
import sys
from pathlib import Path


def load_memories(tmp_path, monkeypatch):
    home_dir = tmp_path / "home"
    db_path = tmp_path / "wudao.db"
    monkeypatch.setenv("WUDAO_HOME", str(home_dir))
    monkeypatch.setenv("WUDAO_DB_PATH", str(db_path))

    for name in list(sys.modules):
        if name.startswith("src"):
            sys.modules.pop(name, None)

    return importlib.import_module("src.memories")


def test_save_wudao_user_memory_writes_normalized_file(tmp_path, monkeypatch):
    module = load_memories(tmp_path, monkeypatch)
    expected_path = Path(tmp_path) / "home" / "profile" / "user-memory.md"

    result = asyncio.run(module.save_wudao_user_memory("偏好中文\r\n先给结论\r\n"))

    assert result == {
        "content": "偏好中文\n先给结论",
        "path": str(expected_path),
    }
    assert expected_path.read_text(encoding="utf-8") == "偏好中文\n先给结论\n"


def test_save_wudao_agent_memory_deletes_file_when_empty(tmp_path, monkeypatch):
    module = load_memories(tmp_path, monkeypatch)
    expected_path = Path(tmp_path) / "home" / "profile" / "wudao-agent-memory.md"
    expected_path.parent.mkdir(parents=True, exist_ok=True)
    expected_path.write_text("旧内容\n", encoding="utf-8")

    result = asyncio.run(module.save_wudao_agent_memory(" \r\n "))

    assert result == {
        "content": "",
        "path": str(expected_path),
    }
    assert not expected_path.exists()
