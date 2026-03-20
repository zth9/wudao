# 为 Wudao 引入 TDD

> 本文描述当前仓库实际采用的测试基线，而不是早期 Hono / Vitest-only 方案。
> v1.1 · 2026-03-16

## 1. 目标

### 已达成

- [x] 根目录 `pnpm test` 可以一键跑前后端测试
- [x] Server 侧采用 `pytest` 作为主测试框架
- [x] Route / WebSocket 关键路径通过 FastAPI `TestClient` 覆盖
- [x] Web 侧采用 `vitest` 覆盖 store、工具函数与关键组件交互
- [x] 新功能与 bugfix 以 Red → Green → Refactor 为默认工作节奏

### 当前不追求

- [x] 不追求 100% 覆盖率
- [x] 不要求所有 UI 都补渲染测试
- [x] 不要求当前就补完整 E2E / Playwright 体系

## 2. 当前测试栈

| 层级 | 技术选型 | 说明 |
|------|----------|------|
| 根命令 | `pnpm test` | 串行执行 server + web 测试 |
| Server 单测/集成 | `pytest` | 通过 `uv run --project . pytest` 执行 |
| Server Route / WS | `FastAPI TestClient` | 直接测试 HTTP 与 WebSocket 协议 |
| Web 单测 | `vitest` | 覆盖 store、utils、关键组件 |
| Mock 策略 | monkeypatch / 模块级 mock | 隔离 LLM、OpenViking、终端等外部依赖 |

## 3. 当前覆盖重点

### Server

重点文件：

- `packages/server/tests/test_app.py`
- `packages/server/tests/test_task_agent_chat.py`
- `packages/server/tests/test_agent_runtime_runner.py`
- `packages/server/tests/test_agent_runtime_store.py`
- `packages/server/tests/test_agent_runtime_tools.py`
- `packages/server/tests/test_workspace_tools.py`
- `packages/server/tests/test_terminal.py`
- `packages/server/tests/test_llm.py`

当前优先保证：

- 任务 CRUD、分页、排序、状态流转
- 任务解析、legacy chat、文档生成
- Agent Chat thread / run / 工具调用
- OpenViking bridge 与记忆接口
- 终端协议的 create / list / attach / close / resize 关键路径

### Web

重点文件：

- `packages/web/src/stores/taskStore.test.ts`
- `packages/web/src/stores/terminalStore.test.ts`
- `packages/web/src/app-route.test.ts`
- `packages/web/src/components/task-panel/TaskChat.test.ts`
- `packages/web/src/components/task-panel/TaskListDrawer.test.ts`
- `packages/web/src/components/TaskListView.test.ts`
- `packages/web/src/components/TaskArtifactsDrawer.test.ts`
- `packages/web/src/components/task-workspace-layout.test.ts`
- `packages/web/src/components/terminal-resize.test.ts`
- `packages/web/src/utils/*.test.ts`

当前优先保证：

- store 的状态迁移与并发保护
- Agent timeline 构建与流式事件合并
- 任务工作台关键布局逻辑
- IME、时间处理、终端 resize 等易回归工具函数

## 4. 默认工作流

每次做功能或修 bug，按下面顺序推进：

1. **Red**：先写一个会失败的测试，证明需求确实可验证
2. **Green**：只写让测试通过的最小实现
3. **Refactor**：在测试全绿前提下整理结构，消除重复和坏味道

额外约束：

- Bug 修复应优先补复现测试
- 协议变更要覆盖成功路径和关键失败路径
- 涉及终端或外部 Provider 的逻辑，优先 mock 外部依赖，不依赖本机真实服务

## 5. 常用命令

```bash
pnpm test
pnpm --filter server test
pnpm --filter web test
pnpm --filter web build
```

## 6. 当前验收口径

1. 新功能或修复必须能指出对应测试入口。
2. 提交前至少跑过受影响范围的测试；跨端改动默认跑 `pnpm test`。
3. Server 关键协议变更默认补 `pytest`；Web 状态逻辑变更默认补 `vitest`。
