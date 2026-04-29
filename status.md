# 项目状态

> 本文件记录当前开发进度。每完成一个功能或里程碑后更新。

## 当前阶段

阶段一（任务中心）已形成稳定的任务型 Agent 工作台，当前进入体验打磨、终端真机回归与 Agentic Chat 落地前收口阶段。

当前能力基线：

- **前端已完成 HeroUI v3 基础迁移第一轮，并继续收口高频控件**：Web 端依赖已接入 `@heroui/react` / `@heroui/styles`，Tailwind CSS 已升级到 v4 并通过 `@tailwindcss/vite` 集成；现有 Apple token 已迁移到 CSS `@theme`，HTML 主题初始化与 `ThemeProvider` 同步写入 `data-theme` 以兼容 HeroUI 主题变量；新增 `components/ui/heroui.tsx` 项目级包装层，并把 Dashboard、任务列表、记忆页、设置页、任务工作台 header / 抽屉、终端启动弹窗、Agent Runner、产物抽屉和任务聊天的一批高频按钮、卡片、输入、文本域、状态标签迁入 HeroUI 包装组件。本轮进一步补齐 HeroUI Tooltip、Checkbox、Dropdown、Popover 与 Modal 包装，包装层 Button / Card / Input / TextArea 已支持 `ref` 转发，App 顶栏、任务列表筛选/排序/新建任务、任务详情元数据菜单与标题编辑、任务列表抽屉、日历弹层、设置页头像选择与默认供应商开关、终端卡片重命名和任务聊天 provider 触发器 / 工具卡片操作已继续收敛到项目级 HeroUI 控件；旧的自研 `components/ui/Dropdown.tsx`、`useDropdownTrigger.ts` 与全局 `apple-dropdown*` 样式已删除，新建任务、设置 provider、启动终端与工作台懒加载弹窗已统一到 `WudaoModal`。当前已完成 `pnpm --filter web exec tsc --noEmit --noUnusedLocals --noUnusedParameters`、`pnpm --filter web test`（18 个测试文件 / 111 个用例）与 `pnpm --filter web build`
- **协作文档与 README 已按当前代码重新对齐**：根 `AGENTS.md`、`README.md`、`packages/web/AGENTS.md`、`packages/server/AGENTS.md` 与 `scripts/AGENTS.md` 已同步到当前 `FastAPI + React` 实现；文档入口已移除不存在的设计/Review 文档引用，并补齐 Agent Runtime、Claude Code Runner、右侧三抽屉工作台、任务 workspace、全局记忆、本地 `uv` 与脚本入口等真实代码口径
- **后端风险盘点口径已改为以当前代码与测试为准**：当前仓库未保留 `docs/reviews/backend-review-2026-04-28.md` 文件，后续不再把它作为入口文档引用；本轮 `pnpm test` 确认服务端 pytest 当前为 111 个用例通过，仍需关注默认 Provider 可被清空、删除任务时 SDK Runner 取消竞态、SDK Runner 历史 SSE 终态重复发送等风险
- **前端死代码与旧代码已按 Review 建议顺序清理完成**：前端当前已修复 `tsc --noEmit` 失败项，并可通过 `pnpm --filter web exec tsc --noEmit --noUnusedLocals --noUnusedParameters`；旧版普通任务聊天发送链路已删除，`chat_messages` 仅保留为 Agent timeline 历史展示 fallback；`taskStore` 已复用 `utils/agent-timeline.ts` 的统一映射逻辑；同时清理了未用 import/参数、重复 `TASK_TYPES`、明显旧 i18n key、无引用 CSS 类和生产路径调试日志。本轮已完成 `pnpm --filter web test`（18 个测试文件 / 111 个用例）与 `pnpm --filter web build`
- **Agent Chat 运行时表外键现已支持启动期自修复**：针对历史数据库里 `task_agent_runs`、`task_agent_messages`、`task_sdk_runs`、`task_items` 仍引用已删除的 `tasks_legacy_migration` 表、导致任务聊天发送消息直接返回 `HTTP 500` 的问题，后端现在会在启动时自动重建这些运行时表到正确的 `tasks` 外键上，并保留已有 run/message/sdk/event 数据；本地开发服务已验证 `POST /api/tasks/{task_id}/agent-chat/runs` 恢复返回 `200`
- **`pnpm install` 现可自动 bootstrap 项目本地 `uv`**：根目录安装链路不再要求用户先手动安装系统级 `uv`；当本机缺少 `uv` 时，仓库会自动把官方 `uv` 安装到 `workspace/tools/uv`，随后继续执行 `uv sync --project packages/server --locked --all-groups`，把后端 `.venv` 与 `httpx[socks]` 等 Python 依赖一并准备好
- **服务端现已内置 `httpx` 的 SOCKS 代理支持**：`packages/server` 的 Python 依赖已从 `httpx` 切到 `httpx[socks]`，首次安装或后续 `pnpm install` 时会把 `socksio` 一并装进 `.venv`；当本机设置了 `ALL_PROXY` / `HTTPS_PROXY` 等 SOCKS 代理环境变量时，任务解析与聊天请求不再因为缺少 `socksio` 而直接 500
- **开发代理已固定指向 `127.0.0.1:3000`**：前端 `vite` 开发代理原先写的是 `localhost:3000`，而后端 `uvicorn --reload` 实际只绑定 `127.0.0.1:3000`；在部分机器上这会把 `/api`、`/ws` 请求错误转发到其他本地 3000 端口服务，表现为设置页请求返回 `Cannot POST /api/settings`。现在代理已改为显式命中 `127.0.0.1:3000`
- **设置页供应商加载/保存失败不再静默卡死**：前端 `settingsStore` 现会在供应商接口失败时正确结束 `loading`，并把错误提示回传到设置页；供应商弹窗保存时也已补上“保存中”态与失败提示，不会再表现成模型供应商列表一直转圈、点击保存却没有任何反馈
- **首次启动数据库初始化已补齐目录自举**：服务端数据库路径现会默认跟随 `WUDAO_HOME` 解析，并在模块导入阶段主动创建数据库父目录；首次在新机器上执行 `pnpm dev` 时，不会再因为 `~/.wudao` 或自定义数据库目录尚不存在而在 `sqlite3.connect()` 阶段直接失败
- **`pnpm install` 已自动同步服务端 Python 环境**：根目录安装链路现会自动执行 `uv sync --project packages/server --locked --all-groups`；同时把 `uv` 缓存固定到仓库 `workspace/uv-cache`，减少首次启动遗漏 Python 依赖的问题
- **默认 provider seed 已收缩为最小元数据**：后端 `db.py` 新初始化数据库时仍会预置 provider 行，但仓库内不再硬编码 `api_key`、`endpoint` 或 `model`；这些配置统一留在 `providers` 表里由用户自行填写，现有数据库中的 provider 配置也不会在启动时被自动改写，并已补充服务端回归测试
- **记忆页编辑框已改为整窗高度**：记忆页中的用户记忆与 Agent 记忆编辑模块现会直接占满视图剩余空间，编辑框本身吃满整张卡片，不再停留在约 80% 高度并把页面撑出额外滚动条；由于高度已固定，右下角的 textarea 拖拽手柄也已移除
- **记忆系统已彻底移除 OpenViking 依赖**：后端已删除 OpenViking bridge / worker、启动期 warmup 与 `/api/contexts/status`、`/api/contexts/memories` 接口；前端记忆页现只保留 `用户记忆 / Agent 记忆` 两个本地编辑模块；用户记忆与 Agent 记忆继续从 `~/.wudao/profile/*.md` 注入到任务解析、`AGENTS.md` 生成、legacy chat 与 Agent Chat
- **默认模型供应商持久化已修复**：设置页把某个供应商设为默认后，服务重启不再被数据库初始化强行改回 Claude；后端当前只会在“默认值缺失”或“出现多个默认值”时做一次兜底归一化，并已补上 `tests/test_app.py` 的重启回归测试
- **全体文档已按当前代码设计重新对齐**：`README.md`、任务工作台、Agentic Chat、记忆系统、后端 Python 重构、TDD 与前端规范文档已统一到当前 `FastAPI + React` 实现、结构化 Agent timeline、`AGENTS.md` 主产物模型与 `LoadingIndicator` 加载基线，减少继续参考旧 Hono / Skeleton / `app.request()` 口径的风险
- **后端运行时已切换到 Python**：`packages/server` 已由 FastAPI + sqlite3 + Python PTY 接管，默认开发/测试脚本改为 `uv` 驱动；原 TypeScript 服务端源码已移除，前端继续复用既有 `/api`、SSE 与 `/ws/terminal` 协议
- **文档主线已按当前实现收口**：根文档、任务工作台、上下文注入与 Agentic Chat 设计已统一到 `packages/server/src/*.py`、`packages/server/tests/` 与 `P0-P4` 优先级模型，避免继续沿用 Hono / TS 路径与“紧急度”旧口径
- **Agentic Chat 持久化底座已起步**：后端已新增 `task_agent_runs`、`task_agent_messages` 两张表及 `agent_runtime/thread_store.py` 基础查询服务，先为后续 typed SSE、结构化时间线和审批流提供可恢复的 run/message 存储层
- **Agentic Chat 路由与 typed SSE 已接通**：后端已新增 `task_agent_chat.py`，提供 `GET /api/tasks/{task_id}/agent-chat/thread` 与 `POST /api/tasks/{task_id}/agent-chat/runs`；新 run 会写入结构化 run/message 记录，并继续把纯文本结果投影回 `tasks.chat_messages`，确保迁移期与旧聊天链路兼容
- **Agentic Chat 一期只读工具已落地**：后端已新增 `agent_runtime/model_adapter.py`、`agent_runtime/runner.py`、`workspace_tools.py`、`terminal_tools.py` 与 `tool_registry.py`；当前支持 `workspace_list`、`workspace_read_file`、`workspace_search_text` 与 `terminal_snapshot` 四个只读工具，并把 `tool_call` / `tool_result` 持久化进结构化线程
- **Agentic Chat 前端结构化时间线已接通**：前端 `taskStore` 与 `TaskChat` 已切到 `/api/tasks/{task_id}/agent-chat/thread` 和 typed SSE，可渲染工具调用卡片、工具结果卡片与运行错误；当模型未稳定产出结构化工具响应时，现会降级为普通 assistant 文本，而不是直接中断当前 run
- **Agentic Chat 写工具已接通**：后端 `workspace_tools.py` 已补上 `workspace_write_file` 与 `workspace_apply_patch`，当前可直接在 task workspace 内写新文件、覆盖现有文本文件或应用 unified diff patch，默认不走审批
- **Agentic Chat 已支持跨任务读取主上下文**：后端已新增 `task_read_context` 工具，可按任务 ID 直接读取目标任务 workspace 下的 `AGENTS.md`，当前只开放主产物读取，不开放跨任务任意文件访问
- **工具卡片已支持折叠**：前端 `TaskChat` 中的工具调用 / 工具结果卡片现已改为可折叠详情，默认展开，收起后仍保留工具名与类型摘要，便于在长时间线里快速浏览
- **工具调用与结果已合并显示**：当前任务聊天里，相邻的 `tool_call` 与 `tool_result` 会合并为同一个工具消息框，默认收起；展开后可同时查看输入与输出，减少长时间线里的重复占位
- **工具卡片展开现已带平滑动画**：任务聊天中的工具调用 / 工具结果卡片从默认收起状态展开时，详情区现会以平滑高度过渡展开，不再瞬时跳开；同时继续避免 `layout` 缩放带来的文字与图标形变
- **工具执行状态现已改为真实 loading 语义**：Agent Runtime 当前会在工具真正开始执行时先写入 `streaming` 状态的 `tool_call`，等工具完成或失败后再补 `tool_result`；像 `invoke_claude_code_runner` 这类异步工具也会等待 Runner 真实结束后返回最终摘要，不再在“刚拿到 `sdk_run_id`”时就被当成完成，任务聊天里的对应工具卡片也会明确显示执行中状态
- **Agent Chat thread 现已自动修复孤儿 Runner 工具调用**：当历史数据里出现“`invoke_claude_code_runner` 的 `tool_call` 仍是 `streaming`，但底层 `task_sdk_runs` 已经 `completed / failed / cancelled`”这类不一致状态时，后端现在会在读取 thread 前自动补齐对应 `tool_result` 并收尾该轮 `agent_run`，避免任务聊天长期卡在 loading
- **Agent Chat run 现已从单次 SSE 请求中解耦**：`POST /agent-chat/runs` 当前会先启动后台 Agent run，再通过内存 broker 把事件推给这次 SSE 订阅；像 Claude Code Runner 这类长耗时工具执行期间，即使前端订阅意外中断，后台 run 也会继续等待工具完成、拿到结果并继续生成后续 assistant 回复，不再因为单条 HTTP 流断开就整轮停死
- **`pnpm dev` 已可被 `Ctrl+C` 正常终止**：根目录开发入口已改为 `scripts/dev.sh` 统一拉起前后端，并负责转发 `INT / TERM / HUP`；现在在手动中断时会优雅停掉前后端，不再落成 `ELIFECYCLE 129`
- **工具调用解析兼容已补强**：`agent_runtime/model_adapter.py` 现已兼容解析 `minimax:tool_call` + `<invoke>` / `<parameter>`、顶层单个 JSON tool call、“多行多个 JSON tool call”，以及写文件场景下常见的 `path + content` 顶层 payload / `tool + path + content` 顶层 payload；同一轮模型回复里的多次工具调用也会顺序执行，不再只吃第一条
- **工具调用 JSON 包络重复输出已兼容**：当模型异常输出多个连续的 `{"assistant_text": "...", "tool_calls": [...]}` JSON 包络，甚至重复输出完全相同的包络时，后端现会按包逐个提取 `assistant_text` 与嵌套 `tool_calls`，并对完全重复的工具调用做去重；这类回复不再原样泄漏到聊天区，而会正常进入工具执行链路
- **Agentic Chat 首轮策略与工具容错已补强**：运行时 system prompt 现已明确要求首轮默认先通过对话补齐目标、范围、环境和复现信息，而不是为了“先了解情况”就读取当前 workspace；同时，`task_read_context` 这类工具的常见误用（例如把 `current` 当成 `taskId`、目标上下文不存在）现会回流为失败的 `tool_result` 继续提供给模型决策，不再立刻把整轮 run 标成 failed
- **Agent Runner 面板一期已落地**：后端新增 `sdk_runner/` 模块（sdk_store / sdk_adapter / sdk_runner / sdk_approval / sdk_tools），封装 Claude Agent SDK 的 `query()` 调用，提供 SSE 实时事件流、权限审批（10 分钟超时自动拒绝）、进程注册表管理；前端新增 `SdkRunnerPanel` 面板与终端并列展示，Agent 在对话中通过 `invoke_sdk_runner` 工具触发 SDK 执行，执行过程（文件读写、Bash 命令、测试结果）在面板中实时可视化；Agent Runner 面板通过头部 ⚡ 按钮开关，Agent 启动 SDK run 时自动展开
- **Agent Runner 面板现已补齐自动接线与任务重进恢复**：前端 `taskStore` 现会在 Agent Chat 收到 `invoke_sdk_runner` 的 `tool_result` 且返回 `sdk_run_id` 时，立即刷新 SDK runs 并订阅对应 SSE 事件流，自动展开 Agent Runner 面板；重新进入任务页时，也会从结构化 Agent thread 中恢复最近一次 SDK run 并回放持久化事件，修复“`task_sdk_runs` / `task_sdk_events` 里已有记录，但页面没有对应 Agent Runner 展示”的问题，并已补充前端回归测试
- **Agent Runner 工具结果现已实时回传**：服务端 `sdk_adapter.py` 现已按当前 `claude_agent_sdk` 的真实消息结构兼容 `UserMessage.parent_tool_use_id / tool_use_result / ToolResultBlock`，Runner 面板在工具执行过程中也能实时收到 `sdk.tool_result`，不再只停在 `tool_use` 卡片上像是对话卡住；前端同时补上结构化结果格式化，避免对象型结果被渲染成 `[object Object]`
- **Claude Code 工具结果现已可回灌到 Agent Chat 继续推理**：`invoke_claude_code_runner` 的最终摘要当前不再只依赖 `sdk.text_completed`；当 Claude Code 的有效结果主要落在 `sdk.tool_result`（例如通过 Bash 获取当前时间）时，后端现在会回退提取最近一次非错误工具结果作为 `final_text`，并继续喂给下一轮模型决策。任务详情里的 Agent Chat 因此会在 Claude Code 完成后及时补齐工具结果，并继续生成最终回答，而不是只停在工具调用完成态
- **Agent Chat 对 Claude Code 完成回调现已加终态兜底**：`invoke_claude_code_runner` 外层等待逻辑此前主要依赖内存里的 completion callback；在真实运行里即便右侧 Agent Runner 已显示 `completed`，如果这条 callback 没有被上层正常消费，左侧 Agent Chat 里的工具调用就会一直停在 `streaming`。现在后端会在等待 callback 的同时轮询 `task_sdk_runs.status` 终态做兜底，只要 SDK run 已经落库为 `completed / failed / cancelled`，Agent Chat 就会继续收尾 `tool_call`、写入 `tool_result` 并推进下一轮模型回复
- **Agent Chat 工具调用卡片状态现已实时更新**：修复了 Agent 调用 Claude Code 工具后，左侧聊天框中的工具调用卡片一直显示 loading 状态的问题。根本原因是工具执行时间较长时，Agent Chat 的 SSE 连接会超时断开，错过了工具完成事件。解决方案：当 SDK run 完成/失败/取消时，`sdkRunnerStore` 会主动调用 `fetchAgentThread` 刷新 Agent thread 状态，即使 SSE 断开也能更新卡片状态
- **Agent Runner 默认目录与 Agent run 关联已修正**：后端当前会在 `invoke_sdk_runner` 未显式传入 `cwd` 时，默认把 Claude Agent SDK 启动在当前任务的 workspace（`~/.wudao/workspace/<taskId>/`）而不是用户主目录；同时，Agent Runtime 在执行该工具时会把当前 `task_agent_runs.id` 透传到 `task_sdk_runs.agent_run_id`，便于后续按 Agent run 追踪对应 SDK run，并已补充服务端回归测试
- **Agent Runner 面板现已支持多 run 历史与工具卡片反向打开**：前端 `sdkRunnerStore` 当前会保留任务下全部 SDK runs 列表，并允许在面板中切换查看任意一条历史 run 的持久化事件流，不再只保留最近一次 timeline；`TaskChat` 中的 `invoke_sdk_runner` 工具结果卡片也会显示“打开 Agent Runner”入口，可直接跳到该次工具执行关联的 `sdk_run_id`，并已补充前端回归测试
- **同一任务的 Agent Runner 并发限制已移除**：服务端当前不再阻止同一任务同时存在多条 active SDK runs；`start_sdk_run()` 会为每次调用独立创建 `task_sdk_runs` 记录和后台 asyncio 任务，取消、历史回放与事件订阅继续按 `sdk_run_id` 精确命中对应 run，并已补充服务端回归测试
- **Agent Runner 结果渲染已切到 Markdown**：前端 `SdkRunnerPanel` 当前会把 SDK 的最终文本结果和工具结果交给 `MarkdownContent` 渲染，不再一律按纯文本 `pre` 展示；标题、列表、代码块、表格与链接都能在面板内按 Markdown 样式显示，并已补充前端回归测试
- **Agent Runner 工具名已切到具名 runner，并补齐 runner_type 落库**：Agent Runtime 当前对模型暴露的 SDK 调用工具已从通用 `invoke_sdk_runner` 收敛为 `invoke_claude_code_runner`，同时 `task_sdk_runs` 新增并回填了 `runner_type` 字段，当前显式记录为 `claude_code`；旧 `invoke_sdk_runner` 继续作为兼容别名保留，避免历史线程和旧模型输出直接失效，并已补充前后端回归测试
- **任务详情右侧布局现已改为按任务记忆的独立抽屉**：新任务首次进入详情页时，默认只显示左侧聊天区；`终端 / Agent Runner / 产物` 三块现已改为彼此独立的右侧抽屉，可分别开关并在同一任务内记忆上次状态。重新进入该任务时，会恢复你上次留下的终端开关、Agent Runner 开关、产物抽屉开关，以及聊天区 / 产物抽屉宽度；同时修复了“终端关闭、只打开 Agent Runner 时面板不显示”的布局问题
- **右侧三个抽屉现已统一为与聊天框一致的 header 壳层**：任务终端、Agent Runner 与产物抽屉当前都改成了与左侧 Agentic 聊天一致的独立顶部 header，header 高度、底色、描边与整体表面色已对齐；终端原先分散在顶部的标题与操作区已收敛进统一壳层，产物和 Agent Runner 也补上了同风格的顶部关闭入口，切换不同抽屉时不再出现高度和颜色跳变
- **任务详情 header 高度现已统一固定为 49px，并修复 Agent Runner 无法滚动**：左侧 Agentic 聊天 header 与右侧三个抽屉 header 当前都已统一收口到固定 `49px` 高度；抽屉内容区改为独立滚动层后，Agent Runner 时间线恢复正常纵向滚动，不会再卡在顶部
- **统一 header 已改为大小写敏感，Agent Runner 图标不再与聊天重复**：任务详情里共用的 header 组件现已移除强制大写样式，标题会按原始文案显示；同时，Agent Runner 的 header 图标已从和 Agentic 聊天相同的 `Bot` 改为独立的执行态图标，避免两个面板视觉上看起来像同一个入口
- **Agent Runner 现已支持拖拽改宽，所有抽屉宽度都会记住**：任务详情右侧 `Agent Runner` 左边框现在和产物抽屉一样支持拖拽改宽；改动后的 Agent Runner 宽度会和聊天区分栏宽度、产物抽屉宽度一起按任务持久化到浏览器本地缓存里，重新进入同一任务时会恢复上次的抽屉宽度
- **右侧三抽屉现已统一成同一套固定宽度布局模型**：任务终端不再作为特殊的 `flex-1` 中间区处理，而是和 Agent Runner、产物一起收敛为三个固定宽度的右侧抽屉；它们当前共享同一套显示、关闭、拖拽改宽和宽度约束逻辑，聊天区宽度统一由右侧已打开抽屉的总宽度反推，修复了拖 Agent Runner 时瞬间撑满并把产物挤出屏幕的问题
- **Agent 开始执行 Agent Runner 时现会自动展开并切到对应 run**：任务聊天在收到 `invoke_claude_code_runner` 的工具结果且返回 `sdk_run_id` 后，前端当前会立即把当前任务的 Agent Runner 抽屉设为打开，并切换订阅到这条对应 run 的事件流；用户不再需要先手动点开右侧抽屉或再点一次工具卡片，才能看到 Agent 刚启动的执行过程

