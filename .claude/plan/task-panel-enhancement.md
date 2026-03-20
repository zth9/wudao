# 实施计划：任务面板增强（优先级 + 子任务）

## 背景

任务中心核心闭环已稳定运行（五阶段流转 + 对话式规划 + 终端集成），但存在两个关键短板：
1. **任务缺乏优先级维度**：所有任务平等排列，无法快速识别最重要的事
2. **执行阶段缺乏粒度**：plan 是一段文本，无法追踪具体步骤的完成情况

## 任务类型

- [x] 前端 (→ Gemini)
- [x] 后端 (→ Codex)
- [x] 全栈 (→ 并行)

## 技术方案

综合 Codex（后端架构）和 Gemini（前端交互）双模型分析，选择「结构化任务增强」方向：

- **Phase A**：任务元数据增强（priority / urgency / due_at）+ 服务端筛选排序
- **Phase B**：子任务清单（task_items 独立表）+ 进度可视化

两个 Phase 可独立交付，Phase A 是 Phase B 的数据基础。

---

## Phase A：任务元数据增强

### Step A1：数据库迁移（后端）

**文件**：`packages/server/src/services/db.ts`、`packages/server/src/types/db.ts`

tasks 表新增三个字段：

| 字段 | 类型 | 默认值 | 约束 |
|------|------|--------|------|
| priority | INTEGER | 1 | CHECK (0-3)：0=无、1=低、2=中、3=高 |
| urgency | INTEGER | 0 | CHECK (0-2)：0=普通、1=重��、2=紧急 |
| due_at | TEXT | NULL | ISO 日期字符串或 null |

迁移策略：`ensureColumn` 逐字段添加（兼容已有数据），新建排序索引。

更新 `TaskRow` 类型定义，新增 `priority`、`urgency`、`due_at` 字段。

### Step A2：服务端筛选与排序（后端）

**文件**：`packages/server/src/routes/tasks.ts`、`packages/server/src/services/task-route-helpers.ts`

改造 `GET /tasks` 接口，新增查询参数：

- `priority=0..3`（可选筛选）
- `urgency=0..2`（可选筛选）
- `sort=updated_at|priority|urgency|due_at`（默认 updated_at）
- `limit`（默认 20，最大 100）
- `cursor`（base64url 编码的游标，用于翻页）

返回格式从数组改为分页信封：
```json
{
  "items": [...],
  "page": { "next_cursor": "...", "has_more": true, "sort": "priority", "limit": 20 }
}
```

前端 API 适配器兼容新旧两种格式（过渡期）。

### Step A3：更新任务接口（后端）

**文件**：`packages/server/src/routes/tasks.ts`

`PUT /tasks/:id` 接受新字段，增加校验：
- `priority`：整数 0-3，超范围返回 400
- `urgency`：整数 0-2，超范围返回 400
- `due_at`：null 或合法 ISO 日期字符串

`POST /` 创建任务时也接受可选的 priority/urgency/due_at。

### Step A4：前端类型与 API 适配（前端）

**文件**：`packages/web/src/services/api.ts`、`packages/web/src/stores/taskStore.ts`

- 扩展 `Task` 类型：新增 `priority`、`urgency`、`due_at`、`item_total`、`item_done` 字段
- 扩展 `tasks.list()` 参数：支持 sort/priority/urgency/cursor/limit
- 新增分页响应类型 `TaskListResponse`，兼容旧数组格式
- taskStore 新增 `sortBy`、`nextCursor`、`hasMore` 状态，`fetchMore()` 方法

### Step A5：任务列表 UI 增强（前端）

**文件**：`packages/web/src/components/TaskListView.tsx`、`packages/web/src/components/task-panel/constants.ts`

- 新增常量：`PRIORITY_LABELS`（无/低/中/高）、`PRIORITY_COLORS`、`URGENCY_LABELS`、`URGENCY_COLORS`
- TaskCard 新增：优先级色点指示器、紧急度徽章（仅 urgency > 0 时显示）、截止日期显示
- 新增排序下拉控件（更新时间 / 优先级 / 紧急度 / 截止日期），触发服务端重新请求
- 进度条预留位（item_total > 0 时显示完成百分比，Phase B 数据就绪后自动生效）

### Step A6：任务详情页元数据编辑（前端）

**文件**：`packages/web/src/components/task-panel/Header.tsx`

- Header 下方新增一行元数据控件：优先级选择器（分段控件）、紧急度选择器、截止日期选择器
- 修改即时保存（复用现有 debounce update 机制）
- 视觉风格：与现有 type/status 徽章保持一致的 zinc 暗色调

### Step A7：Phase A 测试计划

- **DB 测试**：字段存在性、CHECK 约束拒绝越界值、索引存在性
- **Route 测试**：筛选（priority/urgency/status 组合）、排序（4 种排序字段）、游标分页（next_cursor 稳定性）、无效参数返回 400、PUT 接受新字段
- **Store 测试**：list 传参正确、分页状态更新、update payload 包含新字段

---

## Phase B：子任务清单

### Step B1：数据库新表（后端）

**文件**：`packages/server/src/services/db.ts`、`packages/server/src/types/db.ts`

新建 `task_items` 表：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| task_id | TEXT NOT NULL | FK → tasks(id) ON DELETE CASCADE |
| title | TEXT NOT NULL | 子任务标题 |
| done | INTEGER DEFAULT 0 | CHECK (0,1) |
| sort_order | INTEGER NOT NULL | 排序序号 |
| created_at | TEXT | datetime('now') |

