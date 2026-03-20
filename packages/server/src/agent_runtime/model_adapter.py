from __future__ import annotations

import html
import json
import re
from dataclasses import dataclass
from typing import Any

from ..llm import chat_complete
from .tool_types import AgentTool

JSON_BLOCK_RE = re.compile(r"```(?:json)?\s*(\{.*\})\s*```", re.DOTALL)
MINIMAX_TOOL_CALL_RE = re.compile(r"<minimax:tool_call>(.*?)</minimax:tool_call>", re.DOTALL | re.IGNORECASE)
MINIMAX_INVOKE_RE = re.compile(r'<invoke\s+name="([^"]+)">(.*?)</invoke>', re.DOTALL | re.IGNORECASE)
MINIMAX_PARAMETER_RE = re.compile(
    r'<parameter\s+name="([^"]+)">(.*?)</parameter>',
    re.DOTALL | re.IGNORECASE,
)
KNOWN_TOOL_NAMES = {
    "workspace_list",
    "workspace_read_file",
    "workspace_search_text",
    "workspace_write_file",
    "workspace_apply_patch",
    "task_read_context",
    "terminal_snapshot",
}
TOOL_META_KEYS = {
    "assistant_text",
    "assistantText",
    "tool_calls",
    "toolCalls",
    "tool_call",
    "toolName",
    "tool_name",
    "name",
    "tool",
    "action",
    "input",
    "arguments",
    "params",
    "parameters",
}

JSON_ENVELOPE_INSTRUCTION = """你是任务工作台里的 Agentic Chat 运行时。

你必须始终只输出一个 JSON 对象，不要输出 Markdown、解释文字或代码块。

输出 JSON schema：
{
  "assistant_text": "给用户看的最终回复，可为空字符串",
  "tool_calls": [
    {
      "toolName": "只能从可用工具中选择",
      "input": {}
    }
  ]
}

规则：
1. 如果已有信息足够回答，就输出 assistant_text，并省略 tool_calls 或返回空数组。
2. 如果需要读取更多信息，就输出 tool_calls；可以同时给一个简短 assistant_text，但不要写成长篇解释。
3. toolName 必须严格来自可用工具列表，input 必须是 JSON 对象。
4. 不要臆造工具结果，不要请求 workspace 之外的路径。
5. 如果工具结果已经足够，请在下一轮直接返回 assistant_text。
"""


@dataclass(slots=True)
class AgentToolCall:
    tool_name: str
    input_data: dict[str, Any]


@dataclass(slots=True)
class AgentModelResponse:
    assistant_text: str
    tool_calls: list[AgentToolCall]
    raw_text: str
    structured: bool


def _strip_code_fence(raw: str) -> str:
    match = JSON_BLOCK_RE.search(raw)
    if match:
        return match.group(1).strip()
    return raw.strip()


def _extract_json_candidate(raw: str) -> str:
    stripped = _strip_code_fence(raw)
    if stripped.startswith("{") and stripped.endswith("}"):
        return stripped
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start >= 0 and end > start:
        return stripped[start : end + 1]
    return stripped


def _parse_json_object_sequence(raw: str) -> list[dict[str, Any]] | None:
    stripped = _strip_code_fence(raw)
    decoder = json.JSONDecoder()
    index = 0
    parsed_items: list[dict[str, Any]] = []

    while index < len(stripped):
        while index < len(stripped) and stripped[index].isspace():
            index += 1
        if index >= len(stripped):
            break
        try:
            parsed, next_index = decoder.raw_decode(stripped, index)
        except json.JSONDecodeError:
            return None
        if not isinstance(parsed, dict):
            return None
        parsed_items.append(parsed)
        index = next_index

    return parsed_items or None


