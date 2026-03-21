const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}

// Providers
export interface Provider {
  id: string;
  name: string;
  endpoint: string;
  api_key: string | null;
  usage_auth_token: string | null;
  usage_cookie: string | null;
  model: string;
  is_default: number;
  sort_order: number;
  created_at: string;
}

export const providers = {
  list: () => request<Provider[]>("/settings"),
  create: (data: Omit<Provider, "id" | "created_at" | "sort_order">) =>
    request<Provider>("/settings", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Provider>) =>
    request<Provider>(`/settings/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  reorder: (ids: string[]) =>
    request<Provider[]>("/settings/order", { method: "PUT", body: JSON.stringify({ ids }) }),
  delete: (id: string) =>
    request<{ ok: boolean }>(`/settings/${id}`, { method: "DELETE" }),
};

// Usage
export interface UsageItem {
  label: string;
  used: number;
  total?: number;
  detail?: string;
}

export interface ProviderUsage {
  provider: string;
  status: "ok" | "error";
  error?: string;
  url?: string;
  items: UsageItem[];
}

export const usage = {
  fetch: () => request<ProviderUsage[]>("/usage"),
};

// OpenViking Contexts
export interface OpenVikingStatus {
  available: boolean;
  mode: "embedded";
  workspacePath: string;
  configPath: string | null;
  pythonBin: string;
  message: string | null;
}

export interface OpenVikingMemoryItem {
  uri: string;
  title: string;
  scope: "user" | "agent";
  category: string;
  preview: string;
  content: string;
  updatedAt: string | null;
  size: number | null;
}

export interface OpenVikingMemoryList {
  workspacePath: string;
  items: OpenVikingMemoryItem[];
  total: number;
}

export interface WudaoUserMemory {
  content: string;
  path: string;
}

export interface WudaoUserMemorySaveResult extends WudaoUserMemory {
  mirrored: boolean;
  mirroredUri: string | null;
  mirrorError: string | null;
}

export interface WudaoAgentMemory {
  content: string;
  path: string;
}

export interface WudaoAgentMemorySaveResult extends WudaoAgentMemory {
  mirrored: boolean;
  mirroredUri: string | null;
  mirrorError: string | null;
}



export const contexts = {
  status: () => request<OpenVikingStatus>("/contexts/status"),
  listMemories: () => request<OpenVikingMemoryList>("/contexts/memories"),
  getUserMemory: () => request<WudaoUserMemory>("/contexts/user-memory"),
  updateUserMemory: (content: string) =>
    request<WudaoUserMemorySaveResult>("/contexts/user-memory", {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
  getAgentMemory: () => request<WudaoAgentMemory>("/contexts/agent-memory"),
  updateAgentMemory: (content: string) =>
    request<WudaoAgentMemorySaveResult>("/contexts/agent-memory", {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
};

// Tasks
export type TaskType = "feature" | "bugfix" | "investigation" | "exploration" | "refactor" | "learning";
export type TaskStatus = "execution" | "done";

export interface Task {
  id: string;
  title: string;
  type: TaskType;
  status: TaskStatus;
  context: string | null;
  agent_doc: string | null;
  chat_messages: string | null;
  session_ids: string;
  session_names: string;
  session_providers: string;
  priority: number;
  due_at: string | null;
  provider_id: string | null;
  created_at: string;
  updated_at: string;
}

export type AgentRunStatus = "running" | "waiting_approval" | "completed" | "failed" | "cancelled";
export type AgentMessageRole = "system" | "user" | "assistant" | "tool";
export type AgentMessageKind = "text" | "tool_call" | "tool_result" | "approval" | "artifact" | "error";
export type AgentMessageStatus = "streaming" | "completed" | "failed" | "waiting_approval";

export interface AgentRun {
  id: string;
  task_id: string;
  provider_id: string;
  status: AgentRunStatus;
  checkpoint_json: unknown;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentMessage {
  id: string;
  task_id: string;
  run_id: string;
  seq: number;
  role: AgentMessageRole;
  kind: AgentMessageKind;
  status: AgentMessageStatus;
  content_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AgentThread {
  task_id: string;
  runs: AgentRun[];
  messages: AgentMessage[];
}

export type AgentChatEvent =
  | { type: "run.started"; runId: string; run: AgentRun }
  | { type: "message.delta"; itemId: string; delta: string }
  | { type: "message.completed"; item: AgentMessage }
  | { type: "run.completed"; runId: string }
  | { type: "run.failed"; runId?: string; error: string }
  | { type: "artifact.updated"; path: string; summary?: string };

export interface TaskListResponse {
  items: Task[];
  page: { next_cursor: string | null; has_more: boolean; sort: string; limit: number };
}

export interface TaskStatsSummary {
  active: number;
  done: number;
  high_priority: number;
  all: number;
}

export interface TaskListParams {
  status?: TaskStatus;
  sort?: string;
  order?: "asc" | "desc";
  priority?: number;
  cursor?: string;
  limit?: number;
}

type TaskUpdatePayload = Partial<Pick<Task, "title" | "type" | "status" | "context" | "agent_doc" | "priority" | "due_at" | "provider_id">>;

export const tasks = {
  stats: () => request<TaskStatsSummary>("/tasks/stats"),
  list: (params?: TaskListParams) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.sort) qs.set("sort", params.sort);
    if (params?.order) qs.set("order", params.order);
    if (params?.priority !== undefined) qs.set("priority", String(params.priority));
    if (params?.cursor) qs.set("cursor", params.cursor);
    if (params?.limit) qs.set("limit", String(params.limit));
    const query = qs.toString();
    return request<TaskListResponse>(query ? `/tasks?${query}` : "/tasks");
  },
  get: (id: string) => request<Task>(`/tasks/${id}`),
  create: (data: { title: string; type: TaskType; context?: string; priority?: number; due_at?: string | null; provider_id?: string | null }) =>
    request<Task>("/tasks", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: TaskUpdatePayload) =>
    request<Task>(`/tasks/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  linkSession: (id: string, sessionId: string, sessionName?: string, providerId?: string, replaceSessionIds?: string[]) =>
    request<Task>(`/tasks/${id}/sessions`, {
      method: "PATCH",
      body: JSON.stringify({ sessionId, sessionName, providerId, replaceSessionIds }),
    }),
  delete: (id: string) =>
    request<{ ok: boolean; closedSessions?: number }>(`/tasks/${id}`, { method: "DELETE" }),
  parse: (input: string, providerId?: string) =>
    request<{ title: string; type: TaskType; context: string }>("/tasks/parse", { method: "POST", body: JSON.stringify({ input, providerId }) }),
  generateDocs: (id: string, providerId?: string) =>
    request<Task>(`/tasks/${id}/generate-docs`, { method: "POST", body: JSON.stringify({ providerId }) }),
  openWorkspace: (id: string) =>
    request<{ ok: boolean }>(`/tasks/${id}/open-workspace`, { method: "POST" }),
  getAgentChatThread: (id: string) =>
    request<AgentThread>(`/tasks/${id}/agent-chat/thread`),
  streamTaskAgentRun(
    taskId: string,
    message: string,
    onEvent: (event: AgentChatEvent) => void,
    onError: (error: string) => void,
    providerId?: string,
    seedMessage?: string,
  ): AbortController {
    const controller = new AbortController();

    fetch(`${BASE}/tasks/${taskId}/agent-chat/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, providerId, seedMessage }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          onError(`HTTP ${res.status}`);
          return;
        }
        const reader = res.body?.getReader();
        if (!reader) {
          onError("empty response body");
          return;
        }
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            try {
              onEvent(JSON.parse(payload) as AgentChatEvent);
            } catch {
              // skip malformed event
            }
          }
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") onError(err.message);
      });

    return controller;
  },

  streamTaskChat(
    taskId: string,
    message: string,
    onDelta: (delta: string) => void,
    onDone: () => void,
    onError: (error: string) => void,
    providerId?: string,
    seedMessage?: string,
  ): AbortController {
    const controller = new AbortController();

    fetch(`${BASE}/tasks/${taskId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, providerId, seedMessage }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          onError(`HTTP ${res.status}`);
          return;
        }
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop()!;

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            try {
              const parsed = JSON.parse(data);
              if (parsed.delta) onDelta(parsed.delta);
              if (parsed.done) onDone();
              if (parsed.error) onError(parsed.error);
            } catch {
              // skip
            }
          }
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") onError(err.message);
      });

    return controller;
  },
};

