from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

from .db import db
from .llm import chat_complete
from .memories import get_global_memory_system_messages
from .paths import WORKSPACE_DIR
from .task_claude_md import write_task_claude_md
from .task_helpers import (
    get_default_provider_id,
    parse_session_ids,
    parse_session_names,
    parse_session_providers,
    parse_task_chat_messages,
)
from .time_utils import get_current_date_in_default_time_zone, normalize_stored_utc_datetime

ALLOWED_TRANSITIONS = {"execution": {"done"}, "done": {"execution"}}
TASK_ID_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}-\d+$")
VALID_TYPES = {"feature", "bugfix", "investigation", "exploration", "refactor", "learning"}


def error_message(err: Exception | object) -> str:
    return str(err)


def validate_transition(from_status: str, to_status: str) -> bool:
    return to_status in ALLOWED_TRANSITIONS.get(from_status, set())


def normalize_task_status(status: Any) -> str:
    return "done" if status == "done" else "execution"


def parse_status_log(raw: str | None) -> list[dict[str, str]]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return []
    return parsed if isinstance(parsed, list) else []


def append_status_log(existing_log: str | None, entry: dict[str, str]) -> str:
    log = parse_status_log(existing_log)
    log.append({**entry, "at": datetime.now(tz=timezone.utc).isoformat().replace("+00:00", "Z")})
    return json.dumps(log, ensure_ascii=False)


def is_valid_task_id(task_id: str) -> bool:
    return bool(TASK_ID_PATTERN.fullmatch(task_id))


def get_task_by_id(task_id: str) -> dict[str, Any] | None:
    return db.query_one("SELECT * FROM tasks WHERE id = ?", (task_id,))


def get_task_stats_summary() -> dict[str, int]:
    row = db.query_one(
        """
        SELECT
          SUM(CASE WHEN status != 'done' THEN 1 ELSE 0 END) AS active,
          SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
          SUM(CASE WHEN status != 'done' AND priority <= 1 THEN 1 ELSE 0 END) AS high_priority,
          COUNT(*) AS all_count
        FROM tasks
        """
    ) or {}
    return {
        "active": int(row.get("active") or 0),
        "done": int(row.get("done") or 0),
        "high_priority": int(row.get("high_priority") or 0),
        "all": int(row.get("all_count") or 0),
    }


def to_task_response(task: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": task["id"],
        "title": task["title"],
        "type": task["type"],
        "status": task["status"],
        "context": task.get("context"),
        "agent_doc": task.get("agent_doc"),
        "chat_messages": task.get("chat_messages"),
        "session_ids": task.get("session_ids"),
        "session_names": task.get("session_names"),
        "session_providers": task.get("session_providers"),
        "priority": task.get("priority"),
        "due_at": task.get("due_at"),
        "provider_id": task.get("provider_id"),
        "created_at": normalize_stored_utc_datetime(task.get("created_at")) or task.get("created_at"),
        "updated_at": normalize_stored_utc_datetime(task.get("updated_at")) or task.get("updated_at"),
    }


def persist_task_agent_doc(task_id: str, agent_doc: str, *, write_workspace: bool = True) -> None:
    if not isinstance(agent_doc, str):
        raise ValueError("agent_doc must be a string")

    ws_dir = WORKSPACE_DIR / task_id
    ws_dir.mkdir(parents=True, exist_ok=True)
    if write_workspace:
        (ws_dir / "AGENTS.md").write_text(agent_doc, encoding="utf-8")
    write_task_claude_md(ws_dir)
    db.execute(
        "UPDATE tasks SET agent_doc = ?, updated_at = datetime('now') WHERE id = ?",
        (agent_doc, task_id),
    )


def next_task_id() -> str:
    today = get_current_date_in_default_time_zone()
    prefix = f"{today}-"
    pattern = re.compile(rf"^{re.escape(today)}-(\d+)$")
    max_seq = 0

    for row in db.query_all("SELECT id FROM tasks WHERE id LIKE ?", (f"{prefix}%",)):
        matched = pattern.fullmatch(str(row["id"]))
        if matched:
            max_seq = max(max_seq, int(matched.group(1)))

    try:
        WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)
        for entry in WORKSPACE_DIR.iterdir():
            if not entry.is_dir():
                continue
            matched = pattern.fullmatch(entry.name)
            if matched:
                max_seq = max(max_seq, int(matched.group(1)))
    except OSError:
        pass

    return f"{prefix}{max_seq + 1}"


