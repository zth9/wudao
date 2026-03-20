# 任务上下文注入与 AGENTS/兼容入口协同

> 当前主产物为 `AGENTS.md`；`CLAUDE.md` 与 `GEMINI.md` 仅作为兼容入口存在。
> v2.2 · 2026-03-16（对齐当前任务工作台与 Agent Runtime 口径）

---

## 一、背景

当前任务系统里，真正用于承载执行上下文的主产物已经不是单独生成的 `CLAUDE.md`，而是：

- 后端生成并持久化到数据库的 `agent_doc`
- workspace 中物化出的 `AGENTS.md`
- 兼容入口 `CLAUDE.md` / `GEMINI.md`（都软链到 `AGENTS.md`）

因此，最新设计需要解决的问题不再是“启动终端前临时拼一份 CLAUDE.md 文本”，而是：

1. 让 `AGENTS.md` 成为任务上下文的单一事实来源
2. 让 Claude Code 与 Gemini CLI 都可以通过兼容入口读到同一份内容
3. 避免 `AGENTS.md` 与兼容入口文件出现双份内容漂移

---

## 二、目标

### 2.1 当前目标

- 以 `AGENTS.md` 作为任务主产物和 UI 展示对象
- 以 `task.agent_doc` 作为数据库中的持久化副本
- 以 `CLAUDE.md -> AGENTS.md` 与 `GEMINI.md -> AGENTS.md` 软链作为 CLI 兼容入口
- 启动终端时只做“兼容入口维护 + 首条提示引导”，不再把完整计划文本直接注入 stdin

### 2.2 不做

- 不在终端创建时重新用 DB 内容拼装一份完整兼容入口文本
- 不恢复“把 plan 全文作为首条 prompt 注入”的旧方案
- 上下文注入本身不依赖 MCP、工具注册中心或结构化编排协议；这些能力由独立的 Agent Runtime 承担

---

## 三、当前实现设计

### 3.0 全局 Agent 记忆补充

除任务本身的 `context` 与规划对话外，系统还支持一份全局的 `Wudao Agent` 记忆文件：

- 源文件位置：`~/.wudao/profile/wudao-agent-memory.md`
- 编辑入口：顶部“记忆”页中的全局 Agent 记忆编辑卡片
- 注入时机：当某个任务的聊天历史为空、首次开始规划对话时

注入方式：

- 将该文件内容拼接到任务首条“任务信息”消息之前
- 作为长期偏好 / 工作方式 / 全局约束上下文供任务对话参考
- 后续同一任务继续聊天时，不重复注入，避免污染历史

### 3.1 生成主产物

当用户在任务面板中点击“生成/重新生成”时：

1. 前端调用 `POST /api/tasks/{task_id}/generate-docs`
2. 后端基于 `全局用户记忆 + 全局 Agent 记忆 + context + chat_messages + task metadata` 调用 LLM
3. 产出一份给 coding agent 使用的 `AGENTS.md` 文本
4. 同步更新：
   - `tasks.agent_doc`
   - workspace 下的 `AGENTS.md`
   - workspace 下的 `CLAUDE.md` / `GEMINI.md` 软链

### 3.2 workspace 中的文件关系

```text
~/.wudao/workspace/<taskId>/
├── AGENTS.md      # 主产物，真实内容文件
├── CLAUDE.md      # 指向 ./AGENTS.md 的软链
└── GEMINI.md      # 指向 ./AGENTS.md 的软链
```

设计原则：

- 真实内容只维护一份：`AGENTS.md`
- `CLAUDE.md` / `GEMINI.md` 只是兼容不同 CLI 自动加载机制的入口
- UI 侧只预览和强调 `AGENTS.md`

### 3.3 终端创建时的行为

在 `packages/server/src/terminal.py` 的 WebSocket `create` 分支中，当 `task_id` 存在时：

1. 确保 `~/.wudao/workspace/<taskId>/` 目录存在
2. 调用 `generate_task_claude_md(task_id, cwd)`
3. 该函数只在以下条件满足时重建兼容入口：
   - `task_id` 格式合法
   - 目录位于任务 workspace 根下
   - 任务存在
   - `AGENTS.md` 已存在
4. 然后再启动 PTY

**关键点**：当前并不会在这里重新生成 `AGENTS.md` 正文；这里只负责维护兼容软链。

### 3.4 打开 workspace 时的行为

调用 `POST /api/tasks/{task_id}/open-workspace` 时：

- 若 `task.agent_doc` 非空，会先把 `AGENTS.md` 物化到目录中
- 然后重建 `CLAUDE.md` / `GEMINI.md` 软链
- 最后调用系统 `open` 打开本地目录

这保证了：即使用户还没启动终端，也能从 Finder 中看到当前任务产物。

### 3.5 首条提示语

当前前端不会再把完整 plan 文本注入终端，而是在已有 `agent_doc` 时传入一条简短提示：

```text
请先阅读当前目录里的 AGENTS.md，理解任务目标、约束和执行方式后再开始执行。
```

这条提示的作用是：

- 引导 CLI 先读取主产物
- 避免重复注入长文本
- 让 resume 会话与首次启动走同一套上下文入口

---

## 四、实现落点

| 文件 | 作用 |
|------|------|
| `packages/server/src/app.py` | 挂载 `POST /api/tasks/{task_id}/generate-docs`、`POST /api/tasks/{task_id}/open-workspace`、`POST /api/tasks/{task_id}/chat` 与 Agent Chat 路由 |
| `packages/server/src/task_service.py` | 生成 `AGENTS.md`、写回 `agent_doc` 并在 workspace 中物化主产物 |
| `packages/server/src/task_claude_md.py` | 维护 `CLAUDE.md` / `GEMINI.md` 指向 `AGENTS.md` 的软链 |
| `packages/server/src/terminal.py` | 创建终端前确保任务 workspace 与兼容入口就绪 |
| `packages/web/src/components/TaskWorkspaceView.tsx` | 在启动终端时传入“先阅读 AGENTS.md”的首条提示 |
| `packages/web/src/components/TaskArtifactsDrawer.tsx` | 预览 `AGENTS.md` 并提供打开 workspace 能力 |

---

## 五、边界情况

| 场景 | 当前处理 |
|------|------|
| 任务尚未生成 `AGENTS.md` | 不创建兼容软链，终端也不会收到阅读产物的首条提示 |
| 用户手动修改 `CLAUDE.md` | 下次重建软链时会被移除并重新指向 `AGENTS.md` |
| 用户手动修改 `AGENTS.md` | UI 中仍以数据库 `agent_doc` 为准；再次生成或打开 workspace 会重新物化 |
| resume 历史会话 | 终端恢复逻辑不依赖重新生成正文，产物仍由 workspace 中现有文件提供 |
| 任务被删除后 workspace 保留 | 目录与已有产物保留，不主动清理 |
| 非法 taskId / 越权路径 | `generate_task_claude_md()` 会直接跳过 |

---

## 六、验收标准

1. 在任务面板点击“生成”后，数据库中的 `agent_doc` 有值。
2. 任务 workspace 中存在 `AGENTS.md`，且 `CLAUDE.md` 指向它。
3. 产物抽屉展示的是 `AGENTS.md` 内容，而不是单独维护的 `CLAUDE.md` 文本。
4. 新建终端时，首条提示为“请先阅读当前目录里的 AGENTS.md，理解任务目标、约束和执行方式后再开始执行。”
5. 打开 workspace 时，如果任务已有产物，目录中能看到最新 `AGENTS.md` 和兼容软链。

---

*悟道 · 任务上下文注入 v2.1 · 2026-03-15*
