import { create } from "zustand";
import {
  tasks as api,
  type AgentChatEvent,
  type AgentRun,
  type Task,
  type TaskType,
  type TaskStatus,
} from "../services/api";
import { useTerminalStore } from "./terminalStore";
import { useSettingsStore } from "./settingsStore";
import type { SortOption } from "../components/task-panel/constants";
import {
  type ChatMessage,
  type AgentTimelineItem,
  parseChatMessages,
  upsertAssistantMessage,
  createOptimisticUserItem,
  buildAgentTimeline,
  upsertAgentRun,
  updateAgentRunStatus,
  upsertAgentTimelineItem,
  applyAgentDelta,
  mapAgentMessageToTimelineItem,
} from "../utils/agent-timeline";

// Re-export for external use
export type { ChatMessage, AgentTimelineItem } from "../utils/agent-timeline";

type TaskUpdatePayload = Partial<Pick<Task, "title" | "type" | "status" | "context" | "agent_doc" | "priority" | "urgency" | "due_at" | "provider_id">>;

interface TaskState {
  tasks: Task[];
  currentTask: Task | null;
  chatTaskId: string | null;
  agentChatTaskId: string | null;
  nextCursor: string | null;
  hasMore: boolean;
  loading: boolean;
  generating: boolean;
  chatMessages: ChatMessage[];
  chatStreaming: boolean;
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
  sendChatMessage: (taskId: string, message: string, providerId?: string) => void;
  startInitialChat: (taskId: string, seedMessage: string, providerId?: string) => void;
  abortChat: () => void;
  sendAgentChatMessage: (taskId: string, message: string, providerId?: string) => void;
  startInitialAgentChat: (taskId: string, seedMessage: string, providerId?: string) => void;
  abortAgentChat: () => void;
  update: (id: string, data: TaskUpdatePayload) => Promise<void>;
  linkSession: (taskId: string, sessionId: string, sessionName?: string, providerId?: string, replaceSessionIds?: string[]) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clearCurrent: () => void;
}

function parseChatMessages(raw: string | null): ChatMessage[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ChatMessage[];
  } catch {
    return [];
  }
}

function upsertAssistantMessage(messages: ChatMessage[], content: string): ChatMessage[] {
  const assistant = { role: "assistant", content } as const;
  const last = messages[messages.length - 1];
  if (last?.role === "assistant") {
    return [...messages.slice(0, -1), assistant];
  }
  return [...messages, assistant];
}

function parseAgentStatus(value: unknown): AgentTimelineStatus {
  return value === "streaming" || value === "failed" || value === "waiting_approval" ? value : "completed";
}

function createOptimisticUserItem(content: string): AgentTimelineItem {
  return {
    id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: "user_text",
    content,
    status: "completed",
    optimistic: true,
  };
}

function mapAgentMessageToTimelineItem(message: AgentMessage): AgentTimelineItem | null {
  const status = parseAgentStatus(message.status);
  const content = message.content_json || {};
  if (message.kind === "text" && message.role === "user") {
    return { id: message.id, kind: "user_text", content: String(content.content || ""), status };
  }
  if (message.kind === "text" && message.role === "assistant") {
    return {
      id: message.id,
      kind: "assistant_text",
      content: String(content.content || ""),
      status,
      streaming: status === "streaming",
    };
  }
  if (message.kind === "tool_call") {
    return {
      id: message.id,
      kind: "tool_call",
      toolName: String(content.toolName || "tool"),
      input: content.input ?? {},
      status,
    };
  }
  if (message.kind === "tool_result") {
    return {
      id: message.id,
      kind: "tool_result",
      toolName: String(content.toolName || "tool"),
      output: content.output ?? content,
      status,
    };
  }
  if (message.kind === "approval") {
    return {
      id: message.id,
      kind: "approval",
      toolName: String(content.toolName || "tool"),
      input: content.input ?? {},
      status,
    };
  }
  if (message.kind === "artifact") {
    return {
      id: message.id,
      kind: "artifact",
      path: String(content.path || ""),
      summary: String(content.summary || ""),
      status,
    };
  }
  if (message.kind === "error") {
    return {
      id: message.id,
      kind: "error",
      content: String(content.error || content.content || ""),
      status,
    };
  }
  return null;
}

function buildLegacyAgentTimeline(raw: string | null): AgentTimelineItem[] {
  return parseChatMessages(raw).map((message, index) => (
    message.role === "user"
      ? {
          id: `legacy-${index + 1}`,
          kind: "user_text",
          content: message.content,
          status: "completed",
        }
      : {
          id: `legacy-${index + 1}`,
          kind: "assistant_text",
          content: message.content,
          status: "completed",
          streaming: false,
        }
  ));
}

function buildAgentTimeline(thread: AgentThread | null, rawChatMessages: string | null): AgentTimelineItem[] {
  const mapped = (thread?.messages || [])
    .map(mapAgentMessageToTimelineItem)
    .filter((item): item is AgentTimelineItem => item !== null);
  return mapped.length > 0 ? mapped : buildLegacyAgentTimeline(rawChatMessages);
}

function upsertAgentRun(runs: AgentRun[], run: AgentRun): AgentRun[] {
  const index = runs.findIndex((item) => item.id === run.id);
  if (index < 0) return [...runs, run];
  return [...runs.slice(0, index), run, ...runs.slice(index + 1)];
}

function updateAgentRunStatus(runs: AgentRun[], runId: string, status: AgentRun["status"], lastError?: string): AgentRun[] {
  return runs.map((run) => (run.id === runId ? { ...run, status, last_error: lastError ?? run.last_error } : run));
}

