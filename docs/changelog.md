# Changelog

> 用户视角的变更记录。每完成一个可感知的功能后，由 Claude Code 更新。

## 2026-03-20

- **首次启动不再因为数据库目录缺失而失败**：
  - 修复了新机器首次执行 `pnpm dev` 时，如果 `~/.wudao` 或自定义 `WUDAO_DB_PATH` 的父目录还不存在，服务端会在导入 `db.py` 时直接报 `sqlite3.OperationalError: unable to open database file` 的问题
  - 数据库默认路径现在会跟随 `WUDAO_HOME` 解析，同时会在建立 SQLite 连接前主动创建数据库父目录，避免第一次启动卡死在 `uvicorn --reload` 子进程里
  - 已补充显式 `WUDAO_DB_PATH` 缺父目录、以及仅配置 `WUDAO_HOME` 时默认数据库路径跟随变更的回归测试

- **`pnpm install` 现在会自动准备 server Python 环境**：
  - 根目录安装链路已新增 `uv` 前置检查；如果本机还没装 `uv`，`pnpm install` 会直接给出安装提示，而不是等到启动或测试时才失败
  - 在 `uv` 可用时，`pnpm install` 会继续自动执行 `uv sync --project packages/server --locked --all-groups`，把后端 `.venv` 一并准备好
  - `uv` 缓存现已固定写到仓库 `workspace/uv-cache`，避免首次安装把临时文件散落到用户全局目录
  - 本轮已完成 `pnpm install --force` 与 `pnpm test`

## 2026-03-19

- **默认 provider 不再内置仓库密钥**：
  - 后端已把默认 provider seed 收缩为最小元数据，新初始化的数据库仍会预置供应商条目，但仓库里不再硬编码 `api_key`、`endpoint` 或 `model`
  - 这些 provider 配置现统一落在 `providers` 表中维护；现有数据库中的 `api_key`、`endpoint` 与 `model` 也不会在启动时被自动改写
  - 已补充服务端回归测试，并完成 `pnpm --filter server test`

- **手动生成 `AGENTS.md` 现会带入全局记忆**：
  - 修复了在任务面板手动点击“生成 / 更新 `AGENTS.md`”时，没有把“用户记忆”和“Wudao Agent 全局记忆”一起注入模型上下文的问题
  - 现在 `POST /api/tasks/{task_id}/generate-docs` 会和自然语言建任务、普通任务聊天、Agent Chat 一样，共享同一套全局记忆来源，生成出的任务文档会更贴近用户长期偏好与默认约束
  - 已补充 `tests/test_task_service.py` 回归测试，并完成 `pnpm --filter server test`

## 2026-03-18

- **Agentic 聊天底部虚化已去掉滚动闪露**：
  - 修复了快速滑动聊天历史记录时，输入托盘下方到底部这段缝隙会先短暂露出一帧未虚化内容、随后弱化层才补上的视觉问题
  - 现在只要聊天列表一离开底部，底部弱化层就会立即接管；回到底部时仍保留平滑淡出，不会把常态下的最新消息一直压暗
  - 已补充 `TaskChat` 回归测试，并完成 `pnpm --filter web exec vitest --run src/components/task-panel/TaskChat.test.ts` 与 `pnpm --filter web build`

- **记忆编辑框已改为整窗高度编辑**：
  - 记忆页中的“用户记忆”和“Wudao Agent 全局记忆”编辑区现已改为随视图剩余高度自动撑满，不再只占约 80% 高度
  - 编辑模块会直接吃满记忆页主体可用空间，页面本身不再因为这两个大文本框额外出现滚动条，长内容继续只在文本框内部滚动
  - 由于编辑区现已固定为整窗高度，textarea 右下角的拖拽手柄已一并移除，暗黑模式下也不再出现发白的 resize 角标
  - 已完成 `pnpm --filter web test` 与 `pnpm --filter web build`

- **默认模型供应商重启后不再被撤销**：
  - 修复了在设置页把某个模型供应商设为默认后，服务重启又被启动初始化强行改回 Claude 的问题
  - 后端现在只会在“没有默认供应商”或“出现多个默认供应商”这两类异常状态下做一次兜底归一化，不会覆盖用户已经保存的默认选择
  - 已补充服务端重启回归测试，并完成 `uv run --project . pytest tests/test_app.py -k "provider_crud_and_reorder or default_provider_selection_persists_across_restart"`

## 2026-03-16

- **Agentic 聊天底部缝隙现会随滚动做弱化处理**：
  - 当聊天列表离开底部、消息滑到输入托盘下方的底部缝隙区域时，现在会叠加一层轻微的渐变虚化遮罩
  - 这层遮罩会在回到底部后自动淡出，常态下不会一直压暗最新消息；右侧继续保留约 `6px` 边距避免盖到滚动条，边缘也会做羽化过渡避免出现硬边，同时弱化带本身已经继续加宽加高、左侧覆盖更开，头像进入该区域时会更完整地被处理
  - 已完成 `pnpm --filter web exec vitest --run src/components/task-panel/TaskChat.test.ts` 与 `pnpm --filter web build`

- **Agentic 聊天输入区已恢复圆角边框与外边距**：
  - 底部输入托盘现已重新带上圆角外框，并在聊天面板边缘恢复一圈外部留白，不再完全贴边
  - 标题条继续保持贴边，输入区与消息区的层次会更清楚，发送区视觉也更接近独立操作面板
  - 已完成 `pnpm --filter web exec vitest --run src/components/task-panel/TaskChat.test.ts` 与 `pnpm --filter web build`

- **模型选择下拉框已恢复真实毛玻璃效果**：
  - 任务聊天底部的模型菜单现已改为脱离输入区毛玻璃父层的独立浮层，不再被父层毛玻璃压成实底
  - 菜单表面进一步收敛为全站统一的 `apple-dropdown` 轻量玻璃材质，并改成一个约 120ms 的淡入上浮动画，既保留展开反馈，也不会有明显显示延迟
  - 这套做法已同步沉淀到前端规范，后续同类下拉框默认复用相同的层级、材质与动效约束
  - 已完成 `pnpm --filter web exec vitest --run src/components/task-panel/TaskChat.test.ts` 与 `pnpm --filter web build`

