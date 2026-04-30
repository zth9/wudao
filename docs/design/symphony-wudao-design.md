# Symphony × Wudao 集成设计方案

> 状态：Draft v1
> 目标：将 Symphony SPEC 的自动化调度能力适配到 wudao 现有架构中，形成 wudao 内置的 Symphony 模块。

## 1. 核心映射关系

Symphony SPEC 定义的是一个**独立守护进程**，而 wudao 是一个**已有完整任务闭环的 Web 应用**。适配的关键是把 Symphony 的概念映射到 wudao 已有的概念上：

| Symphony SPEC | Wudao 对应物 | 备注 |
|---|---|---|
| Issue | Task（扩展字段） | 新增 `source`/`external_id`/`external_identifier`/`external_url` |
| Per-issue workspace | `~/.wudao/workspace/<taskId>/` | 复用现有 workspace 机制 |
| Coding Agent (Codex) | Agent Runtime + SDK Runner | 以 Claude Code SDK Runner 为主，Codex CLI 通过终端兼容 |
| WORKFLOW.md | `~/.wudao/symphony/workflows/<name>.md` | 放在 wudao home 下，支持 UI 配置 |
| Orchestrator poll loop | FastAPI 后台 asyncio.Task | 随服务启动，可开关 |
| Tracker Client | 新建 `symphony/tracker.py` | 先只实现 Linear GraphQL |
| Retry queue | 内存 + symphony_runs 表 | 与 task_agent_runs 同级持久化 |
| Observability | 结构化日志 + SSE 推送 + Dashboard 卡片 | 复用现有 SSE 机制 |
| Status Surface | Dashboard Symphony 卡片 + 任务列表来源徽章 | 复用现有前端 |

## 2. 数据模型变更

### 2.1 扩展 tasks 表

```sql
-- 新增字段（ALTER TABLE 迁移）
ALTER TABLE tasks ADD COLUMN source TEXT NOT NULL DEFAULT 'local'
  CHECK (source IN ('local', 'linear'));
ALTER TABLE tasks ADD COLUMN external_id TEXT;            -- Linear issue ID
ALTER TABLE tasks ADD COLUMN external_identifier TEXT;    -- MT-649 一类人类可读 key
ALTER TABLE tasks ADD COLUMN external_url TEXT;           -- Linear issue URL
ALTER TABLE tasks ADD COLUMN external_labels TEXT;        -- JSON array, lowercase labels
ALTER TABLE tasks ADD COLUMN external_blocked_by TEXT;    -- JSON array of blocker refs
ALTER TABLE tasks ADD COLUMN external_priority INTEGER;   -- 原始 Linear priority
ALTER TABLE tasks ADD COLUMN external_metadata TEXT;      -- JSON, 预留扩展

-- 索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_external_id
  ON tasks(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_source ON tasks(source);
```

### 2.2 新增 symphony_workflows 表

```sql
CREATE TABLE symphony_workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,            -- WORKFLOW.md 绝对路径
  enabled INTEGER NOT NULL DEFAULT 1,
  config_cache TEXT,                  -- 最近一次解析的 config JSON
  prompt_cache TEXT,                  -- 最近一次解析的 prompt_template
  last_error TEXT,                    -- 最近一次加载/验证错误
  last_loaded_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### 2.3 新增 symphony_runs 表

```sql
CREATE TABLE symphony_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES symphony_workflows(id),
  task_id TEXT NOT NULL REFERENCES tasks(id),
  issue_id TEXT NOT NULL,             -- Linear issue ID
  issue_identifier TEXT NOT NULL,     -- MT-649
  attempt INTEGER,                    -- null=首次, >=1=重试/续作
  status TEXT NOT NULL DEFAULT 'preparing'
    CHECK (status IN (
      'preparing', 'building_prompt', 'launching',
      'streaming', 'finishing', 'succeeded',
      'failed', 'timed_out', 'stalled', 'cancelled'
    )),
  agent_run_id TEXT,                  -- 关联 task_agent_runs.id
  sdk_run_id TEXT,                    -- 关联 task_sdk_runs.id
  error TEXT,
  started_at TEXT DEFAULT (datetime('now')),
  finished_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_symphony_runs_workflow ON symphony_runs(workflow_id);
