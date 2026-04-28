import { create } from "zustand";
import { sdkRunner as api, type SdkRun, type SdkEvent, type SdkEventType } from "../services/api";
import { useTaskStore } from "./taskStore";

const BASE = "/api";

// ---------------------------------------------------------------------------
// Timeline item types rendered in the Agent Runner panel
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

  fetchSdkRuns: (taskId: string) => Promise<void>;
  subscribeSdkEvents: (taskId: string, runId: string) => void;
  selectSdkRun: (taskId: string, runId: string) => void;
  unsubscribeSdkEvents: () => void;
  approveSdkAction: (taskId: string, runId: string, approvalId: string, approved: boolean) => Promise<void>;
  cancelSdkRun: (taskId: string, runId: string) => Promise<void>;
  openSdkPanel: (taskId: string, runId?: string) => void;
  closeSdkPanel: () => void;
  clearSdkRunner: () => void;
}

let _abortController: AbortController | null = null;
let _itemCounter = 0;

function nextId(): string {
  return `sdk-${Date.now()}-${++_itemCounter}`;
}

function compareRunsDesc(left: SdkRun, right: SdkRun): number {
  const byCreatedAt = right.created_at.localeCompare(left.created_at);
  if (byCreatedAt !== 0) {
    return byCreatedAt;
  }
  return right.id.localeCompare(left.id);
}

function sortSdkRuns(runs: SdkRun[]): SdkRun[] {
  return [...runs].sort(compareRunsDesc);
}

function patchSdkRuns(runs: SdkRun[], runId: string, patch: Partial<SdkRun>): SdkRun[] {
  let found = false;
  const nextRuns = runs.map((run) => {
    if (run.id !== runId) {
      return run;
    }
    found = true;
    return { ...run, ...patch };
  });
  return found ? sortSdkRuns(nextRuns) : runs;
}

function resolveSdkRunning(status: SdkRun["status"] | null | undefined): boolean {
  return status === "pending" || status === "running";
}

function extractTotalTokens(event: SdkEvent): number | undefined {
  const usage = event.usage;
  if (!usage || typeof usage !== "object") {
    return undefined;
  }
  const totalTokens = (usage as Record<string, unknown>).total_tokens;
  return typeof totalTokens === "number" ? totalTokens : undefined;
}

function formatSdkEventContent(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value == null) {
    return "";
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export const useSdkRunnerStore = create<SdkRunnerState>((set, get) => ({
  sdkRuns: [],
  activeSdkRunId: null,
  sdkTimeline: [],
  sdkRunning: false,

  fetchSdkRuns: async (taskId: string) => {
    try {
      const { runs } = await api.listRuns(taskId);
      const sortedRuns = sortSdkRuns(runs);
      set((state) => {
        const activeSdkRunId = state.activeSdkRunId && sortedRuns.some((run) => run.id === state.activeSdkRunId)
          ? state.activeSdkRunId
          : (sortedRuns[0]?.id ?? null);
        const activeRun = sortedRuns.find((run) => run.id === activeSdkRunId) ?? null;
        return {
          sdkRuns: sortedRuns,
          activeSdkRunId,
          sdkRunning: state.sdkTimeline.length > 0 ? state.sdkRunning : resolveSdkRunning(activeRun?.status),
        };
      });
    } catch {
      // Silently ignore — panel will show empty state
    }
  },

  subscribeSdkEvents: (taskId: string, runId: string) => {
    _abortController?.abort();
    const controller = new AbortController();
    _abortController = controller;

    const selectedRun = get().sdkRuns.find((run) => run.id === runId) ?? null;
    set((state) => ({
      activeSdkRunId: runId,
      sdkTimeline: [],
      sdkRunning: resolveSdkRunning(selectedRun?.status),
      sdkRuns: state.sdkRuns,
    }));

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
          const activeRun = get().sdkRuns.find((run) => run.id === get().activeSdkRunId) ?? null;
          set({ sdkRunning: resolveSdkRunning(activeRun?.status) });
        }
      }
    })();
  },

  selectSdkRun: (taskId: string, runId: string) => {
    const state = get();
    if (state.activeSdkRunId === runId && state.sdkTimeline.length > 0) {
      return;
    }
    get().subscribeSdkEvents(taskId, runId);
  },

  unsubscribeSdkEvents: () => {
    _abortController?.abort();
    _abortController = null;
    const activeRun = get().sdkRuns.find((run) => run.id === get().activeSdkRunId) ?? null;
    set({ sdkRunning: resolveSdkRunning(activeRun?.status) });
  },

  approveSdkAction: async (taskId, runId, approvalId, approved) => {
    await api.approve(taskId, runId, approvalId, approved);
    set((state) => ({
      sdkTimeline: state.sdkTimeline.map((item) =>
        item.kind === "approval_request" && item.approvalId === approvalId
          ? { ...item, status: approved ? "approved" as const : "denied" as const }
          : item
      ),
    }));
  },

  cancelSdkRun: async (taskId, runId) => {
    try {
      await api.cancel(taskId, runId);
      set((state) => ({
        sdkRuns: patchSdkRuns(state.sdkRuns, runId, { status: "cancelled" }),
        sdkRunning: state.activeSdkRunId === runId ? false : state.sdkRunning,
      }));
    } catch {
      // May already be finished
    }
  },

  openSdkPanel: (taskId, runId) => {
    const state = get();
    const selectedRunId = runId ?? state.activeSdkRunId ?? state.sdkRuns[0]?.id ?? null;
    if (!selectedRunId) {
      return;
    }
    get().selectSdkRun(taskId, selectedRunId);
  },

  closeSdkPanel: () => {
    get().unsubscribeSdkEvents();
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
    });
  },
}));

