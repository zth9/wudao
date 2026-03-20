from __future__ import annotations

import os
import sqlite3
import threading
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator

from .logger import logger
from .paths import WUDAO_HOME

DB_PATH = Path(os.environ.get("WUDAO_DB_PATH", str(WUDAO_HOME / "wudao.db"))).expanduser()


@dataclass(frozen=True)
class DefaultProviderSeed:
    id: str
    name: str
    is_default: int
    sort_order: int


DEFAULT_PROVIDERS = [
    DefaultProviderSeed(
        id="claude",
        name="Claude",
        is_default=1,
        sort_order=1,
    ),
    DefaultProviderSeed(
        id="kimi",
        name="Kimi",
        is_default=0,
        sort_order=2,
    ),
    DefaultProviderSeed(
        id="glm",
        name="智谱 GLM",
        is_default=0,
        sort_order=3,
    ),
    DefaultProviderSeed(
        id="minimax",
        name="MiniMax",
        is_default=0,
        sort_order=4,
    ),
    DefaultProviderSeed(
        id="qwen",
        name="通义千问",
        is_default=0,
        sort_order=5,
    ),
    DefaultProviderSeed(
        id="openai",
        name="OpenAI",
        is_default=0,
        sort_order=6,
    ),
    DefaultProviderSeed(
        id="gemini",
        name="Google Gemini",
        is_default=0,
        sort_order=7,
    ),
]


def _row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {key: row[key] for key in row.keys()}


