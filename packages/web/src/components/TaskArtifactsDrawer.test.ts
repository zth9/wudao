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
  it("使用统一抽屉壳层并为产物信息声明可读颜色", () => {
    const html = renderToStaticMarkup(
      createElement(TaskArtifactsDrawer, {
        taskId: "2026-03-08-1",
        agentDoc: null,
        onClose: () => undefined,
      })
    );

    expect(html).toContain('data-task-workspace-drawer="true"');
    expect(html).toContain('data-task-workspace-drawer-header="true"');
    expect(html).toContain("height:49px");
    expect(html).toContain("text-xs font-bold text-foreground");
    expect(html).toContain("text-[10px] text-muted mt-0.5");
  });
});
