import { create } from "zustand";
import { sdkRunner as api, type SdkRun, type SdkEvent, type SdkEventType } from "../services/api";

const BASE = "/api";

// ---------------------------------------------------------------------------
// Timeline item types rendered in the SDK Runner panel
// ---------------------------------------------------------------------------

export type SdkTimelineItem =
  | { id: string; kind: "text"; content: string; streaming: boolean }
  | { id: string; kind: "thinking"; content: string }
  | { id: string; kind: "tool_use"; toolName: string; toolUseId: string; input: unknown }
  | { id: string; kind: "tool_result"; toolUseId: string; content: string; isError: boolean }
  | { id: string; kind: "approval_request"; approvalId: string; toolName: string; input: unknown; status: "pending" | "approved" | "denied" | "timeout" }
  | { id: string; kind: "progress"; message: string }
  | { id: string; kind: "cost"; totalCostUsd: number; durationMs?: number; numTurns?: number }
  | { id: string; kind: "error"; message: string }
  | { id: string; kind: "status_change"; status: SdkRun["status"] };

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface SdkRunnerState {
  sdkRuns: SdkRun[];
  activeSdkRunId: string | null;
  sdkTimeline: SdkTimelineItem[];
  sdkRunning: boolean;
  sdkPanelOpen: boolean;

  fetchSdkRuns: (taskId: string) => Promise<void>;
  subscribeSdkEvents: (taskId: string, runId: string) => void;
  unsubscribeSdkEvents: () => void;
  approveSdkAction: (taskId: string, runId: string, approvalId: string, approved: boolean) => Promise<void>;
  cancelSdkRun: (taskId: string, runId: string) => Promise<void>;
  openSdkPanel: (runId?: string) => void;
  closeSdkPanel: () => void;
  clearSdkRunner: () => void;
}

let _abortController: AbortController | null = null;
let _itemCounter = 0;

function nextId(): string {
  return `sdk-${Date.now()}-${++_itemCounter}`;
}

export const useSdkRunnerStore = create<SdkRunnerState>((set, get) => ({
  sdkRuns: [],
  activeSdkRunId: null,
  sdkTimeline: [],
  sdkRunning: false,
  sdkPanelOpen: false,

  fetchSdkRuns: async (taskId: string) => {
    try {
      const { runs } = await api.listRuns(taskId);
      set({ sdkRuns: runs });
    } catch {
      // Silently ignore — panel will show empty state
    }
  },

  subscribeSdkEvents: (taskId: string, runId: string) => {
    // Abort previous subscription
    _abortController?.abort();
    const controller = new AbortController();
    _abortController = controller;

    set({ activeSdkRunId: runId, sdkTimeline: [], sdkRunning: true, sdkPanelOpen: true });

    const url = `${BASE}/tasks/${taskId}/sdk-runner/${runId}/events`;

    (async () => {
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok || !res.body) {
          set({ sdkRunning: false });
          return;
        }
        const reader = res.body.getReader();
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
            try {
              const event: SdkEvent = JSON.parse(trimmed.slice(5).trim());
              handleSdkEvent(event, set, get);
            } catch {
              // Skip malformed SSE lines
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      } finally {
        if (_abortController === controller) {
          set({ sdkRunning: false });
        }
      }
    })();
  },

  unsubscribeSdkEvents: () => {
    _abortController?.abort();
    _abortController = null;
    set({ sdkRunning: false });
  },

  approveSdkAction: async (taskId, runId, approvalId, approved) => {
    await api.approve(taskId, runId, approvalId, approved);
    // Update the approval card in timeline
    set((s) => ({
      sdkTimeline: s.sdkTimeline.map((item) =>
        item.kind === "approval_request" && item.approvalId === approvalId
          ? { ...item, status: approved ? "approved" as const : "denied" as const }
          : item
      ),
    }));
  },

  cancelSdkRun: async (taskId, runId) => {
    try {
      await api.cancel(taskId, runId);
    } catch {
      // May already be finished
    }
  },

  openSdkPanel: (runId) => {
    set({ sdkPanelOpen: true, ...(runId ? { activeSdkRunId: runId } : {}) });
  },

  closeSdkPanel: () => {
    set({ sdkPanelOpen: false });
  },

  clearSdkRunner: () => {
    _abortController?.abort();
    _abortController = null;
    _itemCounter = 0;
    set({
      sdkRuns: [],
      activeSdkRunId: null,
      sdkTimeline: [],
      sdkRunning: false,
      sdkPanelOpen: false,
    });
  },
}));