class DatabaseManager:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self._lock = threading.RLock()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(db_path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode = WAL")
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._init_database()

    @contextmanager
    def locked_connection(self) -> Iterator[sqlite3.Connection]:
        with self._lock:
            try:
                yield self._conn
                self._conn.commit()
            except Exception:
                self._conn.rollback()
                raise

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> sqlite3.Cursor:
        with self.locked_connection() as conn:
            return conn.execute(sql, params)

    def executescript(self, sql: str) -> None:
        with self.locked_connection() as conn:
            conn.executescript(sql)

    def query_one(self, sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
        with self._lock:
            cursor = self._conn.execute(sql, params)
            return _row_to_dict(cursor.fetchone())

    def query_all(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        with self._lock:
            cursor = self._conn.execute(sql, params)
            return [_row_to_dict(row) for row in cursor.fetchall() if row is not None]

    def transaction(self, statements: list[tuple[str, tuple[Any, ...]]]) -> None:
        with self.locked_connection() as conn:
            for sql, params in statements:
                conn.execute(sql, params)

    def _table_columns(self, table: str) -> list[str]:
        rows = self.query_all(f"PRAGMA table_info({table})")
        return [str(row["name"]) for row in rows]

    def _table_exists(self, table: str) -> bool:
        row = self.query_one(
            "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?",
            (table,),
        )
        return bool(row and row["ok"] == 1)

    def _ensure_column(self, table: str, column: str, definition: str) -> None:
        if column in self._table_columns(table):
            return
        self.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    def _create_tasks_table(self, table_name: str = "tasks") -> None:
        self.executescript(
            f"""
            CREATE TABLE IF NOT EXISTS {table_name} (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              type TEXT NOT NULL CHECK (type IN ('feature','bugfix','investigation','exploration','refactor','learning')),
              status TEXT NOT NULL DEFAULT 'execution' CHECK (status IN ('execution','done')),
              context TEXT,
              agent_doc TEXT,
              chat_messages TEXT NOT NULL DEFAULT '[]',
              status_log TEXT NOT NULL DEFAULT '[]',
              session_ids TEXT NOT NULL DEFAULT '[]',
              session_names TEXT NOT NULL DEFAULT '{{}}',
              session_providers TEXT NOT NULL DEFAULT '{{}}',
              priority INTEGER NOT NULL DEFAULT 2 CHECK (priority BETWEEN 0 AND 4),
              due_at TEXT,
              provider_id TEXT,
              created_at TEXT DEFAULT (datetime('now')),
              updated_at TEXT DEFAULT (datetime('now'))
            );
            """
        )

    def _create_task_agent_runtime_tables(self) -> None:
        self.executescript(
            """
            CREATE TABLE IF NOT EXISTS task_agent_runs (
              id TEXT PRIMARY KEY,
              task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
              provider_id TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'running'
                CHECK (status IN ('running','waiting_approval','completed','failed','cancelled')),
              checkpoint_json TEXT,
              last_error TEXT,
              created_at TEXT DEFAULT (datetime('now')),
              updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS task_agent_messages (
              id TEXT PRIMARY KEY,
              task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
              run_id TEXT NOT NULL REFERENCES task_agent_runs(id) ON DELETE CASCADE,
              seq INTEGER NOT NULL,
              role TEXT NOT NULL CHECK (role IN ('system','user','assistant','tool')),
              kind TEXT NOT NULL CHECK (kind IN ('text','tool_call','tool_result','approval','artifact','error')),
              status TEXT NOT NULL DEFAULT 'completed'
                CHECK (status IN ('streaming','completed','failed','waiting_approval')),
              content_json TEXT NOT NULL DEFAULT '{}',
              created_at TEXT DEFAULT (datetime('now')),
              updated_at TEXT DEFAULT (datetime('now')),
              UNIQUE (task_id, seq)
            );

            CREATE INDEX IF NOT EXISTS idx_task_agent_runs_task_created
              ON task_agent_runs(task_id ASC, created_at ASC, id ASC);
            CREATE INDEX IF NOT EXISTS idx_task_agent_messages_task_seq
              ON task_agent_messages(task_id ASC, seq ASC, id ASC);
            CREATE INDEX IF NOT EXISTS idx_task_agent_messages_run_seq
              ON task_agent_messages(run_id ASC, seq ASC, id ASC);
            """
        )

    def _migrate_tasks_table(self) -> None:
        if not self._table_exists("tasks"):
            self._create_tasks_table()
            return

        columns = set(self._table_columns("tasks"))
        latest_columns = {
            "id",
            "title",
            "type",
            "status",
            "context",
            "agent_doc",
            "chat_messages",
            "status_log",
            "session_ids",
            "session_names",
            "session_providers",
            "priority",
            "due_at",
            "provider_id",
            "created_at",
            "updated_at",
        }
        legacy_columns = {"plan", "summary", "plan_messages", "stage_log", "urgency"}
        already_latest = latest_columns.issubset(columns) and legacy_columns.isdisjoint(columns)
        if already_latest:
            return

        source_chat_messages = (
            "COALESCE(chat_messages, '[]')"
            if "chat_messages" in columns
            else "COALESCE(plan_messages, '[]')"
            if "plan_messages" in columns
            else "'[]'"
        )
        source_status_log = (
            "COALESCE(status_log, '[]')"
            if "status_log" in columns
            else "COALESCE(stage_log, '[]')"
            if "stage_log" in columns
            else "'[]'"
        )
        source_session_ids = "COALESCE(session_ids, '[]')" if "session_ids" in columns else "'[]'"
        source_session_names = "COALESCE(session_names, '{}')" if "session_names" in columns else "'{}'"
        source_session_providers = (
            "COALESCE(session_providers, '{}')" if "session_providers" in columns else "'{}'"
        )
        source_priority = (
            "CASE WHEN urgency >= 2 THEN 0 WHEN priority >= 3 THEN 1 WHEN priority >= 2 THEN 2 WHEN priority >= 1 THEN 3 ELSE 4 END"
            if "priority" in columns and "urgency" in columns
            else "CASE WHEN priority >= 3 THEN 1 WHEN priority >= 2 THEN 2 WHEN priority >= 1 THEN 3 ELSE 4 END"
            if "priority" in columns
            else "2"
        )
        source_due_at = "due_at" if "due_at" in columns else "NULL"
        source_provider_id = "provider_id" if "provider_id" in columns else "NULL"
        source_created_at = "created_at" if "created_at" in columns else "datetime('now')"
        source_updated_at = "updated_at" if "updated_at" in columns else "datetime('now')"
        source_agent_doc = "agent_doc" if "agent_doc" in columns else "NULL"
        source_context = "context" if "context" in columns else "NULL"

        self.executescript(
            f"""
            ALTER TABLE tasks RENAME TO tasks_legacy_migration;
            CREATE TABLE tasks (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              type TEXT NOT NULL CHECK (type IN ('feature','bugfix','investigation','exploration','refactor','learning')),
              status TEXT NOT NULL DEFAULT 'execution' CHECK (status IN ('execution','done')),
              context TEXT,
              agent_doc TEXT,
              chat_messages TEXT NOT NULL DEFAULT '[]',
              status_log TEXT NOT NULL DEFAULT '[]',
              session_ids TEXT NOT NULL DEFAULT '[]',
              session_names TEXT NOT NULL DEFAULT '{{}}',
              session_providers TEXT NOT NULL DEFAULT '{{}}',
              priority INTEGER NOT NULL DEFAULT 2 CHECK (priority BETWEEN 0 AND 4),
              due_at TEXT,
              provider_id TEXT,
              created_at TEXT DEFAULT (datetime('now')),
              updated_at TEXT DEFAULT (datetime('now'))
            );
            INSERT INTO tasks (
              id, title, type, status, context, agent_doc, chat_messages, status_log,
              session_ids, session_names, session_providers, priority, due_at,
              provider_id, created_at, updated_at
            )
            SELECT
              id,
              title,
              type,
              CASE WHEN status = 'done' THEN 'done' ELSE 'execution' END,
              {source_context},
              {source_agent_doc},
              {source_chat_messages},
              {source_status_log},
              {source_session_ids},
              {source_session_names},
              {source_session_providers},
              {source_priority},
              {source_due_at},
              {source_provider_id},
              {source_created_at},
              {source_updated_at}
            FROM tasks_legacy_migration;
            DROP TABLE tasks_legacy_migration;
            """
        )

    def _backfill_provider_sort_order(self) -> None:
        missing_rows = self.query_all(
            "SELECT id FROM providers WHERE sort_order IS NULL OR sort_order <= 0 ORDER BY created_at ASC, id ASC"
        )
        if not missing_rows:
            return

        max_row = self.query_one("SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM providers")
        next_order = int(max_row["max_order"] if max_row else 0)
        for row in missing_rows:
            next_order += 1
            self.execute("UPDATE providers SET sort_order = ? WHERE id = ?", (next_order, row["id"]))

    def _normalize_default_provider(self) -> None:
        default_rows = self.query_all(
            "SELECT id FROM providers WHERE is_default = 1 ORDER BY sort_order ASC, created_at ASC, id ASC"
        )
        default_ids = [str(row["id"]) for row in default_rows if isinstance(row.get("id"), str)]

        keep_id: str | None = None
        if not default_ids:
            preferred = self.query_one("SELECT id FROM providers WHERE id = 'claude'")
            if preferred and isinstance(preferred.get("id"), str):
                keep_id = str(preferred["id"])
            else:
                first_provider = self.query_one(
                    "SELECT id FROM providers ORDER BY sort_order ASC, created_at ASC, id ASC LIMIT 1"
                )
                keep_id = (
                    str(first_provider["id"])
                    if first_provider and isinstance(first_provider.get("id"), str)
                    else None
                )
        elif len(default_ids) > 1:
            non_claude_defaults = [provider_id for provider_id in default_ids if provider_id != "claude"]
            keep_id = non_claude_defaults[0] if "claude" in default_ids and non_claude_defaults else default_ids[0]

        if not keep_id:
            return

        self.execute(
            "UPDATE providers SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END",
            (keep_id,),
        )

    def _init_database(self) -> None:
        self.executescript(
            """
            CREATE TABLE IF NOT EXISTS providers (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              endpoint TEXT NOT NULL,
              api_key TEXT,
              usage_auth_token TEXT,
              usage_cookie TEXT,
              model TEXT NOT NULL,
              is_default INTEGER DEFAULT 0,
              sort_order INTEGER DEFAULT 0,
              created_at TEXT DEFAULT (datetime('now'))
            );
            """
        )

        self._ensure_column("providers", "usage_auth_token", "TEXT")
        self._ensure_column("providers", "usage_cookie", "TEXT")
        self._ensure_column("providers", "sort_order", "INTEGER DEFAULT 0")

        self._migrate_tasks_table()
        self._create_task_agent_runtime_tables()

        self.execute("UPDATE tasks SET status = 'execution' WHERE status IS NULL OR status != 'done'")
        self.execute("UPDATE tasks SET priority = 2 WHERE priority IS NULL")
        self.execute("UPDATE tasks SET chat_messages = '[]' WHERE chat_messages IS NULL")
        self.execute("UPDATE tasks SET status_log = '[]' WHERE status_log IS NULL")
        self.execute("UPDATE tasks SET session_ids = '[]' WHERE session_ids IS NULL")
        self.execute("UPDATE tasks SET session_names = '{}' WHERE session_names IS NULL")
        self.execute("UPDATE tasks SET session_providers = '{}' WHERE session_providers IS NULL")

        self._backfill_provider_sort_order()

        self.executescript(
            """
            CREATE INDEX IF NOT EXISTS idx_tasks_priority_updated ON tasks(priority ASC, updated_at DESC, id DESC);
            CREATE INDEX IF NOT EXISTS idx_tasks_due_at_updated ON tasks(due_at ASC, updated_at DESC, id DESC);
            """
        )

        inserted_count = 0
        next_sort_row = self.query_one("SELECT COALESCE(MAX(sort_order), 0) + 1 AS v FROM providers")
        next_sort_order = int(next_sort_row["v"] if next_sort_row else 1)

        for provider in DEFAULT_PROVIDERS:
            exists = self.query_one("SELECT 1 AS ok FROM providers WHERE id = ?", (provider.id,))
            if exists:
                continue

            self.execute(
                """
                INSERT INTO providers (id, name, endpoint, model, is_default, sort_order)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    provider.id,
                    provider.name,
                    "",
                    "",
                    provider.is_default,
                    max(provider.sort_order, next_sort_order),
                ),
            )
            next_sort_order += 1
            inserted_count += 1

        if inserted_count > 0:
            logger.info("Seeded %s default provider(s)", inserted_count)

        self.execute("UPDATE providers SET name = 'Claude' WHERE id = 'claude' AND name = 'Claude 原生'")
        self._normalize_default_provider()


db = DatabaseManager(DB_PATH)
