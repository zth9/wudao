import { describe, expect, it } from "vitest";

import {
  clampArtifactsWidth,
  getArtifactsDragPreview,
  getCollapsedChatPanelWidth,
} from "./task-workspace-layout";

describe("task workspace artifacts drag preview", () => {
  it("在仅显示产物栏时会同步返回聊天区预览宽度", () => {
    expect(
      getArtifactsDragPreview({
        containerRight: 1200,
        pointerClientX: 900,
        terminalCollapsed: true,
        viewportWidth: 1440,
      })
    ).toEqual({
      artifactsWidth: 300,
      chatPanelWidth: "calc(100% - 301px)",
    });
  });

  it("会对产物栏宽度做最小值和最大值钳制", () => {
    expect(clampArtifactsWidth(120, 1200)).toBe(200);
    expect(clampArtifactsWidth(1200, 900)).toBe(720);
  });

  it("在终端关闭且保留产物栏时，会把产物分割线宽度也计入聊天区宽度计算", () => {
    expect(getCollapsedChatPanelWidth(440)).toBe("calc(100% - 441px)");
  });
});