CREATE INDEX idx_symphony_runs_issue ON symphony_runs(issue_id);
CREATE INDEX idx_symphony_runs_status ON symphony_runs(status);
```

### 2.4 新增 symphony_tracker_state 表（可选，用于缓存）

```sql
CREATE TABLE symphony_tracker_state (
  workflow_id TEXT NOT NULL REFERENCES symphony_workflows(id),
  issue_id TEXT NOT NULL,
  issue_identifier TEXT NOT NULL,
  tracker_state TEXT NOT NULL,        -- Linear 侧当前 state
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (workflow_id, issue_id)
);
```

## 3. 后端模块设计

### 3.1 模块结构

```
packages/server/src/symphony/
├── __init__.py
├── orchestrator.py      # 核心调度循环 + 状态机
├── workflow.py           # WORKFLOW.md 解析 + $VAR 解析 + 验证
├── tracker.py            # Linear GraphQL 客户端
├── workspace.py          # workspace 创建/复用/清理 + hooks 执行
├── prompt.py             # Liquid 模板渲染 (issue + attempt)
├── conductor.py          # Worker 执行：workspace → prompt → agent run
├── models.py             # 数据类：Issue, RunAttempt, OrchestratorState
├── routes.py             # REST/SSE 路由注册
└── store.py              # symphony_workflows / symphony_runs 的 CRUD
```

### 3.2 Workflow Loader（workflow.py）

```python
@dataclass
class WorkflowConfig:
    # tracker
    tracker_kind: str                      # "linear"
    tracker_endpoint: str                  # 默认 https://api.linear.app/graphql
    tracker_api_key: str                   # 解析 $VAR 后的实际值
    tracker_project_slug: str
    active_states: list[str]               # ["Todo", "In Progress"]
    terminal_states: list[str]             # ["Closed", "Cancelled", ...]
    # polling
    poll_interval_ms: int                  # 默认 30000
    # workspace
    workspace_root: str                    # 解析后绝对路径
    # hooks
    after_create: str | None
    before_run: str | None
    after_run: str | None
    before_remove: str | None
    hooks_timeout_ms: int                  # 默认 60000
    # agent
    max_concurrent_agents: int             # 默认 10
    max_turns: int                         # 默认 20
    max_retry_backoff_ms: int              # 默认 300000
    max_concurrent_agents_by_state: dict[str, int]
    # agent runner type
    agent_runner_type: str                 # "claude_code" | "codex_cli"，默认 "claude_code"
    agent_runner_command: str | None       # 仅 codex_cli 时使用
    agent_turn_timeout_ms: int             # 默认 3600000
    agent_stall_timeout_ms: int            # 默认 300000
    # server (可选 HTTP 扩展)
    server_port: int | None
    # raw
    prompt_template: str

def load_workflow(file_path: str) -> tuple[WorkflowConfig | None, str | None]:
    """解析 WORKFLOW.md，返回 (config, error)"""

def reload_if_changed(file_path: str, last_mtime: float) -> tuple[WorkflowConfig | None, str | None, float]:
    """文件变更时重新加载，返回 (config, error, new_mtime)"""

def resolve_env_var(value: str) -> str:
    """$VAR_NAME → os.environ.get('VAR_NAME', '')"""
```

**WORKFLOW.md 格式**（完全兼容 Symphony SPEC §5）：

```yaml
---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: my-project
  active_states: [Todo, In Progress]
  terminal_states: [Closed, Cancelled, Canceled, Duplicate, Done]
polling:
  interval_ms: 30000
workspace:
  root: ~/.wudao/symphony_workspaces
hooks:
  after_create: |
    git clone git@github.com:org/repo.git .
  before_run: |
    git pull origin main
agent:
  max_concurrent_agents: 3
  max_turns: 20
  runner_type: claude_code
---

You are a coding agent working on issue {{ issue.identifier }}: {{ issue.title }}.

