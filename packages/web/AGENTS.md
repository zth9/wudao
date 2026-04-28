# packages/web/AGENTS.md

> Web 端局部规则。进入本目录工作时，在遵循根目录 `AGENTS.md` 的前提下优先使用本文件。

## 范围与目标

- 范围：`packages/web/src/**`
- 目标：保证 UI 交互稳定、状态一致、布局可维护、任务工作台体验可靠

## 当前代码结构

- 应用入口：`src/App.tsx`
- 路由模型：`src/app-route.ts`，通过 URL query 维护 `dashboard / tasks / memories / settings` 与 `taskId`
- API 类型与请求封装：`src/services/api.ts`
- 全局状态：
  - `src/stores/taskStore.ts`：任务列表、任务详情、Agentic Chat timeline 与 SSE
  - `src/stores/terminalStore.ts`：终端 WebSocket、会话状态与任务关联
  - `src/stores/sdkRunnerStore.ts`：Claude Code Runner runs、事件订阅与时间线
  - `src/stores/taskWorkspaceStore.ts`：按任务持久化右侧抽屉开关与宽度
  - `src/stores/settingsStore.ts`：Provider、主题、语言、排序偏好与用户信息
- 主要组件：
  - `src/components/TaskWorkspaceView.tsx`：任务工作台总装
  - `src/components/task-panel/TaskChat.tsx`：Agentic Chat 渲染与发送
  - `src/components/TiledTerminalPanel.tsx`、`TerminalView.tsx`、`TerminalTile.tsx`：终端区域
  - `src/components/sdk-runner/SdkRunnerPanel.tsx`：Agent Runner 面板
  - `src/components/TaskArtifactsDrawer.tsx`：`AGENTS.md` 产物抽屉
  - `src/components/MarkdownContent.tsx`：Markdown 渲染
- 国际化资源：`src/locales/zh.json`、`src/locales/en.json`

## 文档入口

- 根协作规则：`../../AGENTS.md`
- 前端视觉与交互规范：`../../docs/design/frontend-guidelines.md`
- 当前进度：`../../status.md`
- 用户视角变更：`../../docs/changelog.md`

## 前端开发规则

1. 修改 UI 或组件时，必须遵守 `docs/design/frontend-guidelines.md` 的 Apple Glass、加载态、动效、i18n 与布局规范。
2. 代码中禁止硬编码可见中/英文文案，所有文案走 `t()` 与 `locales/*.json`。
3. 默认使用 `LoadingIndicator` 与稳定壳层占位；不要恢复全站 pulse Skeleton 体系。
4. 高度、宽度、位置变化优先用 CSS transition 与明确尺寸约束；谨慎使用 Framer Motion `layout`，避免文字和图标形变。
5. 任务工作台右侧终端、Agent Runner、产物是同一套固定宽度抽屉模型，改布局时同步维护 `task-workspace-layout.ts` 与测试。
6. Agentic Chat 的结构化消息统一经过 `utils/agent-timeline.ts` 映射；不要重新引入旧版普通聊天渲染链路。
7. Store 测试优先 mock `services/api.ts`，直接控制 zustand 初始状态，避免依赖真实后端。
8. 涉及终端和 Runner 的 UI 变更，要考虑 SSE/WebSocket 断连、重连、历史回放和任务切换清理。
9. 组件职责保持清晰：展示组件与状态逻辑分离，复杂逻辑优先放到 `stores`、`utils` 或 layout helper。

## 自测要求

- 本地运行：`pnpm --filter web dev`
- 常规测试：`pnpm --filter web test`
- 构建验证：`pnpm --filter web build`
- 严格类型与未使用代码检查：`pnpm --filter web exec tsc --noEmit --noUnusedLocals --noUnusedParameters`
- 涉及关键交互时，手动走通任务创建、Agentic Chat、终端开关、Agent Runner 展示、产物抽屉、设置保存等主流程

## 文档回写

- 功能完成后按影响同步更新：`../../status.md`、`../../docs/changelog.md`
- 若设计或交互规范变化，先更新 `../../docs/design/frontend-guidelines.md`
