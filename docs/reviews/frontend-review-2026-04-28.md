# 前端 Review 盘点

> 日期：2026-04-28
> 范围：`packages/web/src/**`
> 目的：重新熟悉前端当前功能面，标记死代码与优先清理项。

## 结论摘要

- 前端主线已经收敛到“任务中心 + Agentic Chat + 右侧三抽屉工作台”。
- `pnpm --filter web test` 和 `pnpm --filter web build` 当前通过。
- `pnpm --filter web exec tsc --noEmit` 当前失败，说明生产构建没有覆盖完整 TypeScript 静态检查。
- 旧版普通任务聊天链路仍留在 store 和 API 中，但当前 UI 已不再使用，属于最大一块可确认死代码候选。
- `utils/agent-timeline.ts` 与 `stores/taskStore.ts` 存在一份重复的 Agent timeline 映射逻辑，需要二选一收口。

## 当前功能项

### 应用壳

- 入口：`packages/web/src/main.tsx`、`packages/web/src/App.tsx`
- 功能：
  - 顶部导航：Dashboard、任务中心、记忆、设置
  - 查询参数路由：`view`、`taskId`、`autoStartChat`
  - 主题切换：浅色、深色、跟随系统
  - 中英文切换
  - 用户头像与昵称展示
  - 主视图懒加载

### Dashboard

- 入口：`packages/web/src/components/DashboardView.tsx`
- 功能：
  - 任务统计：进行中、已完成、高优先级、全部
  - Provider 用量卡片
  - 30 秒静默自动刷新
  - 窗口重新聚焦 / 页面重新可见时刷新
  - 用量异常时引导到设置页修复

### 任务列表

- 入口：`packages/web/src/components/TaskListView.tsx`
- 功能：
  - 全量任务拉取与前端过滤
  - active / done / all 标签页
  - 标题与任务 ID 搜索
  - 按创建时间、更新时间、优先级、截止日期排序
  - 新建任务弹窗
  - 自然语言解析任务意图
  - 模型供应商选择
  - 删除任务确认

### 任务工作台

- 入口：`packages/web/src/components/TaskWorkspaceView.tsx`
- 功能：
  - 任务详情加载与切换
  - 顶部任务 header
  - 任务标题、类型、优先级、截止日期编辑
  - 标记完成 / 恢复执行
  - 打开任务 workspace
  - 删除任务
  - 左侧 Agentic Chat
  - 右侧三抽屉：终端、Agent Runner、产物
  - 三抽屉独立开关、拖拽改宽、按任务记忆布局
  - 首次建任务后自动发起首轮 Agentic Chat

### Agentic Chat

- 入口：`packages/web/src/components/task-panel/TaskChat.tsx`、`packages/web/src/stores/taskStore.ts`
- 功能：
  - 结构化 Agent timeline 渲染
  - 用户消息、assistant 文本、工具调用、工具结果、审批、产物更新、错误消息
  - 工具调用和结果合并折叠展示
  - `invoke_claude_code_runner` 工具结果可反向打开 Agent Runner
  - Provider 下拉选择
  - 生成 / 更新 `AGENTS.md`
  - 回复中提示
  - 滚动到底部按钮与回底动效
  - SSE 断开后回拉 thread 恢复状态

### 任务终端

- 入口：
  - `packages/web/src/components/TiledTerminalPanel.tsx`
  - `packages/web/src/components/TerminalTile.tsx`
  - `packages/web/src/components/TerminalView.tsx`
  - `packages/web/src/stores/terminalStore.ts`
  - `packages/web/src/contexts/WsContext.tsx`
- 功能：
  - WebSocket 连接 `/ws/terminal`
  - xterm.js 渲染本地 PTY 会话
  - 新建终端
  - 终端命名与重命名
  - 多终端 tile 展示
  - 拖拽排序
  - 关闭终端
  - 历史 session 关联、恢复、打开状态识别
  - 终端 resize 同步
  - 文件链接通过后端打开本地路径

### Agent Runner

- 入口：
  - `packages/web/src/components/sdk-runner/SdkRunnerPanel.tsx`
  - `packages/web/src/stores/sdkRunnerStore.ts`
  - `packages/web/src/utils/sdk-runner.ts`
- 功能：
  - 当前任务 SDK run 列表
  - 选择历史 run
  - 订阅 SDK SSE 事件流
  - 文本、thinking、工具调用、工具结果、审批、进度、费用、错误、状态变化渲染
  - 工具结果 Markdown 渲染
  - 审批允许 / 拒绝
  - 取消运行
  - SDK run 完成后刷新 Agent Chat thread

### 产物抽屉

- 入口：`packages/web/src/components/TaskArtifactsDrawer.tsx`
- 功能：
  - 展示当前任务主产物 `AGENTS.md`
  - Markdown 渲染
  - 产物状态：已生成 / 待生成
  - 打开任务 workspace

