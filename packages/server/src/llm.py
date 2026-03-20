from __future__ import annotations

import asyncio
import json
import subprocess
import uuid
from dataclasses import dataclass
from typing import Any, AsyncGenerator

import httpx

from .db import db


@dataclass
class LlmApiError(Exception):
    status: int
    provider_id: str
    model: str
    endpoint: str
    response_body: str

    def __str__(self) -> str:
        return f"LLM API error {self.status} ({self.provider_id}/{self.model} @ {self.endpoint}): {self.response_body}"


ChatMessage = dict[str, str]

DEFAULT_EXTERNAL_USER_AGENT = "claude-cli/external (external, cli)"
CODEX_CLI_USER_AGENT = "codex_cli_rs/0.89.0 (Mac OS 15.0.0; arm64) xterm-256color"
CODEX_CLI_ORIGINATOR = "codex_cli_rs"
CODEX_CLI_INSTRUCTIONS_PREFIX = (
    "You are Codex, based on GPT-5. You are running as a coding agent in the Codex CLI"
)
OPENAI_RESPONSES_LEGACY_FALLBACK_STATUSES = {400, 422, 503}


def _get_default_provider() -> dict[str, Any]:
    provider = db.query_one("SELECT * FROM providers WHERE is_default = 1")
    if not provider:
        raise RuntimeError("No default provider configured")
    return provider


def _get_provider_by_id(provider_id: str) -> dict[str, Any] | None:
    return db.query_one("SELECT * FROM providers WHERE id = ?", (provider_id,))


def _assert_provider_is_configured(provider: dict[str, Any]) -> None:
    missing: list[str] = []
    endpoint = str(provider.get("endpoint") or "").strip()
    model = str(provider.get("model") or "").strip()
    if not endpoint:
        missing.append("endpoint")
    if not model:
        missing.append("model")
    if not missing:
        return
    raise RuntimeError(
        f"Provider {provider.get('id') or 'unknown'} is not fully configured: missing {', '.join(missing)}"
    )


def _resolve_provider(provider_id: str | None = None) -> dict[str, Any]:
    if provider_id:
        provider = _get_provider_by_id(provider_id)
        if not provider:
            raise RuntimeError("Provider not found")
        _assert_provider_is_configured(provider)
        return provider
    provider = _get_default_provider()
    _assert_provider_is_configured(provider)
    return provider


def _normalize_endpoint(endpoint: str) -> str:
    return endpoint.rstrip("/")


def _resolve_provider_protocol(provider: dict[str, Any]) -> str:
    endpoint = _normalize_endpoint(str(provider["endpoint"])).lower()
    model = str(provider["model"]).lower()
    provider_id = str(provider["id"])

    if provider_id == "openai" or endpoint.endswith("/responses") or endpoint.endswith("/v1/responses") or "gpt-5.3-codex" in model:
        return "openai_responses"
    if provider_id == "gemini" or "/chat/completions" in endpoint or "gemini" in model:
        return "openai_chat_completions"
    return "anthropic_messages"


def _anthropic_messages_endpoint(provider: dict[str, Any]) -> str:
    normalized = _normalize_endpoint(str(provider["endpoint"]))
    if normalized.endswith("/v1/messages"):
        return normalized
    if normalized.endswith("/v1"):
        return f"{normalized}/messages"
    return f"{normalized}/v1/messages"


def _openai_responses_endpoint(provider: dict[str, Any]) -> str:
    normalized = _normalize_endpoint(str(provider["endpoint"]))
    if normalized.endswith("/v1/responses") or normalized.endswith("/responses"):
        return normalized
    if normalized.endswith("/v1"):
        return f"{normalized}/responses"
    return f"{normalized}/responses"


def _openai_chat_completions_endpoint(provider: dict[str, Any]) -> str:
    normalized = _normalize_endpoint(str(provider["endpoint"]))
    if normalized.endswith("/chat/completions"):
        return normalized
    if normalized.endswith("/v1"):
        return f"{normalized}/chat/completions"
    return f"{normalized}/v1/chat/completions"