- 已具备自然语言建任务、规划对话、`AGENTS.md` 产物生成、任务级 workspace、多终端执行与会话恢复
- 创建任务并进入详情页后，现已恢复自动发起首轮规划对话；首轮请求会自动组装任务标题、类型与初步意图作为任务信息发送给大模型
- 已支持在任务 workspace 中同时维护 `CLAUDE.md` 与 `GEMINI.md` 两个指向 `AGENTS.md` 的兼容软链，便于不同 CLI 共享同一份任务产物
- **任务详情页深度重构**：引入单行全局横向菜单栏，整合返回、任务名/ID、优先级/截止时间及核心操作按钮（标记完成、打开目录、删除、产物开关）
- **元数据选择器优化**：所有选择器采用对齐的紧凑胶囊样式，默认仅显示选中 Label，点击弹出实色菜单；当前优先级与任务列表、抽屉展示已统一到 P0-P4 五级模型
- **弹窗模型供应商状态已补齐**：新建任务弹窗与启动工作台弹窗中的模型供应商卡片，现已直接显示“已选 / 默认”状态徽标；在多个供应商并存时，选择当前模型与识别默认供应商更直观
- **设置页默认供应商切换暗黑模式已提亮**：设置页里“设为默认供应商”在未选中时，现已补上更明确的深色背景、浅色文字与描边；暗黑模式下无需 hover 也能清楚识别该开关
- **首页专业提示已移除**：Dashboard 底部原先独立展示的“专业提示”卡片现已删除，首页仅保留任务与用量等核心信息，视觉更收敛
- **模型选择下拉框已恢复轻量毛玻璃效果**：任务聊天底部的模型菜单现已改为脱离输入区毛玻璃父层的独立浮层，并复用全站统一的 `apple-dropdown` 轻量玻璃材质；在保留毛玻璃观感和遮挡能力的同时，展开时增加了一个很短的淡入上浮动画，不再有明显的显示延迟，这套方案也已同步沉淀到前端规范
- **Agentic 聊天贴边背景已提亮到接近任务名栏的毛玻璃底色**：任务工作台中，Agentic 聊天标题条和底部输入区的大背景现已改成更接近任务名所在栏的浅色/深灰毛玻璃底，而不再是偏黑的突兀色块；输入框内层小框也已恢复圆角
- **Agentic 聊天输入区已恢复圆角浮层与外边距**：任务工作台中，Agentic 聊天顶部标题条继续贴住上边缘；底部输入区则改回带圆角边框的浮层托盘，并补上外部留白，不再完全贴边整个聊天列
- **Agentic 聊天底部滑动弱化已补齐**：任务工作台中，当聊天列表离开底部、消息滑入输入区下方的底部缝隙时，现会出现一层轻微的渐变虚化遮罩；该弱化层在离开底部时会立即生效，避免快速滑动历史记录时先闪出一帧未虚化内容，再延迟补上遮罩；滚回到底部后则继续平滑淡出，右侧仅保留约 `6px` 边距避免压到滚动条，边缘也会做羽化过渡而不是硬切；当前弱化带已进一步加宽加高并向左放开，减少头像只被虚化一部分的割裂感
- **Agentic 聊天锚玻璃质感已对齐元数据下拉框**：任务工作台中，Agentic 聊天顶部标题条与底部输入托盘现已从整行毛玻璃收敛成浮层玻璃面板，材质、描边和阴影更接近任务类型/优先级下拉框；输入区内部的 provider 入口与 textarea 也同步增强了层次
- **Agentic 聊天标题行与输入区已改为毛玻璃**：任务工作台中，Agentic 聊天顶部标题条与底部输入区现已切到 `apple-glass` 风格；输入区同时补上半透明玻璃托盘与玻璃输入框，整体层次更接近全站现有的 Apple glass 视觉
- **任务聊天回复中提示已补齐**：发送消息后，如果模型首条 assistant 文本或工具消息尚未到达，聊天区现会先显示一个临时“正在回复”气泡；真正的流式内容开始后，该提示会自动消失，不再出现回复空窗
- **布局与交互升级**：移除侧边栏折叠，采用固定的左聊天右终端分栏，中间支持无形变拖拽占比；聊天窗口精准固定标题与输入框，仅滚动消息区域
- **任务工作台产物拖拽修复**：修复了仅开启产物栏、关闭终端时，拖动产物栏左边框会视觉上变成右边框移动的问题；现在拖拽过程中聊天区会同步收缩/扩展，左侧分割线反馈与最终结果保持一致
- **任务工作台终端关闭抖动修复**：修复同时打开终端和产物栏时，终端关闭到最后消失瞬间产物栏会向左抖一下的问题；现在终端关闭后的聊天区宽度计算会连同产物栏左侧 1px 分割线一起计入，避免最终落位时再次被挤压
- **任务工作台终端关闭动画收口**：终端区在关闭时已不再保留退出占位动画，而是直接从布局中退场，避免终端内部最后一帧的 reflow 把右侧产物栏再次顶偏
- **任务工作台终端退出动画收口**：终端区域在关闭时现已立即脱离 flex 布局，仅保留淡出效果；终端分割线也改为即时移除，避免退出动画最后一帧继续占位，引发产物栏抖动
- **任务列表抽屉首帧定位修复**：修复强制刷新后在任务详情页首次打开任务列表抽屉时，加载态会先闪到屏幕最右侧、待资源加载完才跳回左侧的问题；现在抽屉的加载态与正式内容都固定从左侧进入，首帧位置一致
- **产物栏默认宽度调整**：加宽了任务工作台产物栏的默认展开宽度，减少首次打开时的横向换行和滚动，查看 `AGENTS.md` 更顺手
- **暗黑模式分隔线 hover 修复**：修复任务工作台中终端/产物分隔线在暗黑模式下悬停时不显示蓝色高亮的问题；现在日间与暗黑模式的拖拽提示保持一致
- **终端 resize 稳定性修复**：修复 Claude Code、Codex 与 Gemini CLI 在任务终端中因窗口 resize 触发过多或抖动尺寸同步，进而出现串行/降级输出的问题；前端现已过滤无效尺寸并去掉重复上报，后端仅在真实尺寸变化时更新 PTY，并补发 `SIGWINCH`
- **终端 resize 收尾同步补强**：前端在每次 `fit()` 完成后，现会基于最终的 `cols/rows` 再执行一次去重后的收尾同步，减少拖拽分栏或窗口 resize 结束时遗漏最后一次终端尺寸上报、导致后端停留在旧尺寸的概率
- **终端重命名刷新恢复修复**：修复了任务详情页中终端重命名后刷新页面，会被 websocket 会话恢复链路用默认名（如 `Anthropic dc6355`）回写覆盖的问题；现在仅在新建终端首次绑定任务时持久化终端名，刷新恢复只补会话关联与 provider，不再篡改已保存名称
- **终端名大小写强制转换已取消**：任务详情页中的终端名现已按用户输入原样显示，不再在终端卡片标题或历史会话恢复按钮里被统一转成全大写；仅保留按钮状态词的原有强调样式
- **聊天回底按钮样式收敛**：任务聊天区右下角的“回到底部”按钮已缩小，并去掉玻璃高光与描边质感，改为更直接的纯色圆形按钮；原有的回底与碎裂动画仍保留
- **终端关联去重补强**：修复了 Codex 一类固定 session provider 在先拿到 runtime session id、后拿到真实 `cliSessionId` 时，会把同一个终端以两个不同 id 重复关联到任务的问题；现在真实 `cliSessionId` 回填后会替换旧 runtime id，而不是继续追加
- **终端输出缓冲稳定性修复**：服务端 PTY 输出现已改为增量 UTF-8 解码，并在终端历史快照达到上限时避开 ANSI 控制序列边界进行裁剪，降低长时间输出、重新 attach 或组件重挂载时出现 `[B` 一类控制序列残片和串行显示的概率
- **任务终端恢复与清理修复**：修复 Codex 终端恢复时会因无效 id 自动退化到 `resume --last`、进而在后台反复拉起高 CPU `codex` 进程的问题；后端现已对无效恢复直接报错，并在关闭终端、删除任务和应用 shutdown 时按整个进程组回收 PTY 子进程。同时修复了 Codex 新建终端后任务未关联、以及历史恢复报 `Session not found or no longer recoverable` 的问题：后端会在创建后直接从 `~/.codex/sessions/*.jsonl` 解析真实 Codex session id 回传前端；Gemini 也会在 live session 同步阶段从 `~/.gemini/tmp/**/chats/session-*.json` 解析真实会话 id。前端在页面刷新或 WebSocket 重连后，会像 Claude 一样基于 `/ws/terminal list` 的 live session 更新已有终端并回写任务关联，让 Codex 与 Gemini 的刷新恢复逻辑尽量与 Claude 保持一致；若仍未拿到真实可恢复 id，则继续避免持久化不可恢复的后端运行时 session ID
- **UI 细节与暗黑模式**：全站暗黑模式对比度修复；操作按钮改为紧凑图标样式；悬浮组件（下拉框、日期选择）切换为实色背景以保证文字阅读；已补做主要页面暗黑模式审计，并修复“新建任务”弹窗、产物抽屉与设置页排序按钮中的低对比度文本问题
- **输入体验修复**：修复新建任务、任务聊天、任务标题编辑与终端重命名输入框在中文输入法组合输入时，按回车选词会直接触发提交/确认的问题；现已统一识别 IME 组合态，避免误发送
- **聊天体验修复**：创建任务后自动首聊时，任务信息现会立即显示在对话区；已移除流式响应期间冗余的三点加载消息，并修复了流式输出时聊天区被强制锁定到底部、无法手动滚动查看历史的问题
- **聊天自动滚动交互优化**：发送消息后聊天区现在会恢复自动滚动；只有用户手动上滑离开底部时才会退出自动滚动，并显示一个“回到底部”下箭头按钮，点击后可立即跳回底部并重新进入自动跟随
- **聊天回底按钮动效升级**：任务聊天区右下角的“回到底部”按钮在点击后，现会先播放一段至少 1 秒的击碎爆裂动画；碎片会越出按钮范围向四周明显飞散，且后续每次再次点击都能重新触发完整特效；保留原有立即恢复自动滚动并平滑跳到底部的行为
- **任务聊天气泡样式调整**：任务工作台中，用户消息框背景色已改为 `#3EB575` 且文字为黑色，AI 消息框背景色已改为 `#2E2E2E` 且文字为白色；同时消息气泡圆角已与发送框输入区域对齐，统一保持现有气泡样式与视觉节奏
- **任务聊天暗黑背景调整**：暗黑模式下，任务聊天面板背景已统一为 `#191919`，聊天顶部标题区和底部输入区也一并对齐，减少分段色差
- **任务聊天日间配色调整**：日间模式下，任务聊天面板背景已统一为 `#EDEDED`，用户消息框改为 `#95EC69`，AI 消息框改为 `#FFFFFF`，并将日间消息文字统一收为黑色，整体更接近常见即时通信视觉
- **体验打磨与加载态优化**：全站移除脉冲式鱼骨屏（Skeleton Screen），统一替换为更简洁的 `LoadingIndicator`（加载动画 + 文字），提升了在弱网或数据处理中的视觉稳定性，并清理了相关的冗余代码与 pulse 样式；优化了暗黑模式加载逻辑，通过 `index.html` 内联脚本预设主题及按需应用过度动画，解决了刷新页面时的色块闪烁问题
- **任务元数据系统升级**：
  - **任务类型图标化**：为不同任务类型引入专属 Emoji 图标（✨ 修复、🐛 调研等），提升了列表的可读性与视觉丰富度
  - **优先级体系重构**：将优先级规范为 P0-P4 五级（P0 为最高），并配套红、橙、黄、蓝、绿五色视觉体系；后端同步完成数据库约束更新与自动化数据迁移
  - **精简元数据**：移除了冗余的“重要度/紧急度”字段，将其能力整合入新的五级优先级体系中，简化了任务创建与管理的决策成本
  - **优先级排序修复**：修复任务列表按优先级排序时方向颠倒的问题，`P0` 现会排在更前，且分页排序语义与数据库索引保持一致
  - **任务抽屉优先级展示修复**：修复任务详情页左侧任务列表抽屉未显示优先级标签的问题；抽屉中的任务项现已完整展示 `P0-P4` 五级优先级，并与主列表保持一致的颜色语义
