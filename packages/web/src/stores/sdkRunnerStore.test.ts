import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockListRuns,
  mockApprove,
  mockCancel,
  mockFetch,
} = vi.hoisted(() => ({
  mockListRuns: vi.fn(),
  mockApprove: vi.fn(),
  mockCancel: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock("../services/api", () => ({
  sdkRunner: {
    listRuns: mockListRuns,
    approve: mockApprove,
    cancel: mockCancel,
  },
}));

vi.stubGlobal("fetch", mockFetch);

import { useSdkRunnerStore } from "./sdkRunnerStore";

function makeRun(overrides: Partial<{
  id: string;
  task_id: string;
  agent_run_id: string | null;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  prompt: string;
  cwd: string | null;
  total_cost_usd: number;
  total_tokens: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}> = {}) {
  return {
    id: "sdk-run-1",
    task_id: "task-1",
    agent_run_id: null,
    runner_type: "claude_code" as const,
    status: "completed" as const,
    prompt: "执行一次测试",
    cwd: "/tmp/task-1",
    total_cost_usd: 0,
    total_tokens: 0,
    last_error: null,
    created_at: "2026-03-21T09:09:12+08:00",
    updated_at: "2026-03-21T09:09:58+08:00",
    ...overrides,
  };
}

function makeFetchResponse(events: Array<Record<string, unknown>>) {
  const payload = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
  let done = false;
  return {
    ok: true,
    body: {
      getReader() {
        return {
          read: async () => {
            if (done) {
              return { done: true, value: undefined };
            }
            done = true;
            return { done: false, value: new TextEncoder().encode(payload) };
          },
        };
      },
    },
  };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function resetStore() {
  useSdkRunnerStore.setState({
    sdkRuns: [],
    activeSdkRunId: null,
    sdkTimeline: [],
    sdkRunning: false,
  });
}

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
});

describe("sdkRunnerStore", () => {
  it("keeps all sdk run history and sorts newest runs first", async () => {
    mockListRuns.mockResolvedValue({
      runs: [
        makeRun({ id: "sdk-run-old", created_at: "2026-03-21T09:09:12+08:00" }),
        makeRun({ id: "sdk-run-new", created_at: "2026-03-21T09:10:12+08:00" }),
      ],
    });

    await useSdkRunnerStore.getState().fetchSdkRuns("task-1");

    expect(useSdkRunnerStore.getState().sdkRuns.map((run) => run.id)).toEqual(["sdk-run-new", "sdk-run-old"]);
    expect(useSdkRunnerStore.getState().activeSdkRunId).toBe("sdk-run-new");
  });

  it("switches to the sdk run chosen from history without dropping older runs", async () => {
    mockListRuns.mockResolvedValue({
      runs: [
        makeRun({ id: "sdk-run-1", created_at: "2026-03-21T09:09:12+08:00", prompt: "第一次执行" }),
        makeRun({ id: "sdk-run-2", created_at: "2026-03-21T09:10:12+08:00", prompt: "第二次执行" }),
      ],
    });

    mockFetch
      .mockResolvedValueOnce(makeFetchResponse([
        { type: "sdk_run.started", run_id: "sdk-run-1" },
        { type: "sdk.text_completed", run_id: "sdk-run-1", text: "第一次结果" },
        { type: "sdk_run.completed", run_id: "sdk-run-1" },
      ]))
      .mockResolvedValueOnce(makeFetchResponse([
        { type: "sdk_run.started", run_id: "sdk-run-2" },
        { type: "sdk.text_completed", run_id: "sdk-run-2", text: "第二次结果" },
        { type: "sdk_run.completed", run_id: "sdk-run-2" },
      ]));

    await useSdkRunnerStore.getState().fetchSdkRuns("task-1");

    useSdkRunnerStore.getState().openSdkPanel("task-1", "sdk-run-1");
    await flushAsyncWork();

    expect(useSdkRunnerStore.getState().activeSdkRunId).toBe("sdk-run-1");
    expect(useSdkRunnerStore.getState().sdkTimeline.some((item) => item.kind === "text" && item.content.includes("第一次结果"))).toBe(true);
    expect(useSdkRunnerStore.getState().sdkRuns.map((run) => run.id)).toEqual(["sdk-run-2", "sdk-run-1"]);

    useSdkRunnerStore.getState().openSdkPanel("task-1", "sdk-run-2");
    await flushAsyncWork();

    expect(useSdkRunnerStore.getState().activeSdkRunId).toBe("sdk-run-2");
    expect(useSdkRunnerStore.getState().sdkTimeline.some((item) => item.kind === "text" && item.content.includes("第二次结果"))).toBe(true);
    expect(useSdkRunnerStore.getState().sdkRuns.map((run) => run.id)).toEqual(["sdk-run-2", "sdk-run-1"]);
  });
});
