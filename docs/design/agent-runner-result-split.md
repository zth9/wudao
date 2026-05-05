# agent_runner 结果拆分为消息气泡

> 状态：已实现
> 创建：2026-05-05

## 背景

`agent_runner`（原 `invoke_claude_code_runner`）的执行结果原先和工具输入一起合并在 `tool_exchange` 折叠卡片中。成功结果里的 `final_text` 可能很长，并且会和 `tool_names`、`total_cost_usd`、`duration_ms` 等元数据一起以 JSON 展示，阅读体验差。

## 目标

- Agent Runner 工具卡片主要展示输入、状态与 Agent Runner 入口
- 成功结果里的 `final_text` 以助手 Markdown 气泡展示
- 失败结果、旧历史结果、非 Agent Runner 工具保持可见且行为不变

## 最终方案

后端只在 Agent Runner 成功且存在非空 `final_text` 时拆分结果：

```text
[tool_call message]       -> SSE message.completed
[tool_result message]     -> SSE message.completed
                              output 为精简元数据，并带 final_text_split: true
[assistant text message]  -> SSE message.completed
                              content 为 final_text
```

如果工具失败、`final_text` 为空，或者结果来自旧历史数据，则不拆分，继续按原工具结果卡片展示。

## 关键设计

- 拆分判定集中在 `packages/server/src/agent_runtime/sdk_result_split.py`
- 后端使用 SDK Runner 工具注册表判断工具名，不维护独立硬编码列表
- 精简 output 使用 allowlist，只保留 `ok`、`status`、`sdk_run_id`、`runner_type`、`tool_name`、`cwd`、`tool_names`、`total_cost_usd`、`total_tokens`、`duration_ms`、`num_turns`、`message`
- 精简 output 增加 `final_text_split: true`，前端只根据这个显式标记跳过 `tool_result`
- `tool_transcript` 对 Agent Runner 工具精简为 `{"ok": true/false, "final_text": "..."}` 以减少 LLM context 占用
- `thread_repair.py` 也复用同一拆分规则，刷新修复孤儿 Runner 工具调用时保持相同历史结构

## 历史兼容

旧数据里的完整 Agent Runner `tool_result` 没有 `final_text_split: true` 标记，前端不会跳过，因此旧历史中的 `final_text` 仍会在工具卡片里可见。失败结果也不会带该标记，错误信息继续在工具结果中展示。

## 涉及文件

| 文件 | 改动 |
|------|------|
| `packages/server/src/agent_runtime/sdk_result_split.py` | SDK Runner 结果拆分 helper |
| `packages/server/src/agent_runtime/runner.py` | 成功结果拆分为精简 tool_result + assistant text，tool_transcript 精简 |
| `packages/server/src/agent_runtime/thread_repair.py` | 孤儿 Runner 工具调用修复时同步拆分 |
| `packages/web/src/utils/sdk-runner.ts` | split marker 判断 |
| `packages/web/src/components/task-panel/TaskChat.tsx` | 跳过带 split marker 的 Agent Runner tool_result，使用 Bot 图标 |
| `packages/server/tests/test_task_agent_chat.py` | 覆盖成功拆分、失败不拆分、repair 拆分 |
| `packages/web/src/components/task-panel/TaskChat.test.ts` | 覆盖结果跳过、旧历史保留、失败保留 |

## 验证

- `pnpm --filter server test -- tests/test_task_agent_chat.py`
- `pnpm --filter web test -- src/components/task-panel/TaskChat.test.ts`

提交前仍建议执行：

- `pnpm --filter web exec tsc --noEmit --noUnusedLocals --noUnusedParameters`
- `pnpm --filter server test`
- `pnpm --filter web test`
