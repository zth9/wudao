# 任务管理 Agentic 化 — 统一实施计划

> Codex 后端规划 + Gemini 前端规划综合，以用户原始方案为权威基准

## 总览

在现有 Workflow 基础上叠加三层 Agentic 能力，不破坏已有架构：

```
Layer 3: 反思校验   — AI 审查自己的输出
Layer 2: 建议系统   — AI 主动观察和推荐
Layer 1: 状态机     — 灵活的阶段流转
现有 Workflow 基础   — 不变
```

分 5 步实施，每步独立可验证。

---

## Step 1: 数据库迁移 + 状态机验证（后端）

### 1.1 数据模型

**TaskRow 增加字段**：
```typescript
// packages/server/src/types/db.ts
stage_log: string;  // JSON 数组，DEFAULT '[]'
```

**StageTransition 类型**：
```typescript
interface StageTransition {
  from: TaskStatus;
  to: TaskStatus;
  reason: string;
  triggered_by: "user" | "ai_suggestion";
  at: string;  // ISO 时间戳
}
```

**DB 迁移**（packages/server/src/services/db.ts）：
```typescript
ensureColumn(db, "tasks", "stage_log", "TEXT DEFAULT '[]'");
```

### 1.2 状态机逻辑

**文件**: `packages/server/src/services/task-service.ts`

```typescript
const STAGE_ORDER: TaskStatus[] = ["context", "planning", "execution", "review", "summary", "done"];

const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  context:   ["planning", "execution"],   // 正常前进 / 跳过规划
  planning:  ["context", "execution"],     // 补充背景 / 确认方案
  execution: ["planning", "review"],       // 修改方案 / 正常前进
  review:    ["planning", "execution", "summary"],  // 方案有误 / 继续执行 / 正常前进
  summary:   ["review", "done"],           // 补充复盘 / 正常前进
  done:      [],
};

export function validateTransition(from: TaskStatus, to: TaskStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isBackwardTransition(from: TaskStatus, to: TaskStatus): boolean {
  return STAGE_ORDER.indexOf(to) < STAGE_ORDER.indexOf(from);
}
```

### 1.3 路由修改

**文件**: `packages/server/src/routes/tasks.ts` — PUT /:id

改为 CAS (Compare-And-Swap) 模式：
- 当 `status` 发生变化时：
  1. 调用 `validateTransition(existing.status, newStatus)` 校验合法性
  2. 如果是 `isBackwardTransition()`，要求 `body.transition_reason` 不为空
  3. 将 `{ from, to, reason, triggered_by, at }` 追加到 `stage_log` JSON 数组
  4. 使用 `WHERE id = ? AND status = ?` 防止并发冲突
- 非法转换返回 400 + 具体错误信息

**PUT /:id 请求体新增字段**：
```typescript
transition_reason?: string;     // 回退/跳跃原因
transition_triggered_by?: "user" | "ai_suggestion";  // 默认 "user"
```

### 1.4 advanceTask 适配

`advanceTask()` 内部也需要调用 `validateTransition()`，保证三条状态写入路径（PUT、advanceTask、persistPlanningResult）统一走验证。

### 涉及文件
- [x] `packages/server/src/types/db.ts` — 增加 stage_log 字段
- [x] `packages/server/src/services/db.ts` — ensureColumn 迁移
- [x] `packages/server/src/services/task-service.ts` — 状态机函数 + advanceTask 适配
- [x] `packages/server/src/routes/tasks.ts` — PUT /:id 路由修改

### 验收标准
- 合法转换成功执行，stage_log 正确追加
- 非法转换返回 400
- 回退无 reason 返回 400
- CAS 防并发冲突
- 现有测试全部通过

---

## Step 2: 前端阶段回退交互

### 2.1 前端常量 + 类型

**文件**: `packages/web/src/components/task-panel/constants.ts`

前端同步 ALLOWED_TRANSITIONS（与后端保持一致，用于 UI 灰显判断）：