- **模型选择下拉框背景遮挡问题已修复**：
  - 问题根源：输入区的 `backdrop-blur-apple` 创建了堆叠上下文，导致子元素的 `backdrop-filter` 无法正常工作
  - 解决方案：为模型下拉框直接定义 `bg-white/95 dark:bg-[#1c1c1e]/95` 接近实色的背景，配合圆角、阴影、边框保持视觉层次
  - 现在模型下拉框能完全遮挡后方对话文字，不再透明穿透
  - 已完成 `pnpm --filter web test -- --run` 与 `pnpm --filter web build`

- **模型选择下拉框已对齐任务类型胶囊质感**：
  - 任务聊天底部的模型选择框现已调成接近任务类型下拉框的胶囊配色，触发器不会再显得像单独漂浮的一层半透明膜
  - 展开菜单继续使用任务类型同款的下拉交互，但在菜单内部追加了一层实底玻璃面，避免后方聊天文字直接透出来
  - 已完成 `pnpm --filter web exec vitest --run src/components/task-panel/TaskChat.test.ts` 与 `pnpm --filter web build`

- **Agentic 聊天贴边背景已提亮到接近任务名栏的毛玻璃底色**：
  - 聊天标题条和底部输入区的大背景现已从偏黑玻璃改成更接近任务名所在栏的底色，在暗黑模式下不再显得突兀
  - 毛玻璃效果仍然保留，同时输入框内层小框已恢复圆角，和发送区的交互层次重新拉开
  - 已完成 `pnpm --filter web exec vitest --run src/components/task-panel/TaskChat.test.ts` 与 `pnpm --filter web build`

- **Agentic 聊天标题条与输入区已改为贴边全宽布局**：
  - 顶部标题条现在直接贴住聊天面板上边缘，底部输入区也直接贴住下边缘，不再保留外层留白
  - 两块区域都会横向撑满整个聊天列，外层圆角已去掉，视觉上更像固定工作区边框的一部分
  - 已完成 `pnpm --filter web exec vitest --run src/components/task-panel/TaskChat.test.ts` 与 `pnpm --filter web build`

- **Agentic 聊天锚玻璃已收敛到元数据下拉框同款浮层质感**：
  - 任务工作台左侧 Agentic 聊天顶部标题条不再直接贴整行 `apple-glass`，而是改成和任务类型、优先级下拉框同一套浮层玻璃面板
  - 底部输入托盘也同步切到同款浮层材质，内部 provider 入口和输入框进一步拉开层次，玻璃感不再发灰发糊
  - 已完成 `pnpm --filter web exec vitest --run src/components/task-panel/TaskChat.test.ts` 与 `pnpm --filter web build`

- **Agentic 聊天标题行和输入区已换成毛玻璃效果**：
  - 任务工作台左侧 Agentic 聊天顶部标题条现已切到毛玻璃风格，不再是纯色实底
  - 底部输入区也同步改为毛玻璃托盘，并把 textarea 调整为半透明玻璃输入框，让顶部和底部的层次保持一致
  - 已完成 `pnpm --filter web exec vitest --run src/components/task-panel/TaskChat.test.ts` 与 `pnpm --filter web build`

- **首页“专业提示”已移除**：
  - Dashboard 底部原先单独展示的“专业提示”卡片已删除，首页现在只保留任务统计、用量统计等核心信息
  - 同时清理了对应的中英文文案键，避免继续残留无用提示内容
  - 已完成 `pnpm --filter web exec vitest --run src/components/DashboardView.test.ts` 与 `pnpm --filter web build`

- **设置页“设为默认供应商”在暗黑模式下更清楚了**：
  - 设置页供应商编辑弹窗中的默认供应商开关，在未选中时现已改为更明确的深色底、浅色文案和浅色描边
  - 暗黑模式下不再需要靠 hover 才能辨认这项操作，未选中态也能直接看清
  - 已完成 `pnpm --filter web test -- --run SettingsView.test.tsx` 与 `pnpm --filter web build`

- **任务聊天在首个 token 前会显示回复中提示**：
  - 发出消息后，如果模型还没推来第一段 assistant 文本或工具消息，聊天区现在会先显示一个临时的 AI 回复中气泡，明确反馈“正在回复”
  - 一旦真正的流式文本或工具卡片开始出现，这个提示会立即让位，不会和正式消息重复堆叠
  - 已完成 `pnpm --filter web test -- --run TaskChat.test.ts` 与 `pnpm --filter web build`

- **弹窗里的模型供应商选择现会显示状态**：
  - 新建任务弹窗与启动工作台弹窗中的模型供应商卡片，现已补上状态徽标，当前选中项会显示“已选”，默认供应商会显示“默认”
  - 这样在多个供应商并存时，用户不需要点开设置页，也能直接在弹窗里判断当前选择和默认落点
  - 已完成 `pnpm --filter web test -- --run TaskListView.test.ts NewTaskTerminalDialog.test.tsx` 与 `pnpm --filter web build`

- **OpenViking 现会随服务启动自动拉起**：
  - 后端已把 OpenViking bridge 改成常驻 worker 模式，`wudao server` 启动时会先预热一次，后续记忆状态、记忆列表和镜像写入都会复用同一 Embedded 单例，不再每次请求单独起一个 bridge 子进程
  - 同时补上了 OpenViking Python 解释器自动回退：当 `uv` 虚拟环境本身没有安装 `openviking` 时，会自动切到可用的系统 Python，避免记忆页和同步接口直接失效
  - 本轮已完成 `uv run --project . pytest -q` 全绿，并实测 `get_openviking_status()` 可在 `packages/server` 的 `uv` 环境下成功返回可用状态

- **Agentic Chat 新增按任务 ID 读取上下文工具**：
  - 后端已新增 `task_read_context` 工具，可按任务 ID 直接读取目标任务 workspace 下的主上下文 `AGENTS.md`
  - 该工具当前只开放主产物读取，不允许跨任务读取任意文件，保持现有任务边界
  - 已补充对应工具注册、workspace 工具与 runner 回归测试，并完成 `tests/test_workspace_tools.py`、`tests/test_agent_runtime_tools.py` 与 `tests/test_agent_runtime_runner.py`

- **文档已按当前实现全量收口**：
  - 已统一更新 `README.md`、任务工作台、Agentic Chat、OpenViking、后端 Python 重构、TDD 与前端规范文档，确保当前文档口径与真实代码一致
  - 本轮重点清理了旧的 Hono / `node-pty` / Skeleton / `app.request()` / 纯文本聊天主链路等过期描述，后续查阅文档时将默认以当前 `FastAPI + React + Agent Runtime` 结构为准

