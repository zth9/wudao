import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../services/api", () => ({
  tasks: {
    openWorkspace: () => Promise.resolve(),
  },
}));

import TaskArtifactsDrawer from "./TaskArtifactsDrawer";

describe("TaskArtifactsDrawer", () => {
  it("在暗黑模式下为产物标题和辅助文案声明可读颜色", () => {
    const html = renderToStaticMarkup(
      createElement(TaskArtifactsDrawer, {
        taskId: "2026-03-08-1",
        agentDoc: null,
        onClose: () => undefined,
      })
    );

    expect(html).toContain("text-xs font-bold text-foreground dark:text-foreground-dark");
    expect(html).toContain("text-[10px] text-system-gray-400 dark:text-system-gray-300 mt-1");
    expect(html).toContain("text-[10px] text-system-gray-400 dark:text-system-gray-300 mt-0.5");
  });
});
