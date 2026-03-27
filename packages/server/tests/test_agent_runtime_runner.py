from __future__ import annotations

import importlib
import json
import sys

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
    runner = importlib.import_module("src.agent_runtime.runner")
    model_adapter = importlib.import_module("src.agent_runtime.model_adapter")
    thread_store = importlib.import_module("src.agent_runtime.thread_store")
    return app_module, runner, model_adapter, thread_store, home_dir


def create_task(client: TestClient, title: str) -> str:
    response = client.post("/api/tasks", json={"title": title, "type": "feature"})
    assert response.status_code == 201
    return response.json()["id"]


def test_runner_executes_readonly_tool_and_persists_timeline(tmp_path, monkeypatch):
    app_module, runner, model_adapter, thread_store, home_dir = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "跑 Agent Runner")
    (home_dir / "workspace" / task_id / "AGENTS.md").write_text("# Demo\n", encoding="utf-8")

    steps = iter(
        [
            {"type": "tool_call", "toolName": "workspace_list", "input": {"path": "."}},
            {"type": "assistant_text", "content": "我已经看到了 AGENTS.md。"},
        ]
    )

    async def fake_next_step(provider_id, *, system_messages, history, tool_schemas, tool_transcript):
        return next(steps)

    monkeypatch.setattr(model_adapter, "next_agent_step", fake_next_step)

    run = thread_store.create_agent_run(task_id, "claude", run_id="run-1")
    projected_history = [{"role": "user", "content": "看看 workspace"}]

    async def collect():
        return [
            event
            async for event in runner.run_agent_loop(
                task_id=task_id,
                run_id=run["id"],
                provider_id="claude",
                history=projected_history,
                projected_history=projected_history,
            )
        ]

    import asyncio

    events = asyncio.run(collect())
    assert [event["type"] for event in events] == [
        "message.completed",
        "tool.started",
        "message.completed",
        "message.completed",
        "tool.completed",
        "message.delta",
        "message.delta",
        "message.completed",
        "run.completed",
    ]
    assert events[0]["item"]["kind"] == "tool_call"
    assert events[0]["item"]["status"] == "streaming"
    assert events[2]["item"]["kind"] == "tool_call"
    assert events[2]["item"]["status"] == "completed"
    assert events[3]["item"]["kind"] == "tool_result"

    thread = thread_store.get_task_agent_thread(task_id)
    assert [item["kind"] for item in thread["messages"]] == ["tool_call", "tool_result", "text"]
    assert thread["messages"][0]["content_json"]["toolName"] == "workspace_list"
    assert thread["messages"][1]["content_json"]["output"]["entries"][0]["name"] == "AGENTS.md"
    assert thread["messages"][2]["content_json"]["content"] == "我已经看到了 AGENTS.md。"

    history = json.loads(client.get(f"/api/tasks/{task_id}").json()["chat_messages"])
    assert history == [
        {"role": "user", "content": "看看 workspace"},
        {"role": "assistant", "content": "我已经看到了 AGENTS.md。"},
    ]


def test_runner_degrades_invalid_model_output_to_plain_text_reply(tmp_path, monkeypatch):
    app_module, runner, model_adapter, thread_store, _ = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "降级为纯文本")

    async def fake_next_step(provider_id, *, system_messages, history, tool_schemas, tool_transcript):
        return {"type": "assistant_text", "content": "这是降级后的纯文本回复。", "degraded": True}

    monkeypatch.setattr(model_adapter, "next_agent_step", fake_next_step)

    run = thread_store.create_agent_run(task_id, "claude", run_id="run-1")
    projected_history = [{"role": "user", "content": "继续"}]

    async def collect():
        return [
            event
            async for event in runner.run_agent_loop(
                task_id=task_id,
                run_id=run["id"],
                provider_id="claude",
                history=projected_history,
                projected_history=projected_history,
            )
        ]

    import asyncio

    events = asyncio.run(collect())
    assert events[-1] == {"type": "run.completed", "runId": "run-1"}
    history = json.loads(client.get(f"/api/tasks/{task_id}").json()["chat_messages"])
    assert history[-1] == {"role": "assistant", "content": "这是降级后的纯文本回复。"}


