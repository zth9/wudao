from __future__ import annotations

from typing import Any

from .terminal_tools import terminal_snapshot_tool, terminal_tools_prompt_schema
from .tool_types import AgentTool
from .workspace_tools import (
    task_read_context_tool,
    workspace_apply_patch_tool,
    workspace_list_tool,
    workspace_read_file_tool,
    workspace_search_text_tool,
    workspace_write_file_tool,
    workspace_tools_prompt_schema,
)
from ..sdk_runner.sdk_tools import invoke_sdk_runner_tool, sdk_tools_prompt_schema


def list_agent_tools() -> list[AgentTool]:
    workspace_schemas = {item["name"]: item for item in workspace_tools_prompt_schema()}
    terminal_schemas = {item["name"]: item for item in terminal_tools_prompt_schema()}
    return [
        AgentTool(
            name="workspace_list",
            description=workspace_schemas["workspace_list"]["description"],
            input_schema=workspace_schemas["workspace_list"]["inputSchema"],
            execute=workspace_list_tool,
        ),
        AgentTool(
            name="workspace_read_file",
            description=workspace_schemas["workspace_read_file"]["description"],
            input_schema=workspace_schemas["workspace_read_file"]["inputSchema"],
            execute=workspace_read_file_tool,
        ),
        AgentTool(
            name="workspace_search_text",
            description=workspace_schemas["workspace_search_text"]["description"],
            input_schema=workspace_schemas["workspace_search_text"]["inputSchema"],
            execute=workspace_search_text_tool,
        ),
        AgentTool(
            name="workspace_write_file",
            description=workspace_schemas["workspace_write_file"]["description"],
            input_schema=workspace_schemas["workspace_write_file"]["inputSchema"],
            execute=workspace_write_file_tool,
        ),
        AgentTool(
            name="workspace_apply_patch",
            description=workspace_schemas["workspace_apply_patch"]["description"],
            input_schema=workspace_schemas["workspace_apply_patch"]["inputSchema"],
            execute=workspace_apply_patch_tool,
        ),
        AgentTool(
            name="task_read_context",
            description=workspace_schemas["task_read_context"]["description"],
            input_schema=workspace_schemas["task_read_context"]["inputSchema"],
            execute=task_read_context_tool,
        ),
        AgentTool(
            name="terminal_snapshot",
            description=terminal_schemas["terminal_snapshot"]["description"],
            input_schema=terminal_schemas["terminal_snapshot"]["inputSchema"],
            execute=terminal_snapshot_tool,
        ),
        *_sdk_runner_tools(),
    ]


def _sdk_runner_tools() -> list[AgentTool]:
    sdk_schemas = {item["name"]: item for item in sdk_tools_prompt_schema()}
    return [
        AgentTool(
            name="invoke_sdk_runner",
            description=sdk_schemas["invoke_sdk_runner"]["description"],
            input_schema=sdk_schemas["invoke_sdk_runner"]["inputSchema"],
            execute=invoke_sdk_runner_tool,
        ),
    ]


def get_agent_tool(tool_name: str) -> AgentTool | None:
    normalized = tool_name.strip()
    for tool in list_agent_tools():
        if tool.name == normalized:
            return tool
    return None


def serialize_tool_schemas() -> list[dict[str, Any]]:
    return [tool.to_prompt_schema() for tool in list_agent_tools()]


def get_task_agent_tools() -> list[dict[str, Any]]:
    return serialize_tool_schemas()


async def execute_agent_tool(task_id: str, tool_name: str, input_data: dict[str, Any]) -> dict[str, Any]:
    tool = get_agent_tool(tool_name)
    if tool is None:
        raise RuntimeError(f"unknown tool: {tool_name}")
    return await tool.execute(task_id, input_data)
