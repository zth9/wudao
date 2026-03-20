# scripts/AGENTS.md

> 重复操作的脚本规范。新增脚本前先看本文件。

## 目标

- 把高频且易出错的流程固化为可重复执行的命令
- 减少同一任务每次“换一种做法”的不确定性

## 脚本约定

1. 文件命名使用动词短语：`scripts/<action>.sh`（如 `deploy.sh`、`migrate.sh`）。
2. 统一使用：

```bash
#!/usr/bin/env bash
set -euo pipefail
```

3. 默认支持重复执行（幂等）或在文档中明确不可重复执行条件。
4. 涉及生产或破坏性操作时，必须提供确认提示与参数说明。
5. 新增脚本后同步更新根目录 `AGENTS.md` 的“常用命令”章节。

## 当前脚本状态

- `scripts/dev.sh`
  - 统一拉起前端 `vite` 与后端 `uvicorn --reload`
  - 负责转发 `INT / TERM / HUP`，避免 `pnpm dev` 在 `Ctrl+C` 时落成 `ELIFECYCLE 129`
- `scripts/ensure-uv.sh`
  - 作为根目录 `pnpm install` 的 `preinstall` 钩子，检查本机是否已安装 `uv`
  - 缺失时直接失败并输出安装指引，避免后续 `uv run` / `uv sync` 到启动阶段才报错
- `scripts/sync-server-python.sh`
  - 作为根目录 `pnpm install` 的 `postinstall` 钩子，自动执行 `uv sync --project packages/server --locked --all-groups`
  - 统一把 `uv` 缓存写到仓库 `workspace/uv-cache`，避免临时文件散落到全局目录
