import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface TaskWorkspaceLayout {
  terminalOpen: boolean;
  terminalWidth: number;
  sdkRunnerOpen: boolean;
  chatPanelWidth: number;
  sdkRunnerWidth: number;
}

export const DEFAULT_TASK_WORKSPACE_LAYOUT: TaskWorkspaceLayout = {
  terminalOpen: false,
  terminalWidth: 720,
  sdkRunnerOpen: false,
  chatPanelWidth: 40,
  sdkRunnerWidth: 420,
};

type TaskWorkspaceLayoutPatch = Partial<TaskWorkspaceLayout>;

interface TaskWorkspaceState {
  taskLayouts: Record<string, TaskWorkspaceLayoutPatch>;
  setTaskLayout: (taskId: string, patch: TaskWorkspaceLayoutPatch) => void;
  toggleTerminal: (taskId: string) => void;
  toggleSdkRunner: (taskId: string) => void;
}

function mergeTaskWorkspaceLayout(
  layout?: TaskWorkspaceLayoutPatch,
): TaskWorkspaceLayout {
  return layout
    ? { ...DEFAULT_TASK_WORKSPACE_LAYOUT, ...layout }
    : DEFAULT_TASK_WORKSPACE_LAYOUT;
}

export const useTaskWorkspaceStore = create<TaskWorkspaceState>()(
  persist(
    (set) => ({
      taskLayouts: {},

      setTaskLayout: (taskId, patch) =>
        set((state) => ({
          taskLayouts: {
            ...state.taskLayouts,
            [taskId]: {
              ...mergeTaskWorkspaceLayout(state.taskLayouts[taskId]),
              ...patch,
            },
          },
        })),

      toggleTerminal: (taskId) =>
        set((state) => {
          const layout = mergeTaskWorkspaceLayout(state.taskLayouts[taskId]);
          return {
            taskLayouts: {
              ...state.taskLayouts,
              [taskId]: { ...layout, terminalOpen: !layout.terminalOpen },
            },
          };
        }),

      toggleSdkRunner: (taskId) =>
        set((state) => {
          const layout = mergeTaskWorkspaceLayout(state.taskLayouts[taskId]);
          return {
            taskLayouts: {
              ...state.taskLayouts,
              [taskId]: { ...layout, sdkRunnerOpen: !layout.sdkRunnerOpen },
            },
          };
        }),

    }),
    {
      name: "wudao-task-workspace",
      partialize: (state) => ({ taskLayouts: state.taskLayouts }),
    },
  ),
);
