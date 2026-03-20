import { Fragment, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Task } from "../../services/api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = {
        "tasks.task_list": "任务列表",
        "common.active": "进行中",
        "common.done": "已完成",
        "task_types.feature": "功能",
        "priority_labels.4": "P4",
      };
      return messages[key] ?? key;
    },
  }),
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) =>
    createElement(Fragment, null, children),
  motion: {
    div: "div",
  },
}));

import { TaskListDrawer } from "./TaskListDrawer";

describe("TaskListDrawer", () => {
  it("会在任务抽屉中展示 P4 优先级标签", () => {
    const task: Task = {
      id: "task-p4",
      title: "补一个优先级展示回归测试",
      type: "feature",
      status: "execution",
      context: null,
      agent_doc: null,
      chat_messages: null,
      session_ids: "[]",
      session_names: "{}",
      session_providers: "{}",
      priority: 4,
      due_at: null,
      provider_id: null,
      created_at: "2026-03-10T10:00:00Z",
      updated_at: "2026-03-10T10:00:00Z",
    };

    const html = renderToStaticMarkup(
      createElement(TaskListDrawer, {
        isOpen: true,
        onClose: () => undefined,
        tasks: [task],
        currentTaskId: "another-task",
        onSwitchTask: () => undefined,
      })
    );

    expect(html).toContain(">P4<");
    expect(html).toContain("bg-apple-green/10 text-apple-green");
    expect(html).toContain("fixed left-0 top-0 bottom-0");
    expect(html).toContain("border-r border-black/5");
  });
});
