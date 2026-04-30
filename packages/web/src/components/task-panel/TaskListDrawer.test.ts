import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Task } from "../../services/api";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = {
        "tasks.task_list": "任务列表",
        "common.active": "进行中",
        "common.done": "已完成",
        "common.close": "关闭",
        "task_types.feature": "功能",
        "priority_labels.4": "P4",
      };
      return messages[key] ?? key;
    },
  }),
}));

vi.mock("@heroui/react/drawer", () => ({
  Drawer: Object.assign(
    ({ children }: { children?: React.ReactNode }) => children,
    {
      Backdrop: ({ children }: { children?: React.ReactNode }) => children,
      Content: ({ children }: { children?: React.ReactNode }) => children,
      Dialog: ({ children }: { children?: React.ReactNode }) => children,
      Header: ({ children }: { children?: React.ReactNode }) => children,
      Heading: ({ children, className }: { children?: React.ReactNode; className?: string }) =>
        createElement("h2", { className }, children),
      Body: ({ children }: { children?: React.ReactNode }) => children,
    },
  ),
}));

vi.mock("@heroui/react/chip", () => ({
  Chip: ({ children, className }: { children?: React.ReactNode; className?: string }) =>
    createElement("span", { className }, children),
}));

vi.mock("@heroui/react/tooltip", () => ({
  Tooltip: Object.assign(
    ({ children }: { children?: React.ReactNode }) => children,
    {
      Content: () => null,
      Arrow: () => null,
    },
  ),
}));

vi.mock("@heroui/react/button", () => ({
  Button: ({ children, className }: { children?: React.ReactNode; className?: string }) =>
    createElement("button", { className }, children),
}));

import { TaskListDrawer } from "./TaskListDrawer";

describe("TaskListDrawer", () => {
  const makeTask = (overrides: Partial<Task> = {}): Task => ({
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
    ...overrides,
  });

  it("会在任务抽屉中展示 P4 优先级标签", () => {
    const html = renderToString(
      createElement(TaskListDrawer, {
        isOpen: true,
        onClose: () => undefined,
        tasks: [makeTask()],
        currentTaskId: "another-task",
        onSwitchTask: () => undefined,
      })
    );

    expect(html).toContain("P4");
    expect(html).toContain("任务列表");
    expect(html).toContain("补一个优先级展示回归测试");
    expect(html).toContain("功能");
  });

  it("会按状态分组展示进行中和已完成任务", () => {
    const html = renderToString(
      createElement(TaskListDrawer, {
        isOpen: true,
        onClose: () => undefined,
        tasks: [
          makeTask({ id: "active-1", status: "execution" }),
          makeTask({ id: "done-1", status: "done", title: "已完成任务" }),
        ],
        currentTaskId: "another-task",
        onSwitchTask: () => undefined,
      })
    );

    expect(html).toContain("进行中");
    expect(html).toContain("已完成");
    expect(html).toContain("已完成任务");
  });
});
