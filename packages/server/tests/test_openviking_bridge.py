from __future__ import annotations

import importlib
import sys


def load_bridge_module(tmp_path, monkeypatch):
    home_dir = tmp_path / "home"
    db_path = tmp_path / "wudao.db"
    monkeypatch.setenv("WUDAO_HOME", str(home_dir))
    monkeypatch.setenv("WUDAO_DB_PATH", str(db_path))

    for name in list(sys.modules):
        if name.startswith("src"):
            sys.modules.pop(name, None)

    return importlib.import_module("src.openviking_bridge")


def test_get_python_bin_falls_back_to_base_python_when_uv_python_has_no_openviking(tmp_path, monkeypatch):
    module = load_bridge_module(tmp_path, monkeypatch)
    module._DETECTED_PYTHON_BIN = None
    monkeypatch.delenv("OPENVIKING_PYTHON", raising=False)
    monkeypatch.setattr(module.sys, "executable", "/tmp/uv-python")
    monkeypatch.setattr(module.sys, "_base_executable", "/tmp/base-python", raising=False)
    monkeypatch.setattr(module.sys, "base_prefix", "/tmp/base-prefix")

    calls: list[str] = []

    class Completed:
        def __init__(self, returncode: int) -> None:
            self.returncode = returncode

    def fake_run(args, stdout=None, stderr=None, check=False):
        calls.append(args[0])
        if args[0] == "/tmp/uv-python":
            return Completed(1)
        if args[0] == "/tmp/base-python":
            return Completed(0)
        return Completed(1)

    monkeypatch.setattr(module.subprocess, "run", fake_run)

    assert module._get_python_bin() == "/tmp/base-python"
    assert calls == ["/tmp/uv-python", "/tmp/base-python"]
