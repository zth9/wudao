import { describe, expect, it } from "vitest";

import {
  clampSdkRunnerWidth,
  clampTerminalWidth,
  getCollapsedChatPanelWidth,
  getSdkRunnerDragPreview,
  getTerminalDragPreview,
  resolveRightDrawerLayout,
} from "./task-workspace-layout";

describe("task workspace drawer layout", () => {
  it("会对 Agent Runner 宽度做最小值和最大值钳制", () => {
    expect(clampSdkRunnerWidth(180, 1200)).toBe(280);
    expect(clampSdkRunnerWidth(1200, 900)).toBe(579);
    expect(clampSdkRunnerWidth(500, 1200)).toBe(500);
  });

  it("会对终端宽度做最小值和最大值钳制", () => {
    expect(
      clampTerminalWidth(180, 1600, {
        sdkRunnerOpen: false,
        sdkRunnerWidth: 420,
      }),
    ).toBe(360);
    expect(
      clampTerminalWidth(1200, 900, {
        sdkRunnerOpen: true,
        sdkRunnerWidth: 420,
      }),
    ).toBe(360);
    expect(
      clampTerminalWidth(640, 1600, {
        sdkRunnerOpen: false,
        sdkRunnerWidth: 420,
      }),
    ).toBe(640);
  });

  it("会把右侧独立抽屉和分割线宽度都计入聊天区宽度计算", () => {
    expect(
      getCollapsedChatPanelWidth({
        terminalOpen: false,
        terminalWidth: 720,
        sdkRunnerOpen: true,
        sdkRunnerWidth: 420,
      }),
    ).toBe("calc(100% - 421px)");
    expect(
      getCollapsedChatPanelWidth({
        terminalOpen: true,
        terminalWidth: 720,
        sdkRunnerOpen: true,
        sdkRunnerWidth: 420,
      }),
    ).toBe("calc(100% - 1142px)");
  });

  it("在仅显示 Agent Runner 时会同步返回聊天区预览宽度", () => {
    expect(
      getSdkRunnerDragPreview({
        containerRight: 1200,
        pointerClientX: 860,
        viewportWidth: 1440,
        layout: {
          terminalOpen: false,
          terminalWidth: 720,
          sdkRunnerOpen: true,
          sdkRunnerWidth: 420,
        },
      }),
    ).toEqual({
      sdkRunnerWidth: 340,
      chatPanelWidth: "calc(100% - 341px)",
    });
  });

  it("在仅显示终端时会同步返回聊天区预览宽度", () => {
    expect(
      getTerminalDragPreview({
        containerRight: 1200,
        pointerClientX: 700,
        viewportWidth: 1440,
        layout: {
          terminalOpen: true,
          terminalWidth: 720,
          sdkRunnerOpen: false,
          sdkRunnerWidth: 420,
        },
      }),
    ).toEqual({
      terminalWidth: 500,
      chatPanelWidth: "calc(100% - 501px)",
    });
  });

  it("会统一解析终端和 Agent Runner 宽度", () => {
    expect(
      resolveRightDrawerLayout(
        {
          terminalOpen: true,
          terminalWidth: 720,
          sdkRunnerOpen: true,
          sdkRunnerWidth: 420,
        },
        900,
      ),
    ).toEqual({
      terminalWidth: 360,
      sdkRunnerWidth: 280,
      totalWidth: 642,
      chatPanelWidth: "calc(100% - 642px)",
    });
  });
});
