import { describe, expect, it } from "vitest";

import { isRenderableTerminalViewport, shouldSyncTerminalSize } from "./terminal-resize";

describe("terminal resize guards", () => {
  it("只在终端容器达到有效尺寸后才允许 fit", () => {
    expect(isRenderableTerminalViewport({ width: 320, height: 240 })).toBe(true);
    expect(isRenderableTerminalViewport({ width: 0, height: 240 })).toBe(false);
    expect(isRenderableTerminalViewport({ width: 110, height: 240 })).toBe(false);
    expect(isRenderableTerminalViewport({ width: 320, height: 60 })).toBe(false);
  });

  it("会忽略重复和非法的终端尺寸同步", () => {
    expect(shouldSyncTerminalSize({ cols: 80, rows: 24 }, null)).toBe(true);
    expect(shouldSyncTerminalSize({ cols: 80, rows: 24 }, { cols: 80, rows: 24 })).toBe(false);
    expect(shouldSyncTerminalSize({ cols: 81, rows: 24 }, { cols: 80, rows: 24 })).toBe(true);
    expect(shouldSyncTerminalSize({ cols: 0, rows: 24 }, null)).toBe(false);
  });
});