### 记忆页

- 入口：`packages/web/src/components/MemoriesView.tsx`
- 功能：
  - 用户记忆读取、编辑、保存
  - Wudao Agent 全局记忆读取、编辑、保存
  - 打开记忆源文件
  - 刷新全部记忆

### 设置页

- 入口：
  - `packages/web/src/components/SettingsView.tsx`
  - `packages/web/src/stores/settingsStore.ts`
- 功能：
  - 用户昵称与头像
  - 上传头像
  - 内置头像选择
  - Provider 列表加载
  - Provider 新建、编辑、删除
  - Provider 排序
  - 默认 Provider 设置
  - 用量统计认证 Token / Cookie 字段
  - Provider 请求失败提示

## 死代码与旧代码候选

### 1. 旧版普通任务聊天链路

- `packages/web/src/services/api.ts`
  - `tasks.streamTaskChat()`
- `packages/web/src/stores/taskStore.ts`
  - `chatTaskId`
  - `chatMessages`
  - `chatStreaming`
  - `sendChatMessage()`
  - `startInitialChat()`
  - `abortChat()`
  - 内部 `startChatStream()`
  - 内部 `parseChatMessages()` / `upsertAssistantMessage()` 中与 legacy chat 直接相关的部分

判断依据：

- 当前 `TaskWorkspaceView` 只向 `TaskChat` 传入 `agentTimeline`、`agentChatStreaming`、`sendAgentChatMessage()`、`startInitialAgentChat()`、`abortAgentChat()`。
- UI 生产路径没有调用 `sendChatMessage()` 或 `startInitialChat()`。
- 这些旧 action 仍被测试 mock/断言覆盖，清理前需要同步更新测试。

保留风险：

- `task.chat_messages` 仍作为 legacy fallback 被 `buildLegacyAgentTimeline()` 使用。
- 如果还需要兼容老任务历史对话，不能直接删除 `chat_messages` fallback，只应先删除前端旧发送链路。

### 2. Agent timeline 映射逻辑重复

- `packages/web/src/utils/agent-timeline.ts`
- `packages/web/src/stores/taskStore.ts`

现状：

- `utils/agent-timeline.ts` 已导出完整函数：
  - `parseChatMessages()`
  - `upsertAssistantMessage()`
  - `createOptimisticUserItem()`
  - `buildAgentTimeline()`
  - `upsertAgentRun()`
  - `updateAgentRunStatus()`
  - `upsertAgentTimelineItem()`
  - `applyAgentDelta()`
  - `mapAgentMessageToTimelineItem`
- `taskStore.ts` 又复制了一份同名或同逻辑函数。
- `taskStore.ts` 当前只从 `utils/agent-timeline.ts` 导入类型，没有复用这些实现。

建议：

- 优先让 `taskStore.ts` 复用 `utils/agent-timeline.ts`。
- 如果短期不想动运行逻辑，则删除 `utils/agent-timeline.ts` 中未被测试外部依赖的函数，但这会浪费已有单元测试价值。

### 3. 已移除字段残留：`urgency`

- `packages/web/src/stores/taskStore.ts`
  - `TaskUpdatePayload` 仍包含 `"urgency"`。

现状：

- `Task` 类型已经没有 `urgency` 字段。
- `pnpm --filter web exec tsc --noEmit` 因此失败。
- 后端仍有迁移兼容逻辑读取 legacy `urgency`，但前端更新 payload 不应再包含这个字段。

### 4. 未用 import / 未用参数

- `packages/web/src/components/DashboardView.tsx`
  - `Loader2`
- `packages/web/src/components/task-panel/CalendarPopup.tsx`
  - `addDays`
  - `AnimatePresence`
- `packages/web/src/components/task-panel/Header.tsx`
  - `useTaskStore`
  - `Calendar`
  - `X`
  - `onSwitchTask`
- `packages/web/src/components/task-panel/TaskListDrawer.tsx`
  - `Clock`
- `packages/web/src/stores/terminalStore.ts`
  - Zustand 初始化函数中的 `get`

这些不影响 `vite build`，但开启 `noUnusedLocals/noUnusedParameters` 后会暴露。

### 5. 重复常量：`TASK_TYPES`

- 已有共享常量：
  - `packages/web/src/components/task-panel/constants.ts`
- 重复定义：
  - `packages/web/src/components/TaskListView.tsx`
  - `packages/web/src/components/task-panel/Header.tsx`

建议统一从 `task-panel/constants.ts` 导入。

### 6. 旧翻译键

疑似旧键集中在：

- `packages/web/src/locales/zh.json`
- `packages/web/src/locales/en.json`

重点候选：