```typescript
export const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  context:   ["planning", "execution"],
  planning:  ["context", "execution"],
  execution: ["planning", "review"],
  review:    ["planning", "execution", "summary"],
  summary:   ["review", "done"],
  done:      [],
};

export const STAGE_ORDER: TaskStatus[] = ["context", "planning", "execution", "review", "summary", "done"];
```

**文件**: `packages/web/src/services/api.ts`

Task 接口增加 `stage_log`：
```typescript
stage_log: string;  // JSON string
```

tasks.update 增加 `transition_reason` 和 `transition_triggered_by` 参数。

### 2.2 StageBar 改造

**文件**: `packages/web/src/components/task-panel/StageBar.tsx`

- 每个阶段按钮增加三种视觉状态：
  - **当前阶段**: `bg-blue-600 text-white`（不变）
  - **可达阶段**: `bg-zinc-700 text-zinc-300 hover:bg-zinc-600 cursor-pointer`
  - **不可达阶段**: `bg-zinc-800/50 text-zinc-600 cursor-not-allowed opacity-50`
- 点击可达阶段时，如果是回退（`isBackwardTransition`），弹出确认对话框

### 2.3 RegressionDialog 组件

**新建**: `packages/web/src/components/task-panel/RegressionDialog.tsx`

- 使用 AlertDialog (shadcn)
- 包含 textarea 输入回退原因
- 原因不为空才可提交
- 提交后调用 `taskStore.transitionTask(taskId, targetStatus, reason)`

### 2.4 StageActions 增强

**文件**: `packages/web/src/components/task-panel/StageActions.tsx`

- context 阶段增加"跳过规划"按钮（直接进入 execution）
- 非 done 阶段，若存在合法回退路径，显示回退选项

### 2.5 taskStore 适配

**文件**: `packages/web/src/stores/taskStore.ts`

新增方法：
```typescript
transitionTask: (taskId: string, targetStatus: TaskStatus, reason?: string, triggeredBy?: string) => Promise<void>;
```

内部调用 `api.update(id, { status, transition_reason, transition_triggered_by })`。

### 涉及文件
- [x] `packages/web/src/components/task-panel/constants.ts`
- [x] `packages/web/src/services/api.ts` — Task 类型 + update payload
- [x] `packages/web/src/components/task-panel/StageBar.tsx`
- [x] `packages/web/src/components/task-panel/RegressionDialog.tsx` — 新建
- [x] `packages/web/src/components/task-panel/StageActions.tsx`
- [x] `packages/web/src/stores/taskStore.ts`

### 验收标准
- StageBar 不可达阶段灰显不可点
- 回退操作弹出原因对话框，提交成功
- context 阶段可跳过规划直接进入 execution
- 前进操作正常工作
- 前端 ALLOWED_TRANSITIONS 与后端一致

---

## Step 3: 规则引擎建议系统

### 3.1 后端建议生成

**新建**: `packages/server/src/services/task-suggestions.ts`

```typescript
export interface AISuggestion {
  id: string;
  type: "transition" | "decompose" | "risk" | "enrichment";
  title: string;
  detail: string;
  action?: { label: string; payload: Record<string, unknown> };
}

export function generateRuleSuggestions(task: TaskListRow): AISuggestion[] {
  // 5 条规则（同步、零 LLM 成本）：
  // 1. planning 阶段 + 有 plan → 建议确认方案
  // 2. execution 阶段 + 无终端 → 风险提醒
  // 3. 有 plan + 无 checklist → 建议拆解
  // 4. 超过截止日期 → 风险提醒
  // 5. context 阶段 + 描述过短 → 建议补充
}
```

### 3.2 路由增强

**文件**: `packages/server/src/routes/tasks.ts` — GET /:id

增加 `?with_suggestions=true` 查询参数支持：
```typescript
tasks.get("/:id", (c) => {
  const row = getTaskWithStats(c.req.param("id"));
  if (!row) return c.json({ error: "Task not found" }, 404);

  const withSuggestions = c.req.query("with_suggestions") === "true";
  if (withSuggestions) {
    return c.json({ ...row, suggestions: generateRuleSuggestions(row) });
  }
  return c.json(row);
});
```

### 3.3 前端 SuggestionBar 组件

