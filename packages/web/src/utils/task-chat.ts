import type { Task } from "../services/api";

export type TaskChatSeed = Pick<Task, "title" | "type" | "context">;
type TaskChatTranslator = (key: string, options?: Record<string, unknown>) => string;

export function buildInitialTaskInfoMessage(task: TaskChatSeed, t: TaskChatTranslator): string {
  const context = task.context?.trim() || t("common.none");
  const taskType = t(`task_types.${task.type}`);

  return `[${t("tasks.initial_chat.info_label")}]
${t("tasks.initial_chat.title_line", { value: task.title })}
${t("tasks.initial_chat.type_line", { value: taskType })}
${t("tasks.initial_chat.context_line", { value: context })}

${t("tasks.initial_chat.prompt")}`;
}

export function isTaskChatScrolledNearBottom(params: {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}, threshold = 4): boolean {
  const remaining = params.scrollHeight - params.clientHeight - params.scrollTop;
  return remaining <= threshold;
}

export function shouldShowTaskChatScrollButton(autoScrollEnabled: boolean, messageCount: number): boolean {
  return !autoScrollEnabled && messageCount > 0;
}