## Issue Description
{{ issue.description }}

## Labels
{% for label in issue.labels %}- {{ label }}
{% endfor %}

{% if issue.blocked_by.size > 0 %}
## Blocked By
{% for blocker in issue.blocked_by %}
- {{ blocker.identifier }} (state: {{ blocker.state }})
{% endfor %}
{% endif %}

{% if attempt %}
This is retry attempt #{{ attempt }}. Please review the current state and continue.
{% endif %}
```

### 3.3 Tracker Client（tracker.py）

```python
@dataclass
class TrackerIssue:
    id: str
    identifier: str
    title: str
    description: str | None
    priority: int | None
    state: str
    branch_name: str | None
    url: str | None
    labels: list[str]
    blocked_by: list[BlockerRef]
    created_at: str | None
    updated_at: str | None

@dataclass
class BlockerRef:
    id: str | None
    identifier: str | None
    state: str | None

class LinearTrackerClient:
    def __init__(self, endpoint: str, api_key: str, project_slug: str): ...

    async def fetch_candidate_issues(self) -> list[TrackerIssue]:
        """获取 active_states 中的候选 issues"""

    async def fetch_issues_by_states(self, states: list[str]) -> list[TrackerIssue]:
        """获取指定状态的 issues（启动清理用）"""

    async def fetch_issue_states_by_ids(self, ids: list[str]) -> list[TrackerIssue]:
        """按 ID 刷新 issue 状态（对账用）"""
```

实现要点：
- 使用 `httpx.AsyncClient` 发 GraphQL 请求
- 分页默认 50 条
- 网络超时 30000ms
- 错误映射：`linear_api_request` / `linear_api_status` / `linear_graphql_errors` / `linear_unknown_payload`

### 3.4 Orchestrator（orchestrator.py）

这是核心，完全遵循 Symphony SPEC §7-8 的状态机设计，但适配到 wudao 的 asyncio 运行时。

```python
class Orchestrator:
    """Symphony 调度器，随 FastAPI 启动，可开关"""

    def __init__(self, workflow_id: str, config: WorkflowConfig): ...

    # 生命周期
    async def start(self) -> None:
        """启动 poll loop"""
    async def stop(self) -> None:
        """优雅停止：取消 poll timer、终止 running workers"""

    # Tick 循环（SPEC §8.1）
    async def _tick(self) -> None:
        """reconcile → validate → fetch → sort → dispatch → notify"""

    # 调度核心（SPEC §8.2-8.3）
    def _is_eligible(self, issue: TrackerIssue) -> bool:
    def _available_slots(self) -> int:
    def _sort_for_dispatch(self, issues: list[TrackerIssue]) -> list[TrackerIssue]:

    # Worker 管理
    async def _dispatch_issue(self, issue: TrackerIssue, attempt: int | None) -> None:
    async def _on_worker_exit(self, issue_id: str, reason: str) -> None:

    # 对账（SPEC §8.5）
    async def _reconcile_running(self) -> None:
    async def _reconcile_stalled(self) -> None:
    async def _terminate_running(self, issue_id: str, *, cleanup_workspace: bool) -> None:

    # 重试（SPEC §8.4）
    def _schedule_retry(self, issue_id: str, attempt: int, *,
                        delay_type: str = "error", error: str | None = None) -> None:
    async def _on_retry_timer(self, issue_id: str) -> None:

    # 启动清理（SPEC §8.6）
    async def _startup_cleanup(self) -> None:

    # 配置热重载（SPEC §6.2）
    async def reload_config(self, config: WorkflowConfig) -> None:

    # 状态快照
    def get_state_snapshot(self) -> OrchestratorSnapshot
```

**内存状态模型**（对应 SPEC §4.1.8）：

```python
@dataclass
class OrchestratorState:
    poll_interval_ms: int
    max_concurrent_agents: int
    running: dict[str, RunningEntry]       # issue_id -> entry
    claimed: set[str]                       # issue_ids
    retry_attempts: dict[str, RetryEntry]   # issue_id -> entry
    completed: set[str]                     # issue_ids, bookkeeping only
    token_totals: TokenTotals

