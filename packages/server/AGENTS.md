# packages/server/AGENTS.md

> Server 端局部规则。进入本目录工作时，在遵循根目录 `AGENTS.md` 的前提下优先使用本文件。

## 范围与目标

- 范围：`packages/server/src/**`、`packages/server/tests/**`
- 目标：保证接口稳定、数据一致、Agent Runtime 可恢复、终端与 Runner 生命周期可靠

## 当前代码结构

- 应用入口：`src/app.py`，创建 FastAPI app 并注册 HTTP、SSE、WebSocket 路由
- 数据库：`src/db.py`，负责 SQLite 连接、默认 Provider seed、表初始化与兼容迁移
- 路径与记忆：`src/paths.py`、`src/memories.py`
- 任务服务：`src/task_service.py`、`src/task_helpers.py`、`src/task_claude_md.py`
- LLM 适配：`src/llm.py`，兼容 Anthropic Messages、OpenAI Responses、OpenAI Chat Completions 与部分 provider fallback
- Agentic Chat：
  - 路由：`src/task_agent_chat.py`
  - Runtime：`src/agent_runtime/runner.py`
  - 线程存储：`src/agent_runtime/thread_store.py`
  - 工具注册：`src/agent_runtime/tool_registry.py`
  - workspace / terminal 工具：`src/agent_runtime/workspace_tools.py`、`terminal_tools.py`
- Claude Code Runner：
  - 路由：`src/task_sdk_runner.py`
  - 运行与进程注册：`src/sdk_runner/sdk_runner.py`
  - 持久化：`src/sdk_runner/sdk_store.py`
  - SDK 消息适配：`src/sdk_runner/sdk_adapter.py`
  - Agent 工具入口：`src/sdk_runner/sdk_tools.py`
- 终端：`src/terminal.py`、`src/terminal_utils.py`
- 测试：`tests/test_*.py`

## 文档入口

- 根协作规则：`../../AGENTS.md`
- 当前进度：`../../status.md`
- 用户视角变更：`../../docs/changelog.md`

当前仓库内没有长期后端设计文档；如要新增协议、表结构或 Agent Runtime 设计说明，放到 `../../docs/design/` 并同步更新根 `AGENTS.md` 的文档入口。

## 后端开发规则

1. 任何接口、SSE/WebSocket 事件、数据库结构或任务产物语义变更，先更新承载文档再改实现。
2. 路由层只做协议编排、参数校验和响应转换；业务逻辑优先放到独立模块，避免 `app.py` 继续膨胀。
3. DB 变更必须兼容已有 SQLite 数据，提供启动期迁移或明确的数据处理策略，不依赖手工清库。
4. `tasks.chat_messages` 当前是 legacy 兼容投影；Agentic Chat 主数据在 `task_agent_runs` 与 `task_agent_messages`。
5. Agent 工具读写文件必须限制在任务 workspace 内，并复用 `workspace_tools.py` / `path_guard.py` 的路径防逃逸策略。
6. `AGENTS.md` 是任务主产物；写入或 patch 该文件时要同步数据库中的 `tasks.agent_doc`，并维护 `CLAUDE.md` / `GEMINI.md` 软链。
7. 涉及 Agent Runtime 的改动必须考虑工具失败回流、SSE 断开、后台 run 继续执行、历史 thread 修复与重复事件去重。
8. 涉及 SDK Runner 的改动必须考虑 run 持久化、事件回放、取消、应用 shutdown、任务删除和并发 run。
9. 涉及 PTY 终端的改动必须考虑 create / attach / list / exit、进程组清理、真实 CLI session id 发现和 resize 去重。
10. 所有错误路径都要返回可诊断信息，禁止吞错或只在服务端日志里体现。

## 自测要求

- 本地运行：`pnpm --filter server dev`
- 生产入口：`pnpm --filter server start`
- 自动化测试：`pnpm --filter server test`
- Watch：`pnpm --filter server test:watch`
- 涉及 API 变更时，至少验证对应端点成功与失败路径
- 涉及 Agentic Chat / Runner 时，优先补 `tests/test_task_agent_chat.py`、`tests/test_agent_runtime_*.py`、`tests/test_sdk_*.py`
- 涉及终端逻辑时，优先补 `tests/test_terminal.py`，并尽量手动验证真实 CLI 的 create / resume / close 主流程
- 测试里使用临时 `WUDAO_HOME` / `WUDAO_DB_PATH`，不要依赖用户本地 `~/.wudao`

## 文档回写

- 功能完成后按影响同步更新：`../../status.md`、`../../docs/changelog.md`
- 若协议、表结构或运行时状态机有长期约束，新增或更新 `../../docs/design/*.md` 并在根 `AGENTS.md` 补入口