// ---------------------------------------------------------------------------
// Event handler — maps SSE events to timeline items
// ---------------------------------------------------------------------------

function handleSdkEvent(
  event: SdkEvent,
  set: (fn: (state: SdkRunnerState) => Partial<SdkRunnerState>) => void,
  get: () => SdkRunnerState,
) {
  const type = event.type as SdkEventType;
  const runId = String(event.run_id || "");

  switch (type) {
    case "sdk_run.started":
      set((state) => ({
        sdkTimeline: [...state.sdkTimeline, { id: nextId(), kind: "status_change", status: "running" }],
        sdkRunning: true,
        sdkRuns: patchSdkRuns(state.sdkRuns, runId, { status: "running" }),
      }));
      break;

    case "sdk_run.completed":
      set((state) => ({
        sdkTimeline: [...state.sdkTimeline, { id: nextId(), kind: "status_change", status: "completed" }],
        sdkRunning: false,
        sdkRuns: patchSdkRuns(state.sdkRuns, runId, { status: "completed" }),
      }));
      setTimeout(() => {
        const run = get().sdkRuns.find((r) => r.id === runId);
        if (run?.task_id) {
          void useTaskStore.getState().fetchOne(run.task_id);
        }
      }, 500);
      break;

    case "sdk_run.failed":
      set((state) => ({
        sdkTimeline: [
          ...state.sdkTimeline,
          { id: nextId(), kind: "error", message: String(event.error || "SDK run failed") },
          { id: nextId(), kind: "status_change", status: "failed" },
        ],
        sdkRunning: false,
        sdkRuns: patchSdkRuns(state.sdkRuns, runId, {
          status: "failed",
          last_error: String(event.error || "SDK run failed"),
        }),
      }));
      setTimeout(() => {
        const run = get().sdkRuns.find((r) => r.id === runId);
        if (run?.task_id) void useTaskStore.getState().fetchOne(run.task_id);
      }, 500);
      break;

    case "sdk_run.cancelled":
      set((state) => ({
        sdkTimeline: [...state.sdkTimeline, { id: nextId(), kind: "status_change", status: "cancelled" }],
        sdkRunning: false,
        sdkRuns: patchSdkRuns(state.sdkRuns, runId, { status: "cancelled" }),
      }));
      setTimeout(() => {
        const run = get().sdkRuns.find((r) => r.id === runId);
        if (run?.task_id) void useTaskStore.getState().fetchOne(run.task_id);
      }, 500);
      break;

    case "sdk.text_delta": {
      const text = String(event.text || "");
      set((state) => {
        const timeline = [...state.sdkTimeline];
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
      set((state) => {
        const timeline = [...state.sdkTimeline];
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
      set((state) => ({
        sdkTimeline: [...state.sdkTimeline, {
          id: nextId(), kind: "thinking", content: String(event.thinking || ""),
        }],
      }));
      break;

    case "sdk.tool_use":
      set((state) => ({
        sdkTimeline: [...state.sdkTimeline, {
          id: nextId(),
          kind: "tool_use",
          toolName: String(event.tool_name || "tool"),
          toolUseId: String(event.tool_use_id || ""),
          input: event.input ?? {},
        }],
      }));
      break;

    case "sdk.tool_result":
      set((state) => ({
        sdkTimeline: [...state.sdkTimeline, {
          id: nextId(),
          kind: "tool_result",
          toolUseId: String(event.tool_use_id || ""),
          content: formatSdkEventContent(event.content),
          isError: Boolean(event.is_error),
        }],
      }));
      break;

    case "sdk.approval_request":
      set((state) => ({
        sdkTimeline: [...state.sdkTimeline, {
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
      set((state) => ({
        sdkTimeline: [...state.sdkTimeline, {
          id: nextId(), kind: "progress", message: String(event.message || ""),
        }],
      }));
      break;

    case "sdk.cost_update":
      if (event.total_cost_usd !== undefined) {
        set((state) => ({
          sdkTimeline: [...state.sdkTimeline, {
            id: nextId(),
            kind: "cost",
            totalCostUsd: Number(event.total_cost_usd) || 0,
            durationMs: event.duration_ms != null ? Number(event.duration_ms) : undefined,
            numTurns: event.num_turns != null ? Number(event.num_turns) : undefined,
          }],
          sdkRuns: patchSdkRuns(state.sdkRuns, runId, {
            total_cost_usd: Number(event.total_cost_usd) || 0,
            total_tokens: extractTotalTokens(event) ?? state.sdkRuns.find((run) => run.id === runId)?.total_tokens ?? 0,
          }),
        }));
      }
      break;

    case "sdk.error":
      set((state) => ({
        sdkTimeline: [...state.sdkTimeline, {
          id: nextId(), kind: "error", message: String(event.message || "Unknown error"),
        }],
      }));
      break;

    default:
      break;
  }
}