async def parse_task_input(input_text: str, provider_id: str | None = None) -> dict[str, str]:
    prompt = f"""你是一个任务解析助手。用户会用自然语言描述一个开发任务，你需要从中提取结构化信息。

请严格返回以下 JSON 格式（不要包含任何其他文字）：
{{"title": "简洁的任务标题", "type": "任务类型", "context": "任务创建时的初步意图摘要"}}

type 只能是以下之一：feature, bugfix, investigation, exploration, refactor, learning

用户输入：{input_text}"""

    provider = provider_id or get_default_provider_id()
    result = await chat_complete([*get_global_memory_system_messages(), {"role": "user", "content": prompt}], provider)
    start = result.find("{")
    end = result.rfind("}")
    if start < 0 or end <= start:
        raise RuntimeError("AI 解析失败，请重试")
    cleaned = result[start : end + 1].replace("\r", " ").replace("\n", " ").replace("\t", " ")

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise RuntimeError("AI 解析失败，请重试") from exc

    title = parsed.get("title")
    task_type = parsed.get("type")
    if not isinstance(title, str) or not title.strip() or not isinstance(task_type, str) or not task_type.strip():
        raise RuntimeError("AI 解析结果不完整")
    if task_type not in VALID_TYPES:
        task_type = "feature"
    context = parsed.get("context") if isinstance(parsed.get("context"), str) else ""
    return {"title": title, "type": task_type, "context": context}


def extract_agent_doc(raw: str) -> str:
    start = raw.find("---AGENTS---")
    end = raw.find("---END---", start + 1)
    if start < 0 or end < 0:
        raise RuntimeError("AI 输出中缺少 AGENTS 标记，请重试")
    agent_doc = raw[start + len("---AGENTS---") : end].strip()
    if not agent_doc:
        raise RuntimeError("AI 输出的 AGENTS 文档为空，请重试")
    return agent_doc


def build_task_agent_prompt(task: dict[str, Any]) -> str:
    history = parse_task_chat_messages(task.get("chat_messages"))
    transcript = (
        "\n\n".join(f"{'用户' if item['role'] == 'user' else 'AI'}：{item['content']}" for item in history)
        if history
        else "（暂无补充对话，仅使用任务创建时的初步意图）"
    )
    return f"""你是悟道（Wudao）的任务文档生成助手。请基于下面已有信息，只生成一份给 coding agent 使用的 AGENTS.md。

硬性要求：
- 只能使用已知信息，不要假装你读过代码库或检查过文件
- 如果某个技术细节未知，要明确写成“待确认”或“假设”
- AGENTS.md 要足够让 coding agent 直接开始工作，但保持简洁，不要写成长篇说明
- 优先提炼任务意图、目标、约束、待确认项和建议执行方式
- 直接输出文档内容，不要加解释，不要使用代码块包裹整个结果
- 涉及到具体项目，如果你知道的话，要给出完整的路径名称，不要使用模糊的“相关文件”之类的表述

请严格按以下格式输出：
---AGENTS---
# {task['title']}

## 背景
...

# 目标
...

# 约束与待确认项
...

# 建议执行方式
...
---END---

任务标题：{task['title']}
任务类型：{task['type']}
任务状态：{'已完成' if task['status'] == 'done' else '执行中'}
初步意图：{task.get('context') or '无'}

历史对话：
{transcript}"""


async def generate_task_docs(task: dict[str, Any], requested_provider_id: str | None = None) -> dict[str, str]:
    provider_id = requested_provider_id or task.get("provider_id") or get_default_provider_id()
    raw = await chat_complete(
        [*get_global_memory_system_messages(), {"role": "user", "content": build_task_agent_prompt(task)}],
        str(provider_id),
    )
    return {"agentDoc": extract_agent_doc(raw)}


def persist_task_docs(task_id: str, docs: dict[str, str]) -> None:
    persist_task_agent_doc(task_id, docs["agentDoc"])


def _provider_exists(provider_id: str) -> bool:
    row = db.query_one("SELECT 1 AS ok FROM providers WHERE id = ?", (provider_id,))
    return bool(row and row.get("ok") == 1)