- **Codex 终端不再重复关联到同一任务**：
  - 修复了固定 session provider 在先使用运行时 session id 关联任务、后续 websocket 又拿到真实 `cliSessionId` 时，会把同一个终端重复绑定成两条关联记录的问题
  - 现在前端会在拿到真实 `cliSessionId` 后，明确替换旧 runtime id；后端任务 session 关联接口也支持把旧 id 原子替换掉，而不是继续追加
  - 已完成 `pnpm --filter server test`、`pnpm --filter web test` 与 `pnpm --filter web build`；并已清理任务 `2026-03-16-4` 现有的重复 Codex 关联

- **聊天回底按钮改小并去掉玻璃质感**：
  - 任务聊天区右下角的“回到底部”按钮已从原先较大的玻璃质感圆钮，调整为更小的纯色圆形按钮
  - 已移除按钮上的高光渐变层与玻璃边框，只保留回到底部和点击后的碎裂动画反馈
  - 已完成 `pnpm --filter web test` 与 `pnpm --filter web build`

- **终端名不再强制显示为大写**：
  - 任务详情页中的终端名现已按原始大小写显示，不再在终端卡片标题或历史会话恢复按钮里被统一转成大写
  - 保留了终端面板中其它操作性文案的强调样式，只去掉终端名称本身的大小写强制转换
  - 已完成 `pnpm --filter web test` 与 `pnpm --filter web build`

- **终端重命名刷新后不再被默认名覆盖**：
  - 修复了任务详情页里把终端改名后，只要刷新页面，就会被 websocket 会话恢复流程重新写回类似 `Anthropic dc6355` 默认名的问题
  - 现在仅在新建终端首次绑定任务时持久化终端名；页面刷新或 websocket 重连触发的会话恢复，只会补齐会话关联和 provider 信息，不会覆盖任务里已保存的自定义终端名
  - 已补充前端回归测试，并完成 `pnpm --filter web test` 与 `pnpm --filter web build`

- **Agentic Chat 重复 JSON 包络已修复**：
  - 修复了模型偶发连续输出多个 `{"assistant_text":"...","tool_calls":[...]}` JSON 包络时，后端把整段原样当成普通文本消息显示到聊天区、而不是继续执行工具的问题
  - 现在后端会按包逐个提取 `assistant_text` 和嵌套 `tool_calls`，并对完全重复的工具调用做去重；像重复输出两次 `workspace_list` 的场景，现会只执行一次
  - 已补充对应服务端回归测试，并完成 `pnpm --filter server test`

- **OpenAI 网关 `approved clients` 403 已兼容**：
  - 修复了任务意图解析与任务聊天在调用启用了 CRS `approved clients` 限制的 OpenAI Responses 网关时，会因固定发送 `claude-cli/external` 请求头而直接收到 `Client not allowed` 403 的问题
  - 后端现在会在识别到这类 403 且网关允许 `codex_cli` 时，自动切换到 Codex CLI 兼容的 `User-Agent`、`Originator`、`Session_id` 与 `instructions` 重试，不需要手动改 provider 配置
  - 已补充对应服务端回归测试，并完成 `pnpm --filter server test`；同时用当前本地 OpenAI provider 实测确认，接口现已可正常返回结果
## 2026-03-15

- **`pnpm dev` 的 `Ctrl+C` 退出已修复**：
  - 根目录开发入口已改为 `scripts/dev.sh`，统一管理前后端 dev 进程和信号转发
  - 现在手动按 `Ctrl+C` 时，会优雅停止前后端，不再把根命令收成 `ELIFECYCLE` 退出码 `129`
  - 已通过模拟前后端常驻进程，从 `./scripts/dev.sh` 和 `pnpm dev` 两个入口分别验证

- **工具调用与工具结果已合并显示**：
  - 前端任务聊天中，相邻的工具调用与工具结果现已合并为同一个消息框，默认收起，点击后可展开同时查看输入和输出
  - 这会减少长时间线中工具消息的重复占位，浏览连续工具操作时更紧凑
  - 本轮已完成 `pnpm --filter web test` 与 `pnpm --filter web build`

- **工具调用解析兼容修复**：
  - 后端现已兼容解析 `minimax:tool_call` 配合 `<invoke>` / `<parameter>`、顶层单个 JSON tool call、多行多个 JSON tool call，以及写文件场景下常见的顶层 `path + content` / `tool + path + content` payload，不再只支持固定的 JSON 包络
  - 同一轮模型回复里包含多个工具调用时，系统会按顺序依次执行，而不再只吃第一条
  - 已补充对应回归测试，并完成 `pnpm --filter server test`

- **Agentic Chat 已支持直接写文件与 patch**：
  - 后端已为 Agentic Chat 新增 `workspace_write_file` 与 `workspace_apply_patch` 两个写工具，当前可在任务 workspace 内直接新建文本文件、覆盖现有文件或应用 unified diff patch，默认不走审批
  - 本轮补充了写工具与 patch 回归测试，并完成 `pnpm --filter server test`

- **工具调用卡片已支持折叠**：
  - 前端任务聊天中的工具调用 / 工具结果卡片现已支持折叠与展开，默认展开，收起后仍保留工具类型与工具名，便于在长对话时间线里快速浏览
  - 本轮已完成 `pnpm --filter web test` 与 `pnpm --filter web build`

- **Agentic Chat 一期已打通只读工具与结构化时间线**：
  - 后端已新增 `agent_runtime/model_adapter.py` 与 `agent_runtime/runner.py`，开始通过文本 JSON 包络驱动工具回合；当模型未稳定返回结构化结果时，会回退成纯文本 assistant 回复，而不会让整轮 run 静默失败
  - 已接入 `workspace_list`、`workspace_read_file`、`workspace_search_text` 与 `terminal_snapshot` 四个只读工具，并把 `tool_call` / `tool_result` 持久化为结构化消息
  - 前端任务聊天现已消费 `/api/tasks/{task_id}/agent-chat/thread` 与 typed SSE，能显示工具调用卡片、工具结果卡片和运行错误，而不再只显示 `user / assistant` 两类纯文本气泡
  - 本轮已完成 `pnpm --filter server test`、`pnpm --filter web test`、`pnpm --filter web build` 与 `UV_CACHE_DIR=/Users/tian/wudao/workspace/uv-cache pnpm test`

