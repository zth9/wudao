import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../stores/sdkRunnerStore", () => ({
  useSdkRunnerStore: () => ({
    sdkRuns: [
      {
        id: "sdk-run-1",
        task_id: "task-1",
        agent_run_id: "agent-run-1",
        runner_type: "claude_code",
        status: "completed",
        prompt: "生成 markdown 结果",
        cwd: "/tmp/task-1",
        total_cost_usd: 0.12,
        total_tokens: 42,
        last_error: null,
        created_at: "2026-03-21T10:00:00+08:00",
        updated_at: "2026-03-21T10:00:10+08:00",
      },
    ],
    activeSdkRunId: "sdk-run-1",
    sdkTimeline: [
      {
        id: "text-1",
        kind: "text",
        content: "# 执行结果\n\n- 第一项\n- 第二项",
        streaming: false,
      },
      {
        id: "tool-result-1",
        kind: "tool_result",
        toolUseId: "toolu_1",
        content: "```ts\nconsole.log('hello')\n```",
        isError: false,
      },
    ],
    sdkRunning: false,
    sdkPanelOpen: true,
    fetchSdkRuns: vi.fn(),
    subscribeSdkEvents: vi.fn(),
    selectSdkRun: vi.fn(),
    unsubscribeSdkEvents: vi.fn(),
    approveSdkAction: vi.fn(),
    cancelSdkRun: vi.fn(),
    openSdkPanel: vi.fn(),
    closeSdkPanel: vi.fn(),
    clearSdkRunner: vi.fn(),
  }),
}));

import { SdkRunnerPanel } from "./SdkRunnerPanel";

describe("SdkRunnerPanel", () => {
  it("renders agent runner content inside the unified drawer shell", () => {
    const html = renderToStaticMarkup(
      createElement(SdkRunnerPanel, {
        taskId: "task-1",
        onClose: () => undefined,
      }),
    );

    expect(html).toContain('data-task-workspace-drawer="true"');
    expect(html).toContain('data-task-workspace-drawer-header="true"');
    expect(html).toContain("height:49px");
    expect(html).toContain("<h1");
    expect(html).toContain("执行结果</h1>");
    expect(html).toContain("<ul");
    expect(html).toContain("<pre");
    expect(html).toContain("console.log");
  });
});