def update_task_provider_binding(task_id: str, requested_provider_id: Any, current_provider_id: str | None = None) -> str:
    provider_id = requested_provider_id.strip() if isinstance(requested_provider_id, str) else ""
    if not provider_id or provider_id == current_provider_id or not _provider_exists(provider_id):
        return ""
    db.execute("UPDATE tasks SET provider_id = ?, updated_at = datetime('now') WHERE id = ?", (provider_id, task_id))
    return provider_id


async def generate_and_persist_task_docs(task_id: str, requested_provider_id: str | None = None) -> dict[str, Any]:
    task = get_task_by_id(task_id)
    if not task:
        raise RuntimeError("Task not found")
    provider_id = requested_provider_id.strip() if isinstance(requested_provider_id, str) else ""
    update_task_provider_binding(task_id, provider_id, task.get("provider_id"))
    latest = get_task_by_id(task_id)
    if not latest:
        raise RuntimeError("Task not found")
    docs = await generate_task_docs(latest, provider_id or None)
    persist_task_docs(task_id, docs)
    updated = get_task_by_id(task_id)
    if not updated:
        raise RuntimeError("Task not found")
    return to_task_response(updated)


def merge_task_session_link_data(task: dict[str, Any], input_data: dict[str, Any], provider_available: bool) -> dict[str, Any]:
    raw_session_id = str(input_data["sessionId"]).strip()
    ids = parse_session_ids(task.get("session_ids"))
    names = parse_session_names(task.get("session_names"))
    providers = parse_session_providers(task.get("session_providers"))
    requested_provider_id = input_data.get("providerId").strip() if isinstance(input_data.get("providerId"), str) else ""
    raw_replace_session_ids = input_data.get("replaceSessionIds")
    replace_session_ids = []
    if isinstance(raw_replace_session_ids, list):
        replace_session_ids = [
            item.strip()
            for item in raw_replace_session_ids
            if isinstance(item, str) and item.strip() and item.strip() != raw_session_id
        ]
    changed = False

    if replace_session_ids:
        replace_session_id_set = set(replace_session_ids)
        next_ids = [item for item in ids if item not in replace_session_id_set]
        if next_ids != ids:
            ids = next_ids
            changed = True

        removed_names = [item for item in replace_session_ids if item in names]
        for item in removed_names:
            names.pop(item, None)
        if removed_names:
            changed = True

        removed_providers = [item for item in replace_session_ids if item in providers]
        for item in removed_providers:
            providers.pop(item, None)
        if removed_providers:
            changed = True

    if raw_session_id not in ids:
        ids.append(raw_session_id)
        changed = True

    session_name = input_data.get("sessionName")
    if isinstance(session_name, str):
        normalized = session_name.strip()[:32]
        if normalized:
            if names.get(raw_session_id) != normalized:
                names[raw_session_id] = normalized
                changed = True
        elif raw_session_id in names:
            names.pop(raw_session_id, None)
            changed = True

    if requested_provider_id and provider_available and providers.get(raw_session_id) != requested_provider_id:
        providers[raw_session_id] = requested_provider_id
        changed = True

    return {
        "changed": changed,
        "session_ids": json.dumps(ids, ensure_ascii=False),
        "session_names": json.dumps(names, ensure_ascii=False),
        "session_providers": json.dumps(providers, ensure_ascii=False),
    }


def link_task_session(task_id: str, input_data: dict[str, Any]) -> dict[str, Any] | None:
    task = get_task_by_id(task_id)
    if not task:
        return None
    raw_session_id = str(input_data.get("sessionId") or "").strip()
    if not raw_session_id:
        return to_task_response(task)

    merged = merge_task_session_link_data(
        task,
        {
            "sessionId": raw_session_id,
            "sessionName": input_data.get("sessionName"),
            "providerId": input_data.get("providerId"),
            "replaceSessionIds": input_data.get("replaceSessionIds"),
        },
        _provider_exists(str(input_data.get("providerId") or "").strip()),
    )
    if merged["changed"]:
        db.execute(
            "UPDATE tasks SET session_ids = ?, session_names = ?, session_providers = ?, updated_at = datetime('now') WHERE id = ?",
            (merged["session_ids"], merged["session_names"], merged["session_providers"], task_id),
        )
    updated = get_task_by_id(task_id)
    return to_task_response(updated) if updated else None