def test_runner_executes_write_tool_and_updates_workspace(tmp_path, monkeypatch):
    app_module, runner, model_adapter, thread_store, home_dir = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "写文件")
    workspace_root = home_dir / "workspace" / task_id
    workspace_root.mkdir(parents=True, exist_ok=True)

    steps = iter(
        [
            {
                "type": "tool_call",
                "toolName": "workspace_write_file",
                "input": {
                    "path": "docs/plan.md",
                    "content": "# Plan\n- done\n",
                },
            },
            {"type": "assistant_text", "content": "我已经写好了 docs/plan.md。"},
        ]
    )

    async def fake_next_step(provider_id, *, system_messages, history, tool_schemas, tool_transcript):
        return next(steps)

    monkeypatch.setattr(model_adapter, "next_agent_step", fake_next_step)

    run = thread_store.create_agent_run(task_id, "claude", run_id="run-1")
    projected_history = [{"role": "user", "content": "写一份计划"}]

    async def collect():
        return [
            event
            async for event in runner.run_agent_loop(
                task_id=task_id,
                run_id=run["id"],
                provider_id="claude",
                history=projected_history,
                projected_history=projected_history,
            )
        ]

    import asyncio

    events = asyncio.run(collect())
    assert events[-1] == {"type": "run.completed", "runId": "run-1"}
    assert (workspace_root / "docs" / "plan.md").read_text(encoding="utf-8") == "# Plan\n- done\n"

    thread = thread_store.get_task_agent_thread(task_id)
    assert thread["messages"][0]["content_json"]["toolName"] == "workspace_write_file"
    assert thread["messages"][1]["content_json"]["output"]["path"] == "docs/plan.md"
    assert thread["messages"][2]["content_json"]["content"] == "我已经写好了 docs/plan.md。"

    history = json.loads(client.get(f"/api/tasks/{task_id}").json()["chat_messages"])
    assert history[-1] == {"role": "assistant", "content": "我已经写好了 docs/plan.md。"}


def test_runner_syncs_agents_artifact_when_write_tool_updates_agents_md(tmp_path, monkeypatch):
    app_module, runner, model_adapter, thread_store, home_dir = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "更新 AGENTS")
    workspace_root = home_dir / "workspace" / task_id
    workspace_root.mkdir(parents=True, exist_ok=True)

    steps = iter(
        [
            {
                "type": "tool_call",
                "toolName": "workspace_write_file",
                "input": {
                    "path": "AGENTS.md",
                    "content": "# Done\n任务已完成\n",
                },
            },
            {"type": "assistant_text", "content": "AGENTS.md 已更新。"},
        ]
    )

    async def fake_next_step(provider_id, *, system_messages, history, tool_schemas, tool_transcript):
        return next(steps)

    monkeypatch.setattr(model_adapter, "next_agent_step", fake_next_step)

    run = thread_store.create_agent_run(task_id, "claude", run_id="run-1")
    projected_history = [{"role": "user", "content": "更新 AGENTS.md"}]

    async def collect():
        return [
            event
            async for event in runner.run_agent_loop(
                task_id=task_id,
                run_id=run["id"],
                provider_id="claude",
                history=projected_history,
                projected_history=projected_history,
            )
        ]

    import asyncio

    events = asyncio.run(collect())
    assert [event["type"] for event in events] == [
        "message.completed",
        "tool.started",
        "message.completed",
        "message.completed",
        "tool.completed",
        "message.completed",
        "artifact.updated",
        "message.delta",
        "message.delta",
        "message.completed",
        "run.completed",
    ]
    assert events[3]["item"]["kind"] == "tool_result"
    assert events[5]["item"]["kind"] == "artifact"
    assert events[6] == {
        "type": "artifact.updated",
        "path": "AGENTS.md",
        "summary": "已同步 AGENTS.md 主产物",
    }

    assert (workspace_root / "AGENTS.md").read_text(encoding="utf-8") == "# Done\n任务已完成\n"
    assert (workspace_root / "CLAUDE.md").is_symlink()
    assert (workspace_root / "GEMINI.md").is_symlink()

    task = client.get(f"/api/tasks/{task_id}").json()
    assert task["agent_doc"] == "# Done\n任务已完成\n"

    thread = thread_store.get_task_agent_thread(task_id)
    assert [item["kind"] for item in thread["messages"]] == ["tool_call", "tool_result", "artifact", "text"]
    assert thread["messages"][2]["content_json"] == {
        "path": "AGENTS.md",
        "summary": "已同步 AGENTS.md 主产物",
    }


