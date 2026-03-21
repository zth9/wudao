import { Fragment, createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) =>
    createElement(Fragment, null, children),
  motion: {
    button: "button",
    div: "div",
    span: "span",
  },
}));

vi.mock("../../stores/settingsStore", () => ({
  useSettingsStore: (selector: (state: {
    providers: Array<{ id: string; name: string; is_default?: boolean }>;
    user: { avatar: string; nickname: string };
  }) => unknown) =>
    selector({
      providers: [{ id: "provider-1", name: "Claude", is_default: true }],
      user: { avatar: "", nickname: "Tian" },
    }),
}));

import {
  TASK_CHAT_PROVIDER_BACKDROP_CLASS,
  TASK_CHAT_PROVIDER_MENU_CLASS,
  TASK_CHAT_PROVIDER_TRIGGER_CLASS,
  TaskChat,
  TaskChatScrollToBottomButton,
  resolveTaskChatBottomFadeVisibilityClass,
} from "./TaskChat";

describe("TaskChat", () => {
  it("让消息气泡与聊天面板保持指定的日间和暗黑配色", () => {
    const html = renderToStaticMarkup(
      createElement(TaskChat, {
        taskId: "2026-03-10-1",
        taskProviderId: "provider-1",
        items: [
          { id: "user-1", kind: "user_text", content: "用户消息", status: "completed" },
          { id: "assistant-1", kind: "assistant_text", content: "AI 消息", status: "completed", streaming: false },
        ],
        streaming: false,
        agentDoc: null,
        generatingDocs: false,
        onGenerateDocs: () => undefined,
        onSend: () => undefined,
        onProviderChange: () => undefined,
        onAbort: () => undefined,
      })
    );

    expect(html).toContain("bg-[#EDEDED] dark:bg-[#191919]");
    expect(html).toContain("rounded-apple-xl");
    expect(html).toContain("bg-[#95EC69]/90 text-black dark:bg-[#3EB575]/90");
    expect(html).toContain("bg-white/80 text-black border border-black/5 dark:bg-[#2E2E2E]/80 dark:text-white dark:border-white/10");
  });

  it("让标题行继续贴边，并把输入区渲染成带外边距的圆角浮层", () => {
    const html = renderToStaticMarkup(
      createElement(TaskChat, {
        taskId: "2026-03-10-1",
        taskProviderId: "provider-1",
        items: [],
        streaming: false,
        agentDoc: null,
        generatingDocs: false,
        onGenerateDocs: () => undefined,
        onSend: () => undefined,
        onProviderChange: () => undefined,
        onAbort: () => undefined,
      })
    );

    expect(html).toContain('data-task-chat-header="true"');
    expect(html).toContain('data-task-chat-header-panel="true"');
    expect(html).toContain('data-task-chat-input-shell="true"');
    expect(html).toContain('data-task-chat-input-panel="true"');
    expect(html).toContain('data-task-chat-input-field="true"');
    expect(html).toContain('data-task-chat-bottom-fade="true"');
    expect(html).toContain('class="absolute top-0 left-0 right-0 z-20"');
    expect(html).toContain('class="absolute bottom-0 left-0 right-0 z-20"');
    expect(html).toContain("border-b border-black/5 bg-white/90 backdrop-blur-apple dark:border-white/10 dark:bg-[#1c1c1e]/85");
    expect(html).toContain("m-3 rounded-apple-2xl border border-black/5 bg-white/90 shadow-apple-lg backdrop-blur-apple dark:border-white/10 dark:bg-[#1c1c1e]/85");
    expect(html).toContain("bg-gradient-to-b from-[#EDEDED]/0 via-[#EDEDED]/24 to-[#EDEDED]/96 backdrop-blur-md dark:from-[#191919]/0 dark:via-[#191919]/28 dark:to-[#191919]/94");
    expect(html).toContain("opacity-0");
    expect(html).toContain("left:0px");
    expect(html).toContain("right:6px");
    expect(html).toContain("height:76px");
    expect(html).toContain("-webkit-mask-image:linear-gradient(to right, transparent 0, black 10px, black calc(100% - 18px), transparent 100%)");
    expect(html).toContain("mask-image:linear-gradient(to right, transparent 0, black 10px, black calc(100% - 18px), transparent 100%)");
    expect(html).toContain("flex-1 rounded-apple-xl border border-black/5 bg-white/60");
    expect(html).toContain('data-task-chat-provider-trigger="true"');
    expect(html).toContain(TASK_CHAT_PROVIDER_TRIGGER_CLASS);
    expect(TASK_CHAT_PROVIDER_MENU_CLASS).toContain("absolute");
    expect(TASK_CHAT_PROVIDER_MENU_CLASS).toContain("apple-dropdown");
    expect(TASK_CHAT_PROVIDER_BACKDROP_CLASS).toContain("fixed inset-0");
  });

  it("将工具调用与工具结果合并为一个默认收起的卡片", () => {
    const html = renderToStaticMarkup(
      createElement(TaskChat, {
        taskId: "2026-03-10-1",
        taskProviderId: "provider-1",
        items: [
          { id: "tool-call", kind: "tool_call", toolName: "workspace_list", input: { path: "." }, status: "completed" },
          { id: "tool-result", kind: "tool_result", toolName: "workspace_list", output: { entries: ["AGENTS.md"] }, status: "completed" },
        ],
        streaming: false,
        agentDoc: null,
        generatingDocs: false,
        onGenerateDocs: () => undefined,
        onSend: () => undefined,
        onProviderChange: () => undefined,
        onAbort: () => undefined,
      })
    );

    expect(html).toContain("tasks.tool_message_label");
    expect(html).toContain('data-tool-collapsible="true"');
    expect(html).toContain('data-tool-kind="tool_exchange"');
    expect(html).toContain('data-tool-default-collapsed="true"');
    expect(html).toContain("tasks.expand_tool");
    expect(html).toContain("tasks.collapse_tool");
    expect(html).toContain("workspace_list");
    expect(html).toContain("AGENTS.md");
  });

  it("为 invoke_claude_code_runner 工具结果提供打开对应 SDK Runner 的入口", () => {
    const html = renderToStaticMarkup(
      createElement(TaskChat, {
        taskId: "2026-03-21-1",
        taskProviderId: "provider-1",
        items: [
          { id: "tool-call", kind: "tool_call", toolName: "invoke_claude_code_runner", input: { prompt: "执行一次测试" }, status: "completed" },
          { id: "tool-result", kind: "tool_result", toolName: "invoke_claude_code_runner", output: { ok: true, sdk_run_id: "sdk-run-12345678" }, status: "completed" },
        ],
        streaming: false,
        agentDoc: null,
        generatingDocs: false,
        onGenerateDocs: () => undefined,
        onSend: () => undefined,
        onProviderChange: () => undefined,
        onAbort: () => undefined,
        onOpenSdkRun: () => undefined,
      })
    );

    expect(html).toContain("tasks.open_sdk_runner");
    expect(html).toContain('data-sdk-run-link="sdk-run-12345678"');
    expect(html).toContain("sdk-run-");
  });

  it("在模型首条回复到达前显示输入中提示", () => {
    const html = renderToStaticMarkup(
      createElement(TaskChat, {
        taskId: "2026-03-10-1",
        taskProviderId: "provider-1",
        items: [
          { id: "assistant-prev", kind: "assistant_text", content: "上一轮回复", status: "completed", streaming: false },
          { id: "user-1", kind: "user_text", content: "用户消息", status: "completed" },
        ],
        streaming: true,
        agentDoc: null,
        generatingDocs: false,
        onGenerateDocs: () => undefined,
        onSend: () => undefined,
        onProviderChange: () => undefined,
        onAbort: () => undefined,
      })
    );

    expect(html).toContain('data-replying-indicator="true"');
    expect(html).toContain("animate-pulse");
  });

  it("在已有流式 assistant 文本时不重复显示输入中提示", () => {
    const html = renderToStaticMarkup(
      createElement(TaskChat, {
        taskId: "2026-03-10-1",
        taskProviderId: "provider-1",
        items: [
          { id: "user-1", kind: "user_text", content: "用户消息", status: "completed" },
          { id: "assistant-1", kind: "assistant_text", content: "AI 正在回复", status: "streaming", streaming: true },
        ],
        streaming: true,
        agentDoc: null,
        generatingDocs: false,
        onGenerateDocs: () => undefined,
        onSend: () => undefined,
        onProviderChange: () => undefined,
        onAbort: () => undefined,
      })
    );

    expect(html).not.toContain('data-replying-indicator="true"');
  });

  it("在工具调用完成后等待最终回复时继续显示输入中提示", () => {
    const html = renderToStaticMarkup(
      createElement(TaskChat, {
        taskId: "2026-03-10-1",
        taskProviderId: "provider-1",
        items: [
          { id: "user-1", kind: "user_text", content: "用户消息", status: "completed" },
          { id: "tool-call-1", kind: "tool_call", toolName: "workspace_list", input: { path: "." }, status: "completed" },
          { id: "tool-result-1", kind: "tool_result", toolName: "workspace_list", output: { entries: ["AGENTS.md"] }, status: "completed" },
        ],
        streaming: true,
        agentDoc: null,
        generatingDocs: false,
        onGenerateDocs: () => undefined,
        onSend: () => undefined,
        onProviderChange: () => undefined,
        onAbort: () => undefined,
      })
    );

    expect(html).toContain('data-replying-indicator="true"');
  });

  it("让底部弱化层在出现时立即生效，只在回到底部时平滑淡出", () => {
    expect(resolveTaskChatBottomFadeVisibilityClass(true)).toBe("opacity-0 transition-opacity duration-200");
    expect(resolveTaskChatBottomFadeVisibilityClass(false)).toBe("opacity-100 transition-none");
  });

  it("为回到底部按钮渲染点击后碎裂消失的碎片层", () => {
    const html = renderToStaticMarkup(
      createElement(TaskChatScrollToBottomButton, {
        visible: true,
        shattering: true,
        shatterCycle: 2,
        title: "tasks.scroll_to_bottom",
        onClick: () => undefined,
      })
    );

    expect(html).toContain('data-shattering="true"');
    expect(html).toContain('data-shatter-duration="1100"');
    expect(html).toContain('data-shatter-cycle="2"');
    expect(html).toContain('h-9 w-9');
    expect(html).toContain('shadow-apple-md');
    expect(html).not.toContain('border-white/30');
    expect(html).not.toContain('radial-gradient(');
    expect(html).toContain('data-scroll-shard="north-west"');
    expect(html).toContain('data-scroll-shard="south-east"');
  });
});