- **稳定性与适配优化**：修复了 Kimi 用量获取 401 错误，优化了身份验证 token 的提取优先级逻辑，增加了对 JWT 备选字段名的解析支持并模拟了浏览器 User-Agent，提升了与 Kimi 最新 API 的兼容性
- **本地全局记忆已收口**：顶部导航“记忆”页现只保留 `用户记忆 / Agent 记忆` 两个模块；用户记忆位于 `~/.wudao/profile/user-memory.md`，Agent 记忆位于 `~/.wudao/profile/wudao-agent-memory.md`；两者都会在每次任务对话请求里作为 `system prompt` 注入，并参与任务意图识别
- **手动生成 `AGENTS.md` 现已接入全局记忆**：任务面板中手动点击“生成 / 更新 `AGENTS.md`”时，后端现也会把用户记忆与 `Wudao Agent` 全局记忆作为 `system prompt` 一并注入，不再只有任务解析、普通聊天与 Agent Chat 会看到这部分长期上下文；同时已补上 `tests/test_task_service.py` 回归测试，防止后续回退
- **OpenAI Responses 兼容性修复**：修复了新建任务时选择 OpenAI 供应商会因未正确消费 Responses API 流式 `response.output_text.delta` 事件而导致 `/api/tasks/parse` 返回 500 的问题；同时修复了带 assistant 历史消息的任务对话错误地使用 `input_text` 编码、触发 400 的问题，并保留结构化 `input` 失败时对旧兼容端点的单 `user prompt` 回退；此外，针对启用了 CRS `approved clients` 限制的 OpenAI 兼容网关，后端现会在识别到 `Client not allowed` 403 且允许 `codex_cli` 时，自动切换到 Codex CLI 兼容请求头与 `instructions` 重试，任务意图解析与任务聊天现已能稳定读取并发送 OpenAI Responses 文本消息