def test_runner_executes_task_context_tool_and_reads_target_task_context(tmp_path, monkeypatch):
    app_module, runner, model_adapter, thread_store, home_dir = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "当前任务")
    target_task_id = create_task(client, "目标任务")
    workspace_root = home_dir / "workspace" / target_task_id
    workspace_root.mkdir(parents=True, exist_ok=True)
    (workspace_root / "AGENTS.md").write_text("# 目标任务\n先看这里\n", encoding="utf-8")

    steps = iter(
        [
            {
                "type": "tool_call",
                "toolName": "task_read_context",
                "input": {"taskId": target_task_id},
            },
            {"type": "assistant_text", "content": "我已经读完目标任务上下文。"},
        ]
    )

    async def fake_next_step(provider_id, *, system_messages, history, tool_schemas, tool_transcript):
        return next(steps)

    monkeypatch.setattr(model_adapter, "next_agent_step", fake_next_step)

    run = thread_store.create_agent_run(task_id, "claude", run_id="run-1")
    projected_history = [{"role": "user", "content": "读取目标任务上下文"}]

    async def collect():
        return [
            event
            async for event in runner.run_agent_loop(
                task_id=task_id,
                run_id=run["id"],
                provider_id="claude",
                history=projected_history,
                projected_history=projected_history,
            )
        ]

    import asyncio

    events = asyncio.run(collect())
    assert events[-1] == {"type": "run.completed", "runId": "run-1"}

    thread = thread_store.get_task_agent_thread(task_id)
    assert thread["messages"][0]["content_json"]["toolName"] == "task_read_context"
    assert thread["messages"][1]["content_json"]["output"]["taskId"] == target_task_id
    assert thread["messages"][1]["content_json"]["output"]["content"] == "# 目标任务\n先看这里"
    assert thread["messages"][2]["content_json"]["content"] == "我已经读完目标任务上下文。"


def test_runner_keeps_run_alive_after_recoverable_tool_error(tmp_path, monkeypatch):
    app_module, runner, model_adapter, thread_store, _ = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "工具误用后继续对话")

    call_count = 0

    async def fake_next_step(provider_id, *, system_messages, history, tool_schemas, tool_transcript):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return {
                "type": "tool_call",
                "toolName": "task_read_context",
                "input": {"taskId": "current"},
            }

        assert tool_transcript == [
            {"type": "tool_call", "toolName": "task_read_context", "input": {"taskId": "current"}},
            {
                "type": "tool_result",
                "toolName": "task_read_context",
                "output": {"ok": False, "error": "task_id is invalid"},
            },
        ]
        return {"type": "assistant_text", "content": "先确认下报错出现在哪个环境，以及是否能稳定复现。"}

    monkeypatch.setattr(model_adapter, "next_agent_step", fake_next_step)

    run = thread_store.create_agent_run(task_id, "claude", run_id="run-1")
    projected_history = [{"role": "user", "content": "先帮我排查这个问题"}]

    async def collect():
        return [
            event
            async for event in runner.run_agent_loop(
                task_id=task_id,
                run_id=run["id"],
                provider_id="claude",
                history=projected_history,
                projected_history=projected_history,
            )
        ]

    import asyncio

    events = asyncio.run(collect())
    assert events[-1] == {"type": "run.completed", "runId": "run-1"}
    assert all(event["type"] != "run.failed" for event in events)

    thread = thread_store.get_task_agent_thread(task_id)
    assert [item["kind"] for item in thread["messages"]] == ["tool_call", "tool_result", "text"]
    assert thread["messages"][1]["status"] == "failed"
    assert thread["messages"][1]["content_json"] == {
        "toolName": "task_read_context",
        "output": {"ok": False, "error": "task_id is invalid"},
    }
    assert thread["messages"][2]["content_json"]["content"] == "先确认下报错出现在哪个环境，以及是否能稳定复现。"

    history = json.loads(client.get(f"/api/tasks/{task_id}").json()["chat_messages"])
    assert history[-1] == {"role": "assistant", "content": "先确认下报错出现在哪个环境，以及是否能稳定复现。"}


