# Wudao 增量重构计划（方案 A）

> 综合 Codex 后端规划 + Gemini 前端规划，Claude 编排统一

## 执行基线

- 测试门禁：`pnpm test` 保持 147 个测试全绿（server 113 + web 34）
- 构建门禁：`pnpm --filter web build` 通过
- 不改变任何 API 接口契约和用户可见行为
- 每步独立提交，可单步回退

## 总览

| Step | 域 | 主题 | 优先级 | 预估净减行数 |
|------|----|------|--------|-------------|
| 1 | 后端 | `llm.ts` 启动阻塞修复 | P0 | -5~-12 |
| 2 | 后端 | `usage.ts` ProviderAdapter 去重 | P0 | -70~-120 |
| 3 | 前端 | `sections.tsx` 拆分为 6 个原子组件 | P0 | -548→6文件 |
| 4 | 前端 | 常量集中化 + TaskWorkspaceView 瘦身 | P1 | -100~-140 |
| 5 | 后端 | `terminal.ts` 职责拆分 | P1 | -25~-45 |
| 6 | 后端 | JSON 解析工具提取通用 utils | P1 | -15~-30 |
| 7 | 后端 | `getTask()` 下沉 task-service | P2 | -8~-18 |
| 8 | 跨端 | `ChatMessage` 类型收敛 | P2 | -10~-25 |

---

## Step 1：修复 llm.ts 启动阻塞（后端 P0）

**目标**：消除模块加载时 `execSync` 同步阻塞

**涉及文件**：
- `packages/server/src/services/llm.ts`
- `packages/server/src/services/llm.test.ts`

**操作**：
1. 删除顶层 `const CLAUDE_VERSION = getClaudeVersion()`
2. 改为惰性缓存：首次调用 `buildHeaders()` 时探测，失败回退 `unknown`
3. 补测试：模块导入不触发 execSync、版本探测失败回退

**验证**：`pnpm --filter server test`

---

## Step 2：usage.ts ProviderAdapter 去重（后端 P0）

**目标**：抽象 MiniMax/GLM/Kimi 通用请求管线，消除重复

**涉及文件**：
- `packages/server/src/routes/usage.ts`（大幅瘦身）
- `packages/server/src/services/usage-utils.ts`
- 新增 `packages/server/src/services/usage-adapters.ts`

**操作**：
1. 定义 ProviderAdapter 契约（name/buildRequest/parse/formatHttpError）
2. 统一 fetchProviderJson 管线（网络错误/JSON解析/HTTP错误映射）
3. 3 个 adapter 仅保留 provider 特有字段映射
4. usage.ts 路由层改为"组装 adapter + Promise.allSettled"编排
5. 删除旧 fetchMiniMax/fetchGLM/fetchKimi

**验证**：`pnpm --filter server test`

---

## Step 3：sections.tsx 拆分（前端 P0）

**目标**：548 行单文件拆为 6 个原子组件

**新建文件**：
- `task-panel/Header.tsx`
- `task-panel/StageBar.tsx`
- `task-panel/EditArea.tsx`
- `task-panel/StageActions.tsx`
- `task-panel/PlanChat.tsx`
- `task-panel/SessionSection.tsx`

**操作**：
1. 逐个提取组件到独立文件，保持 props 接口不变
2. 更新 TaskPanel.tsx 导入路径
3. 删除 sections.tsx

**验证**：`pnpm --filter web test && pnpm --filter web build`

---

## Step 4：常量集中化 + TaskWorkspaceView 瘦身（前端 P1）

**目标**：消除常量重复，提取内联组件

**涉及文件**：
- `task-panel/constants.ts`（扩充）
- `TaskWorkspaceView.tsx`（瘦身）
- `TaskListView.tsx`（改用集中常量）
- 新增 `dialogs/NewTaskTerminalDialog.tsx`

**操作**：
1. STAGES/PERMISSION_MODES/STATUS_COLORS 等统一到 constants.ts
2. 提取 NewTaskTerminalDialog 到 dialogs/
3. VerticalStageIndicator 使用集中常量
4. 提取 usePanelResize hook（可选）

**验证**：`pnpm --filter web test && pnpm --filter web build`

---

## Step 5：terminal.ts 职责拆分（后端 P1）

**目标**：剥离非终端职责，聚焦 WS/PTY 会话管理

**涉及文件**：
- `packages/server/src/services/terminal.ts`
- 新增 `packages/server/src/services/task-claude-md.ts`

**操作**：
1. 迁移 `generateTaskClaudeMd` 到 `task-claude-md.ts`
2. 迁移 `hasPersistedClaudeSession` 到独立模块
3. terminal.ts 通过导入调用

**验证**：`pnpm --filter server test`

---

## Step 6：JSON 解析工具提取（后端 P1）

**目标**：抽离通用 JSON 安全解析能力

**涉及文件**：
- `packages/server/src/services/task-route-helpers.ts`
- 新增 `packages/server/src/services/json-utils.ts`

**操作**：
1. 提取 parseJsonOr 到 json-utils.ts
2. task-route-helpers.ts 改为调用通用工具
3. 补 json-utils.test.ts

**验证**：`pnpm --filter server test`

---

## Step 7：getTask() 下沉（后端 P2）

**目标**：统一 tasks 路由数据访问入口

**涉及文件**：
- `packages/server/src/routes/tasks.ts`
- `packages/server/src/services/task-service.ts`

**操作**：
1. 在 task-service.ts 导出 getTaskById(id)
2. tasks.ts 删除本地 getTask，统一用 service

**验证**：`pnpm --filter server test`

---

## Step 8：ChatMessage 类型收敛（跨端 P2）

**目标**：合并前后端重复 ChatMessage 定义

**涉及文件**：
- `packages/server/src/services/llm.ts`
- `packages/web/src/stores/taskStore.ts`
- `packages/server/src/types/db.ts`（或新增共享类型文件）

**操作**：
1. 在 server types/ 中定义 ChatMessage
2. llm.ts 改为 import
3. 前端 taskStore 保持本地定义（避免跨包依赖），但对齐字段

**验证**：`pnpm test`

---

## 风险控制

- 每步单独提交，禁止跨步混改
- 每步完成后执行 `pnpm test` 全量回归
- 异常时 `git revert` 单步回退，不影响其他步骤