- **Agentic Chat 路由与 typed SSE 接通**：
  - 后端已新增 `GET /api/tasks/{task_id}/agent-chat/thread` 与 `POST /api/tasks/{task_id}/agent-chat/runs`，开始提供结构化线程快照与 typed SSE 事件流
  - 新 run 会把用户消息、assistant 文本与运行状态写入 `task_agent_runs` / `task_agent_messages`，同时继续投影回 `tasks.chat_messages`，保证迁移期与旧聊天链路兼容
  - 已补充 `packages/server/tests/test_task_agent_chat.py`，覆盖 thread 接口、typed SSE 事件顺序、失败状态落库与 legacy transcript 投影；`pnpm --filter server test` 已通过，当前服务端测试基线提升到 33 个用例

- **Agentic Chat 持久化底座起步**：
  - 后端已新增 `task_agent_runs` 与 `task_agent_messages` 两张表，开始为后续 Agentic Chat 的运行记录、结构化消息时间线与审批流提供可恢复存储
  - 新增 `packages/server/src/agent_runtime/thread_store.py`，先落地 run / message 的创建、更新、线程查询与级联删除基线
  - 已补充 `packages/server/tests/test_agent_runtime_store.py`，并完成 `pnpm --filter server test`，当前服务端测试基线提升到 30 个用例

- **文档口径收口（无功能变更）**：
  - 根目录 `AGENTS.md` 与 `packages/server/AGENTS.md` 已统一到当前 Python 后端结构，测试目录说明收口为 `packages/server/src/**` 与 `packages/server/tests/**`
  - `status.md`、任务工作台、上下文注入与 Agentic Chat 设计文档已统一到 `P0-P4` 优先级模型，并移除当前阶段说明中的旧“紧急度”口径
  - Agentic Chat 一期方案已按 `FastAPI + SQLite + Python PTY` 结构重写，后续可直接围绕 `app.py`、`task_service.py`、`llm.py`、`terminal.py` 与新增 `task_agent_chat.py` / `agent_runtime/` 目录推进

## 2026-03-13

- **Codex / Gemini 终端刷新恢复对齐 Claude**：
  - 终端页强制刷新或 WebSocket 重连后，Codex 与 Gemini 现在会像 Claude 一样，基于 `/ws/terminal list` 返回的 live session 重新补齐可恢复会话 ID 并回写任务关联
  - Codex 会继续优先解析真实的 `~/.codex/sessions/*.jsonl` 会话 ID；Gemini 现已补上 `~/.gemini/tmp/**/chats/session-*.json` 的 live session ID 发现逻辑，减少刷新后仍停留在临时运行时 ID 或无法重新关联的问题
  - 前端会在 `sessions` 同步时合并更新已有终端，而不是只追加新终端，避免刷新后已有会话错过最新的 `cliSessionId`
  - 补充了前后端回归测试，并完成 `pnpm --filter server test`、`pnpm --filter web test` 与 `pnpm --filter web build` 验证

- **终端 resize 收尾同步补强**：
  - 前端在每次 `fit()` 完成后，现会基于最终的 `cols/rows` 再执行一次去重后的收尾同步
  - 这会减少拖拽分栏或窗口 resize 结束时漏掉最后一次尺寸上报、导致后端 PTY 仍停留在旧尺寸的概率
  - 已完成 `pnpm --filter web test` 与 `pnpm --filter web build` 验证

- **任务列表抽屉首帧定位修复**：
  - 修复了强制刷新后在任务详情页首次打开任务列表抽屉时，加载态会先出现在屏幕最右侧、等抽屉模块加载完后才跳回左侧的问题
  - 现在任务列表抽屉的加载态与正式抽屉已统一使用同一套左侧定位布局，首次打开时不会再出现“先右后左”的闪动
  - 补充了任务抽屉左侧定位的前端回归断言，并完成 `pnpm --filter web test` 与 `pnpm --filter web build` 验证

- **聊天回到底部按钮碎裂动效**：
  - 任务聊天区右下角的“回到底部”按钮在点击后，会先播放一段至少 1 秒的击碎爆裂动画，碎片会越出按钮范围向四周明显飞散后再消失
  - 按钮碎裂期间会保持原位完成动画，不会提前闪退，同时仍会立刻恢复自动滚动并平滑跳到最新消息；后续再次点击时也会重新触发完整碎裂特效
  - 补充了 `TaskChat` 前端回归测试，并完成 `pnpm --filter web test` 与 `pnpm --filter web build` 验证

- **终端输出串行残片修复**：
  - 修复了任务终端在长时间输出、重新连接或组件重新挂载时，偶发把 ANSI 控制序列残片直接显示成正文的问题，例如输出中混入 `[B`
  - 服务端现在会按流式方式解码 PTY 输出，避免多字节字符和控制流在 chunk 边界上被拆坏
  - 终端历史快照在达到缓冲上限后，会避开 ANSI 控制序列边界再裁剪，降低重新 attach 后出现串行显示或控制字符穿帮的概率
  - 补充了终端输出缓冲回归测试，并完成 `pnpm --filter server test` 验证

## 2026-03-10

- **任务终端恢复与进程清理修复**：
  - 修复了任务工作台里 Codex 历史会话恢复时，误把后端临时 session id 当成真实 CLI 会话 id 持久化的问题
  - 对于无法确认真实 Provider 会话 id 的终端，系统不再把仅当前后端进程内有效的临时 id 写回任务，避免后续刷新后误恢复；当前该保护已覆盖 Gemini 这类尚未实现真实会话 ID 解析的 Provider
  - 后端现已移除 Codex 在恢复 id 失效时自动退化到 `resume --last` 的行为，改为直接返回明确错误，避免后台反复拉起新的高 CPU `codex` 进程
  - 终端关闭、任务删除和后端 shutdown 时，现在都会按整个进程组回收 PTY 子进程，减少 `fish -> node -> codex` 残留成孤儿进程的概率
  - 补充了前后端回归测试，覆盖固定 Provider 会话 id 持久化、无效恢复请求拦截、进程组清理和应用关闭回收
  - 同时修复了新建 Codex 终端后任务未关联的问题：当创建阶段还拿不到真实 CLI 会话 id 时，前端会先回写当前运行时 session id 保持任务关联，后端继续负责兜底拦截无效恢复
  - 后端现在会在新建 Codex 终端后，从实际打开的 `~/.codex/sessions/*.jsonl` 会话文件里解析真实 session id，并在 `created` 消息里回传给前端；因此后续任务关联与历史恢复会优先使用真正可恢复的 Codex session id

