# scripts/AGENTS.md

> 重复操作的脚本规范。新增或修改脚本前先看本文件。

## 目标

- 把高频且易出错的流程固化为可重复执行的命令
- 统一开发启动、Python 环境同步与 `uv` 解析方式
- 减少同一任务每次“换一种做法”的不确定性

## 脚本约定

1. 文件命名使用动词短语：`scripts/<action>.sh`。
2. 仓库脚本统一使用 bash，即使交互 shell 是 fish：

```bash
#!/usr/bin/env bash
set -euo pipefail
```

3. 默认支持重复执行（幂等）或在文档中明确不可重复执行条件。
4. 涉及生产、删除、覆盖、迁移等破坏性操作时，必须提供确认提示与参数说明。
5. 临时文件、下载缓存和本地工具统一放在仓库 `workspace/` 下。
6. 新增脚本后同步更新根目录 `AGENTS.md` 的“常用命令”章节和本文件的“当前脚本状态”。
7. server 相关 `uv run` / `uv sync` 入口必须走 `scripts/uv.sh`，不要直接假设系统 `uv` 一定存在。

## 当前脚本状态

- `scripts/dev.sh`
  - 根目录 `pnpm dev` 的实际入口
  - 同时拉起 `pnpm --filter web dev` 与 `pnpm --filter server dev`
  - 通过 `WUDAO_WEB_DEV_CMD` / `WUDAO_SERVER_DEV_CMD` 支持覆盖启动命令
  - 负责转发 `INT / TERM / HUP`，避免手动 `Ctrl+C` 时留下前后端子进程

- `scripts/ensure-uv.sh`
  - 根目录 `pnpm install` 的 `preinstall` 钩子
  - 优先复用项目本地 `workspace/tools/uv/uv`，其次检查系统 `uv`
  - 缺少 `uv` 时通过官方安装脚本 bootstrap 到 `workspace/tools/uv`
  - 依赖 `curl` 下载 installer

- `scripts/uv.sh`
  - 统一解析 `uv` 可执行文件
  - 优先使用项目本地 `workspace/tools/uv/uv`，其次回退系统 `uv`
  - 如果两者都不存在，会调用 `scripts/ensure-uv.sh` 尝试 bootstrap
  - `packages/server/package.json` 的 `dev / start / test / test:watch` 都通过它运行

- `scripts/sync-server-python.sh`
  - 根目录 `pnpm install` 的 `postinstall` 钩子
  - 执行 `uv sync --project packages/server --locked --all-groups`
  - 固定 `UV_CACHE_DIR=workspace/uv-cache`

## 常见入口

```bash
pnpm install
pnpm dev
pnpm --filter server test
pnpm --filter web test
pnpm test
```