def _alternate_minimax_endpoint(endpoint: str) -> str | None:
    if "api.minimaxi.com" in endpoint:
        return endpoint.replace("api.minimaxi.com", "api.minimax.io")
    if "api.minimax.io" in endpoint:
        return endpoint.replace("api.minimax.io", "api.minimaxi.com")
    return None


def _is_minimax_auth_error(status: int, text: str) -> bool:
    return status == 401 and "invalid api key" in text.lower()


def _build_headers(provider: dict[str, Any], protocol: str, codex_cli_compatible: bool = False) -> dict[str, str]:
    headers = {
        "Content-Type": "application/json",
        "User-Agent": DEFAULT_EXTERNAL_USER_AGENT,
    }
    if codex_cli_compatible:
        headers["User-Agent"] = CODEX_CLI_USER_AGENT
        headers["Originator"] = CODEX_CLI_ORIGINATOR
        headers["Session_id"] = str(uuid.uuid4())
    api_key = provider.get("api_key")
    if protocol == "anthropic_messages":
        headers["anthropic-version"] = "2023-06-01"
        if api_key:
            headers["x-api-key"] = str(api_key)
            if provider.get("id") == "minimax":
                headers["Authorization"] = f"Bearer {api_key}"
        return headers
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def _split_system_messages(messages: list[ChatMessage]) -> tuple[str, list[dict[str, str]]]:
    system = "\n\n".join(message["content"].strip() for message in messages if message["role"] == "system" and message["content"].strip())
    conversation = [message for message in messages if message["role"] in {"user", "assistant"}]
    return system, conversation


def _collapse_messages_to_single_user_prompt(messages: list[ChatMessage]) -> str:
    if len(messages) == 1 and messages[0]["role"] == "user":
        return messages[0]["content"]
    return "\n\n".join(f"{message['role'].upper()}:\n{message['content']}" for message in messages)


def _to_openai_responses_message_content(role: str, text: str) -> list[dict[str, str]]:
    content_type = "output_text" if role == "assistant" else "input_text"
    return [{"type": content_type, "text": text}]


def _build_openai_responses_input(messages: list[ChatMessage], include_system: bool = True) -> list[dict[str, Any]]:
    return [
        {
            "role": message["role"],
            "content": _to_openai_responses_message_content(message["role"], message["content"]),
        }
        for message in messages
        if include_system or message["role"] != "system"
    ]


def _build_codex_cli_instructions(messages: list[ChatMessage]) -> str:
    system, _ = _split_system_messages(messages)
    if not system:
        return CODEX_CLI_INSTRUCTIONS_PREFIX
    return f"{CODEX_CLI_INSTRUCTIONS_PREFIX}\n\n{system}"


def _build_openai_responses_payload(
    provider: dict[str, Any],
    messages: list[ChatMessage],
    stream: bool,
    structured: bool = True,
    codex_cli_compatible: bool = False,
) -> dict[str, Any]:
    effective_messages = messages if not codex_cli_compatible else [message for message in messages if message["role"] != "system"]
    payload: dict[str, Any] = {
        "model": str(provider["model"]).strip(),
        "stream": stream,
    }
    if structured:
        payload["input"] = _build_openai_responses_input(effective_messages)
    else:
        payload["input"] = [{"role": "user", "content": _collapse_messages_to_single_user_prompt(effective_messages)}]
    if codex_cli_compatible:
        payload["instructions"] = _build_codex_cli_instructions(messages)
    return payload


