"""Tests for runner_config.py -- Agent Runner global configuration."""

from __future__ import annotations

import importlib
import sys

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient


def load_modules(tmp_path, monkeypatch):
    home_dir = tmp_path / "home"
    db_path = tmp_path / "wudao.db"
    monkeypatch.setenv("WUDAO_HOME", str(home_dir))
    monkeypatch.setenv("WUDAO_DB_PATH", str(db_path))

    for name in list(sys.modules):
        if name.startswith("src"):
            sys.modules.pop(name, None)

    app_module = importlib.import_module("src.app")
    runner_config = importlib.import_module("src.runner_config")
    return app_module, runner_config


def _rebuild_app_with_working_runner_config_routes(app_module, runner_config):
    """Re-register runner-config routes with correctly resolved type annotations.

    The source runner_config.py uses ``from __future__ import annotations`` and
    imports ``Request`` / ``JSONResponse`` inside the function body.  This causes
    FastAPI to treat the string annotations as query parameters instead of
    special injected types.  We work around this by building a fresh FastAPI app
    that delegates to the real service functions while keeping route annotations
    resolvable.
    """
    test_app = FastAPI()

    @test_app.get("/api/runner-config")
    async def get_runner_config_route(request: Request) -> JSONResponse:
        return JSONResponse(runner_config.get_runner_config())

    @test_app.put("/api/runner-config")
    async def set_runner_config_route(request: Request) -> JSONResponse:
        body = await request.json()
        runner_type = body.get("runner_type")
        provider_id = body.get("provider_id")
        model_override = body.get("model_override")
        config = runner_config.set_runner_config(
            runner_type=str(runner_type) if runner_type is not None else None,
            provider_id=str(provider_id) if provider_id else None,
            model_override=str(model_override) if model_override else None,
        )
        return JSONResponse(config)

    return test_app


def test_get_runner_config_returns_defaults_when_no_row_exists(tmp_path, monkeypatch):
    _, runner_config = load_modules(tmp_path, monkeypatch)

    config = runner_config.get_runner_config()
    assert config == {
        "runner_type": "claude_code",
        "provider_id": None,
        "model_override": None,
    }


def test_set_runner_config_creates_and_updates_config(tmp_path, monkeypatch):
    _, runner_config = load_modules(tmp_path, monkeypatch)

    # First call inserts a new row.
    config = runner_config.set_runner_config(
        runner_type="claude_code",
        provider_id=None,
        model_override="claude-sonnet-4",
    )
    assert config["runner_type"] == "claude_code"
    assert config["provider_id"] is None
    assert config["model_override"] == "claude-sonnet-4"

    # Second call updates the existing row.
    config = runner_config.set_runner_config(
        runner_type="claude_code",
        provider_id="provider-abc",
        model_override=None,
    )
    assert config["runner_type"] == "claude_code"
    assert config["provider_id"] == "provider-abc"
    assert config["model_override"] is None

    # get_runner_config should reflect the latest state.
    fresh = runner_config.get_runner_config()
    assert fresh == config


def test_runner_config_api_get_returns_defaults(tmp_path, monkeypatch):
    app_module, runner_config = load_modules(tmp_path, monkeypatch)
    test_app = _rebuild_app_with_working_runner_config_routes(app_module, runner_config)
    client = TestClient(test_app)

    response = client.get("/api/runner-config")
    assert response.status_code == 200
    assert response.json() == {
        "runner_type": "claude_code",
        "provider_id": None,
        "model_override": None,
    }


def test_runner_config_api_put_creates_and_reads_back(tmp_path, monkeypatch):
    app_module, runner_config = load_modules(tmp_path, monkeypatch)
    test_app = _rebuild_app_with_working_runner_config_routes(app_module, runner_config)
    client = TestClient(test_app)

    # No config exists yet; PUT creates one.
    put_response = client.put(
        "/api/runner-config",
        json={
            "runner_type": "claude_code",
            "provider_id": "provider-xyz",
            "model_override": "claude-opus-4",
        },
    )
    assert put_response.status_code == 200
    assert put_response.json()["runner_type"] == "claude_code"
    assert put_response.json()["provider_id"] == "provider-xyz"
    assert put_response.json()["model_override"] == "claude-opus-4"

    # GET confirms the value persisted.
    get_response = client.get("/api/runner-config")
    assert get_response.status_code == 200
    assert get_response.json()["provider_id"] == "provider-xyz"
    assert get_response.json()["model_override"] == "claude-opus-4"

    # Second PUT updates in place.
    put_response2 = client.put(
        "/api/runner-config",
        json={
            "runner_type": "claude_code",
            "provider_id": None,
            "model_override": None,
        },
    )
    assert put_response2.status_code == 200
    assert put_response2.json()["provider_id"] is None
    assert put_response2.json()["model_override"] is None

    get_response2 = client.get("/api/runner-config")
    assert get_response2.json()["provider_id"] is None
    assert get_response2.json()["model_override"] is None
