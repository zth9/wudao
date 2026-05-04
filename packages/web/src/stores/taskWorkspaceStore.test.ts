import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { memoryStorage } = vi.hoisted(() => ({
  memoryStorage: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

vi.stubGlobal("localStorage", memoryStorage);

import { DEFAULT_TASK_WORKSPACE_LAYOUT, useTaskWorkspaceStore } from "./taskWorkspaceStore";

function readLayout(taskId: string) {
  return {
    ...DEFAULT_TASK_WORKSPACE_LAYOUT,
    ...useTaskWorkspaceStore.getState().taskLayouts[taskId],
  };
}

beforeEach(() => {
  useTaskWorkspaceStore.setState({ taskLayouts: {} });
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("taskWorkspaceStore", () => {
  it("defaults each task to a chat-only layout", () => {
    expect(readLayout("task-1")).toEqual(DEFAULT_TASK_WORKSPACE_LAYOUT);
    expect(readLayout("task-2")).toEqual(DEFAULT_TASK_WORKSPACE_LAYOUT);
  });

  it("remembers drawer visibility independently for each task", () => {
    useTaskWorkspaceStore.getState().setTaskLayout("task-1", {
      terminalOpen: true,
      terminalWidth: 860,
      sdkRunnerOpen: true,
      chatPanelWidth: 48,
      sdkRunnerWidth: 520,
    });
    useTaskWorkspaceStore.getState().setTaskLayout("task-2", {
      sdkRunnerOpen: true,
      sdkRunnerWidth: 520,
    });

    expect(readLayout("task-1")).toMatchObject({
      terminalOpen: true,
      terminalWidth: 860,
      sdkRunnerOpen: true,
      chatPanelWidth: 48,
      sdkRunnerWidth: 520,
    });
    expect(readLayout("task-2")).toMatchObject({
      terminalOpen: false,
      terminalWidth: 720,
      sdkRunnerOpen: true,
      chatPanelWidth: 40,
      sdkRunnerWidth: 520,
    });
  });

  it("toggles only the current task layout without affecting others", () => {
    useTaskWorkspaceStore.getState().toggleTerminal("task-1");
    useTaskWorkspaceStore.getState().toggleSdkRunner("task-2");

    expect(readLayout("task-1")).toMatchObject({
      terminalOpen: true,
      terminalWidth: 720,
      sdkRunnerOpen: false,
    });
    expect(readLayout("task-2")).toMatchObject({
      terminalOpen: false,
      terminalWidth: 720,
      sdkRunnerOpen: true,
    });
  });
});