def test_model_adapter_prompt_prefers_first_turn_clarification(tmp_path, monkeypatch):
    _, _, model_adapter, _, _ = load_modules(tmp_path, monkeypatch)
    captured: dict[str, object] = {}

    async def fake_chat_complete(messages, provider_id):
        captured["messages"] = messages
        captured["provider_id"] = provider_id
        return '{"assistant_text":"先说下当前掌握的信息。","tool_calls":[]}'

    async def fake_execute(_task_id, _input_data):
        return {}

    monkeypatch.setattr(model_adapter, "chat_complete", fake_chat_complete)

    tool = model_adapter.AgentTool(
        name="workspace_list",
        description="列出 workspace",
        input_schema={},
        execute=fake_execute,
    )

    import asyncio

    response = asyncio.run(
        model_adapter.complete_agent_turn(
            "claude",
            [{"role": "user", "content": "帮我看下这个任务"}],
            [tool],
        )
    )

    assert response.assistant_text == "先说下当前掌握的信息。"
    prompt_messages = captured["messages"]
    assert isinstance(prompt_messages, list)
    system_prompt = str(prompt_messages[-1]["content"])
    assert "首轮对话默认先通过 assistant_text 与用户沟通" in system_prompt
    assert "不要为了“先了解情况”就读取当前 workspace" in system_prompt
    assert "不要把 current、当前任务、空字符串之类的值当作 taskId" in system_prompt


def test_model_adapter_parses_minimax_tool_call_markup(tmp_path, monkeypatch):
    _, _, model_adapter, _, _ = load_modules(tmp_path, monkeypatch)

    parsed = model_adapter.parse_agent_model_response(
        """我理解任务：在 APM 监控系统前端增加 Python 应用的可视化支持。

在深入之前，我需要先了解几个关键信息：
<minimax:tool_call>
  <invoke name="workspace_list">
    <parameter name="path">.</parameter>
  </invoke>
  <invoke name="terminal_snapshot">
    <parameter name="maxChars">2000</parameter>
  </invoke>
</minimax:tool_call>"""
    )

    assert parsed.structured is True
    assert parsed.assistant_text.startswith("我理解任务")
    assert [
        {"toolName": item.tool_name, "input": item.input_data}
        for item in parsed.tool_calls
    ] == [
        {"toolName": "workspace_list", "input": {"path": "."}},
        {"toolName": "terminal_snapshot", "input": {"maxChars": 2000}},
    ]


def test_model_adapter_parses_top_level_single_tool_call_json(tmp_path, monkeypatch):
    _, _, model_adapter, _, _ = load_modules(tmp_path, monkeypatch)

    parsed = model_adapter.parse_agent_model_response(
        '{"toolName":"workspace_list","input":{"path":"."}}'
    )

    assert parsed.structured is True
    assert parsed.assistant_text == ""
    assert [
        {"toolName": item.tool_name, "input": item.input_data}
        for item in parsed.tool_calls
    ] == [
        {"toolName": "workspace_list", "input": {"path": "."}},
    ]


def test_model_adapter_parses_multiple_line_tool_call_json_objects(tmp_path, monkeypatch):
    _, _, model_adapter, _, _ = load_modules(tmp_path, monkeypatch)

    parsed = model_adapter.parse_agent_model_response(
        """{"toolName":"workspace_read_file","input":{"path":"AGENTS.md"}}
{"toolName":"workspace_read_file","input":{"path":"CLAUDE.md"}}"""
    )

    assert parsed.structured is True
    assert parsed.assistant_text == ""
    assert [
        {"toolName": item.tool_name, "input": item.input_data}
        for item in parsed.tool_calls
    ] == [
        {"toolName": "workspace_read_file", "input": {"path": "AGENTS.md"}},
        {"toolName": "workspace_read_file", "input": {"path": "CLAUDE.md"}},
    ]


