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


def make_step_streamer(step_func):
    """Wrap an async step function into an async generator for stream_next_agent_step.

    For assistant_text steps, yields the content as a single delta before completing.
    For tool_call steps, yields only the complete event.
    """

    async def streamer(provider_id, *, system_messages, history, tool_schemas, tool_transcript):
        step = await step_func(provider_id, system_messages=system_messages, history=history, tool_schemas=tool_schemas, tool_transcript=tool_transcript)
        if isinstance(step, dict) and step.get("type") == "assistant_text":
            content = step.get("content", "")
            if content:
                yield {"type": "delta", "text": content}
        yield {"type": "complete", "step": step}

    return streamer


def test_runner_executes_readonly_tool_and_persists_timeline(tmp_path, monkeypatch):
    app_module, runner, model_adapter, thread_store, home_dir = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "跑 Agent Runner")
    (home_dir / "workspace" / task_id / "README.md").write_text("# Demo\n", encoding="utf-8")

    steps = iter(
        [
            {"type": "tool_call", "toolName": "workspace_list", "input": {"path": "."}},
            {"type": "assistant_text", "content": "我已经看到了 README。"},
        ]
    )

    async def fake_next_step(provider_id, *, system_messages, history, tool_schemas, tool_transcript):
        return next(steps)

    monkeypatch.setattr(model_adapter, "stream_next_agent_step", make_step_streamer(fake_next_step))

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
    assert thread["messages"][1]["content_json"]["output"]["entries"][0]["name"] == "README.md"
    assert thread["messages"][2]["content_json"]["content"] == "我已经看到了 README。"

    history = json.loads(client.get(f"/api/tasks/{task_id}").json()["chat_messages"])
    assert history == [
        {"role": "user", "content": "看看 workspace"},
        {"role": "assistant", "content": "我已经看到了 README。"},
    ]


def test_runner_persists_sdk_wait_checkpoint_while_runner_is_active(tmp_path, monkeypatch):
    app_module, runner, model_adapter, thread_store, _ = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "Runner checkpoint")

    step_count = 0

    async def fake_next_step(provider_id, *, system_messages, history, tool_schemas, tool_transcript):
        nonlocal step_count
        step_count += 1
        if step_count == 1:
            return {
                "type": "tool_call",
                "toolName": "agent_runner",
                "input": {"prompt": "run tests"},
            }
        return {"type": "assistant_text", "content": "Runner 已完成。"}

    async def fake_execute_agent_tool(task_id, tool_name, input_data, *, agent_run_id=None, provider_id=None, on_started=None):
        assert tool_name == "agent_runner"
        if on_started is not None:
            await on_started(
                {
                    "sdk_run_id": "sdk-run-checkpoint-active",
                    "runner_type": "claude_code",
                    "tool_name": "agent_runner",
                    "status": "running",
                    "message": "Claude Code Runner started and is now running.",
                }
            )
        await release_runner.wait()
        return {
            "ok": True,
            "status": "completed",
            "sdk_run_id": "sdk-run-checkpoint-active",
            "runner_type": "claude_code",
            "tool_name": "invoke_claude_code_runner",
            "cwd": "/tmp/demo",
            "prompt": "run tests",
            "final_text": "All tests passed.",
            "message": "Claude Code Runner completed successfully.",
        }

    monkeypatch.setattr(model_adapter, "stream_next_agent_step", make_step_streamer(fake_next_step))
    monkeypatch.setattr(runner, "execute_agent_tool", fake_execute_agent_tool)

    run = thread_store.create_agent_run(task_id, "claude", run_id="run-checkpoint")
    release_runner = None

    async def collect():
        nonlocal release_runner
        import asyncio

        release_runner = asyncio.Event()
        history = [{"role": "user", "content": "跑测试"}]
        events = []
        stream = runner.run_agent_loop(
            task_id=task_id,
            run_id=run["id"],
            provider_id="claude",
            history=history,
            projected_history=history,
        )

        events.append(await stream.__anext__())
        events.append(await stream.__anext__())
        events.append(await stream.__anext__())

        checkpoint = thread_store.get_agent_run(run["id"])["checkpoint_json"]
        assert checkpoint == {
            "type": "sdk_runner_wait",
            "tool_name": "agent_runner",
            "tool_input": {"prompt": "run tests"},
            "tool_call_message_id": events[0]["item"]["id"],
            "sdk_run_id": "sdk-run-checkpoint-active",
        }

        release_runner.set()
        async for event in stream:
            events.append(event)
        return events

    import asyncio

    events = asyncio.run(collect())

    assert events[2]["type"] == "message.completed"
    assert events[2]["item"]["content_json"]["sdk_run_id"] == "sdk-run-checkpoint-active"
    assert thread_store.get_agent_run(run["id"])["checkpoint_json"] is None


def test_runner_degrades_invalid_model_output_to_plain_text_reply(tmp_path, monkeypatch):
    app_module, runner, model_adapter, thread_store, _ = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "降级为纯文本")

    async def fake_next_step(provider_id, *, system_messages, history, tool_schemas, tool_transcript):
        return {"type": "assistant_text", "content": "这是降级后的纯文本回复。", "degraded": True}

    monkeypatch.setattr(model_adapter, "stream_next_agent_step", make_step_streamer(fake_next_step))

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

    monkeypatch.setattr(model_adapter, "stream_next_agent_step", make_step_streamer(fake_next_step))

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