- **任务工作台终端关闭抖动修复**：
  - 修复了在同时打开终端和产物栏时，关闭终端到最后消失瞬间，产物栏会向左抖一下的问题
  - 现在终端关闭后的聊天区宽度计算会把产物栏左侧 1px 分割线一起计入，避免最终落位时再发生一次布局挤压
  - 产物栏拖拽预览也已复用同一套宽度计算，避免拖拽态和最终态不一致
  - 进一步移除了终端区关闭时的退出占位动画，避免终端内部最后一帧 reflow 再次把产物栏顶偏
  - 终端区域退出时现已立即脱离 flex 布局，只保留淡出；终端分割线也改为即时移除，避免最后一帧仍参与布局导致产物栏抖动

- **任务聊天气泡配色调整**：
  - 日间模式下，用户消息框背景色改为 `#95EC69`，AI 消息框背景色改为 `#FFFFFF`，消息文字统一调整为黑色
  - 日间模式下，任务聊天面板背景统一改为 `#EDEDED`，顶部标题区和底部输入区也同步对齐
  - 暗黑模式下继续保留当前聊天面板 `#191919`、用户消息框 `#3EB575`、AI 消息框 `#2E2E2E` 的深色配色
  - 消息气泡圆角已与发送框输入区域对齐，统一使用同一套圆角规格，视觉更一致
  - 补充了 `TaskChat` 前端回归测试，避免后续样式调整时把这组配色改回去

- **暗黑模式分隔线 hover 修复**：
  - 修复了任务工作台里终端边界和产物边界在暗黑模式下悬停时不显示蓝色高亮的问题
  - 现在拖拽分隔线在日间和暗黑模式下都会稳定显示同样的蓝色提示

- **聊天自动滚动交互优化**：
  - 发送消息后，任务聊天区会重新进入自动滚动模式，后续回复会继续跟随到底部
  - 只有用户手动滚动离开底部时，才会退出自动滚动，并在右下角显示一个下箭头入口
  - 点击下箭头后会立即回到底部，并重新开启自动滚动

- **产物栏默认宽度调整**：
  - 加宽了任务工作台里产物栏的默认展开宽度，首次打开时能看到更多 `AGENTS.md` 内容
  - 保留原有拖拽行为不变，仍可继续手动缩放到更窄或更宽

- **终端 resize 串行问题修复**：
  - 修复了 Claude Code、Codex 与 Gemini CLI 在任务终端里因为窗口 resize 触发过多或抖动的尺寸同步，导致界面退化成串行/降级输出的问题
  - 前端现在会跳过无效终端尺寸，去掉重复的 resize 上报，并移除固定周期的尺寸 keepalive，避免浏览器布局抖动时持续向后端灌入 resize
  - 后端现在只会在 PTY 尺寸真实变化时执行 winsize 更新，并额外向终端进程组发送 `SIGWINCH`，让 CLI 正常重绘而不是卡在旧尺寸状态
  - 补充了前端 resize 守卫测试和后端 PTY resize 回归测试，覆盖重复 resize 与真实尺寸变化两条关键路径

- **任务工作台产物拖拽视觉修复**：
  - 修复了仅开启产物栏、关闭终端时，拖动产物栏左边框会视觉上像是右边框在移动的问题
  - 拖拽过程中左侧聊天区现在会同步跟随剩余空间实时变化，分割线位置与最终落点保持一致
  - 补充了产物栏拖拽预览布局的前端回归测试，避免后续再出现“拖拽时只改右侧宽度、左侧不跟随”的回退

- **任务详情页任务抽屉优先级展示修复**：
  - 修复了在任务详情页打开任务列表抽屉时，任务卡片没有展示优先级标签的问题
  - 抽屉中的任务项现已对齐主任务列表，支持完整展示 `P0` 到 `P4` 五级优先级，并保留对应的颜色语义
  - 补充了 `P4` 优先级的前端回归测试，避免后续抽屉样式调整时再次漏掉最低优先级

- **OpenAI Responses 兼容性修复**：
  - 修复了选择 OpenAI 供应商新建任务时，接口返回 `API error 500: {"error":"解析失败: AI 解析失败，请重试"}` 的问题
  - 修复了 OpenAI 对话带历史 assistant 消息时，Responses API 请求把 assistant 内容误发成 `input_text`、导致接口返回 400 的问题
  - 保留了旧版兼容端点所需的单 `user prompt` 回退：当结构化 `input` 流式请求返回 `400/422/503` 时，会自动降级重试，避免任务解析和文档生成在兼容代理上再次回退
  - 后端现已兼容 Responses API 流式 `response.output_text.delta` 事件，并按角色正确编码消息内容：用户/系统消息使用 `input_text`，assistant 历史消息使用 `output_text`
  - 补充了 OpenAI 流式解析、Responses 消息编码与 `/api/tasks/parse` 的回归测试，避免后续兼容层回退

- **后端运行时切换到 Python**：
  - `packages/server` 已由 Python + FastAPI 接管，前端继续沿用原有 `/api`、SSE 和 `/ws/terminal` 协议，不需要同步重写前端接口层
  - 任务、设置、记忆、头像、用量聚合、本地路径打开与终端 WebSocket 已迁移到 Python 实现，开发与测试脚本默认改为通过 `uv` 运行
  - 原 TypeScript 服务端源码已从默认后端实现中移除，仓库现在以 Python 作为唯一后端代码路径
  - 新增 `packages/server/tests/test_app.py`，补齐了健康检查、Provider CRUD、任务主流程、流式聊天、记忆保存、路径打开和 WebSocket `list` 的关键链路验证

## 2026-03-09

- **Agentic Chat 工具化设计补齐**：
  - 新增 `docs/design/agentic-chat-tooling.md`，系统梳理了当前任务聊天与 workspace / 终端 / 产物之间的断点
  - 明确了后续将采用“自建 AgentRuntime + tool registry + typed SSE + 审批流”的路线，把搜索、workspace 文件读写、产物同步与终端桥接纳入统一设计
  - 同时保留当前 `tasks.chat_messages`、`generate-docs` 与终端链路作为迁移兼容层，避免一次性重构过大