def _normalize_tool_calls(raw_calls: Any) -> list[AgentToolCall]:
    if isinstance(raw_calls, dict):
        raw_items = [raw_calls]
    elif isinstance(raw_calls, list):
        raw_items = raw_calls
    else:
        raw_items = []

    tool_calls: list[AgentToolCall] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        tool_name = item.get("toolName") or item.get("tool_name") or item.get("name") or item.get("tool") or item.get("action")

        if not tool_name and len(item) == 1:
            only_key = next(iter(item.keys()))
            only_value = item[only_key]
            if isinstance(only_key, str) and only_key in KNOWN_TOOL_NAMES and isinstance(only_value, dict):
                tool_name = only_key
                item = {"toolName": only_key, "input": only_value}

        input_data = item.get("input") or item.get("arguments") or item.get("params") or item.get("parameters")
        if not isinstance(tool_name, str) or not tool_name.strip():
            continue
        if input_data is None:
            input_data = {
                key: value
                for key, value in item.items()
                if key not in TOOL_META_KEYS
            }
        if isinstance(input_data, str):
            try:
                parsed_input = json.loads(input_data)
            except json.JSONDecodeError:
                parsed_input = {"raw": input_data}
            input_data = parsed_input
        if not isinstance(input_data, dict):
            input_data = {"value": input_data}
        tool_calls.append(AgentToolCall(tool_name=tool_name.strip(), input_data=input_data))
    return tool_calls


def _parse_scalar_parameter(raw_value: str) -> Any:
    unescaped = html.unescape(raw_value).strip()
    if not unescaped:
        return ""
    try:
        return json.loads(unescaped)
    except json.JSONDecodeError:
        pass
    lowered = unescaped.lower()
    if lowered == "true":
        return True
    if lowered == "false":
        return False
    if lowered == "null":
        return None
    if re.fullmatch(r"-?\d+", unescaped):
        try:
            return int(unescaped)
        except ValueError:
            return unescaped
    if re.fullmatch(r"-?\d+\.\d+", unescaped):
        try:
            return float(unescaped)
        except ValueError:
            return unescaped
    return unescaped


def _parse_minimax_tool_calls(raw: str) -> AgentModelResponse | None:
    match = MINIMAX_TOOL_CALL_RE.search(raw)
    if not match:
        return None

    assistant_text = MINIMAX_TOOL_CALL_RE.sub("", raw).strip()
    tool_calls: list[AgentToolCall] = []
    for invoke_match in MINIMAX_INVOKE_RE.finditer(match.group(1)):
        tool_name = invoke_match.group(1).strip()
        if not tool_name:
            continue
        input_data: dict[str, Any] = {}
        for parameter_match in MINIMAX_PARAMETER_RE.finditer(invoke_match.group(2)):
            parameter_name = parameter_match.group(1).strip()
            if not parameter_name:
                continue
            input_data[parameter_name] = _parse_scalar_parameter(parameter_match.group(2))
        tool_calls.append(AgentToolCall(tool_name=tool_name, input_data=input_data))

    if not tool_calls:
        return None
    return AgentModelResponse(
        assistant_text=assistant_text,
        tool_calls=tool_calls,
        raw_text=raw,
        structured=True,
    )


def _infer_tool_calls_from_payload(payload: dict[str, Any]) -> list[AgentToolCall]:
    if not isinstance(payload, dict):
        return []
    if "path" in payload and "content" in payload and isinstance(payload.get("content"), str):
        return [
            AgentToolCall(
                tool_name="workspace_write_file",
                input_data={
                    "path": payload.get("path"),
                    "content": payload.get("content"),
                    **(
                        {"createDirectories": payload.get("createDirectories")}
                        if "createDirectories" in payload
                        else {}
                    ),
                },
            )
        ]
    if "patch" in payload and isinstance(payload.get("patch"), str):
        return [
            AgentToolCall(
                tool_name="workspace_apply_patch",
                input_data={"patch": payload.get("patch")},
            )
        ]
    return []


def _extract_tool_calls_from_payload(payload: dict[str, Any]) -> list[AgentToolCall]:
    tool_calls = _normalize_tool_calls(payload.get("tool_calls") or payload.get("toolCalls") or payload.get("tool_call"))
    if not tool_calls:
        tool_calls = _normalize_tool_calls(payload)
    if not tool_calls:
        tool_calls = _infer_tool_calls_from_payload(payload)
    return tool_calls


def _deduplicate_assistant_texts(texts: list[str]) -> list[str]:
    unique_texts: list[str] = []
    seen: set[str] = set()
    for text in texts:
        normalized = text.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        unique_texts.append(normalized)
    return unique_texts


def _deduplicate_tool_calls(tool_calls: list[AgentToolCall]) -> list[AgentToolCall]:
    unique_calls: list[AgentToolCall] = []
    seen: set[tuple[str, str]] = set()
    for call in tool_calls:
        key = (
            call.tool_name,
            json.dumps(call.input_data, ensure_ascii=False, sort_keys=True),
        )
        if key in seen:
            continue
        seen.add(key)
        unique_calls.append(call)
    return unique_calls


