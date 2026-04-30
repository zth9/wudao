# HeroUI 前端重构计划

## 目标

将 Web 前端从项目自研的基础 UI 类逐步迁移到 HeroUI v3，保留当前 Wudao 的 Apple glass 视觉、任务工作台交互、i18n 文案体系和现有状态管理模型。

## 范围

- 接入 `@heroui/react` 与 `@heroui/styles`
- 将 Tailwind CSS 从 v3 迁移到 HeroUI v3 要求的 v4 集成方式
- 建立项目级 HeroUI 包装组件，统一按钮、卡片、输入、文本域、浮层与状态标签的默认外观
- 分批迁移 Dashboard、任务列表、记忆页、设置页、任务工作台 header / drawer / dialog 等高频 UI
- 保留 xterm 终端、Agent timeline、SDK Runner 等复杂交互的业务结构，仅替换外层控件和可复用视觉壳层

## 非目标

- 不重写任务、设置、终端、Agent Chat 或 SDK Runner 的状态模型
- 不改变后端接口、SSE/WebSocket 协议或数据结构
- 不引入新的路由框架或设计语言
- 不恢复全站 Skeleton / pulse 加载体系

## 分步计划

1. 基础设施迁移
   - 安装 HeroUI v3 依赖
   - 接入 Tailwind CSS v4 Vite 插件
   - 将现有 Apple token 迁移到 CSS `@theme` 与 CSS 变量
   - 确保 `pnpm --filter web build` 可以通过

2. 项目级 UI 包装层
   - 新增 `components/ui/heroui.tsx`
   - 用 HeroUI `Button`、`Card`、`TextArea`、`Spinner`、`Chip` 等组件封装项目默认样式
   - 保持 `onClick` / `disabled` 等 React 原生调用方式，降低业务组件迁移成本

3. 核心页面迁移
   - Dashboard：统计卡片、刷新按钮、用量卡片
   - TaskList：新建按钮、筛选 tab、搜索框、任务卡片、创建任务弹窗
   - Memories：模块切换、操作按钮、记忆编辑框
   - Settings：用户信息、provider 列表、provider 弹窗和默认开关

4. 工作台迁移
   - 统一 `TaskWorkspacePanelHeader` 与 `TaskWorkspaceDrawerShell` 的 HeroUI 表面层
   - 迁移 `TaskChat` 的 provider 菜单、发送按钮、工具卡片外层
   - 迁移 Terminal / Agent Runner / Artifacts 的 header 操作按钮与状态标签

5. 收口验证
   - 运行 `pnpm --filter web test`
   - 运行 `pnpm --filter web build`
   - 运行 `pnpm --filter web exec tsc --noEmit --noUnusedLocals --noUnusedParameters`
   - 手动检查任务创建、任务详情、Agent Chat、终端抽屉、Agent Runner、产物抽屉、记忆页与设置页

## 当前进展

### 第一阶段：基础设施迁移 ✅ 已完成

- HeroUI v3 (`@heroui/react: 3.0.3`) 与 `@heroui/styles: 3.0.3` 已安装
- Tailwind CSS v4 (`tailwindcss: ^4.2.4`) 与 `@tailwindcss/vite: 4.2.4` 已配置
- CSS 已通过 `@import "@heroui/styles"` 集成到 `index.css`
- `pnpm --filter web build` 可以通过

### 第二阶段：项目级 UI 包装层 ⚠️ 已跳过

- 直接使用 HeroUI 原生组件导入，未创建项目级包装层
- 旧的自研 UI 组件目录 `components/ui/` 已删除

### 第三阶段：核心页面迁移 ✅ 已完成

- **DashboardView**: 4 处 HeroUI 引用 (Button, Card, Tooltip, ProgressBar)
- **TaskListView**: 10 处 HeroUI 引用 (Button, Card, Chip, Dropdown, Input, Modal, SearchField, Spinner, TextArea, Tooltip)
- **MemoriesView**: 4 处 HeroUI 引用 (Alert, Button, Card, TextArea)
- **SettingsView**: 11 处 HeroUI 引用 (Alert, Avatar, Button, Card, Checkbox, Chip, Input, Modal, Spinner, TextArea, Tooltip)

### 第四阶段：工作台迁移 ✅ 已完成

- **TaskChat**: 5 处 HeroUI 引用
- **Header (task-panel)**: 5 处 HeroUI 引用 (Button, Input, Dropdown, Popover)
- **TaskListDrawer**: 4 处 HeroUI 引用 (Drawer, Chip, Tooltip, Button)
- **TerminalTile**: 3 处 HeroUI 引用 (Button, Input, Tooltip)
- **SdkRunnerPanel**: 3 处 HeroUI 引用 (Alert, Button, Chip)
- **TiledTerminalPanel**: 2 处 HeroUI 引用 (Button, Chip)
- **TaskWorkspaceDrawerShell**: 2 处 HeroUI 引用 (Button, Tooltip)
- **TaskArtifactsDrawer**: 2 处 HeroUI 引用 (Button, Chip)
- **CalendarPopup**: 2 处 HeroUI 引用
- **TaskWorkspaceView**: 1 处 HeroUI 引用 (Modal)
- **LoadingIndicator**: 1 处 HeroUI 引用 (Spinner)
- **NewTaskTerminalDialog**: 7 处 HeroUI 引用

### 第五阶段：收口验证 ✅ 已完成

- `pnpm --filter web test` 通过 (18 个测试文件 / 112 个用例)
- `pnpm --filter web build` 通过
- `pnpm --filter web exec tsc --noEmit --noUnusedLocals --noUnusedParameters` 通过

### 迁移统计

- **组件文件总数**: 21 个
- **已迁移组件**: 16 个 (76%)
- **未迁移组件**: 5 个 (其中 3 个保持现状，1 个待迁移，1 个测试文件)
- **使用的 HeroUI 组件类型**: 19 种
- **最常用组件**: Button (15处)、Tooltip (9处)、Chip (7处)、Input (5处)

### 未迁移组件

| 组件 | 状态 | 原因 |
|-----|------|------|
| `MarkdownContent.tsx` | 保持现状 | 纯 Markdown 渲染，不需要 UI 库 |
| `TerminalView.tsx` | 保持现状 | xterm.js 专用组件 |
| `TaskWorkspacePanelHeader.tsx` | 待迁移 | 自定义布局，有特殊高度约束 (49px) |
| `SettingsView.test.tsx` | 保持现状 | 测试 mock |
| `NewTaskTerminalDialog.test.tsx` | 保持现状 | 测试 mock |

## 风险

- HeroUI v3 依赖 Tailwind CSS v4，Tailwind v3 到 v4 的 CSS 配置模型变化较大，现有 `tailwind.config.ts` 中的自定义 token 必须迁移到 CSS 变量和 `@theme`
- HeroUI 组件基于 React Aria，事件 API 偏向 `onPress`；项目包装层需要兼容现有 `onClick`
- 任务工作台大量布局依赖固定高度和固定宽度，迁移时不能让 HeroUI 默认 padding / radius 影响宽度计算
- 终端区域依赖 xterm 尺寸测量，不能给 terminal host 增加会改变测量结果的额外 wrapper

## 测试方案

- 第一阶段以构建和现有单元测试为主，证明样式栈迁移不破坏运行
- 页面迁移阶段优先保留现有组件测试，再按实际交互风险补充组件测试
- 任务工作台迁移必须保留 `task-workspace-layout`、`TaskChat`、`sdkRunnerStore`、`terminal-resize` 相关测试