- **任务列表优先级排序修复**：
  - 修复了任务列表按优先级排序时方向颠倒的问题，`P0` 现在会稳定排在更前面，`P4` 排在更后面
  - 后端分页排序语义与数据库索引保持一致，优先级排序在翻页后也不会出现前后顺序错乱

- **输入法回车误提交修复**：
  - 修复了新建任务输入框、任务聊天输入框、任务标题编辑框与终端重命名输入框在中文输入法组合输入时，按回车选词会被误判为直接提交的问题
  - 统一补上 IME 组合态判断与 `keyCode 229` 兼容处理，保留原有 `Enter` 发送/确认、`Shift + Enter` 换行行为

- **任务产物兼容入口扩展**：
  - 生成或物化 `AGENTS.md` 时，workspace 现在会同时维护 `CLAUDE.md` 与 `GEMINI.md` 两个兼容软链，二者都指向 `./AGENTS.md`
  - 打开 workspace、生成文档与启动任务终端时都会自动补齐这两个兼容入口，避免不同 CLI 读取任务上下文时出现缺口

- **创建任务后自动首聊恢复**：
  - 修复了“分析完意图并创建任务后进入详情页，但不会自动发起第一次规划对话”的问题
  - 现在创建成功后会立即触发首轮规划请求；当任务尚无聊天历史时，后端会自动把标题、类型与初步意图组装成第一条“任务信息”消息发送给大模型

- **任务聊天流式体验修复**：
  - 创建任务后自动首聊时，任务信息现在会立刻出现在对话区，不再等到 AI 首次返回后才补显示
  - 移除了流式响应期间冗余的“三个点”占位消息，避免和真实流式内容重复
  - 调整了聊天区自动滚动策略：只有用户仍停留在底部时才继续跟随流式输出，手动上滑查看历史时不会再被强行拉回底部

## 2026-03-08

- **OpenViking 记忆管理一期**：
  - `wudao server` 新增 OpenViking Embedded bridge，通过本地 Python SDK 读取外挂 context，不再额外暴露 OpenViking 原生服务端
  - OpenViking 本地 workspace 固定落到 `~/.wudao/contexts`，并接入了状态检测与错误诊断
  - 顶部导航新增“记忆”一级入口，可查看当前 OpenViking 状态、配置文件路径、数据目录与全部用户/Agent 记忆
  - 记忆页支持刷新、作用域筛选、文本搜索与展开查看完整内容，也可直接打开本地记忆目录

- **Wudao Agent 全局记忆可编辑**：
  - 记忆页新增“Wudao Agent 全局记忆”编辑卡片，可手动维护一份全局 Agent 记忆
  - 该内容保存到 `~/.wudao/profile/wudao-agent-memory.md`，并会尽力同步到 OpenViking 的 Agent memory 中
  - 每个任务在首次开始规划对话时，系统都会自动把这份全局 Agent 记忆注入到上下文中，作为长期工作方式和约束参考

- **记忆分模块管理**：
  - 记忆页升级为三模块结构：`用户记忆 / Agent 记忆 / OpenViking 记忆`，不同来源的记忆不再混在一个区域里
  - 新增“用户记忆”模块：可单独维护 `~/.wudao/profile/user-memory.md`，用于记录用户个人情况与长期偏好
  - 任务意图识别（自然语言建任务）也会带入用户记忆与 Agent 记忆，让任务澄清更贴近你的习惯和背景
  - 对话协议调整：移除固定 `TASK_CHAT_SYSTEM` 设计，改为把“用户记忆 + Agent 记忆”作为真正的 `system prompt` 注入每次任务对话请求

- **暗黑模式可读性修复**：
  - 补做了主要页面与关键弹窗的暗黑模式可读性审计，确认 Dashboard、任务页、工作台、设置页等主路径的文字对比度
  - 修复了任务列表“新建任务”弹窗里模型供应商名称在暗黑模式下过暗的问题，供应商卡片文字现在会正确切换为浅色，选择模型时更清晰
  - 修复了产物抽屉 `AGENTS.md` 标题与辅助文案、以及设置页供应商排序按钮 hover 状态在暗黑模式下的低对比度问题

- **体验打磨与加载态优化**：
  - **移除全站鱼骨屏（Skeleton Screen）**：将仪表盘、任务列表及任务详情页中的脉冲式灰色块统一替换为更简洁的 `LoadingIndicator`（加载动画 + 文字）
  - 提升了弱网或大数据量处理场景下的视觉稳定性，避免了加载过程中界面大幅跳动
  - 清理了项目中冗余的 Skeleton 函数定义及相关的 `animate-pulse` 样式代码
  - **主题加载体验优化**：在 `index.html` 注入内联脚本预设主题，并优化了 `ThemeProvider` 的过渡类应用逻辑，解决了暗黑模式下刷新页面产生的色块闪烁（由白到黑的自动动画）问题，仅在手动切换主题时保留平滑过渡
- **任务元数据系统升级**：
  - **任务类型图标化**：为功能、修复、调研、探索、重构、学习等任务类型引入了直观的 Emoji 图标（✨, 🐛, 🔍, 🧭, ⚙️, 📚）
  - **优先级体系重构**：统一为 P0-P4 五级标准（P0 为最高），并建立了与之对应的红、橙、黄、蓝、绿五色视觉体系，提升了任务紧急程度的辨识度
  - **精简任务属性**：移除了原有的“重要度/紧急度”冗余字段，将其权重完全整合至五级优先级中，简化了交互流程
  - **数据库自动迁移**：后端同步更新了数据库约束，并实现了旧版优先级与重要度数据向新 P0-P4 体系的自动化平滑迁移
- **Kimi 用量获取适配**：
  - 修复了设置 Cookie 后仍报 401 的问题，通过调整身份验证 token 的提取优先级，确保优先使用 `usage_cookie` 中的最新 `kimi-auth` 字段
  - 增强了 JWT payload 解析的容错性，支持多种备选字段名（如 `deviceId` / `sessionId` 等），并模拟了真实的浏览器 `User-Agent`
