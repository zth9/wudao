# Agent Runner 独立状态

> 状态：已实现
> 创建：2026-05-05

## 背景

`agent_runner`（原 `invoke_claude_code_runner`）是 Agentic Chat 的一个工具，但 Agent Runner 本身是长耗时执行单元。它不能依赖前端页面、SSE 订阅或当前 React store 是否存在；页面刷新、抽屉关闭、事件流断开都只应影响展示，不应改变 Runner 的真实生命周期。

## 目标

- Agent Runner 的真实生命周期以 `task_sdk_runs` / `task_sdk_events` 为准
- Agent Runtime 在等待 Runner 时，把"当前 Agent run 正在等待哪个 SDK run"写入 `task_agent_runs.checkpoint_json`
- 刷新后读取 Agent thread 时，可以从 SDK run 自身终态修复遗留的 streaming 工具调用
- 前端订阅只负责观察和回放，不负责维持 Runner 执行

## 非目标

- 不把 Agent Runner 改成独立系统守护进程
- 不改变用户显式点击"取消"时通过后端 cancel 接口终止 Runner 的语义
- 不在本轮重写 Agent run 的完整断点续跑机制

## 状态模型

Runner 独立状态仍由 SDK Runner 表承载：

```text
task_sdk_runs.status: pending -> running -> completed | failed | cancelled
task_sdk_events:      按 seq 持久化 Runner 事件，可回放
```

Agent Runtime 额外在等待 Runner 时写入 checkpoint：

```json
{
  "type": "sdk_runner_wait",
  "tool_name": "agent_runner",
  "tool_input": { "prompt": "..." },
  "tool_call_message_id": "...",
  "sdk_run_id": "..."
}
```

`sdk_run_id` 可能比初始 `tool_call` 消息稍晚到达，因此 checkpoint 和 tool_call 消息都要能承载它。读取 thread 时，如果 tool_call 仍是 `streaming`，后端会优先从 tool_call 内容读取 `sdk_run_id`，缺失时再从 checkpoint 读取，然后根据 `task_sdk_runs.status` 进行修复。

## 验证

- 服务端测试覆盖：tool_call 丢失实时进度里的 `sdk_run_id` 时，thread repair 仍可从 checkpoint 找回并补齐结果
- 服务端测试覆盖：调用 `agent_runner` 时会写入 SDK wait checkpoint，完成后清理