@dataclass
class RunningEntry:
    task_id: str
    issue: TrackerIssue
    identifier: str
    attempt: int | None
    session_id: str | None
    agent_run_id: str | None
    sdk_run_id: str | None
    started_at: datetime
    last_event_at: datetime | None
    last_event: str | None
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0

@dataclass
class RetryEntry:
    issue_id: str
    identifier: str
    attempt: int
    due_at_ms: int              # monotonic clock
    timer_handle: asyncio.TimerHandle
    error: str | None
```

### 3.5 Conductor（conductor.py）—— Worker 执行逻辑

Conductor 是 Symphony SPEC §10 中 Agent Runner 的 wudao 实现。它负责一个 issue 的完整执行周期。

```python
async def run_symphony_conductor(
    *,
    issue: TrackerIssue,
    task_id: str,
    attempt: int | None,
    config: WorkflowConfig,
    orchestrator: Orchestrator,
) -> None:
    """
    1. 创建/复用 workspace
    2. 运行 before_run hook
    3. 渲染 prompt
    4. 选择并启动 agent runner
    5. 流式接收事件，回调 orchestrator
    6. 运行 after_run hook
    7. 退出（正常 or 异常，由 orchestrator 决定重试）
    """
```

**Agent Runner 选择策略**：

```python
async def _run_with_claude_code_sdk(
    task_id: str, prompt: str, workspace_path: str, config: WorkflowConfig,
    on_event: Callable[[dict], None],
) -> None:
    """使用现有 sdk_runner 模块，通过 Claude Code SDK 执行"""
    # 复用 sdk_runner.start_sdk_run()
    # 但不需要走 Agent Chat 中间层，直接在 workspace 中执行

async def _run_with_codex_cli(
    task_id: str, prompt: str, workspace_path: str, config: WorkflowConfig,
    on_event: Callable[[dict], None],
) -> None:
    """使用 Codex app-server 协议，通过子进程执行"""
    # 通过 asyncio.create_subprocess_exec 启动 codex app-server
    # JSON line protocol over stdio
```

### 3.6 Issue → Task 映射逻辑

```python
async def ensure_task_for_issue(
    issue: TrackerIssue,
    workflow_id: str,
) -> str:
    """
    如果 task 已存在（按 external_id 匹配），返回 task_id。
    如果不存在，创建新 task：
    - source = 'linear'
    - external_id = issue.id
    - external_identifier = issue.identifier
    - external_url = issue.url
    - title = issue.title
    - type = _infer_type(issue.labels)     # bug→bugfix, feature→feature, ...
    - priority = _map_priority(issue.priority)  # Linear 1→0, 2→1, 3→2, 4→3
    - status = 'execution'
    - context = issue.description
    """
```

### 3.7 路由设计（routes.py）

```python
def register_symphony_routes(app: FastAPI) -> None:

    # === Workflow 管理 ===
    app.get("/api/symphony/workflows")                     # 列表
    app.post("/api/symphony/workflows")                    # 创建
    app.get("/api/symphony/workflows/{id}")                # 详情
    app.put("/api/symphony/workflows/{id}")                # 更新
    app.delete("/api/symphony/workflows/{id}")             # 删除
    app.post("/api/symphony/workflows/{id}/reload")        # 手动重载

    # === Orchestrator 控制 ===
    app.post("/api/symphony/workflows/{id}/start")         # 启动 poll loop
    app.post("/api/symphony/workflows/{id}/stop")          # 停止 poll loop
    app.post("/api/symphony/workflows/{id}/tick")          # 手动触发一轮 tick

    # === 状态查询 ===
    app.get("/api/symphony/workflows/{id}/state")          # 运行时快照
    app.get("/api/symphony/workflows/{id}/runs")           # 历史 runs
    app.get("/api/symphony/workflows/{id}/runs/{run_id}")  # 单个 run 详情

    # === SSE 实时推送 ===
    app.get("/api/symphony/workflows/{id}/events")         # SSE 事件流

    # === Issue 级别 ===
    app.get("/api/symphony/workflows/{id}/issues/{identifier}")  # issue 详情 + run 状态
