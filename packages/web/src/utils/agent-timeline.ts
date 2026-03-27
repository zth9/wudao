import type { AgentMessage, AgentRun, AgentThread } from "../services/api";
import { extractSdkRunId } from "./sdk-runner";

export type AgentTimelineStatus = "streaming" | "completed" | "failed" | "waiting_approval";

interface AgentTimelineBase {
  id: string;
  status: AgentTimelineStatus;
  optimistic?: boolean;
}

export type AgentTimelineItem =
  | (AgentTimelineBase & { kind: "user_text"; content: string })
  | (AgentTimelineBase & { kind: "assistant_text"; content: string; streaming: boolean })
  | (AgentTimelineBase & { kind: "tool_call"; toolName: string; input: unknown; sdkRunId?: string | null; message?: string })
  | (AgentTimelineBase & { kind: "tool_result"; toolName: string; output: unknown })
  | (AgentTimelineBase & { kind: "approval"; toolName: string; input: unknown })
  | (AgentTimelineBase & { kind: "artifact"; path: string; summary: string })
  | (AgentTimelineBase & { kind: "error"; content: string });

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function parseChatMessages(raw: string | null): ChatMessage[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ChatMessage[];
  } catch {
    return [];
  }
}

export function upsertAssistantMessage(messages: ChatMessage[], content: string): ChatMessage[] {
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

export function createOptimisticUserItem(content: string): AgentTimelineItem {
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
    const sdkRunId = extractSdkRunId(content) ?? undefined;
    const messageText = typeof content.message === "string" ? content.message : undefined;
    return {
      id: message.id,
      kind: "tool_call",
      toolName: String(content.toolName || "tool"),
      input: content.input ?? {},
      sdkRunId,
      message: messageText,
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

export function buildAgentTimeline(thread: AgentThread | null, rawChatMessages: string | null): AgentTimelineItem[] {
  const mapped = (thread?.messages || [])
    .map(mapAgentMessageToTimelineItem)
    .filter((item): item is AgentTimelineItem => item !== null);
  return mapped.length > 0 ? mapped : buildLegacyAgentTimeline(rawChatMessages);
}

export function upsertAgentRun(runs: AgentRun[], run: AgentRun): AgentRun[] {
  const index = runs.findIndex((item) => item.id === run.id);
  if (index < 0) return [...runs, run];
  return [...runs.slice(0, index), run, ...runs.slice(index + 1)];
}

export function updateAgentRunStatus(runs: AgentRun[], runId: string, status: AgentRun["status"], lastError?: string): AgentRun[] {
  return runs.map((run) => (run.id === runId ? { ...run, status, last_error: lastError ?? run.last_error } : run));
}

export function upsertAgentTimelineItem(items: AgentTimelineItem[], nextItem: AgentTimelineItem): AgentTimelineItem[] {
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

export function applyAgentDelta(items: AgentTimelineItem[], itemId: string, delta: string): AgentTimelineItem[] {
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

export { mapAgentMessageToTimelineItem };
