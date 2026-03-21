# TODOS

> 延迟工作追踪。每条 TODO 包含上下文、优先级和依赖关系。

## P2

### Codex SDK 集成

- **What:** 在通用 SDK runner 中新增 Codex SDK adapter，实现 Claude 写代码 + Codex review 的协作流
- **Why:** Phase 2 多 Agent 编排的基础能力；通用 SDK runner 架构已支持多 adapter，新增 Codex adapter 是直接收益
- **Pros:** 多 Agent 协作提升代码质量；Codex SDK 已在本地（`/Users/tian/osproject/codex/sdk/python`）
- **Cons:** 需要定义 Claude 与 Codex 的协作协议（谁先写、谁 review）
- **Context:** Phase 1 只接 Claude Agent SDK，验证 SDK runner 架构可行后接入 Codex。两个 SDK 均为 Python，adapter 模式可复用
- **Effort:** M（人力 ~1 周 / CC ~2h）
- **Depends on:** Phase 1 SDK runner 稳定运行
- **Source:** /plan-ceo-review 2026-03-21
