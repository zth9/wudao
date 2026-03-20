# packages/web/AGENTS.md

> Web 端局部规则。进入本目录工作时，在遵循根目录 `AGENTS.md` 的前提下优先使用本文件。

## 范围与目标

- 范围：`packages/web/src/**`
- 目标：保证 UI 交互稳定、状态一致、可维护

## 文档入口

- Task 工作台专项：`docs/design/task-workspace-integration.md`
- 大功能计划模板：`docs/design/feature-plan-template.md`

## 前端开发规则

1. **规范优先**：修改 UI 或组件时，必须严格遵守 [`docs/design/frontend-guidelines.md`](../../docs/design/frontend-guidelines.md) 定义的视觉与交互规范。
2. **Apple 风格**：保持全站拟物化/毛玻璃质感，禁止引入与整体风格割裂的第三方组件。
3. **加载体验**：默认使用统一的 `LoadingIndicator` 和稳定布局占位，避免白屏；不要再恢复全站 pulse Skeleton 体系，只有确有必要时才为局部内容补专用骨架。
4. **稳定动效**：高度/位置变化必须通过 CSS 触发以防止文字图标形变，禁止盲目使用 Framer Motion 的 `layout` 缩放动画。
5. **i18n 全覆盖**：禁止在代码中硬编码任何中/英文文本，所有内容必须通过 `t()` 调用。
6. 每轮只交付一个用户可感知变化，避免大范围混改。
7. 组件职责清晰：展示组件与状态逻辑分离，复杂逻辑优先放 `stores` / `services`。

## 自测要求

- 本地运行：`pnpm --filter web dev`
- 交付前至少执行一次构建验证：`pnpm --filter web build`
- 涉及关键交互（终端、任务流转、设置保存）时，手动走通主流程

## 文档回写

- 功能完成后同步更新：`status.md`、`docs/changelog.md`
- 若设计发生变化，先更新设计文档再改代码
