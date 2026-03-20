# packages/server/AGENTS.md

> Server 端局部规则。进入本目录工作时，在遵循根目录 `AGENTS.md` 的前提下优先使用本文件。

## 范围与目标

- 范围：`packages/server/src/**`、`packages/server/tests/**`
- 目标：保证接口稳定、数据一致、终端会话可靠

## 文档入口

- Task 工作台专项：`docs/design/task-workspace-integration.md`
- 后端 Python 重构计划：`docs/design/server-python-refactor.md`
- 大功能计划模板：`docs/design/feature-plan-template.md`

## 后端开发规则

1. 任何接口或数据结构变更，先更新文档再改实现。
2. 路由层只做协议编排，业务逻辑优先放到 `packages/server/src/` 下的独立模块中，避免 `app.py` 继续膨胀。
3. 涉及 PTY 会话管理的改动，必须考虑断连、重连、并发切换。
4. DB 变更必须提供兼容策略与回滚方案，避免破坏已有数据。
5. 所有错误路径都要返回可诊断信息，禁止吞错。

## 自测要求

- 本地运行：`pnpm --filter server dev`
- 自动化测试：`pnpm --filter server test`
- 涉及 API 变更时，至少手动验证对应端点的成功与失败路径
- 涉及会话/终端逻辑时，验证 create/attach/list/exit 主流程

## 文档回写

- 功能完成后同步更新：`status.md`、`docs/changelog.md`
- 若协议有变化，确保前端类型和服务调用同步更新