async def _post_with_curl(endpoint: str, headers: dict[str, str], body: str) -> tuple[int, str]:
    marker = "__WUDAO_CURL_STATUS__"
    args = ["curl", "-sS", "-X", "POST", endpoint]
    for key, value in headers.items():
        args.extend(["-H", f"{key}: {value}"])
    args.extend(["--data-binary", body, "-w", f"\n{marker}%{{http_code}}"])

    process = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout_bytes, stderr_bytes = await process.communicate()
    if process.returncode != 0:
        stderr = stderr_bytes.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"curl failed: {stderr or process.returncode}")

    stdout = stdout_bytes.decode("utf-8", errors="replace")
    marker_index = stdout.rfind(marker)
    if marker_index < 0:
        raise RuntimeError("curl response missing status marker")
    body_text = stdout[:marker_index]
    status_text = stdout[marker_index + len(marker):].strip()
    return int(status_text), body_text


async def _post_json_with_headers(
    endpoint: str,
    headers: dict[str, str],
    payload: dict[str, Any],
    timeout: float = 120.0,
) -> tuple[int, str]:
    body = json.dumps(payload)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(endpoint, headers=headers, content=body)
        return response.status_code, response.text
    except (httpx.HTTPError, OSError):
        return await _post_with_curl(endpoint, headers, body)


async def _post_json(endpoint: str, provider: dict[str, Any], protocol: str, payload: dict[str, Any], timeout: float = 120.0) -> tuple[int, str]:
    return await _post_json_with_headers(endpoint, _build_headers(provider, protocol), payload, timeout=timeout)


def _requires_codex_cli_compatibility(status: int, text: str) -> bool:
    if status != 403:
        return False
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return False
    if not isinstance(payload, dict):
        return False
    error = str(payload.get("error") or "").strip().lower()
    allowed_clients = payload.get("allowedClients")
    return error == "client not allowed" and isinstance(allowed_clients, list) and "codex_cli" in allowed_clients


async def _post_openai_responses_with_codex_cli_compatibility(
    endpoint: str,
    provider: dict[str, Any],
    messages: list[ChatMessage],
    stream: bool,
) -> tuple[int, str]:
    headers = _build_headers(provider, "openai_responses", codex_cli_compatible=True)
    payload = _build_openai_responses_payload(
        provider,
        messages,
        stream=stream,
        structured=True,
        codex_cli_compatible=True,
    )
    status, text = await _post_json_with_headers(endpoint, headers, payload)
    if status not in OPENAI_RESPONSES_LEGACY_FALLBACK_STATUSES:
        return status, text

    fallback_payload = _build_openai_responses_payload(
        provider,
        messages,
        stream=stream,
        structured=False,
        codex_cli_compatible=True,
    )
    return await _post_json_with_headers(endpoint, headers, fallback_payload)


def _unwrap_common_payloads(data: Any) -> list[Any]:
    payloads = [data]
    if isinstance(data, dict):
        for key in ("data", "result", "response"):
            nested = data.get(key)
            if isinstance(nested, dict):
                payloads.append(nested)
    return payloads


def _to_text_from_output_text_field(value: Any) -> str:
    if isinstance(value, str):
        return value
    if not isinstance(value, list):
        return ""
    parts: list[str] = []
    for item in value:
        if isinstance(item, str):
            parts.append(item)
        elif isinstance(item, dict):
            if isinstance(item.get("text"), str):
                parts.append(item["text"])
            if isinstance(item.get("output_text"), str):
                parts.append(item["output_text"])
    return "".join(parts)


def _to_text_from_gemini_candidates(data: Any) -> str:
    if not isinstance(data, dict):
        return ""
    candidates = data.get("candidates")
    if not isinstance(candidates, list):
        return ""
    texts: list[str] = []
    for candidate in candidates:
        parts = (((candidate or {}).get("content") or {}).get("parts")) if isinstance(candidate, dict) else None
        if not isinstance(parts, list):
            continue
        for part in parts:
            if isinstance(part, dict) and isinstance(part.get("text"), str):
                texts.append(part["text"])
    return "".join(texts)