def parse_agent_model_response(raw: str) -> AgentModelResponse:
    minimax_result = _parse_minimax_tool_calls(raw)
    if minimax_result is not None:
        return minimax_result

    sequence_items = _parse_json_object_sequence(raw)
    if sequence_items and len(sequence_items) > 1:
        assistant_texts: list[str] = []
        tool_calls: list[AgentToolCall] = []
        for item in sequence_items:
            assistant_text = item.get("assistant_text") or item.get("assistantText") or ""
            if isinstance(assistant_text, str) and assistant_text.strip():
                assistant_texts.append(assistant_text.strip())
            tool_calls.extend(_extract_tool_calls_from_payload(item))
        assistant_texts = _deduplicate_assistant_texts(assistant_texts)
        tool_calls = _deduplicate_tool_calls(tool_calls)
        if assistant_texts or tool_calls:
            return AgentModelResponse(
                assistant_text="\n\n".join(assistant_texts),
                tool_calls=tool_calls,
                raw_text=raw,
                structured=True,
            )

    candidate = _extract_json_candidate(raw)
    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        return AgentModelResponse(
            assistant_text=raw.strip(),
            tool_calls=[],
            raw_text=raw,
            structured=False,
        )

    if not isinstance(parsed, dict):
        return AgentModelResponse(
            assistant_text=raw.strip(),
            tool_calls=[],
            raw_text=raw,
            structured=False,
        )

    assistant_text = parsed.get("assistant_text") or parsed.get("assistantText") or ""
    if not isinstance(assistant_text, str):
        assistant_text = ""
    tool_calls = _extract_tool_calls_from_payload(parsed)
    return AgentModelResponse(
        assistant_text=assistant_text.strip(),
        tool_calls=tool_calls,
        raw_text=candidate,
        structured=True,
    )


def _format_tools_for_prompt(tools: list[AgentTool]) -> str:
    schemas = [tool.to_prompt_schema() for tool in tools]
    return json.dumps(schemas, ensure_ascii=False, indent=2)


async def complete_agent_turn(
    provider_id: str,
    messages: list[dict[str, str]],
    tools: list[AgentTool],
) -> AgentModelResponse:
    prompt_messages = [
        *messages,
        {
            "role": "system",
            "content": (
                f"{JSON_ENVELOPE_INSTRUCTION}\n\n可用工具列表：\n{_format_tools_for_prompt(tools)}"
                if tools
                else f"{JSON_ENVELOPE_INSTRUCTION}\n\n当前没有可用工具，请只输出 assistant_text。"
            ),
        },
    ]
    raw = await chat_complete(prompt_messages, provider_id)
    return parse_agent_model_response(raw)


async def next_agent_step(
    provider_id: str,
    *,
    system_messages: list[dict[str, str]] | None,
    history: list[dict[str, str]],
    tool_schemas: list[dict[str, Any]],
    tool_transcript: list[dict[str, Any]],
) -> dict[str, Any]:
    tools = [
        AgentTool(
            name=str(tool["name"]),
            description=str(tool.get("description") or ""),
            input_schema=tool.get("inputSchema") if isinstance(tool.get("inputSchema"), dict) else {},
            execute=lambda *_args, **_kwargs: None,  # type: ignore[arg-type]
        )
        for tool in tool_schemas
        if isinstance(tool, dict) and isinstance(tool.get("name"), str)
    ]
    transcript_messages = [
        {
            "role": "assistant" if item.get("type") == "tool_call" else "user",
            "content": json.dumps(item, ensure_ascii=False),
        }
        for item in tool_transcript
    ]
    step = await complete_agent_turn(
        provider_id,
        [*(system_messages or []), *history, *transcript_messages],
        tools,
    )
    if step.tool_calls:
        serialized_tool_calls = [
            {
                "toolName": item.tool_name,
                "input": item.input_data,
            }
            for item in step.tool_calls
        ]
        first = step.tool_calls[0]
        return {
            "type": "tool_calls" if len(step.tool_calls) > 1 else "tool_call",
            "toolName": first.tool_name,
            "input": first.input_data,
            "toolCalls": serialized_tool_calls,
            "assistantText": step.assistant_text,
            "degraded": not step.structured,
        }
    return {
        "type": "assistant_text",
        "content": step.assistant_text or step.raw_text.strip(),
        "degraded": not step.structured,
    }
