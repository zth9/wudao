import { describe, expect, it } from "vitest";

import {
  clampArtifactsWidth,
  clampSdkRunnerWidth,
  clampTerminalWidth,
  getArtifactsDragPreview,
  getCollapsedChatPanelWidth,
  getSdkRunnerDragPreview,
  getTerminalDragPreview,
  resolveRightDrawerLayout,
} from "./task-workspace-layout";

describe("task workspace drawer layout", () => {
  it("在仅显示产物栏时会同步返回聊天区预览宽度", () => {
    expect(
      getArtifactsDragPreview({
        containerRight: 1200,
        pointerClientX: 900,
        viewportWidth: 1440,
        layout: {
          terminalOpen: false,
          terminalWidth: 720,
          sdkRunnerOpen: false,
          sdkRunnerWidth: 420,
          artifactsOpen: true,
          artifactsWidth: 440,
        },
      }),
    ).toEqual({
      artifactsWidth: 300,
      chatPanelWidth: "calc(100% - 301px)",
    });
  });

  it("会对产物栏宽度做最小值和最大值钳制", () => {
    expect(clampArtifactsWidth(120, 1200)).toBe(200);
    expect(clampArtifactsWidth(1200, 900)).toBe(579);
    expect(
      clampArtifactsWidth(600, 1000, {
        terminalOpen: false,
        terminalWidth: 720,
        sdkRunnerOpen: true,
        sdkRunnerWidth: 420,
      }),
    ).toBe(398);
  });

  it("会对 Agent Runner 宽度做最小值和最大值钳制", () => {
    expect(clampSdkRunnerWidth(180, 1200, { artifactsOpen: false, artifactsWidth: 0 })).toBe(280);
    expect(clampSdkRunnerWidth(1200, 900, { artifactsOpen: true, artifactsWidth: 440 })).toBe(280);
    expect(clampSdkRunnerWidth(500, 1200, { artifactsOpen: false, artifactsWidth: 0 })).toBe(500);
  });

  it("会对终端宽度做最小值和最大值钳制", () => {
    expect(
      clampTerminalWidth(180, 1600, {
        sdkRunnerOpen: false,
        sdkRunnerWidth: 420,
        artifactsOpen: false,
        artifactsWidth: 440,
      }),
    ).toBe(360);
    expect(
      clampTerminalWidth(1200, 1440, {
        sdkRunnerOpen: true,
        sdkRunnerWidth: 420,
        artifactsOpen: true,
        artifactsWidth: 440,
      }),
    ).toBe(360);
    expect(
      clampTerminalWidth(640, 1600, {
        sdkRunnerOpen: false,
        sdkRunnerWidth: 420,
        artifactsOpen: false,
        artifactsWidth: 440,
      }),
    ).toBe(640);
  });

  it("会把右侧独立抽屉和分割线宽度都计入聊天区宽度计算", () => {
    expect(
      getCollapsedChatPanelWidth({
        terminalOpen: false,
        terminalWidth: 720,
        sdkRunnerOpen: false,
        sdkRunnerWidth: 420,
        artifactsOpen: true,
        artifactsWidth: 440,
      }),
    ).toBe("calc(100% - 441px)");
    expect(
      getCollapsedChatPanelWidth({
        terminalOpen: false,
        terminalWidth: 720,
        sdkRunnerOpen: true,
        sdkRunnerWidth: 420,
        artifactsOpen: true,
        artifactsWidth: 440,
      }),
    ).toBe("calc(100% - 862px)");
    expect(
      getCollapsedChatPanelWidth({
        terminalOpen: true,
        terminalWidth: 720,
        sdkRunnerOpen: true,
        sdkRunnerWidth: 420,
        artifactsOpen: true,
        artifactsWidth: 440,
      }),
    ).toBe("calc(100% - 1583px)");
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
          artifactsOpen: false,
          artifactsWidth: 440,
        },
      }),
    ).toEqual({
      sdkRunnerWidth: 340,
      chatPanelWidth: "calc(100% - 341px)",
    });
  });

  it("在拖拽 Agent Runner 时会把产物宽度一起纳入约束，避免把产物推出屏幕", () => {
    expect(
      getSdkRunnerDragPreview({
        containerRight: 1440,
        pointerClientX: 200,
        viewportWidth: 1440,
        layout: {
          terminalOpen: true,
          terminalWidth: 720,
          sdkRunnerOpen: true,
          sdkRunnerWidth: 420,
          artifactsOpen: true,
          artifactsWidth: 440,
        },
      }),
    ).toEqual({
      sdkRunnerWidth: 317,
      chatPanelWidth: "calc(100% - 1120px)",
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
          artifactsOpen: false,
          artifactsWidth: 440,
        },
      }),
    ).toEqual({
      terminalWidth: 500,
      chatPanelWidth: "calc(100% - 501px)",
    });
  });

  it("会统一按三抽屉模型解析终端 / Agent Runner / 产物宽度", () => {
    expect(
      resolveRightDrawerLayout(
        {
          terminalOpen: true,
          terminalWidth: 720,
          sdkRunnerOpen: true,
          sdkRunnerWidth: 420,
          artifactsOpen: true,
          artifactsWidth: 440,
        },
        1440,
      ),
    ).toEqual({
      terminalWidth: 360,
      sdkRunnerWidth: 317,
      artifactsWidth: 440,
      totalWidth: 1120,
      chatPanelWidth: "calc(100% - 1120px)",
    });
  });
});