def _to_openai_chat_completions_text_single(data: Any) -> str:
    if not isinstance(data, dict):
        return ""
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        return str(data.get("text") or "")
    choice = choices[0] or {}
    content = ((choice.get("message") or {}).get("content")) if isinstance(choice, dict) else None
    if isinstance(content, str):
        return content
    if isinstance(content, dict) and isinstance(content.get("text"), str):
        return content["text"]
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict):
                if isinstance(part.get("text"), str):
                    parts.append(part["text"])
                if isinstance(part.get("output_text"), str):
                    parts.append(part["output_text"])
        return "".join(parts)

    delta_content = ((choice.get("delta") or {}).get("content")) if isinstance(choice, dict) else None
    if isinstance(delta_content, str):
        return delta_content
    if isinstance(delta_content, list):
        return "".join(part.get("text", "") if isinstance(part, dict) else str(part) for part in delta_content)

    if isinstance(choice.get("text"), str):
        return choice["text"]
    return str(data.get("text") or "")


def _to_openai_responses_text(data: Any) -> str:
    for payload in _unwrap_common_payloads(data):
        if not isinstance(payload, dict):
            continue
        output_text = _to_text_from_output_text_field(payload.get("output_text"))
        if output_text:
            return output_text
        outputs = payload.get("output")
        texts: list[str] = []
        if isinstance(outputs, list):
            for output in outputs:
                if not isinstance(output, dict):
                    continue
                if isinstance(output.get("text"), str):
                    texts.append(output["text"])
                if isinstance(output.get("output_text"), str):
                    texts.append(output["output_text"])
                content = output.get("content")
                if isinstance(content, list):
                    for block in content:
                        if isinstance(block, dict):
                            if isinstance(block.get("text"), str):
                                texts.append(block["text"])
                            if isinstance(block.get("output_text"), str):
                                texts.append(block["output_text"])
        if texts:
            return "".join(texts)
        chat_text = _to_openai_chat_completions_text_single(payload)
        if chat_text:
            return chat_text
        gemini_text = _to_text_from_gemini_candidates(payload)
        if gemini_text:
            return gemini_text
    return ""


def _to_openai_responses_stream_delta(data: Any) -> str:
    if not isinstance(data, dict):
        return ""
    if data.get("type") != "response.output_text.delta":
        return ""
    delta = data.get("delta")
    return delta if isinstance(delta, str) else ""


def _to_openai_responses_stream_terminal_text(data: Any) -> str:
    if not isinstance(data, dict):
        return ""
    event_type = data.get("type")
    if event_type == "response.output_text.done":
        text = data.get("text")
        return text if isinstance(text, str) else ""
    if event_type == "response.completed":
        return _to_openai_responses_text(data)
    return ""


def _to_openai_chat_completions_text(data: Any) -> str:
    for payload in _unwrap_common_payloads(data):
        text = _to_openai_chat_completions_text_single(payload)
        if text:
            return text
        gemini_text = _to_text_from_gemini_candidates(payload)
        if gemini_text:
            return gemini_text
        if isinstance(payload, dict):
            output_text = _to_text_from_output_text_field(payload.get("output_text"))
            if output_text:
                return output_text
    return ""


def _ensure_ok(status: int, text: str, provider: dict[str, Any], endpoint: str) -> None:
    if 200 <= status < 300:
        return
    raise LlmApiError(status, str(provider["id"]), str(provider["model"]), endpoint, text)


async def chat_complete(messages: list[ChatMessage], provider_id: str | None = None, max_tokens: int = 4096) -> str:
    provider = _resolve_provider(provider_id)
    protocol = _resolve_provider_protocol(provider)

    # openai_responses 协议直接使用流式（某些 API 强制要求）
    if protocol == "openai_responses":
        chunks = []
        async for chunk in stream_chat(provider_id, messages, max_tokens):
            chunks.append(chunk)
        return "".join(chunks)

    status, text, endpoint = await _post_completion(provider, messages, max_tokens=max_tokens, stream=False)
    _ensure_ok(status, text, provider, endpoint)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return text
    if protocol == "openai_chat_completions":
        return _to_openai_chat_completions_text(data)
    content = data.get("content") if isinstance(data, dict) else None
    if isinstance(content, list):
        return "".join(block.get("text", "") for block in content if isinstance(block, dict) and block.get("type") == "text")
    return text