- 国际化（i18n）：支持中/英双语切换，任务终端、产物抽屉、任务加载态、仪表盘提示与终端启动弹窗等关键界面文案已完成统一本地化

- 工程质量：服务端现已补齐 Python 版 `FastAPI` 入口、SQLite 初始化、任务路由、记忆路由、用量聚合、头像上传、本地路径守卫与 `/ws/terminal` 会话管理；后端自动化测试已迁到 `pytest + TestClient`，前端 `taskStore` 继续保留请求竞态保护与统一任务状态合并逻辑
- 性能：主导航下的 Dashboard / TaskList / Memories / TaskWorkspace / Settings 已切到按视图懒加载；任务工作台内部进一步拆为 `TaskWorkspaceView` / `TiledTerminalPanel` / `TerminalView` / 抽屉 / 弹窗等独立 chunk，当前主入口约 `453 kB`、记忆页 chunk 约 `10 kB`、工作台主 chunk 约 `225 kB`、终端视图 chunk 约 `367 kB`，生产构建已无大包告警
- 稳定性：当前根级测试基线已通过，其中服务端 Python `pytest` 当前为 115 个关键链路 / 协议用例；前端 vitest 现为 95 个用例。本轮已执行 `pnpm --filter server test` 全绿；任务列表切换为全量任务后前端筛选，同时 Dashboard 已改为调用后端 `GET /api/tasks/stats` 摘要接口，并新增 30 秒静默自动刷新、窗口重新聚焦自动同步与手动刷新合并行为，已修复“进行中 / 已完成”数量在切换 tab、跨页面查看或任务超过一页时失真的问题
- 时间基线：统一采用 `Asia/Shanghai` 时区处理，修复了 UTC 误判及列表显示问题

> 历史已完成事项不再在本文件逐条维护；如需查看演进记录，请参考 `README.md` 与 `docs/changelog.md`。

## 进行中

- [ ] Task 体验持续打磨（交互细节、空状态、恢复引导）
- [ ] Agentic Chat 二期：artifact sync、run 恢复与更细的 provider/tool 策略
- [ ] Agent Runner 面板：Agent 驱动的 Claude Code SDK 集成，任务工作台右侧实时展示执行过程
- [ ] 任务详情右侧三抽屉继续打磨（更细的宽度策略、移动端收口、必要时补抽屉内关闭入口）

## 待开始

- [ ] 继续终端模式体验打磨（启动失败提示、更多快捷操作）
- [ ] Dashboard 扩展：更多服务商用量接入、历史趋势图
- [ ] 运行时结构化观测（任务事件、执行结果、失败诊断）
- [ ] Agentic Chat 二期：`AGENTS.md` artifact sync 与 workspace 产物自动刷新
- [ ] Agentic Chat 三期：`web_search`、回放 / 取消 / provider 更细粒度降级

## 已知问题

- Python PTY 版终端已补齐自动化覆盖，但 `create / resume` 仍需结合本机已安装的真实 CLI（Claude / Codex / Gemini 等）继续做真机回归