```

### 3.8 与现有模块的集成点

```
symphony/orchestrator.py
  ├── 调用 symphony/tracker.py（Linear API）
  ├── 调用 symphony/workflow.py（加载配置）
  ├── 调用 symphony/workspace.py（创建 workspace + hooks）
  ├── 调用 symphony/conductor.py（执行 agent run）
  │     ├── 复用 sdk_runner/sdk_runner.py（Claude Code 执行）
  │     └── 或启动 codex app-server 子进程
  ├── 调用 symphony/store.py（持久化 run 记录）
  └── 调用 symphony/routes.py（通过 SSE 推送状态）

symphony/conductor.py
  └── 复用 db.py 的 ensure_task_for_issue()（创建/复用 task）
       └── task 创建后，前端现有 Task List / Task Workspace 自动可见
```

**关键集成原则**：Symphony 创建的 task 与手动创建的 task 在数据模型上完全统一。前端只需根据 `source` 字段区分展示来源标识。

## 4. 前端变更

### 4.1 Dashboard 扩展

新增 Symphony 统计卡片（在现有统计区域下方）：

```tsx
// DashboardView.tsx 中新增
<SymphonyStatsCard workflowId={workflowId} />
```

显示内容：
- 运行中 tasks 数量
- 重试队列数量
- 累计 token 消耗
- 最近一次 tick 时间
- 各 workflow 的运行/停止状态

### 4.2 Task List 来源标识

```tsx
// TaskListView.tsx 中，每个 task card 新增来源徽章
{task.source === 'linear' && (
  <Badge variant="flat" color="primary" size="sm">
    <Link href={task.external_url} target="_blank">
      {task.external_identifier}
    </Link>
  </Badge>
)}
```

### 4.3 Task Workspace 扩展

在任务详情页的 header 区域，当 `task.source === 'linear'` 时：

- 显示 Linear issue 状态（从 tracker 同步）
- 显示"同步外部状态"按钮（触发 `POST /api/symphony/.../tick`）
- 显示 external_identifier 链接

### 4.4 Settings 页新增 Symphony 配置

在现有 Settings 页增加"Symphony"tab：

- Workflow 列表（名称 + 启用状态 + 最后加载时间 + 错误信息）
- 新建/编辑 Workflow：
  - 名称
  - WORKFLOW.md 文件路径
  - Linear API Key（敏感信息）
  - Linear Project Slug
- 启动/停止按钮
- 手动触发 tick 按钮
- 实时状态预览（running/retrying/totals）

### 4.5 新增 Symphony 监控视图（可选）

在主导航中增加"Symphony"入口（当有活跃 workflow 时显示）：

- 全局运行状态面板
- 每个 workflow 的 running/retrying 列表
- 最近 run 历史
- 实时 SSE 事件流

## 5. 分期交付计划

### Phase 1：数据模型 + Workflow 解析 + Tracker Client

**目标**：能在 wudao 中配置 Linear 连接并拉取 issues

- [ ] `db.py` 迁移：扩展 tasks 表字段
- [ ] `symphony/models.py`：TrackerIssue、WorkflowConfig 等数据类
- [ ] `symphony/workflow.py`：WORKFLOW.md 解析（YAML front matter + prompt body）
- [ ] `symphony/tracker.py`：Linear GraphQL 客户端
- [ ] `symphony/store.py`：symphony_workflows 表 CRUD
- [ ] `symphony/routes.py`：workflow CRUD 路由
- [ ] Settings 页 Symphony tab（基础 workflow CRUD）
- [ ] 测试：workflow 解析、tracker client mock、$VAR 解析

### Phase 2：Orchestrator + 基础调度

**目标**：能自动从 Linear 拉取 issues 并创建 wudao tasks

- [ ] `symphony/orchestrator.py`：poll loop + reconcile + dispatch skeleton
- [ ] `symphony/workspace.py`：workspace 创建/复用 + hooks 执行
- [ ] Issue → Task 映射（`ensure_task_for_issue`）
- [ ] symphony_runs 表 + store
- [ ] 启动/停止/手动 tick 路由
- [ ] Dashboard Symphony 统计卡片
- [ ] Task List 来源标识
- [ ] 测试：dispatch 排序、reconcile 逻辑、retry 退避、workspace 安全约束

### Phase 3：Agent 执行 + 完整闭环

**目标**：派发的 issue 能自动执行 coding agent

- [ ] `symphony/conductor.py`：Claude Code SDK 执行路径
- [ ] 与 sdk_runner 集成：symphony run → sdk run → 事件回流
- [ ] `symphony/prompt.py`：Liquid 模板渲染（用 Jinja2 严格模式）
- [ ] workspace hooks 执行（after_create / before_run / after_run / before_remove）
- [ ] Worker 退出处理：正常续作 / 异常重试
- [ ] Task Workspace header 显示 Linear 来源
- [ ] 测试：conductor 端到端、prompt 渲染、hook 超时、stall 检测

### Phase 4：可观测性 + 体验打磨

**目标**：生产级可观测性和操作体验

- [ ] SSE 实时事件推送
- [ ] Symphony 监控视图（主导航入口）
- [ ] Token 计量聚合
- [ ] WORKFLOW.md 文件变更检测 + 热重载
- [ ] 运行状态持久化（重启恢复）
- [ ] Codex app-server 协议支持（可选）
- [ ] SSH Worker 扩展（可选）

## 6. 与 SPEC 的偏差说明

| SPEC 要求 | Wudao 实现 | 原因 |
|---|---|---|
| Codex app-server 为主 | Claude Code SDK Runner 为主 | wudao 已有完整的 SDK Runner 集成，Codex 作为可选扩展 |
| 独立守护进程 | FastAPI 后台 asyncio.Task | wudao 是单体 Web 应用，不需要额外进程 |
| WORKFLOW.md 在仓库内 | `~/.wudao/symphony/workflows/` | wudao 不是按仓库组织的，workflow 是全局配置 |
| 纯 CLI 启动 | Settings 页 UI 配置 + 启停 | wudao 是 Web-first 产品 |
| 无数据库要求 | SQLite 持久化 | wudao 已有 SQLite 基础设施，持久化 run 状态有助于重启恢复 |
| `linear_graphql` 客户端工具 | Phase 4 可选 | 先做核心调度，工具扩展后续补齐 |
| SSH Worker | 不实现 | 单机场景足够，远程执行可在后续迭代中加入 |

## 7. 安全约束

- **路径守卫**：workspace 必须在配置的 workspace_root 下，不允许路径穿越
- **敏感信息**：Linear API Key 走 `$VAR` 环境变量解析，不持久化到数据库
- **Hook 超时**：所有 hook 必须有超时限制，默认 60s
- **并发限制**：默认 `max_concurrent_agents = 10`，可配置
- **Agent 权限**：Claude Code Runner 使用 `acceptEdits` 模式，Codex 使用配置的 `approval_policy`

## 8. 测试策略

遵循 wudao 的 TDD 基线：

| 模块 | 测试类型 | 关键用例 |
|---|---|---|
| workflow.py | 单元测试 | YAML 解析、$VAR 解析、默认值、验证错误 |
| tracker.py | 单元测试 (mock httpx) | GraphQL 查询构造、分页、错误映射、normalization |
| orchestrator.py | 单元测试 | dispatch 排序、并发槽位、retry 退避、stall 检测、reconcile |
| conductor.py | 集成测试 (mock sdk_runner) | 完整 worker 生命周期、hook 执行、prompt 渲染 |
| workspace.py | 单元测试 | 路径安全、sanitization、hook 超时 |
| prompt.py | 单元测试 | Liquid 渲染、严格变量检查、attempt 语义 |
| routes.py | 集成测试 (TestClient) | CRUD、start/stop、state snapshot、SSE |
| store.py | 单元测试 (临时 SQLite) | workflow/run CRUD、状态迁移 |