async def _post_completion(provider: dict[str, Any], messages: list[ChatMessage], max_tokens: int, stream: bool) -> tuple[int, str, str]:
    protocol = _resolve_provider_protocol(provider)

    if protocol == "openai_responses":
        endpoint = _openai_responses_endpoint(provider)
        payload = _build_openai_responses_payload(provider, messages, stream=stream, structured=True)
        status, text = await _post_json(endpoint, provider, protocol, payload)
        if _requires_codex_cli_compatibility(status, text):
            status, text = await _post_openai_responses_with_codex_cli_compatibility(endpoint, provider, messages, stream)
            return status, text, endpoint
        if status not in OPENAI_RESPONSES_LEGACY_FALLBACK_STATUSES:
            return status, text, endpoint
        fallback_payload = _build_openai_responses_payload(provider, messages, stream=stream, structured=False)
        status, text = await _post_json(endpoint, provider, protocol, fallback_payload)
        if _requires_codex_cli_compatibility(status, text):
            status, text = await _post_openai_responses_with_codex_cli_compatibility(endpoint, provider, messages, stream)
        return status, text, endpoint

    if protocol == "openai_chat_completions":
        endpoint = _openai_chat_completions_endpoint(provider)
        prompt = _collapse_messages_to_single_user_prompt(messages)
        has_system = any(message["role"] == "system" for message in messages)
        payload = {
            "model": str(provider["model"]).strip(),
            "messages": messages if has_system else [{"role": "user", "content": prompt}],
            "stream": stream,
        }
        status, text = await _post_json(endpoint, provider, protocol, payload)
        if status not in {400, 422, 503}:
            return status, text, endpoint
        status, text = await _post_json(endpoint, provider, protocol, {"model": str(provider["model"]).strip(), "messages": messages, "stream": stream})
        return status, text, endpoint

    endpoint = _anthropic_messages_endpoint(provider)
    system, conversation = _split_system_messages(messages)
    payload: dict[str, Any] = {"model": provider["model"], "max_tokens": max_tokens, "messages": conversation, "stream": stream}
    if system:
        payload["system"] = system
    status, text = await _post_json(endpoint, provider, protocol, payload)
    if provider.get("id") == "minimax" and _is_minimax_auth_error(status, text):
        fallback_endpoint = _alternate_minimax_endpoint(endpoint)
        if fallback_endpoint:
            status, text = await _post_json(fallback_endpoint, provider, protocol, payload)
            return status, text, fallback_endpoint
    return status, text, endpoint


async def _stream_openai_responses(
    client: httpx.AsyncClient,
    provider: dict[str, Any],
    messages: list[ChatMessage],
) -> AsyncGenerator[str, None]:
    """流式处理 openai_responses 协议，自动处理 Codex CLI 兼容性重试。"""
    endpoint = _openai_responses_endpoint(provider)
    use_codex_cli_compatible = False

    while True:
        payloads = [
            _build_openai_responses_payload(provider, messages, stream=True, structured=True, codex_cli_compatible=use_codex_cli_compatible),
            _build_openai_responses_payload(provider, messages, stream=True, structured=False, codex_cli_compatible=use_codex_cli_compatible),
        ]
        headers = _build_headers(provider, "openai_responses", codex_cli_compatible=use_codex_cli_compatible)
        should_retry_with_codex_cli = False

        for attempt_index, payload in enumerate(payloads):
            emitted_text = False
            async with client.stream("POST", endpoint, headers=headers, json=payload) as response:
                if response.status_code >= 400:
                    error_text = (await response.aread()).decode("utf-8", errors="replace")
                    if not use_codex_cli_compatible and _requires_codex_cli_compatibility(response.status_code, error_text):
                        should_retry_with_codex_cli = True
                        break
                    if attempt_index == 0 and response.status_code in OPENAI_RESPONSES_LEGACY_FALLBACK_STATUSES:
                        continue
                    raise LlmApiError(response.status_code, str(provider["id"]), str(provider["model"]), endpoint, error_text)

                async for line in response.aiter_lines():
                    delta = _parse_sse_line_to_delta(line, emitted_text)
                    if delta is None:
                        continue
                    if delta:
                        emitted_text = True
                        yield delta
                    elif _is_sse_done(line):
                        return
                return

        if should_retry_with_codex_cli:
            use_codex_cli_compatible = True
            continue
        return


