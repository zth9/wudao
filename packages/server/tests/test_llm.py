from __future__ import annotations

import asyncio
import importlib
import sys

import pytest


def load_llm(tmp_path, monkeypatch):
    home_dir = tmp_path / "home"
    db_path = tmp_path / "wudao.db"
    monkeypatch.setenv("WUDAO_HOME", str(home_dir))
    monkeypatch.setenv("WUDAO_DB_PATH", str(db_path))

    for name in list(sys.modules):
        if name.startswith("src"):
            sys.modules.pop(name, None)

    return importlib.import_module("src.llm")


def configure_provider(llm, provider_id: str, endpoint: str = "https://example.com/v1", model: str = "gpt-5") -> None:
    llm.db.execute(
        "UPDATE providers SET endpoint = ?, model = ? WHERE id = ?",
        (endpoint, model, provider_id),
    )


def make_async_client(stream_lines: list[str]):
    class DummyStreamResponse:
        def __init__(self, lines: list[str]) -> None:
            self.status_code = 200
            self._lines = lines

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def aread(self) -> bytes:
            return b""

        async def aiter_lines(self):
            for line in self._lines:
                yield line

    class DummyAsyncClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        def stream(self, method: str, endpoint: str, headers=None, json=None):
            return DummyStreamResponse(stream_lines)

    return DummyAsyncClient


def test_chat_complete_reads_openai_responses_delta_only_stream(tmp_path, monkeypatch):
    llm = load_llm(tmp_path, monkeypatch)
    configure_provider(llm, "openai")
    monkeypatch.setattr(
        llm.httpx,
        "AsyncClient",
        make_async_client(
            [
                'data: {"type":"response.output_text.delta","delta":"{\\"title\\":\\"修复 openai 任务解析\\",\\"type\\":\\"bugfix\\",\\"context\\":\\"兼容 Responses API 流式文本 delta\\"}"}',
                "data: [DONE]",
            ]
        ),
    )

    async def run() -> str:
        return await llm.chat_complete([{"role": "user", "content": "修复 openai 创建任务报错"}], "openai")

    result = asyncio.run(run())
    assert result == '{"title":"修复 openai 任务解析","type":"bugfix","context":"兼容 Responses API 流式文本 delta"}'


def test_stream_chat_emits_openai_deltas_without_completed_duplication(tmp_path, monkeypatch):
    llm = load_llm(tmp_path, monkeypatch)
    configure_provider(llm, "openai")
    monkeypatch.setattr(
        llm.httpx,
        "AsyncClient",
        make_async_client(
            [
                'data: {"type":"response.output_text.delta","delta":"第一段"}',
                'data: {"type":"response.output_text.delta","delta":"第二段"}',
                'data: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"第一段第二段"}]}]}}',
                "data: [DONE]",
            ]
        ),
    )

    async def collect() -> list[str]:
        return [chunk async for chunk in llm.stream_chat("openai", [{"role": "user", "content": "继续"}])]

    chunks = asyncio.run(collect())
    assert chunks == ["第一段", "第二段"]


def test_chat_complete_falls_back_to_legacy_openai_responses_payload_for_streaming(tmp_path, monkeypatch):
    llm = load_llm(tmp_path, monkeypatch)
    configure_provider(llm, "openai")
    payloads: list[dict] = []

    class DummyStreamResponse:
        def __init__(self, status_code: int, lines: list[str]) -> None:
            self.status_code = status_code
            self._lines = lines

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def aread(self) -> bytes:
            return b'{"error":"legacy endpoint requires plain prompt"}'

        async def aiter_lines(self):
            for line in self._lines:
                yield line

    class DummyAsyncClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        def stream(self, method: str, endpoint: str, headers=None, json=None):
            payloads.append(json)
            if len(payloads) == 1:
                return DummyStreamResponse(400, [])
            return DummyStreamResponse(
                200,
                [
                    'data: {"type":"response.output_text.delta","delta":"兼容回退成功"}',
                    "data: [DONE]",
                ],
            )

    monkeypatch.setattr(llm.httpx, "AsyncClient", DummyAsyncClient)

    async def run() -> str:
        return await llm.chat_complete(
            [
                {"role": "system", "content": "你是助手"},
                {"role": "user", "content": "继续"},
            ],
            "openai",
        )

    result = asyncio.run(run())

    assert result == "兼容回退成功"
    assert len(payloads) == 2
    assert payloads[0]["input"] == [
        {"role": "system", "content": [{"type": "input_text", "text": "你是助手"}]},
        {"role": "user", "content": [{"type": "input_text", "text": "继续"}]},
    ]
    assert payloads[1]["input"] == [{"role": "user", "content": "SYSTEM:\n你是助手\n\nUSER:\n继续"}]