- `terminal.*` 中的大部分终端面板文案已被 `terminal_panel.*` 和 `terminal_dialog.*` 替代。
- `terminal.permission_modes.*` 与顶层 `permission_modes.*` 重复。
- `terminal_dialog.permission_modes.*` 当前未直接使用，弹窗通过 `PERMISSION_MODES` 读取顶层 `permission_modes.*`。
- `task_status.*` 当前未被前端引用。
- `language.*` 当前未被前端引用。
- `dashboard.title`、`dashboard.task_stats`、`dashboard.welcome`、`dashboard.refresh_usage` 当前未被前端引用。
- `artifacts.subtitle`、`artifacts.close_drawer`、`artifacts.empty_hint`、`artifacts.collapse` 当前未被前端引用。

注意：

- 动态 key 如 `task_types.${type}`、`priority_labels.${priority}`、`permission_modes.${mode}.label` 不能用纯文本搜索直接判断。
- 清理 i18n 前应做一次更严格的 key 扫描，并同步删除中英文两份 JSON。

### 7. CSS 死样式与无效类名

- `packages/web/src/index.css`
  - `.apple-sidebar` 未被引用。
  - `.apple-floating-panel` 未被引用。
- 代码中使用但未定义的类：
  - `custom-scrollbar`
  - `dark-scrollbar`

出现位置：

- `packages/web/src/components/TiledTerminalPanel.tsx`
- `packages/web/src/components/task-panel/TaskListDrawer.tsx`
- `packages/web/src/components/TaskArtifactsDrawer.tsx`

建议：

- 若这些类曾经有定制滚动条样式，应补回定义。
- 若没有实际视觉要求，应删除类名，避免误导维护者。

### 8. 调试日志残留

- `packages/web/src/stores/taskStore.ts`
  - `[TaskStore] tool_call update`
  - `Task chat error`
- `packages/web/src/stores/sdkRunnerStore.ts`
  - `[SdkRunner] sdk_run.completed, will fetch agent thread`
  - `[SdkRunner] tool completed, refreshing task`
- `packages/web/src/components/SettingsView.tsx`
  - `Avatar upload failed`

建议：

- 生产路径中保留用户可见错误即可。
- 需要调试时可后续接入统一 logger 或开发环境条件输出。

## 类型与质量风险

### 1. `vite build` 未执行完整类型检查

执行结果：

```bash
pnpm --filter web exec tsc --noEmit
```

失败点：

- `TaskUpdatePayload` 引用不存在的 `urgency` 字段。
- `TaskWorkspacePanelHeader` 的 `wrapperProps` / `panelProps` 传入自定义 `data-*` 属性时，当前类型未兼容。
- `WsContext` 中 `confirmed` / `restored` 在调用 `getReplacementSessionIds()` 时仍可能为 `undefined`。
- 一个测试中存在布尔值传给数字字段的类型问题。

建议：

- 在 `pnpm --filter web build` 前增加 `tsc --noEmit`，或把 web build 脚本改成 `tsc --noEmit && vite build`。
- 先修复上述类型错误，再逐步开启 `noUnusedLocals` / `noUnusedParameters`。

### 2. 部分组件仍偏大

当前较大的文件：

- `TaskChat.tsx`：约 995 行
- `TaskWorkspaceView.tsx`：约 925 行
- `taskStore.ts`：约 726 行
- `TaskListView.tsx`：约 615 行
- `SettingsView.tsx`：约 523 行

建议：

- 不建议马上大拆。
- 先清除死代码和类型错误。
- 后续有明确需求时，再按功能边界拆 `TaskChat` 的工具卡片、Provider 菜单、滚动控制，拆 `TaskWorkspaceView` 的拖拽逻辑与 session 恢复逻辑。

## 建议清理顺序

1. 修复 `tsc --noEmit` 当前失败项。
2. 删除未用 import 和未用参数。
3. 将 `taskStore.ts` 的 Agent timeline 逻辑改为复用 `utils/agent-timeline.ts`。
4. 删除旧版普通任务聊天发送链路，仅保留 legacy `chat_messages` 展示 fallback。
5. 统一 `TASK_TYPES` 常量来源。
6. 清理 i18n 旧键，先清中英文完全一致的明显旧块。
7. 清理 `.apple-sidebar` / `.apple-floating-panel`，并处理 `custom-scrollbar` / `dark-scrollbar`。
8. 移除生产路径调试日志。

## 本次验证

已执行：

```bash
pnpm --filter web test
pnpm --filter web build
pnpm --filter web exec tsc --noEmit
pnpm --filter web exec tsc --noEmit --noUnusedLocals --noUnusedParameters
```

结果：

- `pnpm --filter web test`：通过，18 个测试文件，121 个用例。
- `pnpm --filter web build`：通过。
- `tsc --noEmit`：失败，见“类型与质量风险”。
- `tsc --noEmit --noUnusedLocals --noUnusedParameters`：失败，并额外暴露未用 import / 参数。