def test_model_adapter_parses_and_deduplicates_repeated_json_envelopes_with_tool_calls(tmp_path, monkeypatch):
    _, _, model_adapter, _, _ = load_modules(tmp_path, monkeypatch)

    parsed = model_adapter.parse_agent_model_response(
        """{"assistant_text":"先看下 workspace 当前目录结构。","tool_calls":[{"toolName":"workspace_list","input":{}}]}{"assistant_text":"先看下 workspace 当前目录结构。","tool_calls":[{"toolName":"workspace_list","input":{}}]}"""
    )

    assert parsed.structured is True
    assert parsed.assistant_text == "先看下 workspace 当前目录结构。"
    assert [
        {"toolName": item.tool_name, "input": item.input_data}
        for item in parsed.tool_calls
    ] == [
        {"toolName": "workspace_list", "input": {}},
    ]


def test_model_adapter_parses_top_level_write_file_payload_without_tool_name(tmp_path, monkeypatch):
    _, _, model_adapter, _, _ = load_modules(tmp_path, monkeypatch)

    parsed = model_adapter.parse_agent_model_response(
        '{"path":"docs/plan.md","content":"# Plan\\n- item\\n"}'
    )

    assert parsed.structured is True
    assert parsed.assistant_text == ""
    assert [
        {"toolName": item.tool_name, "input": item.input_data}
        for item in parsed.tool_calls
    ] == [
        {
            "toolName": "workspace_write_file",
            "input": {"path": "docs/plan.md", "content": "# Plan\n- item\n"},
        },
    ]


def test_model_adapter_parses_write_file_payload_with_top_level_tool_and_content(tmp_path, monkeypatch):
    _, _, model_adapter, _, _ = load_modules(tmp_path, monkeypatch)

    parsed = model_adapter.parse_agent_model_response(
        '{"tool":"workspace_write_file","path":"docs/plan.md","content":"hello"}'
    )

    assert parsed.structured is True
    assert parsed.assistant_text == ""
    assert [
        {"toolName": item.tool_name, "input": item.input_data}
        for item in parsed.tool_calls
    ] == [
        {
            "toolName": "workspace_write_file",
            "input": {"path": "docs/plan.md", "content": "hello"},
        },
    ]


def test_runner_executes_multiple_tool_calls_from_single_model_step(tmp_path, monkeypatch):
    app_module, runner, model_adapter, thread_store, home_dir = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "多工具调用")
    workspace_root = home_dir / "workspace" / task_id
    workspace_root.mkdir(parents=True, exist_ok=True)
    (workspace_root / "README.md").write_text("hello\npython\n", encoding="utf-8")

    steps = iter(
        [
            {
                "type": "tool_calls",
                "toolCalls": [
                    {"toolName": "workspace_list", "input": {"path": "."}},
                    {"toolName": "workspace_read_file", "input": {"path": "README.md"}},
                ],
                "assistantText": "先看看目录和 README。",
            },
            {"type": "assistant_text", "content": "我已经读完 README。"},
        ]
    )

    async def fake_next_step(provider_id, *, system_messages, history, tool_schemas, tool_transcript):
        return next(steps)

    monkeypatch.setattr(model_adapter, "next_agent_step", fake_next_step)

    run = thread_store.create_agent_run(task_id, "claude", run_id="run-1")
    projected_history = [{"role": "user", "content": "先看下情况"}]

    async def collect():
        return [
            event
            async for event in runner.run_agent_loop(
                task_id=task_id,
                run_id=run["id"],
                provider_id="claude",
                history=projected_history,
                projected_history=projected_history,
            )
        ]

    import asyncio

    events = asyncio.run(collect())
    assert [event["type"] for event in events] == [
        "message.completed",
        "message.completed",
        "tool.started",
        "message.completed",
        "message.completed",
        "tool.completed",
        "message.completed",
        "tool.started",
        "message.completed",
        "message.completed",
        "tool.completed",
        "message.delta",
        "message.delta",
        "message.completed",
        "run.completed",
    ]

    thread = thread_store.get_task_agent_thread(task_id)
    assert [item["kind"] for item in thread["messages"]] == ["text", "tool_call", "tool_result", "tool_call", "tool_result", "text"]
    assert thread["messages"][1]["content_json"]["toolName"] == "workspace_list"
    assert thread["messages"][3]["content_json"]["toolName"] == "workspace_read_file"
    assert thread["messages"][4]["content_json"]["output"]["content"] == "hello\npython"

    history = json.loads(client.get(f"/api/tasks/{task_id}").json()["chat_messages"])
    assert history[-1] == {"role": "assistant", "content": "我已经读完 README。"}


