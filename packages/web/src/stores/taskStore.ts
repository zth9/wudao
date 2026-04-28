import { create } from "zustand";
import {
  tasks as api,
  type AgentChatEvent,
  type AgentRun,
  type AgentThread,
  type Task,
  type TaskType,
  type TaskStatus,
} from "../services/api";
import { useTerminalStore } from "./terminalStore";
import { useSdkRunnerStore } from "./sdkRunnerStore";
import { useSettingsStore } from "./settingsStore";
import { useTaskWorkspaceStore } from "./taskWorkspaceStore";
import type { SortOption } from "../components/task-panel/constants";
import {
  type AgentTimelineItem,
  applyAgentDelta,
  buildAgentTimeline,
  createOptimisticUserItem,
  mapAgentMessageToTimelineItem,
  upsertAgentRun,
  updateAgentRunStatus,
  upsertAgentTimelineItem,
} from "../utils/agent-timeline";
import { extractSdkRunIdFromToolContent } from "../utils/sdk-runner";

// Re-export for external use
export type { AgentTimelineItem } from "../utils/agent-timeline";

type TaskUpdatePayload = Partial<Pick<Task, "title" | "type" | "status" | "context" | "agent_doc" | "priority" | "due_at" | "provider_id">>;

interface TaskState {
  tasks: Task[];
  currentTask: Task | null;
  agentChatTaskId: string | null;
  nextCursor: string | null;
  hasMore: boolean;
  loading: boolean;
  generating: boolean;
  agentRuns: AgentRun[];
  agentTimeline: AgentTimelineItem[];
  agentChatStreaming: boolean;
  fetch: (status?: TaskStatus, sort?: SortOption, order?: "asc" | "desc") => Promise<void>;
  fetchAll: (sort?: SortOption, order?: "asc" | "desc") => Promise<void>;
  fetchMore: () => Promise<void>;
  fetchOne: (id: string) => Promise<void>;
  create: (data: { title: string; type: TaskType; context?: string; provider_id?: string | null }) => Promise<Task>;
  parse: (input: string, providerId?: string) => Promise<{ title: string; type: TaskType; context: string }>;
  generateDocs: (id: string, providerId?: string) => Promise<void>;
  sendAgentChatMessage: (taskId: string, message: string, providerId?: string) => void;
  startInitialAgentChat: (taskId: string, seedMessage: string, providerId?: string) => void;
  abortAgentChat: () => void;
  update: (id: string, data: TaskUpdatePayload) => Promise<void>;
  linkSession: (taskId: string, sessionId: string, sessionName?: string, providerId?: string, replaceSessionIds?: string[]) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clearCurrent: () => void;
}

function connectSdkRun(taskId: string, sdkRunId: string, options?: { reveal?: boolean }): void {
  const normalizedSdkRunId = sdkRunId.trim();
  if (!normalizedSdkRunId) {
    return;
  }

  if (options?.reveal) {
    useTaskWorkspaceStore.getState().setTaskLayout(taskId, { sdkRunnerOpen: true });
  }

  const { fetchSdkRuns, subscribeSdkEvents, activeSdkRunId } = useSdkRunnerStore.getState();
  void fetchSdkRuns(taskId);
  if (activeSdkRunId === normalizedSdkRunId) {
    return;
  }
  subscribeSdkEvents(taskId, normalizedSdkRunId);
}

function maybeRevealSdkRun(taskId: string, content: unknown): void {
  const sdkRunId = extractSdkRunIdFromToolContent(content);
  if (!sdkRunId) {
    return;
  }

  connectSdkRun(taskId, sdkRunId, { reveal: true });
}

function findLatestSdkRunIdInThread(thread: AgentThread | null): string | null {
  const messages = thread?.messages || [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const sdkRunId = extractSdkRunIdFromToolContent(messages[index]?.content_json);
    if (sdkRunId) {
      return sdkRunId;
    }
  }
  return null;
}