def test_runner_persists_workspace_write_without_extra_events(tmp_path, monkeypatch):
    app_module, runner, model_adapter, thread_store, home_dir = load_modules(tmp_path, monkeypatch)
    client = TestClient(app_module.app)
    task_id = create_task(client, "写 workspace 文件")
    workspace_root = home_dir / "workspace" / task_id
    workspace_root.mkdir(parents=True, exist_ok=True)

    steps = iter(
        [
            {
                "type": "tool_call",
                "toolName": "workspace_write_file",
                "input": {
                    "path": "notes.md",
                    "content": "# Done\n任务已完成\n",
                },
            },
            {"type": "assistant_text", "content": "文件已更新。"},
        ]
    )

    async def fake_next_step(provider_id, *, system_messages, history, tool_schemas, tool_transcript):
        return next(steps)

    monkeypatch.setattr(model_adapter, "stream_next_agent_step", make_step_streamer(fake_next_step))

    run = thread_store.create_agent_run(task_id, "claude", run_id="run-1")
    projected_history = [{"role": "user", "content": "写入 notes.md"}]

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
        "message.completed",
        "run.completed",
    ]
    assert events[3]["item"]["kind"] == "tool_result"

    assert (workspace_root / "notes.md").read_text(encoding="utf-8") == "# Done\n任务已完成\n"

    thread = thread_store.get_task_agent_thread(task_id)
    assert [item["kind"] for item in thread["messages"]] == ["tool_call", "tool_result", "text"]


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
                "toolName": "removed_context_tool",
                "input": {"taskId": "current"},
            }

        assert tool_transcript == [
            {"type": "tool_call", "toolName": "removed_context_tool", "input": {"taskId": "current"}},
            {
                "type": "tool_result",
                "toolName": "removed_context_tool",
                "output": {"ok": False, "error": "unknown tool: removed_context_tool"},
            },
        ]
        return {"type": "assistant_text", "content": "先确认下报错出现在哪个环境，以及是否能稳定复现。"}

    monkeypatch.setattr(model_adapter, "stream_next_agent_step", make_step_streamer(fake_next_step))

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
        "toolName": "removed_context_tool",
        "output": {"ok": False, "error": "unknown tool: removed_context_tool"},
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
    assert "首轮对话默认先与用户沟通" in system_prompt
    assert '不要为了"先了解情况"就读取当前 workspace' in system_prompt
    assert "removed_context_tool" not in system_prompt


def test_model_adapter_retries_unstructured_tool_protocol_reply(tmp_path, monkeypatch):
    _, _, model_adapter, _, _ = load_modules(tmp_path, monkeypatch)
    captured_messages: list[list[dict[str, str]]] = []
    raw_replies = iter(
        [
            "我会调用工具查看目录。",
            '{"tool_calls":[{"toolName":"workspace_list","input":{"path":"."}}]}',
        ]
    )

    async def fake_chat_complete(messages, provider_id):
        captured_messages.append(messages)
        return next(raw_replies)

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
            "glm",
            [{"role": "user", "content": "查看目录"}],
            [tool],
        )
    )

    assert response.structured is True
    assert [
        {"toolName": item.tool_name, "input": item.input_data}
        for item in response.tool_calls
    ] == [{"toolName": "workspace_list", "input": {"path": "."}}]
    assert len(captured_messages) == 2
    assert captured_messages[1][-2] == {"role": "assistant", "content": "我会调用工具查看目录。"}
    assert "必须把它改写为 JSON 格式并提供 tool_calls" in captured_messages[1][-1]["content"]


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
        """{"toolName":"workspace_read_file","input":{"path":"README.md"}}
{"toolName":"workspace_read_file","input":{"path":"docs/notes.md"}}"""
    )

    assert parsed.structured is True
    assert parsed.assistant_text == ""
    assert [
        {"toolName": item.tool_name, "input": item.input_data}
        for item in parsed.tool_calls
    ] == [
        {"toolName": "workspace_read_file", "input": {"path": "README.md"}},
        {"toolName": "workspace_read_file", "input": {"path": "docs/notes.md"}},
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

    monkeypatch.setattr(model_adapter, "stream_next_agent_step", make_step_streamer(fake_next_step))

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

    monkeypatch.setattr(model_adapter, "stream_next_agent_step", make_step_streamer(fake_next_step))

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
    (workspace_root / "README.md").write_text("# Demo\nhello\n", encoding="utf-8")

    steps = iter(
        [
            {"type": "tool_call", "toolName": "workspace_list", "input": {"path": "."}},
            {"type": "tool_call", "toolName": "workspace_read_file", "input": {"path": "README.md"}},
            {"type": "tool_call", "toolName": "workspace_search_text", "input": {"query": "hello"}},
            {"type": "tool_call", "toolName": "workspace_read_file", "input": {"path": "README.md", "startLine": 1, "endLine": 1}},
            {"type": "tool_call", "toolName": "workspace_list", "input": {"path": "."}},
            {"type": "assistant_text", "content": "五轮工具调用后完成。"},
        ]
    )

    async def fake_next_step(provider_id, *, system_messages, history, tool_schemas, tool_transcript):
        return next(steps)

    monkeypatch.setattr(model_adapter, "stream_next_agent_step", make_step_streamer(fake_next_step))

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