def test_runner_fails_invalid_multiple_tool_payload_before_persisting_assistant_text(tmp_path, monkeypatch):
    app_module, runner, model_adapter, thread_store, _ = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "非法多工具 payload")

    async def fake_next_step(provider_id, *, system_messages, history, tool_schemas, tool_transcript):
        return {
            "type": "tool_calls",
            "toolCalls": [],
            "assistantText": "这段说明不该被持久化。",
        }

    monkeypatch.setattr(model_adapter, "next_agent_step", fake_next_step)

    run = thread_store.create_agent_run(task_id, "claude", run_id="run-1")
    projected_history = [{"role": "user", "content": "继续"}]

    async def collect():
        return [
            event
            async for event in runner.run_agent_loop(
                task_id=task_id,
                run_id=run["id"],
                provider_id="claude",
                history=projected_history,
                projected_history=projected_history,
            )
        ]

    import asyncio

    events = asyncio.run(collect())
    assert [event["type"] for event in events] == [
        "message.completed",
        "run.failed",
    ]
    assert events[0]["item"]["kind"] == "error"
    assert events[1] == {
        "type": "run.failed",
        "runId": "run-1",
        "error": "tool_calls payload is empty",
    }

    thread = thread_store.get_task_agent_thread(task_id)
    assert [item["kind"] for item in thread["messages"]] == ["error"]

    history = json.loads(client.get(f"/api/tasks/{task_id}").json()["chat_messages"])
    assert history == []


def test_runner_allows_more_than_four_tool_rounds_before_completing(tmp_path, monkeypatch):
    app_module, runner, model_adapter, thread_store, home_dir = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "多轮工具调用")
    workspace_root = home_dir / "workspace" / task_id
    workspace_root.mkdir(parents=True, exist_ok=True)
    (workspace_root / "AGENTS.md").write_text("# Demo\nhello\n", encoding="utf-8")

    steps = iter(
        [
            {"type": "tool_call", "toolName": "workspace_list", "input": {"path": "."}},
            {"type": "tool_call", "toolName": "workspace_read_file", "input": {"path": "AGENTS.md"}},
            {"type": "tool_call", "toolName": "workspace_search_text", "input": {"query": "hello"}},
            {"type": "tool_call", "toolName": "workspace_read_file", "input": {"path": "AGENTS.md", "startLine": 1, "endLine": 1}},
            {"type": "tool_call", "toolName": "workspace_list", "input": {"path": "."}},
            {"type": "assistant_text", "content": "五轮工具调用后完成。"},
        ]
    )

    async def fake_next_step(provider_id, *, system_messages, history, tool_schemas, tool_transcript):
        return next(steps)

    monkeypatch.setattr(model_adapter, "next_agent_step", fake_next_step)

    run = thread_store.create_agent_run(task_id, "claude", run_id="run-1")
    projected_history = [{"role": "user", "content": "多看几轮"}]

    async def collect():
        return [
            event
            async for event in runner.run_agent_loop(
                task_id=task_id,
                run_id=run["id"],
                provider_id="claude",
                history=projected_history,
                projected_history=projected_history,
            )
        ]

    import asyncio

    events = asyncio.run(collect())
    assert events[-1] == {"type": "run.completed", "runId": "run-1"}
    assert all(event["type"] != "run.failed" for event in events)

    history = json.loads(client.get(f"/api/tasks/{task_id}").json()["chat_messages"])
    assert history[-1] == {"role": "assistant", "content": "五轮工具调用后完成。"}