function isTaskResponse(task: Partial<Task>): task is Task {
  return [task.id, task.title, task.type, task.status, task.session_ids, task.session_names, task.session_providers]
    .every((value) => typeof value === "string");
}

function mergeTaskPatch(task: Task, patch: Partial<Task>): Task {
  return {
    ...task,
    ...patch,
    id: task.id,
  };
}

function applyTaskMutation(
  state: Pick<TaskState, "currentTask" | "tasks">,
  taskId: string,
  patch: Partial<Task>,
  options?: { setCurrentWhenEmpty?: boolean },
): Pick<TaskState, "currentTask" | "tasks"> {
  const currentTask = state.currentTask?.id === taskId
    ? mergeTaskPatch(state.currentTask, patch)
    : !state.currentTask && options?.setCurrentWhenEmpty && isTaskResponse(patch)
      ? patch
      : state.currentTask;

  return {
    currentTask,
    tasks: state.tasks.map((task) => (task.id === taskId ? mergeTaskPatch(task, patch) : task)),
  };
}

export const useTaskStore = create<TaskState>((set, get) => {
  let agentChatAbort: AbortController | null = null;
  let listRequestId = 0;
  let detailRequestId = 0;

  const refreshTasks = async () => {
    const requestId = ++listRequestId;
    const { taskSortBy, taskSortOrder } = useSettingsStore.getState();
    const res = await api.list({ sort: taskSortBy, order: taskSortOrder });
    if (requestId !== listRequestId) return;
    set({ tasks: res.items, nextCursor: res.page.next_cursor, hasMore: res.page.has_more });
  };

  const withGenerating = async <T>(work: () => Promise<T>): Promise<T> => {
    set({ generating: true });
    try {
      return await work();
    } finally {
      set({ generating: false });
    }
  };

  const stopAgentChatStreaming = () => {
    agentChatAbort = null;
    set({ agentChatStreaming: false });
  };

  const startAgentChatStream = (
    taskId: string,
    message: string,
    providerId?: string,
    options?: { appendUserMessage?: boolean; seedMessage?: string | null },
  ) => {
    const state = get();
    if (state.agentChatStreaming && state.agentChatTaskId && state.agentChatTaskId !== taskId) {
      agentChatAbort?.abort();
      agentChatAbort = null;
      set({ agentChatStreaming: false });
    }

    set((current) => {
      const nextTimeline = [...current.agentTimeline];
      if (options?.appendUserMessage === false) {
        if (options?.seedMessage && nextTimeline.length === 0) {
          nextTimeline.push(createOptimisticUserItem(options.seedMessage));
        }
      } else if (message.trim()) {
        nextTimeline.push(createOptimisticUserItem(message.trim()));
      }
      return {
        agentChatTaskId: taskId,
        agentTimeline: nextTimeline,
        agentChatStreaming: true,
      };
    });

    const handleEvent = (event: AgentChatEvent) => {
      if (get().agentChatTaskId !== taskId) return;
      if (event.type === "run.started") {
        set((current) => ({
          agentRuns: upsertAgentRun(current.agentRuns, event.run),
          agentChatStreaming: true,
        }));
        return;
      }
      if (event.type === "message.delta") {
        set((current) => ({
          agentTimeline: applyAgentDelta(current.agentTimeline, event.itemId, event.delta),
        }));
        return;
      }
      if (event.type === "message.completed") {
        const nextItem = mapAgentMessageToTimelineItem(event.item);
        if (!nextItem) return;
        set((current) => ({
          agentTimeline: upsertAgentTimelineItem(current.agentTimeline, nextItem),
        }));
        maybeRevealSdkRun(taskId, event.item.content_json);
        return;
      }
      if (event.type === "run.completed") {
        set((current) => ({
          agentRuns: updateAgentRunStatus(current.agentRuns, event.runId, "completed"),
        }));
        stopAgentChatStreaming();
        void get().fetchOne(taskId);
        return;
      }
      if (event.type === "run.failed") {
        set((current) => ({
          agentRuns: event.runId
            ? updateAgentRunStatus(current.agentRuns, event.runId, "failed", event.error)
            : current.agentRuns,
          agentTimeline: event.error
            ? upsertAgentTimelineItem(
                current.agentTimeline,
                {
                  id: `agent-error-${Date.now()}`,
                  kind: "error",
                  content: `模型请求失败：${event.error}`,
                  status: "failed",
                },
              )
            : current.agentTimeline,
        }));
        stopAgentChatStreaming();
        return;
      }
      if (event.type === "artifact.updated") {
        void get().fetchOne(taskId);
      }
    };

    agentChatAbort = api.streamTaskAgentRun(
      taskId,
      message,
      handleEvent,
      (error) => {
        if (get().agentChatTaskId !== taskId) return;
        if (error === "stream closed before run completion") {
          stopAgentChatStreaming();
          void get().fetchOne(taskId);
          return;
        }
        set((current) => ({
          agentTimeline: upsertAgentTimelineItem(
            current.agentTimeline,
            {
              id: `agent-transport-error-${Date.now()}`,
              kind: "error",
              content: `模型请求失败：${error}`,
              status: "failed",
            },
          ),
        }));
        stopAgentChatStreaming();
      },
      providerId,
      options?.seedMessage ?? undefined,
    );
  };

  return {
    tasks: [],
    currentTask: null,
    agentChatTaskId: null,
    nextCursor: null,
    hasMore: false,
    loading: false,
    generating: false,
    agentRuns: [],
    agentTimeline: [],
    agentChatStreaming: false,

    fetch: async (status, sort, order) => {
      const requestId = ++listRequestId;
      set({ loading: true });
      try {
        const { taskSortBy, taskSortOrder } = useSettingsStore.getState();
        const res = await api.list({
          status,
          sort: sort || taskSortBy,
          order: order || taskSortOrder,
        });
        if (requestId !== listRequestId) return;
        set({ tasks: res.items, nextCursor: res.page.next_cursor, hasMore: res.page.has_more });
      } finally {
        if (requestId === listRequestId) {
          set({ loading: false });
        }
      }
    },

    fetchAll: async (sort, order) => {
      const requestId = ++listRequestId;
      set({ loading: true });
      try {
        const { taskSortBy, taskSortOrder } = useSettingsStore.getState();
        const resolvedSort = sort || taskSortBy;
        const resolvedOrder = order || taskSortOrder;
        const allTasks: Task[] = [];
        let cursor: string | null = null;
        let hasMore = true;
        let lastPage = { next_cursor: null as string | null, has_more: false };

        while (hasMore) {
          const res = await api.list({ sort: resolvedSort, order: resolvedOrder, cursor: cursor || undefined, limit: 100 });
          if (requestId !== listRequestId) return;
          allTasks.push(...res.items);
          cursor = res.page.next_cursor;
          hasMore = res.page.has_more;
          lastPage = { next_cursor: res.page.next_cursor, has_more: res.page.has_more };
        }

        set({ tasks: allTasks, nextCursor: lastPage.next_cursor, hasMore: lastPage.has_more });
      } finally {
        if (requestId === listRequestId) {
          set({ loading: false });
        }
      }
    },

    fetchMore: async () => {
      const requestId = listRequestId;
      const { taskSortBy, taskSortOrder } = useSettingsStore.getState();
      const { nextCursor, hasMore } = get();
      if (!hasMore || !nextCursor) return;
      const res = await api.list({ sort: taskSortBy, order: taskSortOrder, cursor: nextCursor });
      if (requestId !== listRequestId) return;
      set((state) => ({
        tasks: [...state.tasks, ...res.items],
        nextCursor: res.page.next_cursor,
        hasMore: res.page.has_more,
      }));
    },

    fetchOne: async (id) => {
      const requestId = ++detailRequestId;
      const state = get();
      const shouldReconnectSdkRunner = state.currentTask?.id !== id;
      if (state.agentChatStreaming && state.agentChatTaskId && state.agentChatTaskId !== id) {
        agentChatAbort?.abort();
        agentChatAbort = null;
        set({ agentChatStreaming: false });
      }

      const [task, thread] = await Promise.all([
        api.get(id),
        api.getAgentChatThread(id).catch(() => null),
      ]);
      if (requestId !== detailRequestId) return;
      const latestSdkRunId = shouldReconnectSdkRunner ? findLatestSdkRunIdInThread(thread) : null;
      set((current) => {
        const reuseInMemoryAgent = current.agentChatStreaming && current.agentChatTaskId === id && current.agentTimeline.length > 0;
        return {
          currentTask: task,
          agentChatTaskId: id,
          agentRuns: reuseInMemoryAgent ? current.agentRuns : (thread?.runs || []),
          agentTimeline: reuseInMemoryAgent ? current.agentTimeline : buildAgentTimeline(thread, task.chat_messages),
          agentChatStreaming: reuseInMemoryAgent ? current.agentChatStreaming : false,
        };
      });
      if (latestSdkRunId) {
        connectSdkRun(id, latestSdkRunId);
      }
    },

    create: async (data) => {
      const task = await api.create(data);
      await refreshTasks();
      return task;
    },

    parse: (input, providerId) => withGenerating(() => api.parse(input, providerId)),

    generateDocs: (id, providerId) =>
      withGenerating(async () => {
        const updated = await api.generateDocs(id, providerId);
        set((state) => applyTaskMutation(state, id, updated, { setCurrentWhenEmpty: true }));
        await refreshTasks();
      }),

    sendAgentChatMessage: (taskId, message, providerId) => {
      startAgentChatStream(taskId, message, providerId, { appendUserMessage: true });
    },

    startInitialAgentChat: (taskId, seedMessage, providerId) => {
      startAgentChatStream(taskId, "", providerId, {
        appendUserMessage: false,
        seedMessage,
      });
    },

    abortAgentChat: () => {
      if (!agentChatAbort) return;
      agentChatAbort.abort();
      stopAgentChatStreaming();
    },

    update: async (id, data) => {
      const updated = await api.update(id, data);
      set((state) => applyTaskMutation(state, id, updated, { setCurrentWhenEmpty: true }));
      await refreshTasks();
    },

    linkSession: async (taskId, sessionId, sessionName, providerId, replaceSessionIds) => {
      const updated = await api.linkSession(taskId, sessionId, sessionName, providerId, replaceSessionIds);
      set((state) => applyTaskMutation(state, taskId, updated));
    },

    remove: async (id) => {
      await api.delete(id);
      useTerminalStore.getState().removeByTaskId(id);
      if (get().agentChatTaskId === id && agentChatAbort) {
        agentChatAbort.abort();
        agentChatAbort = null;
      }
      set((state) => ({
        currentTask: state.currentTask?.id === id ? null : state.currentTask,
        agentChatTaskId: state.agentChatTaskId === id ? null : state.agentChatTaskId,
        agentTimeline: state.agentChatTaskId === id ? [] : state.agentTimeline,
        agentRuns: state.agentChatTaskId === id ? [] : state.agentRuns,
        agentChatStreaming: state.agentChatTaskId === id ? false : state.agentChatStreaming,
      }));
      await refreshTasks();
    },

    clearCurrent: () => {
      detailRequestId += 1;
      set((state) => (
        state.agentChatStreaming
          ? { currentTask: null }
          : {
              currentTask: null,
              agentChatTaskId: null,
              agentTimeline: [],
              agentRuns: [],
              agentChatStreaming: false,
            }
      ));
    },
  };
});