// ---------------------------------------------------------------------------
// Event handler — maps SSE events to timeline items
// ---------------------------------------------------------------------------

function handleSdkEvent(
  event: SdkEvent,
  set: (fn: (s: SdkRunnerState) => Partial<SdkRunnerState>) => void,
  get: () => SdkRunnerState,
) {
  const type = event.type as SdkEventType;

  switch (type) {
    case "sdk_run.started":
      set((s) => ({
        sdkTimeline: [...s.sdkTimeline, { id: nextId(), kind: "status_change", status: "running" }],
        sdkRunning: true,
      }));
      break;

    case "sdk_run.completed":
      set((s) => ({
        sdkTimeline: [...s.sdkTimeline, { id: nextId(), kind: "status_change", status: "completed" }],
        sdkRunning: false,
      }));
      break;

    case "sdk_run.failed":
      set((s) => ({
        sdkTimeline: [
          ...s.sdkTimeline,
          { id: nextId(), kind: "error", message: String(event.error || "SDK run failed") },
          { id: nextId(), kind: "status_change", status: "failed" },
        ],
        sdkRunning: false,
      }));
      break;

    case "sdk_run.cancelled":
      set((s) => ({
        sdkTimeline: [...s.sdkTimeline, { id: nextId(), kind: "status_change", status: "cancelled" }],
        sdkRunning: false,
      }));
      break;

    case "sdk.text_delta": {
      const text = String(event.text || "");
      set((s) => {
        const timeline = [...s.sdkTimeline];
        const last = timeline[timeline.length - 1];
        if (last && last.kind === "text" && last.streaming) {
          timeline[timeline.length - 1] = { ...last, content: last.content + text };
        } else {
          timeline.push({ id: nextId(), kind: "text", content: text, streaming: true });
        }
        return { sdkTimeline: timeline };
      });
      break;
    }

    case "sdk.text_completed": {
      const text = String(event.text || "");
      set((s) => {
        const timeline = [...s.sdkTimeline];
        const last = timeline[timeline.length - 1];
        if (last && last.kind === "text" && last.streaming) {
          timeline[timeline.length - 1] = { ...last, content: text || last.content, streaming: false };
        } else {
          timeline.push({ id: nextId(), kind: "text", content: text, streaming: false });
        }
        return { sdkTimeline: timeline };
      });
      break;
    }

    case "sdk.thinking":
      set((s) => ({
        sdkTimeline: [...s.sdkTimeline, {
          id: nextId(), kind: "thinking", content: String(event.thinking || ""),
        }],
      }));
      break;

    case "sdk.tool_use":
      set((s) => ({
        sdkTimeline: [...s.sdkTimeline, {
          id: nextId(),
          kind: "tool_use",
          toolName: String(event.tool_name || "tool"),
          toolUseId: String(event.tool_use_id || ""),
          input: event.input ?? {},
        }],
      }));
      break;

    case "sdk.tool_result":
      set((s) => ({
        sdkTimeline: [...s.sdkTimeline, {
          id: nextId(),
          kind: "tool_result",
          toolUseId: String(event.tool_use_id || ""),
          content: String(event.content || ""),
          isError: Boolean(event.is_error),
        }],
      }));
      break;

    case "sdk.approval_request":
      set((s) => ({
        sdkTimeline: [...s.sdkTimeline, {
          id: nextId(),
          kind: "approval_request",
          approvalId: String(event.approval_id || ""),
          toolName: String(event.tool_name || "tool"),
          input: event.tool_input ?? {},
          status: "pending",
        }],
      }));
      break;

    case "sdk.progress":
      set((s) => ({
        sdkTimeline: [...s.sdkTimeline, {
          id: nextId(), kind: "progress", message: String(event.message || ""),
        }],
      }));
      break;

    case "sdk.cost_update":
      if (event.total_cost_usd !== undefined) {
        set((s) => ({
          sdkTimeline: [...s.sdkTimeline, {
            id: nextId(),
            kind: "cost",
            totalCostUsd: Number(event.total_cost_usd) || 0,
            durationMs: event.duration_ms != null ? Number(event.duration_ms) : undefined,
            numTurns: event.num_turns != null ? Number(event.num_turns) : undefined,
          }],
        }));
      }
      break;

    case "sdk.error":
      set((s) => ({
        sdkTimeline: [...s.sdkTimeline, {
          id: nextId(), kind: "error", message: String(event.message || "Unknown error"),
        }],
      }));
      break;

    default:
      // Unknown event type — skip
      break;
  }
}