function upsertAgentTimelineItem(items: AgentTimelineItem[], nextItem: AgentTimelineItem): AgentTimelineItem[] {
  const existingIndex = items.findIndex((item) => item.id === nextItem.id);
  if (existingIndex >= 0) {
    return [...items.slice(0, existingIndex), nextItem, ...items.slice(existingIndex + 1)];
  }
  if (nextItem.kind === "user_text") {
    const optimisticIndex = items.findIndex(
      (item) => item.kind === "user_text" && item.optimistic && item.content === nextItem.content,
    );
    if (optimisticIndex >= 0) {
      return [...items.slice(0, optimisticIndex), nextItem, ...items.slice(optimisticIndex + 1)];
    }
  }
  return [...items, nextItem];
}

function applyAgentDelta(items: AgentTimelineItem[], itemId: string, delta: string): AgentTimelineItem[] {
  const existingIndex = items.findIndex((item) => item.id === itemId);
  if (existingIndex >= 0) {
    const existing = items[existingIndex];
    if (existing.kind !== "assistant_text") return items;
    const updated: AgentTimelineItem = {
      ...existing,
      content: existing.content + delta,
      status: "streaming",
      streaming: true,
    };
    return [...items.slice(0, existingIndex), updated, ...items.slice(existingIndex + 1)];
  }
  return [
    ...items,
    {
      id: itemId,
      kind: "assistant_text",
      content: delta,
      status: "streaming",
      streaming: true,
    },
  ];
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
  let chatAbort: AbortController | null = null;
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

  const stopChatStreaming = () => {
    chatAbort = null;
    set({ chatStreaming: false });
  };

  const stopAgentChatStreaming = () => {
    agentChatAbort = null;
    set({ agentChatStreaming: false });
  };

  const startChatStream = (
    taskId: string,
    message: string,
    providerId?: string,
    options?: { appendUserMessage?: boolean; seedMessage?: string | null },
  ) => {
    const state = get();
    if (state.chatStreaming && state.chatTaskId && state.chatTaskId !== taskId) {
      chatAbort?.abort();
      chatAbort = null;
      set({ chatStreaming: false });
    }

    set((current) => ({
      chatTaskId: taskId,
      chatMessages: options?.appendUserMessage === false
        ? (options?.seedMessage && current.chatMessages.length === 0
            ? [...current.chatMessages, { role: "user", content: options.seedMessage }]
            : current.chatMessages)
        : [...current.chatMessages, { role: "user", content: message }],
      chatStreaming: true,
    }));

    let assistantContent = "";
    chatAbort = api.streamTaskChat(
      taskId,
      message,
      (delta) => {
        if (get().chatTaskId !== taskId) return;
        assistantContent += delta;
        set((state) => ({
          chatMessages: upsertAssistantMessage(state.chatMessages, assistantContent),
        }));
      },
      () => {
        if (get().chatTaskId !== taskId) return;
        stopChatStreaming();
        void get().fetchOne(taskId);
      },
      (error) => {
        if (get().chatTaskId !== taskId) return;
        console.error("Task chat error:", error);
        set((state) => {
          const last = state.chatMessages[state.chatMessages.length - 1];
          if (last?.role === "assistant") return {};
          return {
            chatMessages: [
              ...state.chatMessages,
              { role: "assistant", content: `模型请求失败：${error}` },
            ],
          };
        });
        stopChatStreaming();
      },
      providerId,
      options?.seedMessage ?? undefined,
    );
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
    chatTaskId: null,
    agentChatTaskId: null,
    nextCursor: null,
    hasMore: false,
    loading: false,
    generating: false,
    chatMessages: [],
    chatStreaming: false,
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
      if (state.chatStreaming && state.chatTaskId && state.chatTaskId !== id) {
        chatAbort?.abort();
        chatAbort = null;
        set({ chatStreaming: false });
      }
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
      set((current) => {
        const reuseInMemoryChat = current.chatStreaming && current.chatTaskId === id && current.chatMessages.length > 0;
        const reuseInMemoryAgent = current.agentChatStreaming && current.agentChatTaskId === id && current.agentTimeline.length > 0;
        return {
          currentTask: task,
          chatTaskId: id,
          agentChatTaskId: id,
          chatMessages: reuseInMemoryChat ? current.chatMessages : parseChatMessages(task.chat_messages),
          chatStreaming: reuseInMemoryChat ? current.chatStreaming : false,
          agentRuns: reuseInMemoryAgent ? current.agentRuns : (thread?.runs || []),
          agentTimeline: reuseInMemoryAgent ? current.agentTimeline : buildAgentTimeline(thread, task.chat_messages),
          agentChatStreaming: reuseInMemoryAgent ? current.agentChatStreaming : false,
        };
      });
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

    sendChatMessage: (taskId, message, providerId) => {
      startChatStream(taskId, message, providerId, { appendUserMessage: true });
    },

    startInitialChat: (taskId, seedMessage, providerId) => {
      startChatStream(taskId, "", providerId, {
        appendUserMessage: false,
        seedMessage,
      });
    },

    abortChat: () => {
      if (!chatAbort) return;
      chatAbort.abort();
      stopChatStreaming();
    },

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
        state.chatStreaming || state.agentChatStreaming
          ? { currentTask: null }
          : {
              currentTask: null,
              chatTaskId: null,
              chatMessages: [],
              chatStreaming: false,
              agentChatTaskId: null,
              agentTimeline: [],
              agentRuns: [],
              agentChatStreaming: false,
            }
      ));
    },
  };
});