def _parse_sse_line_to_delta(line: str, has_emitted: bool) -> str | None:
    """解析 SSE 行并返回 delta 内容，返回 None 表示跳过该行。"""
    if not line or line.startswith(":") or not line.startswith("data:"):
        return None
    data = line[5:].strip()
    if data == "[DONE]":
        return ""
    try:
        parsed = json.loads(data)
    except json.JSONDecodeError:
        return None

    delta = _to_openai_responses_stream_delta(parsed)
    if delta:
        return delta
    if not has_emitted:
        return _to_openai_responses_stream_terminal_text(parsed)
    return ""


def _is_sse_done(line: str) -> bool:
    """检查 SSE 行是否表示流结束。"""
    return line.startswith("data:") and line[5:].strip() == "[DONE]"


async def _stream_anthropic_or_chat_completions(
    client: httpx.AsyncClient,
    provider: dict[str, Any],
    protocol: str,
    messages: list[ChatMessage],
    max_tokens: int,
) -> AsyncGenerator[str, None]:
    """流式处理 anthropic_messages 或 openai_chat_completions 协议。"""
    if protocol == "openai_chat_completions":
        endpoint = _openai_chat_completions_endpoint(provider)
        prompt = _collapse_messages_to_single_user_prompt(messages)
        has_system = any(message["role"] == "system" for message in messages)
        payloads = [{
            "model": str(provider["model"]).strip(),
            "messages": messages if has_system else [{"role": "user", "content": prompt}],
            "stream": True,
        }]
    else:
        endpoint = _anthropic_messages_endpoint(provider)
        system, conversation = _split_system_messages(messages)
        payload = {"model": provider["model"], "max_tokens": max_tokens, "messages": conversation, "stream": True}
        if system:
            payload["system"] = system
        payloads = [payload]

    headers = _build_headers(provider, protocol)
    for payload in payloads:
        async with client.stream("POST", endpoint, headers=headers, json=payload) as response:
            if response.status_code >= 400:
                error_text = await response.aread()
                raise LlmApiError(response.status_code, str(provider["id"]), str(provider["model"]), endpoint, error_text.decode("utf-8", errors="replace"))

            async for line in response.aiter_lines():
                if not line or line.startswith(":") or not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    parsed = json.loads(data)
                except json.JSONDecodeError:
                    continue

                delta = _extract_stream_delta(parsed, protocol)
                if delta:
                    yield delta
                elif protocol != "openai_chat_completions" and parsed.get("type") == "message_stop":
                    break
            return


def _extract_stream_delta(parsed: Any, protocol: str) -> str:
    """从解析的 SSE 数据中提取 delta 内容。"""
    if protocol == "openai_chat_completions":
        return _to_openai_chat_completions_text(parsed)
    event_type = parsed.get("type")
    if event_type == "content_block_delta":
        delta = parsed.get("delta")
        return (delta.get("text") if isinstance(delta, dict) else "") or ""
    return ""


async def stream_chat(provider_id: str, messages: list[ChatMessage], max_tokens: int = 4096) -> AsyncGenerator[str, None]:
    provider = _resolve_provider(provider_id)
    protocol = _resolve_provider_protocol(provider)

    async with httpx.AsyncClient(timeout=None) as client:
        if protocol == "openai_responses":
            async for delta in _stream_openai_responses(client, provider, messages):
                yield delta
        else:
            async for delta in _stream_anthropic_or_chat_completions(client, provider, protocol, messages, max_tokens):
                yield delta