索引：`(task_id, sort_order)`、`(task_id, done)`。

新增 `TaskItemRow` 类型定义。

### Step B2：子任务 CRUD API（后端）

**文件**：`packages/server/src/routes/tasks.ts`（或提取 `task-items-route.ts`）

新增端点：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/tasks/:id/items` | 按 sort_order 排序返回子任务列表 |
| POST | `/tasks/:id/items` | 创建子任务，sort_order = max + 1 |
| PATCH | `/tasks/:id/items/:itemId` | 更新 title / done / sort_order |
| DELETE | `/tasks/:id/items/:itemId` | 删除子任务 |
| PUT | `/tasks/:id/items/reorder` | 批量更新排序（事务内执行） |

所有写操作都校验 `task_id` 归属（`WHERE id = ? AND task_id = ?`）。

`GET /tasks` 列表接口通过 LEFT JOIN 子查询返回 `item_total` 和 `item_done` 聚合字段。

### Step B3：前端子任务 API 与 Store（前端）

**文件**：`packages/web/src/services/api.ts`、`packages/web/src/stores/taskStore.ts`

- 新增 `TaskItem` 类型和 `taskItems` API 方法（list/create/update/delete/reorder）
- taskStore 新增：`items: Record<string, TaskItem[]>`、`fetchItems`、`createItem`、`toggleItem`、`deleteItem`、`reorderItems`
- 乐观更新：toggle/delete 先更新本地状态，失败时回滚

### Step B4：ChecklistPanel 组件（前端）

**文件**：新建 `packages/web/src/components/task-panel/ChecklistPanel.tsx`

核心交互：
- 复选框切换完成状态（点击即保存）
- 行内编辑标题（失焦保存）
- 拖拽排序（复用项目已有的 @dnd-kit）
- 底部「+ 添加步骤」按钮
- 已完成项：删除线 + 半透明
- 顶部进度条（蓝色填充，百分比文字）

集成位置：`TaskPanel.tsx` 中，在 EditArea/PlanChat 下方，所有阶段可见（execution 阶段突出显示）。

### Step B5：TaskCard 进度指示器（前端）

**文件**：`packages/web/src/components/TaskListView.tsx`

- 当 `item_total > 0` 时，在 TaskCard 底部显示进度条（薄条形，蓝色填充）
- 进度文字：「3/5 步骤完成」
- 全部完成时进度条变绿，提示可进入 Review 阶段

### Step B6：Phase B 测试计划

- **DB 测试**：task_items 表存在、FK CASCADE 删除任务时级联清理子任务、CHECK 约束
- **Route 测试**：子任务 CRUD 全路径、404（任务不存在/子任务不存在）、400（缺少 title）、reorder 事务一致性
- **Store 测试**：fetchItems 正确填充、toggle 乐观更新、delete 后列表更新、进度聚合字段在列表中可用

---

## 关键文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/server/src/services/db.ts` | 修改 | 新增字段迁移 + task_items 建表 |
| `packages/server/src/types/db.ts` | 修改 | TaskRow 新增字段 + TaskItemRow 类型 |
| `packages/server/src/routes/tasks.ts` | 修改 | GET 分页改造 + PUT 新字段 + 子任务端点 |
| `packages/server/src/services/task-service.ts` | 修改 | 校验逻辑、nextTaskId 不变 |
| `packages/server/src/services/task-route-helpers.ts` | 修改 | 分页/游标/筛选辅助函数 |
| `packages/web/src/services/api.ts` | 修改 | Task 类型扩展 + 子任务 API + 分页适配 |
| `packages/web/src/stores/taskStore.ts` | 修改 | 分页状态 + 子任务状态 + 排序控制 |
| `packages/web/src/components/TaskListView.tsx` | 修改 | 排序控件 + 优先级/紧急度徽章 + 进度条 |
| `packages/web/src/components/task-panel/Header.tsx` | 修改 | 元数据编辑控件行 |
| `packages/web/src/components/task-panel/constants.ts` | 修改 | 新增优先级/紧急度常量 |
| `packages/web/src/components/task-panel/ChecklistPanel.tsx` | 新建 | 子任务清单组件 |
| `packages/web/src/components/TaskPanel.tsx` | 修改 | 集成 ChecklistPanel |

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| GET /tasks 返回格式变更导致前端崩溃 | API 适配器兼容数组和分页信封两种格式，过渡期双格式支持 |
| SQLite ALTER TABLE 限制（不支持 CHECK 约束添加） | ensureColumn 添加字段时不带 CHECK，在应用层校验；新建表时带完整约束 |
| 子任务拖拽排序并发冲突 | reorder 接口在事务内执行，前端乐观更新 + 失败回滚 |
| 游标分页在数据变更时跳过/重复 | 使用 (sort_field, updated_at, id) 三元组作为稳定游标 |
| Phase B 子任务数量过多影响列表性能 | 聚合子查询在 SQL 层完成，不做 N+1 查询 |

## 交付顺序

1. 先交付后端迁移 + API（A1→A2→A3），前端兼容适配器同步就绪
2. 交付前端列表/排序/徽章 UI（A4→A5��A6）
3. 交付 Phase A 测试（A7）
4. 交付子任务后端（B1→B2）
5. 交付子任务前端（B3→B4→B5）
6. 交付 Phase B 测试（B6）
7. 更新 status.md + changelog.md

## SESSION_ID（供 /ccg:execute 使用）

- CODEX_SESSION: 019c9e76-0d1a-7742-83b7-1d6965e16db4
- GEMINI_SESSION: eb479994-a453-4d04-b939-702952657782