- **工程质量与稳定性收敛**：
  - 任务列表与任务详情请求增加竞态保护，快速切换任务或筛选时，旧请求结果不再覆盖当前界面状态
  - 文档生成、任务更新、终端关联改为统一的任务状态合并路径，前端状态更新更稳，相关测试补强后恢复全绿
  - 后端新增可测试的 app 组装入口与轻量日志封装，测试环境默认静音，日常回归输出更干净
- **本地路径打开安全加固**：
  - 终端与界面中触发“打开路径”时，后端仅允许项目目录、任务 workspace 与 profile 白名单路径，避免误打开无关系统目录
- **前端国际化补齐**：
  - 任务终端、产物抽屉、终端启动弹窗、终端系统消息、任务加载态与仪表盘提示文案全部接入 i18n，避免中英文混杂
  - 终端权限模式与操作提示统一改为语义化 key 管理，后续新增文案时不再散落在组件内
- **前端加载性能优化**：
  - Dashboard / TaskList / TaskWorkspace / Settings 四个主视图改为懒加载，主入口包缩减到约 448 kB
  - 任务工作台继续按面板拆包：终端面板、终端视图、任务列表抽屉、产物抽屉、启动终端弹窗均改为独立 chunk
  - 当前 `TaskWorkspaceView` 主 chunk 约 225 kB，`TerminalView` chunk 约 367 kB，前端生产构建已无大包告警
- **工程质量继续收敛**：
  - 删除未再使用的 `TaskPanel` 旧实现与任务面板冗余常量，前端结构更干净，后续维护时不再存在双实现误导
  - `tasks` 路由中的会话关联与 provider 持久化逻辑下沉到 `task-service`，并补上独立 service 单测，后续继续瘦身 route 更顺手
- **任务统计修复**：
  - 任务中心列表页改为拉取全量任务后在前端筛选，修复切到“进行中”或“已完成”时另一侧数量被错误显示为 0 的问题
  - 后端新增 `GET /api/tasks/stats` 统计摘要接口，Dashboard 改为直接消费 active / done / high_priority / urgent / all 五项汇总，避免任务数超过一页后首页统计偏小
  - Dashboard 新增 30 秒静默自动刷新、窗口重新聚焦自动同步与手动刷新合并逻辑，首页统计与用量数据会更及时
  - 删除任务后会立即重新拉取全量任务，保证顶部计数与列表内容保持一致
- **验证基线提升**：
  - 测试基线更新为 server 175 + web 59，全量通过
  - 前端生产构建通过，继续保持无大包告警

## 2026-03-07

- **任务详情页布局大革新**：
  - 新增单行全局顶栏，整合所有任务操作，显著提升空间利用率与操作直观度
  - 核心操作（标记完成、打开目录、删除）全面图标化，风格更加现代、统一
  - 移除侧边栏折叠机制，确立“左聊天 + 右终端”的固定分栏布局，中间支持无损占比调节
- **元数据选择器深度重构**：
  - 优先级、紧急度、截止时间实现视觉对齐，采用简约的胶囊胶囊切换风格
  - 优先级等级规范化为 P1、P2、P3 三级
  - “选中即显示”模式：默认仅展示当前状态，点击弹出不透明实色菜单，彻底解决透明度干扰文字阅读的问题
- **聊天与终端体验升级**：
  - 聊天窗口实现局部固定：AGENTIC 标题行与输入框稳固置顶/置底，消息内容区域独立丝滑滚动
  - 彻底解决终端在调整分栏占比时的“形变”问题，确保行列数计算与容器拉伸绝对同步
- **稳定性与代码质量**：
  - 补全全站 `text-system-gray-500` 的暗黑模式适配（`dark:text-system-gray-400`）
  - 修复了涉及 `taskStore`、`Header` 及 `TaskListView` 的全量 TypeScript 类型报错
  - 修复并重构了 `taskStore.test.ts`，确保单元测试与新 Store 结构完全契合
  - 任务列表新增“创建时间”排序选项支持
- 国际化（i18n）：初步完成中英文框架搭建，支持列表、设置及核心工作台界面的语言切换
- 任务时间基线：统一采用 `Asia/Shanghai` 时区，彻底修复 UTC 与本地时间混淆导致的“8 小时前”显示 Bug

## 2026-03-06

- 文档对齐当前实现：任务工作台设计文档更新为“任务背景 + 规划对话 + 终端平铺 + 产物抽屉”的最新布局，不再描述旧五阶段流转条
- 产物模型说明更新：`AGENTS.md` 为主产物，`CLAUDE.md` 为指向 `AGENTS.md` 的兼容软链；终端首条提示改为引导读取 `AGENTS.md`
- 根文档与项目状态同步：主界面说明更新为三栏导航（主页 / 任务面板 / 设置），测试基线更新为 server 158 + web 44
- 任务模型收敛：移除 `plan` / `summary` 的运行时写路径与响应暴露，移除旧的 `/tasks/:id/advance` 别名；数据库 schema 正式切换为 `chat_messages` / `status_log`

## 2026-02-27

- 后端深度重构：usage.ts 从 383 行瘦身至 11 行薄路由，提取 usage-adapters.ts 统一 provider 请求管线（fetchJson/finalize 共享 + MiniMax/GLM/Kimi 三适配器）
- terminal.ts 职责拆分：提取 task-claude-md.ts（CLAUDE.md 生成）和 claude-session-store.ts（会话持久化检查），终端模块聚焦 WS/PTY 会话管理
- llm.ts 启动阻塞修复：execSync 版本探测改为惰性缓存，消除模块加载时同步阻塞
- getTaskById 下沉到 task-service.ts，统一数据访问入口
- 安全加固：taskId 路径穿越校验（白名单 YYYY-MM-DD-n）、fetchJson 8s 超时控制、getEnv shell fallback 缓存、sessionId UUID 格式校验
- 前端组件拆分：sections.tsx 拆为 Header/StageBar/EditArea/StageActions/PlanChat/SessionSection 6 个原子组件，常量集中到 constants.ts
- 测试基线从 102 升至 147（server 113 + web 34），全量通过
- 工程质量重构：删除旧聊天模块全部死代码（ChatView、SessionList、MessageView、TaskDetailView、chatStore、sessions route、chat route），移除 4 个无用 npm 依赖（react-markdown、rehype-highlight、highlight.js、@tailwindcss/typography）
- 后端类型安全：新增 `types/db.ts` 统一 ProviderRow/TaskRow 类型定义，消除 settings、tasks 路由中约 30 个 `as any`
- 后端分层重构：从 tasks.ts 提取 `task-service.ts`（业务逻辑）和 `paths.ts`（路径常量），llm.ts 提取 `buildHeaders()` 消除重复代码
- 路由注册顺序修正：`POST /parse` 移至动态 `/:id` 路由之前，避免潜在匹配冲突
- DB schema 清理：移除 sessions/messages 旧表定义，测试同步更新，102 个测试全部通过

