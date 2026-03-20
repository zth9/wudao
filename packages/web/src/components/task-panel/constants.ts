import type { TaskType } from "../../services/api";

export const TASK_TYPES: TaskType[] = [
  "feature",
  "bugfix",
  "investigation",
  "exploration",
  "refactor",
  "learning",
];

export const PERMISSION_MODES = [
  {
    value: "bypassPermissions",
    labelKey: "permission_modes.bypassPermissions.label",
    descKey: "permission_modes.bypassPermissions.desc",
  },
  {
    value: "plan",
    labelKey: "permission_modes.plan.label",
    descKey: "permission_modes.plan.desc",
  },
  {
    value: "default",
    labelKey: "permission_modes.default.label",
    descKey: "permission_modes.default.desc",
  },
] as const;

export type FilterTab = "active" | "done" | "all";
export type SortOption = "updated_at" | "created_at" | "priority" | "due_at";
