# Agent Runner 工具、设置与上下文裁剪

> 状态：实施中
> 创建：2026-05-05

## 背景

Agentic Chat 通过 Runner 工具把编码类任务交给独立的 Agent Runner 执行。旧工具名 `invoke_claude_code_runner` 暴露了底层实现细节，并且成功结果会在结构化上下文中携带 `sdk_run_id`、成本、token、耗时、工具列表等元数据，增加了后续模型回合的上下文占用。

本轮将对外工具名收敛为 `agent_runner`，并把 Runner 类型与模型配置放到设置页。

## 目标

- 对模型暴露的工具名改为 `agent_runner`
- `invoke_claude_code_runner` 与 `invoke_sdk_runner` 只保留为历史兼容别名
- 设置页可指定 Agent Runner 类型与模型供应商
- 当前仅支持 `claude_sdk` 类型，底层继续使用 `claude-agent-sdk`
- Runner 成功后，任务聊天只展示两类内容：
  - 工具调用卡片：只承载输入 `prompt`
  - 助手消息气泡：承载 Runner 最终结果 `final_text`
- 下一轮 Agent Chat 模型上下文只保留工具输入 `prompt` 和工具结果 `final_text`，不再携带 Runner 元数据

## 非目标

- 本轮不接入 Codex Runner 或其他 Runner 类型
- 本轮不移除历史消息中已经落库的旧工具名
- 本轮不把 Agent Runner 改成独立系统守护进程

## 设置模型

新增一份全局 Agent Runner 设置：

```json
{
  "runner_type": "claude_sdk",
  "provider_id": "..."
}
```

- `runner_type` 目前只允许 `claude_sdk`
- `provider_id` 可为空；为空时沿用当前 Agent Chat run 的 provider，保持旧行为兼容
- 设置中的 provider 会覆盖当前聊天选择的 provider，用于 Claude Agent SDK 的 `model`、`ANTHROPIC_BASE_URL` 与认证环境变量

## 工具协议

模型可见工具：

```json
{
  "name": "agent_runner",
  "inputSchema": {
    "type": "object",
    "properties": {
      "prompt": { "type": "string" },
      "cwd": { "type": "string" }
    },
    "required": ["prompt"]
  }
}
```

兼容别名：

- `invoke_claude_code_runner`
- `invoke_sdk_runner`

Agent Runtime 在执行前会把别名归一化为 `agent_runner` 再持久化新的消息。

## 上下文裁剪

成功路径中，Agent Runtime 仍等待底层 Runner 完成，但对下一轮模型只提供精简 transcript：

```json
[
  {
    "type": "tool_call",
    "toolName": "agent_runner",
    "input": { "prompt": "..." }
  },
  {
    "type": "tool_result",
    "toolName": "agent_runner",
    "output": { "final_text": "..." }
  }
]
```

任务聊天持久化消息结构：

```text
[tool_call message]      toolName=agent_runner, input.prompt=...
[assistant text message] content=final_text
```

不再为成功的 Agent Runner 调用持久化隐藏的精简 `tool_result` 消息。失败结果仍以失败工具结果保留诊断信息，避免错误被吞掉。

## 恢复与历史兼容

- `task_sdk_runs` / `task_sdk_events` 仍是 Runner 真实生命周期来源
- 等待 Runner 时仍写入 `task_agent_runs.checkpoint_json`
- 读取 thread 时继续修复历史孤儿工具调用
- 历史旧工具名和旧 `tool_result` 仍可读取；新消息使用 `agent_runner`

## 验证

- 服务端测试覆盖设置读写、provider 覆盖、旧工具名别名、上下文裁剪和 thread repair
- 前端测试覆盖设置页保存、工具卡片展示、新工具名识别、旧工具名兼容和不自动展开抽屉