// System utilities
export const system = {
  openPath: (path: string) =>
    request<{ ok: boolean }>("/open-path", { method: "POST", body: JSON.stringify({ path }) }),
};

// SDK Runner
export type SdkRunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface SdkRun {
  id: string;
  task_id: string;
  agent_run_id: string | null;
  runner_type: "claude_code" | "codex";
  status: SdkRunStatus;
  prompt: string;
  cwd: string | null;
  total_cost_usd: number;
  total_tokens: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export type SdkEventType =
  | "sdk_run.started" | "sdk_run.completed" | "sdk_run.failed" | "sdk_run.cancelled"
  | "sdk.text_delta" | "sdk.text_completed" | "sdk.thinking"
  | "sdk.tool_use" | "sdk.tool_result"
  | "sdk.approval_request" | "sdk.approval_resolved"
  | "sdk.progress" | "sdk.cost_update" | "sdk.error";

export interface SdkEvent {
  type: SdkEventType;
  run_id: string;
  [key: string]: unknown;
}

export const sdkRunner = {
  listRuns: (taskId: string) =>
    request<{ runs: SdkRun[] }>(`/tasks/${taskId}/sdk-runner/runs`),
  approve: (taskId: string, runId: string, approvalId: string, approved: boolean) =>
    request<{ ok: boolean }>(`/tasks/${taskId}/sdk-runner/${runId}/approve`, {
      method: "POST",
      body: JSON.stringify({ approval_id: approvalId, approved }),
    }),
  cancel: (taskId: string, runId: string) =>
    request<{ ok: boolean }>(`/tasks/${taskId}/sdk-runner/${runId}/cancel`, { method: "POST" }),
};
