from __future__ import annotations

import asyncio
import importlib
import json
import sys


def load_task_service(tmp_path, monkeypatch):
    home_dir = tmp_path / "home"
    db_path = tmp_path / "wudao.db"
    monkeypatch.setenv("WUDAO_HOME", str(home_dir))
    monkeypatch.setenv("WUDAO_DB_PATH", str(db_path))

    for name in list(sys.modules):
        if name.startswith("src"):
            sys.modules.pop(name, None)

    return importlib.import_module("src.task_service")


def test_generate_task_docs_includes_global_memory_system_messages(tmp_path, monkeypatch):
    module = load_task_service(tmp_path, monkeypatch)
    captured: dict[str, object] = {}

    async def fake_chat_complete(messages, provider_id):
        captured["messages"] = messages
        captured["provider_id"] = provider_id
        return "---AGENTS---\n# 已生成\n---END---"

    monkeypatch.setattr(
        module,
        "get_global_memory_system_messages",
        lambda: [
            {"role": "system", "content": "[用户记忆]\n偏好先补测试"},
            {"role": "system", "content": "[Wudao Agent 全局记忆]\n默认先读文档"},
        ],
    )
    monkeypatch.setattr(module, "chat_complete", fake_chat_complete)

    result = asyncio.run(
        module.generate_task_docs(
            {
                "title": "生成任务文档",
                "type": "feature",
                "status": "execution",
                "context": "补齐 AGENTS 生成上下文",
                "chat_messages": json.dumps(
                    [
                        {"role": "user", "content": "需要把记忆也带进去"},
                        {"role": "assistant", "content": "我会先确认当前链路。"},
                    ],
                    ensure_ascii=False,
                ),
            },
            "claude",
        )
    )

    assert result == {"agentDoc": "# 已生成"}
    assert captured["provider_id"] == "claude"
    assert captured["messages"] == [
        {"role": "system", "content": "[用户记忆]\n偏好先补测试"},
        {"role": "system", "content": "[Wudao Agent 全局记忆]\n默认先读文档"},
        {
            "role": "user",
            "content": module.build_task_agent_prompt(
                {
                    "title": "生成任务文档",
                    "type": "feature",
                    "status": "execution",
                    "context": "补齐 AGENTS 生成上下文",
                    "chat_messages": json.dumps(
                        [
                            {"role": "user", "content": "需要把记忆也带进去"},
                            {"role": "assistant", "content": "我会先确认当前链路。"},
                        ],
                        ensure_ascii=False,
                    ),
                }
            ),
        },
    ]