**新建**: `packages/web/src/components/task-panel/SuggestionBar.tsx`

- 视觉风格：indigo-950/30 背景 + indigo-500/20 边框（适配 zinc 暗色主题）
- 每条建议显示图标 + 标题 + 详情（可展开）+ 操作按钮 + 关闭按钮
- 最多显示 2 条建议
- dismissed 状态用 sessionStorage 管理（关闭面板后重置）

图标映射：
- transition: ArrowRight
- decompose: ListChecks
- risk: AlertTriangle
- enrichment: Sparkles

### 3.4 前端集成

**文件**: `packages/web/src/stores/taskStore.ts`

- fetchOne 增加 `with_suggestions=true` 参数
- 新增 `suggestions` 状态字段
- 新增 `dismissSuggestion(id)` 方法

**文件**: `packages/web/src/components/task-panel/index.tsx` (或 TaskPanel 主组件)

- 在 StageBar 下方、StageActions 上方插入 SuggestionBar

### 涉及文件
- [x] `packages/server/src/services/task-suggestions.ts` — 新建
- [x] `packages/server/src/routes/tasks.ts` — GET /:id 增强
- [x] `packages/web/src/components/task-panel/SuggestionBar.tsx` — 新建
- [x] `packages/web/src/stores/taskStore.ts` — suggestions 状态
- [x] TaskPanel 主组件 — 集成 SuggestionBar

### 验收标准
- planning 阶段 + 有方案 → 显示"确认方案"建议
- execution 阶段 + 无终端 → 显示"尚未启动终端"提醒
- 有方案 + 无子任务 → 显示"建议拆解"
- 超过截止日期 → 显示警告
- context 阶段 + 描述过短 → 显示补充提示
- 关闭建议后不再显示（sessionStorage）
- 最多显示 2 条

---

## Step 4: AI 自动拆解子任务

### 4.1 后端拆解逻辑

**文件**: `packages/server/src/services/task-service.ts`

```typescript
export async function decomposeTask(taskId: string): Promise<string[]> {
  const task = getTaskById(taskId);
  if (!task) throw new Error("Task not found");
  if (!task.plan) throw new Error("任务尚无方案，无法拆解");

  const prompt = `根据以下任务方案，提取 3-8 个可独立执行的子任务标题。

任务：${task.title}
方案：${task.plan}

严格返回 JSON 数组，每个元素是一个子任务标题字符串。不要包含其他内容。`;

  const result = await chatComplete([{ role: "user", content: prompt }]);
  const match = result.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("拆解结果解析失败");

  const titles: string[] = JSON.parse(match[0]);
  return titles.filter(t => typeof t === "string" && t.trim()).slice(0, 8);
}
```

### 4.2 路由

**文件**: `packages/server/src/routes/tasks.ts`

```typescript
// POST /tasks/:id/decompose — AI 拆解子任务
tasks.post("/:id/decompose", async (c) => {
  const id = c.req.param("id");
  try {
    const titles = await decomposeTask(id);
    // 批量创建 task_items
    for (const title of titles) {
      createItemTx(id, title);
    }
    return c.json({ items: listTaskItems(id) });
  } catch (err) {
    // ...error handling
  }
});
```

### 4.3 前端集成

**文件**: `packages/web/src/services/api.ts`

```typescript
decompose: (taskId: string) =>
  request<{ items: TaskItem[] }>(`/tasks/${taskId}/decompose`, { method: "POST" }),
```

**文件**: `packages/web/src/stores/taskStore.ts`

```typescript
decompose: async (taskId: string) => {
  set({ generating: true });
  try {
    const { items } = await api.decompose(taskId);
    set({ currentItems: items });
    await get().fetchOne(taskId);
    await refreshTasks();
  } finally {
    set({ generating: false });
  }
},
```

SuggestionBar 中 decompose 建议的 action 按钮触发此方法。

### 涉及文件
- [x] `packages/server/src/services/task-service.ts` — decomposeTask
- [x] `packages/server/src/routes/tasks.ts` — POST /:id/decompose
- [x] `packages/web/src/services/api.ts` — decompose 方法
- [x] `packages/web/src/stores/taskStore.ts` — decompose action