## 2026-02-26

- 任务上下文自动注入：启动终端时在 workspace 目录自动生成 CLAUDE.md，包含任务标题、背景、执行方案，Claude Code 启动即获得完整上下文
- 终端首条指令从传 plan 全文改为引导 Claude Code 主动读取 CLAUDE.md，resume 会话后上下文不再丢失
- 移除独立「工作台」tab，终端功能完全收归任务系统，导航精简为三栏（主页/任务面板/设置）
- 任务列表新增状态 Tab 筛选（进行中 / 已完成 / 全部），带数量统计
- 任务列表新增搜索框，支��按标题和背景描述模糊匹配
- 已完成任务半透明 + 标题删除线，视觉区分更清晰
- 时间显示改为相对时间（"3小时前"、"2天前"），更直观
- 终端窗口 resize 稳定性修复：避免右侧字符被边框裁切
- 终端文本选区与复制对齐修复：减少选区超出或遗漏字符的问题
- 终端 CJK 字符宽度对齐修复：优化中文符号场景下的换行与选区一致性
- TDD 基础设施搭建：前后端引入 vitest，共 103 个测试用例全部通过
  - Server：db.ts 单元测试（15）、llm.ts 单元测试（18）、tasks route 集成测试（36）
  - Web：taskStore 单元测试（34）
  - db.ts 重构提取 `initDatabase()` 函数，支持 `:memory:` 内存数据库测试
  - 根目录 `pnpm test` 一键运行全量测试

## 2026-02-24

- 完成 MVP 方案设计（v7.0）
- 建立 VibeCoding 开发规范和工作流程
- 搭建文档目录结构
- 搭建项目骨架：pnpm monorepo，后端 Hono + SQLite 建表，前端 Vite + React + Tailwind，health check 连通
- 完成后端 API：Provider CRUD、Session CRUD、SSE 流式对话接口
- 完成前端 UI：ChatView 对话界面、MessageView Markdown 渲染 + 代码高亮、SessionList 会话管理、SettingsView 模型配置
- 打磨：错误提示 banner、首次使用引导、移动端响应式侧边栏、当前模型显示
- 全站中文化，统一用户可见文案
- Provider 配置升级为 Anthropic Messages API 兼容模式，并预置 Kimi / GLM / MiniMax / 通义千问
- 主交互模式升级为“终端工作台”：前端嵌入 xterm.js，后端通过 `node-pty` 启动 CLI 会话
- 新增 `/ws/terminal` 双向通道，支持多终端会话创建、切换、关闭
- 终端会话切换体验优化：支持 attach 回放历史快照，避免切回会话后空白
- 修复多会话串流与重复渲染：消息增加 `sessionId` 过滤，切换后不再重复刷屏
- WebSocket 走 Vite 代理并使用相对地址，开发环境连接稳定性提升
- 新增默认终端服务商 `Claude`，自动识别本机 `claude` CLI 路径并可一键启动
- 设计文档升级为 v8.0，统一记录终端工作台架构与当前协议

## 2026-02-25

- 新增"主页"Dashboard 视图，展示各服务商 Coding 额度用量监控（MiniMax / GLM / Kimi）
- 新增 `/api/usage` 后端接口，聚合多平台��量数据（百分比进度条 + 刷新倒计时）
- 主界面升级为三栏导航：主页（用量监控）/ Claude Code 工作台 / 设置
- 设计文档升级为 v8.1，补充 Dashboard 与 Usage API 说明
- 新增 Task 系统：任务生命周期管理，支持 Context → Planning → Execution → Review → Summary 五阶段流转
- 新增"任务面板"导航入口，支持创建、查看、编辑任务
- 任务详情页：阶段流转条可自由跳转，各阶段内容 debounce 自动保存
- 任务关联终端：从任务详情页启动终端，cwd 自动指向 task workspace 目录，sessionId 自动关联
- 后端新增 `/api/tasks` CRUD 接口 + workspace 目录自动创建
- 导航栏升级为四栏：主页 / 任务面板 / 工作台 / 设置
- Task 自动化流转：支持自然语言创建任务，AI 自动解析为标题/类型/背景
- Task 阶段操作按钮：Context→AI生成方案、Planning→确认/重新生成、Execution→进入复盘、Review→AI生成总结、Summary→完成
- 后端新增 `chatComplete` 非流式 LLM 调用 + `/api/tasks/parse`、`/api/tasks/:id/advance` AI 端点
- Planning 阶段升级为对话式规划：AI 通过提问收集上下文，信息充分后自动生成方案（`---PLAN---` 标记提取）
- 后端新增 `/api/tasks/:id/chat` SSE 流式对话端点，支持多轮规划对话历史持久化（`plan_messages` 字段）
- 执行阶段启动终端时自动将方案作为首条 prompt 输入给 Claude Code（2s 延迟注入）
- Task ID 改为日期序号格式（`2026-02-25-1`），替代 UUID，更直观易读
- Task workspace 迁移至 `~/.wudao/workspace/`，脱离项目目录，避免污染代码仓库
- 关联终端支持 `--resume` 恢复 Claude Code 对话：活跃终端直接跳转，已关闭终端通过 CLI session ID 恢复
- 终端 session 列表接口返回 `cliSessionId`，页面刷新后仍可正确匹配关联终端
- VibeCoding 规则文档升级：新增文档索引、分层 `CLAUDE.md`、大功能计划模板与脚本规范
- Task 工作台一体化：任务详情页升级为左右分栏布局，左侧任务面板（可折叠），右侧终端平铺面板
- 终端平铺面板支持 @dnd-kit 拖拽排列，CSS Grid 自适应列数（1/2/3列）
- 任务终端与工作台终端完全隔离，互不干扰
- 新增 terminalStore（zustand）集中管理终端会话状态，替代 App 局部 state
- 新增 WsContext 共享 WebSocket 连接，消除 prop drilling
- 修复多终端共享 WebSocket 时 input/resize 路由错误的问题