def test_post_completion_encodes_assistant_history_as_output_text(tmp_path, monkeypatch):
    llm = load_llm(tmp_path, monkeypatch)
    configure_provider(llm, "openai")
    captured_payloads: list[dict] = []

    async def fake_post_json(endpoint, provider, protocol, payload, timeout=120.0):
        captured_payloads.append(payload)
        return 200, '{"output_text":"ok"}'

    monkeypatch.setattr(llm, "_post_json", fake_post_json)

    async def run():
        provider = llm._resolve_provider("openai")
        return await llm._post_completion(
            provider,
            [
                {"role": "system", "content": "你是助手"},
                {"role": "user", "content": "第一问"},
                {"role": "assistant", "content": "第一答"},
                {"role": "user", "content": "第二问"},
            ],
            max_tokens=1024,
            stream=False,
        )

    asyncio.run(run())

    assert captured_payloads
    assert captured_payloads[0]["input"] == [
        {"role": "system", "content": [{"type": "input_text", "text": "你是助手"}]},
        {"role": "user", "content": [{"type": "input_text", "text": "第一问"}]},
        {"role": "assistant", "content": [{"type": "output_text", "text": "第一答"}]},
        {"role": "user", "content": [{"type": "input_text", "text": "第二问"}]},
    ]


def test_chat_complete_retries_with_codex_cli_compat_when_gateway_requires_approved_clients(tmp_path, monkeypatch):
    llm = load_llm(tmp_path, monkeypatch)
    configure_provider(llm, "openai")
    requests: list[dict] = []

    class DummyStreamResponse:
        def __init__(self, status_code: int, lines: list[str], body: bytes = b"") -> None:
            self.status_code = status_code
            self._lines = lines
            self._body = body

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def aread(self) -> bytes:
            return self._body

        async def aiter_lines(self):
            for line in self._lines:
                yield line

    class DummyAsyncClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        def stream(self, method: str, endpoint: str, headers=None, json=None):
            requests.append({"headers": headers, "json": json})
            if len(requests) == 1:
                return DummyStreamResponse(
                    403,
                    [],
                    b'{"error":"Client not allowed","allowedClients":["codex_cli"],"userAgent":"claude-cli/external (external, cli)"}',
                )
            return DummyStreamResponse(
                200,
                [
                    'data: {"type":"response.output_text.delta","delta":"兼容网关成功"}',
                    "data: [DONE]",
                ],
            )

    monkeypatch.setattr(llm.httpx, "AsyncClient", DummyAsyncClient)

    async def run() -> str:
        return await llm.chat_complete(
            [
                {"role": "system", "content": "你是助手"},
                {"role": "user", "content": "继续"},
            ],
            "openai",
        )

    result = asyncio.run(run())

    assert result == "兼容网关成功"
    assert len(requests) == 2
    assert requests[0]["headers"]["User-Agent"] == "claude-cli/external (external, cli)"
    assert requests[1]["headers"]["User-Agent"].startswith("codex_cli_rs/")
    assert requests[1]["headers"]["Originator"] == "codex_cli_rs"
    assert len(requests[1]["headers"]["Session_id"]) > 20
    assert requests[1]["json"]["instructions"].startswith(
        "You are Codex, based on GPT-5. You are running as a coding agent in the Codex CLI"
    )
    assert "你是助手" in requests[1]["json"]["instructions"]
    assert requests[1]["json"]["input"] == [
        {"role": "user", "content": [{"type": "input_text", "text": "继续"}]},
    ]


def test_chat_complete_rejects_unconfigured_provider(tmp_path, monkeypatch):
    llm = load_llm(tmp_path, monkeypatch)

    async def run() -> str:
        return await llm.chat_complete([{"role": "user", "content": "继续"}], "openai")

    with pytest.raises(RuntimeError, match="Provider openai is not fully configured: missing endpoint, model"):
        asyncio.run(run())