### 验收标准
- 有方案的任务可成功拆解出 3-8 个子任务
- 无方案任务调用返回 400
- 前端点击"AI 自动拆解"后子任务列表刷新
- generating 状态正确切换（按钮 loading）

---

## Step 5: AI 自我反思

### 5.1 反思函数

**文件**: `packages/server/src/services/task-service.ts`

```typescript
export async function reflectOnOutput(
  original: string,
  taskTitle: string,
  outputType: "plan" | "summary"
): Promise<string> {
  const label = outputType === "plan" ? "实施方案" : "任务总结";
  const prompt = `请审查以下${label}，检查：
1. 是否有遗漏的关键步骤
2. 是否有不切实际的假设
3. 验收标准是否可验证

任务标题：${taskTitle}
待审查内容：
${original}

如果内容没有问题，原样返回。如果有问题，输出修正后的完整版本（不要解释改了什么）。`;

  try {
    return await chatComplete([{ role: "user", content: prompt }]);
  } catch {
    return original;  // 反思失败回退到原始内容
  }
}
```

### 5.2 advanceTask 修改

```typescript
// 原来：
const result = await chatComplete([...]);
db.prepare(`UPDATE tasks SET ${field} = ?, status = ?, ...`).run(result, nextStatus, id);

// 改为：
const draft = await chatComplete([...]);
const refined = await reflectOnOutput(draft, task.title, field as "plan" | "summary");
db.prepare(`UPDATE tasks SET ${field} = ?, status = ?, ...`).run(refined, nextStatus, id);
```

### 5.3 LLM 超时

**文件**: `packages/server/src/services/llm.ts`

`postMessages()` 增加 AbortController + 30s 超时：
```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30_000);
try {
  const resp = await fetch(endpoint, { ...opts, signal: controller.signal });
  // ...
} finally {
  clearTimeout(timeout);
}
```

### 5.4 可选：规划对话反思

`persistPlanningResult()` 中，提取到 plan 后异步执行反思：
- 先同步存储 draft plan + 发送 done 事件
- 后台异步调用 `reflectOnOutput(plan, task.title, "plan")`
- 反思完成后更新 plan 字段
- 前端 `onDone` 回调中 `fetchOne(taskId)` 时会拿到最新（可能已反思）的 plan

### 涉及文件
- [x] `packages/server/src/services/task-service.ts` — reflectOnOutput + advanceTask 修改
- [x] `packages/server/src/services/llm.ts` — 超时控制
- [x] `packages/server/src/services/task-route-helpers.ts` — persistPlanningResult 异步反思

### 验收标准
- advanceTask 生成的 plan/summary 经过反思后质量更高
- 反思失败不影响正常流程（回退到 draft）
- LLM 调用有 30s 超时保护
- 规划对话完成后 plan 可能被异步更新

---

## 实施顺序与依赖

```
Step 1 (后端状态机) ← 无依赖，最先做
Step 2 (前端回退交互) ← 依赖 Step 1
Step 3 (建议系统) ← 依赖 Step 1（可与 Step 2 并行）
Step 4 (AI 拆解) ← 依赖 Step 3
Step 5 (AI 反思) ← 无依赖，可与 Step 2-4 并行
```

建议执行顺序：**1 → 2 → 3 → 4 → 5**（线性推进，每步验证）

## 测试计划

| 层级 | 测试点 | 方式 |
|------|--------|------|
| 状态机 | 30 种转换组合(6x5)合法/非法 | 单元测试 |
| stage_log | 日志格式、回退必须有 reason | 单元测试 |
| CAS | 并发写入冲突检测 | 单元测试 |
| 规则引擎 | 5 条规则触发/不触发 | 单元测试 |
| decompose | mock LLM → 正确创建 items | 集成测试 |
| 反思 | mock LLM → 两次调用链路 | 单元测试 |
| 前端 StageBar | 可达/不可达视觉 | 手动验收 |
| 前端 SuggestionBar | 建议显示/关闭/执行 | 手动验收 |
