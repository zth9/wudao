import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Task } from "../services/api";

const {
  mockList,
  mockGet,
  mockGetAgentChatThread,
  mockCreate,
  mockUpdate,
  mockLinkSession,
  mockDelete,
  mockParse,
  mockGenerateDocs,
  mockStreamTaskChat,
  mockStreamTaskAgentRun,
  mockAbortController,
  mockAgentAbortController,
  mockRemoveByTaskId,
  capturedCallbacks,
  capturedAgentCallbacks,
} = vi.hoisted(() => {
  const callbacks = {
    onDelta: null as ((d: string) => void) | null,
    onDone: null as (() => void) | null,
    onError: null as ((e: string) => void) | null,
  };
  const agentCallbacks = {
    onEvent: null as ((event: any) => void) | null,
    onError: null as ((error: string) => void) | null,
  };
  const ctrl = { abort: vi.fn() };
  const agentCtrl = { abort: vi.fn() };
  return {
    mockList: vi.fn(),
    mockGet: vi.fn(),
    mockGetAgentChatThread: vi.fn(),
    mockCreate: vi.fn(),
    mockUpdate: vi.fn(),
    mockLinkSession: vi.fn(),
    mockDelete: vi.fn(),
    mockParse: vi.fn(),
    mockGenerateDocs: vi.fn(),
    mockStreamTaskChat: vi.fn((_tid: string, _msg: string, onDelta: any, onDone: any, onError: any) => {
      callbacks.onDelta = onDelta;
      callbacks.onDone = onDone;
      callbacks.onError = onError;
      return ctrl;
    }),
    mockStreamTaskAgentRun: vi.fn((_tid: string, _msg: string, onEvent: any, onError: any) => {
      agentCallbacks.onEvent = onEvent;
      agentCallbacks.onError = onError;
      return agentCtrl;
    }),
    mockAbortController: ctrl,
    mockAgentAbortController: agentCtrl,
    mockRemoveByTaskId: vi.fn(),
    capturedCallbacks: callbacks,
    capturedAgentCallbacks: agentCallbacks,
  };
});

vi.mock("../services/api", () => ({
  tasks: {
    list: mockList,
    get: mockGet,
    getAgentChatThread: mockGetAgentChatThread,
    create: mockCreate,
    update: mockUpdate,
    linkSession: mockLinkSession,
    delete: mockDelete,
    parse: mockParse,
    generateDocs: mockGenerateDocs,
    openWorkspace: vi.fn(),
    streamTaskChat: mockStreamTaskChat,
    streamTaskAgentRun: mockStreamTaskAgentRun,
  },
}));

vi.mock("./terminalStore", () => ({
  useTerminalStore: {
    getState: () => ({ removeByTaskId: mockRemoveByTaskId }),
  },
}));

import { useTaskStore } from "./taskStore";
import { useSettingsStore } from "./settingsStore";

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: "2026-02-26-1",
  title: "Test Task",
  type: "feature",
  status: "execution",
  context: null,
  agent_doc: null,
  chat_messages: null,
  session_ids: "[]",
  session_names: "{}",
  session_providers: "{}",
  priority: 2,
  due_at: null,
  provider_id: null,
  created_at: "2026-02-26T00:00:00Z",
  updated_at: "2026-02-26T00:00:00Z",
  ...overrides,
});

const pagedResponse = (items: Task[], page: Partial<{ next_cursor: string | null; has_more: boolean; sort: "updated_at"; limit: number }> = {}) => ({
  items,
  page: { next_cursor: null, has_more: false, sort: "updated_at" as const, limit: 20, ...page },
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const resetStore = () => {
  useTaskStore.setState({
    tasks: [],
    currentTask: null,
    chatTaskId: null,
    agentChatTaskId: null,
    loading: false,
    generating: false,
    chatMessages: [],
    chatStreaming: false,
    agentRuns: [],
    agentTimeline: [],
    agentChatStreaming: false,
    nextCursor: null,
    hasMore: false,
  });
  useSettingsStore.setState({
    taskSortBy: "updated_at",
    taskSortOrder: "desc",
  });
};

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
  capturedCallbacks.onDelta = null;
  capturedCallbacks.onDone = null;
  capturedCallbacks.onError = null;
  capturedAgentCallbacks.onEvent = null;
  capturedAgentCallbacks.onError = null;
  mockAbortController.abort.mockReset();
  mockAgentAbortController.abort.mockReset();
  mockGetAgentChatThread.mockResolvedValue({ task_id: "2026-02-26-1", runs: [], messages: [] });
});

describe("fetch", () => {
  it("sets loading=true during call, false after", async () => {
    let loadingDuringCall = false;
    mockList.mockImplementation(() => {
      loadingDuringCall = useTaskStore.getState().loading;
      return Promise.resolve(pagedResponse([]));
    });
    await useTaskStore.getState().fetch();
    expect(loadingDuringCall).toBe(true);
    expect(useTaskStore.getState().loading).toBe(false);
  });

  it("writes fetched tasks to state", async () => {
    const list = [makeTask({ id: "1" }), makeTask({ id: "2" })];
    mockList.mockResolvedValue(pagedResponse(list));
    await useTaskStore.getState().fetch();
    expect(useTaskStore.getState().tasks).toEqual(list);
  });

  it("passes status parameter to api.list", async () => {
    mockList.mockResolvedValue(pagedResponse([]));
    await useTaskStore.getState().fetch("done");
    expect(mockList).toHaveBeenCalledWith({ status: "done", sort: "updated_at", order: "desc" });
  });

  it("ignores stale list responses when a newer request wins", async () => {
    const first = createDeferred<ReturnType<typeof pagedResponse>>();
    const second = createDeferred<ReturnType<typeof pagedResponse>>();
    mockList
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    const firstFetch = useTaskStore.getState().fetch("execution");
    const secondFetch = useTaskStore.getState().fetch("done");

    second.resolve(pagedResponse([makeTask({ id: "newer" })]));
    await secondFetch;
    first.resolve(pagedResponse([makeTask({ id: "older" })]));
    await firstFetch;

    expect(useTaskStore.getState().tasks.map((task) => task.id)).toEqual(["newer"]);
    expect(useTaskStore.getState().loading).toBe(false);
  });


  it("fetchAll aggregates paginated tasks for correct client-side counts", async () => {
    mockList
      .mockResolvedValueOnce(pagedResponse([makeTask({ id: "1" }), makeTask({ id: "2", status: "done" })], { next_cursor: "cursor-2", has_more: true }))
      .mockResolvedValueOnce(pagedResponse([makeTask({ id: "3" })]));

    await useTaskStore.getState().fetchAll();

    expect(mockList).toHaveBeenNthCalledWith(1, { sort: "updated_at", order: "desc", cursor: undefined, limit: 100 });
    expect(mockList).toHaveBeenNthCalledWith(2, { sort: "updated_at", order: "desc", cursor: "cursor-2", limit: 100 });
    expect(useTaskStore.getState().tasks.map((task) => task.id)).toEqual(["1", "2", "3"]);
    expect(useTaskStore.getState().loading).toBe(false);
  });

  it("fetchAll ignores stale paginated responses when a newer list request wins", async () => {
    const firstPage = createDeferred<ReturnType<typeof pagedResponse>>();
    mockList
      .mockImplementationOnce(() => firstPage.promise)
      .mockResolvedValueOnce(pagedResponse([makeTask({ id: "newer" })]));

    const firstFetch = useTaskStore.getState().fetchAll();
    const secondFetch = useTaskStore.getState().fetch("done");

    await secondFetch;
    firstPage.resolve(pagedResponse([makeTask({ id: "older" })], { next_cursor: "cursor-2", has_more: true }));
    await firstFetch;

    expect(useTaskStore.getState().tasks.map((task) => task.id)).toEqual(["newer"]);
  });
});

describe("fetchOne", () => {
  it("sets currentTask from API response", async () => {
    const task = makeTask();
    mockGet.mockResolvedValue(task);
    await useTaskStore.getState().fetchOne("2026-02-26-1");
    expect(useTaskStore.getState().currentTask).toEqual(task);
    expect(useTaskStore.getState().chatTaskId).toBe("2026-02-26-1");
  });

  it("parses chat_messages JSON into chatMessages", async () => {
    const msgs = [{ role: "user", content: "hi" }];
    const task = makeTask({ chat_messages: JSON.stringify(msgs) });
    mockGet.mockResolvedValue(task);
    await useTaskStore.getState().fetchOne("2026-02-26-1");
    expect(useTaskStore.getState().chatMessages).toEqual(msgs);
  });

  it("sets empty chatMessages when chat_messages is null", async () => {
    const task = makeTask({ chat_messages: null });
    mockGet.mockResolvedValue(task);
    await useTaskStore.getState().fetchOne("2026-02-26-1");
    expect(useTaskStore.getState().chatMessages).toEqual([]);
  });

  it("sets empty chatMessages when chat_messages is invalid JSON", async () => {
    const task = makeTask({ chat_messages: "invalid" });
    mockGet.mockResolvedValue(task);
    await useTaskStore.getState().fetchOne("2026-02-26-1");
    expect(useTaskStore.getState().chatMessages).toEqual([]);
  });

  it("keeps in-memory chat when revisiting the same task during streaming", async () => {
    const msgs = [{ role: "assistant", content: "streaming..." }];
    useTaskStore.setState({
      chatTaskId: "2026-02-26-1",
      chatMessages: msgs as never[],
      chatStreaming: true,
    });
    mockGet.mockResolvedValue(makeTask());
    await useTaskStore.getState().fetchOne("2026-02-26-1");
    expect(useTaskStore.getState().chatMessages).toEqual(msgs);
    expect(useTaskStore.getState().chatStreaming).toBe(true);
  });

  it("ignores stale detail responses when a newer task wins", async () => {
    const first = createDeferred<Task>();
    const second = createDeferred<Task>();
    mockGet
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    const firstFetch = useTaskStore.getState().fetchOne("2026-02-26-1");
    const secondFetch = useTaskStore.getState().fetchOne("2026-02-26-2");

    second.resolve(makeTask({ id: "2026-02-26-2", title: "Latest" }));
    await secondFetch;
    first.resolve(makeTask({ id: "2026-02-26-1", title: "Stale" }));
    await firstFetch;

    expect(useTaskStore.getState().currentTask?.id).toBe("2026-02-26-2");
    expect(useTaskStore.getState().currentTask?.title).toBe("Latest");
  });

  it("loads structured agent timeline from agent-chat thread first", async () => {
    mockGet.mockResolvedValue(makeTask({ chat_messages: JSON.stringify([{ role: "assistant", content: "legacy" }]) }));
    mockGetAgentChatThread.mockResolvedValue({
      task_id: "2026-02-26-1",
      runs: [],
      messages: [
        {
          id: "msg-tool",
          task_id: "2026-02-26-1",
          run_id: "run-1",
          seq: 1,
          role: "assistant",
          kind: "tool_result",
          status: "completed",
          content_json: { toolName: "workspace_list", output: { entries: ["AGENTS.md"] } },
          created_at: "2026-02-26T00:00:00Z",
          updated_at: "2026-02-26T00:00:00Z",
        },
      ],
    });

    await useTaskStore.getState().fetchOne("2026-02-26-1");

    expect(useTaskStore.getState().agentTimeline).toEqual([
      {
        id: "msg-tool",
        kind: "tool_result",
        toolName: "workspace_list",
        output: { entries: ["AGENTS.md"] },
        status: "completed",
      },
    ]);
  });
});

describe("create", () => {
  it("calls api.create and returns the new task", async () => {
    const task = makeTask();
    mockCreate.mockResolvedValue(task);
    const result = await useTaskStore.getState().create({ title: "x", type: "feature" });
    expect(mockCreate).toHaveBeenCalledWith({ title: "x", type: "feature" });
    expect(result).toEqual(task);
  });

  it("refreshes task list after creation", async () => {
    mockCreate.mockResolvedValue(makeTask());
    mockList.mockResolvedValue(pagedResponse([]));
    await useTaskStore.getState().create({ title: "x", type: "feature" });
    expect(mockList).toHaveBeenCalled();
  });
});

describe("parse", () => {
  it("sets generating=true during call, false after", async () => {
    let genDuringCall = false;
    mockParse.mockImplementation(() => {
      genDuringCall = useTaskStore.getState().generating;
      return Promise.resolve({ title: "T", type: "feature", context: "ctx" });
    });
    await useTaskStore.getState().parse("hello");
    expect(genDuringCall).toBe(true);
    expect(useTaskStore.getState().generating).toBe(false);
  });

  it("returns parsed result from API", async () => {
    const data = { title: "T", type: "feature", context: "ctx" };
    mockParse.mockResolvedValue(data);
    await expect(useTaskStore.getState().parse("hello")).resolves.toEqual(data);
  });

  it("resets generating on error", async () => {
    mockParse.mockRejectedValue(new Error("boom"));
    await expect(useTaskStore.getState().parse("hello")).rejects.toThrow("boom");
    expect(useTaskStore.getState().generating).toBe(false);
  });
});

describe("generateDocs", () => {
  it("sets generating=true during call", async () => {
    let genDuringCall = false;
    mockGenerateDocs.mockImplementation(() => {
      genDuringCall = useTaskStore.getState().generating;
      return Promise.resolve(makeTask({ agent_doc: "doc" }));
    });
    await useTaskStore.getState().generateDocs("2026-02-26-1");
    expect(genDuringCall).toBe(true);
    expect(useTaskStore.getState().generating).toBe(false);
  });

  it("merges generated docs into currentTask and matching list item", async () => {
    const original = makeTask({ agent_doc: null });
    useTaskStore.setState({ currentTask: original, tasks: [original] });
    mockGenerateDocs.mockResolvedValue({ agent_doc: "NEW" });
    mockList.mockResolvedValue(pagedResponse([makeTask({ agent_doc: "NEW" })]));

    await useTaskStore.getState().generateDocs("2026-02-26-1");

    expect(useTaskStore.getState().currentTask).toEqual(makeTask({ agent_doc: "NEW" }));
    expect(useTaskStore.getState().tasks[0].agent_doc).toBe("NEW");
  });

  it("refreshes task list after doc generation", async () => {
    mockGenerateDocs.mockResolvedValue(makeTask({ agent_doc: "doc" }));
    mockList.mockResolvedValue(pagedResponse([]));
    await useTaskStore.getState().generateDocs("2026-02-26-1");
    expect(mockList).toHaveBeenCalled();
  });
});

describe("startInitialChat", () => {
  it("seeds the provided task info message immediately and starts streaming", () => {
    const seedMessage = `[Task Info]
Title: 启动任务
Type: ✨ Feature
Initial Intent: 补齐首轮对话

Please first understand the task, and use the conversation to gradually fill in the information needed to generate the artifact.`;
    useTaskStore.getState().startInitialChat("t1", seedMessage);
    expect(useTaskStore.getState().chatMessages).toEqual([
      {
        role: "user",
        content: seedMessage,
      },
    ]);
    expect(useTaskStore.getState().chatStreaming).toBe(true);
    expect(useTaskStore.getState().chatTaskId).toBe("t1");
    expect(mockStreamTaskChat).toHaveBeenCalledWith(
      "t1",
      "",
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      undefined,
      seedMessage,
    );
  });

  it("writes assistant delta after seeded task info", () => {
    useTaskStore.getState().startInitialChat(
      "t1",
      `[任务信息]
标题：启动任务
类型：✨ 功能
初步意图：无

请先理解任务，并通过对话逐步补齐生成产物所需的信息。`,
    );
    capturedCallbacks.onDelta!("先理解一下任务");
    expect(useTaskStore.getState().chatMessages).toEqual([
      {
        role: "user",
        content: `[任务信息]
标题：启动任务
类型：✨ 功能
初步意图：无

请先理解任务，并通过对话逐步补齐生成产物所需的信息。`,
      },
      { role: "assistant", content: "先理解一下任务" },
    ]);
  });
});

describe("sendChatMessage", () => {
  it("appends user message to chatMessages immediately", () => {
    useTaskStore.getState().sendChatMessage("t1", "hello");
    const msgs = useTaskStore.getState().chatMessages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toEqual({ role: "user", content: "hello" });
  });

  it("sets chatStreaming=true", () => {
    useTaskStore.getState().sendChatMessage("t1", "hello");
    expect(useTaskStore.getState().chatStreaming).toBe(true);
    expect(useTaskStore.getState().chatTaskId).toBe("t1");
  });

  it("accumulates delta into assistant message", () => {
    useTaskStore.getState().sendChatMessage("t1", "hello");
    capturedCallbacks.onDelta!("part 1 ");
    capturedCallbacks.onDelta!("part 2");
    const msgs = useTaskStore.getState().chatMessages;
    expect(msgs).toHaveLength(2);
    expect(msgs[1]).toEqual({ role: "assistant", content: "part 1 part 2" });
  });

  it("sets chatStreaming=false on done and refreshes the task", async () => {
    mockGet.mockResolvedValue(makeTask());
    useTaskStore.getState().sendChatMessage("t1", "hello");
    capturedCallbacks.onDone!();
    await Promise.resolve();
    expect(useTaskStore.getState().chatStreaming).toBe(false);
  });

  it("sets chatStreaming=false on error", () => {
    console.error = vi.fn();
    useTaskStore.getState().sendChatMessage("t1", "hello");
    capturedCallbacks.onError!("oops");
    expect(useTaskStore.getState().chatStreaming).toBe(false);
  });

  it("passes providerId to streamTaskChat", () => {
    useTaskStore.getState().sendChatMessage("t1", "hello", "kimi");
    expect(mockStreamTaskChat).toHaveBeenCalledWith(
      "t1",
      "hello",
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      "kimi",
      undefined,
    );
  });
});

describe("abortChat", () => {
  it("calls abort on the controller and sets chatStreaming=false", () => {
    useTaskStore.getState().sendChatMessage("t1", "hello");
    expect(useTaskStore.getState().chatStreaming).toBe(true);
    useTaskStore.getState().abortChat();
    expect(mockAbortController.abort).toHaveBeenCalled();
    expect(useTaskStore.getState().chatStreaming).toBe(false);
  });

  it("does nothing when no active stream", () => {
    useTaskStore.getState().abortChat();
    expect(mockAbortController.abort).not.toHaveBeenCalled();
  });
});

describe("agent chat timeline", () => {
  it("optimistically appends user text and applies structured run events", () => {
    useTaskStore.getState().sendAgentChatMessage("t1", "列一下 workspace", "claude");

    expect(useTaskStore.getState().agentTimeline[0]).toMatchObject({
      kind: "user_text",
      content: "列一下 workspace",
    });
    expect(useTaskStore.getState().agentChatStreaming).toBe(true);
    expect(mockStreamTaskAgentRun).toHaveBeenCalledWith(
      "t1",
      "列一下 workspace",
      expect.any(Function),
      expect.any(Function),
      "claude",
      undefined,
    );

    capturedAgentCallbacks.onEvent!({
      type: "run.started",
      runId: "run-1",
      run: {
        id: "run-1",
        task_id: "t1",
        provider_id: "claude",
        status: "running",
        checkpoint_json: null,
        last_error: null,
        created_at: "2026-02-26T00:00:00Z",
        updated_at: "2026-02-26T00:00:00Z",
      },
    });
    capturedAgentCallbacks.onEvent!({
      type: "message.completed",
      item: {
        id: "tool-1",
        task_id: "t1",
        run_id: "run-1",
        seq: 2,
        role: "assistant",
        kind: "tool_call",
        status: "completed",
        content_json: { toolName: "workspace_list", input: {} },
        created_at: "2026-02-26T00:00:00Z",
        updated_at: "2026-02-26T00:00:00Z",
      },
    });
    capturedAgentCallbacks.onEvent!({
      type: "message.delta",
      itemId: "assistant-1",
      delta: "已列出 workspace 文件",
    });

    expect(useTaskStore.getState().agentRuns[0]?.id).toBe("run-1");
    expect(useTaskStore.getState().agentTimeline.some((item) => item.kind === "tool_call")).toBe(true);
    expect(useTaskStore.getState().agentTimeline.at(-1)).toEqual({
      id: "assistant-1",
      kind: "assistant_text",
      content: "已列出 workspace 文件",
      status: "streaming",
      streaming: true,
    });
  });

  it("can abort active agent chat stream", () => {
    useTaskStore.getState().sendAgentChatMessage("t1", "继续", "claude");

    useTaskStore.getState().abortAgentChat();

    expect(mockAgentAbortController.abort).toHaveBeenCalled();
    expect(useTaskStore.getState().agentChatStreaming).toBe(false);
  });
});

describe("update", () => {
  it("calls api.update and sets currentTask", async () => {
    const updated = makeTask({ title: "Updated" });
    mockUpdate.mockResolvedValue(updated);
    await useTaskStore.getState().update("2026-02-26-1", { title: "Updated" });
    expect(useTaskStore.getState().currentTask).toEqual(updated);
  });

  it("does not overwrite another currentTask", async () => {
    const original = makeTask({ id: "2026-02-26-1", title: "Original" });
    useTaskStore.setState({ currentTask: original });
    mockUpdate.mockResolvedValue(makeTask({ id: "2026-02-26-2", title: "Updated" }));

    await useTaskStore.getState().update("2026-02-26-2", { title: "Updated" });

    expect(useTaskStore.getState().currentTask).toEqual(original);
  });

  it("refreshes task list after update", async () => {
    mockUpdate.mockResolvedValue(makeTask());
    mockList.mockResolvedValue(pagedResponse([]));
    await useTaskStore.getState().update("2026-02-26-1", { title: "X" });
    expect(mockList).toHaveBeenCalled();
  });
});

describe("linkSession", () => {
  it("updates currentTask when ids match", async () => {
    const task = makeTask({ session_ids: '["s1"]' });
    mockLinkSession.mockResolvedValue(task);
    useTaskStore.setState({ currentTask: makeTask() });
    await useTaskStore.getState().linkSession("2026-02-26-1", "s1");
    expect(useTaskStore.getState().currentTask).toEqual(task);
  });

  it("does not update currentTask when ids differ", async () => {
    const original = makeTask({ id: "2026-02-26-1" });
    useTaskStore.setState({ currentTask: original });
    mockLinkSession.mockResolvedValue(makeTask({ id: "2026-02-26-2" }));
    await useTaskStore.getState().linkSession("2026-02-26-2", "s1");
    expect(useTaskStore.getState().currentTask).toEqual(original);
  });

  it("updates matching task in tasks array", async () => {
    const t1 = makeTask({ id: "2026-02-26-1", session_ids: "[]" });
    useTaskStore.setState({ tasks: [t1], currentTask: t1 });
    mockLinkSession.mockResolvedValue({ ...t1, session_ids: '["s1"]' });
    await useTaskStore.getState().linkSession("2026-02-26-1", "s1");
    expect(useTaskStore.getState().tasks[0].session_ids).toBe('["s1"]');
  });

  it("passes replacement session ids through to the api", async () => {
    const task = makeTask({ session_ids: '["cli-1"]' });
    mockLinkSession.mockResolvedValue(task);

    await useTaskStore.getState().linkSession(
      "2026-02-26-1",
      "cli-1",
      "Reviewer codex",
      "openai",
      ["runtime-1"],
    );

    expect(mockLinkSession).toHaveBeenCalledWith(
      "2026-02-26-1",
      "cli-1",
      "Reviewer codex",
      "openai",
      ["runtime-1"],
    );
  });
});

describe("remove", () => {
  it("calls api.delete with correct id", async () => {
    await useTaskStore.getState().remove("2026-02-26-1");
    expect(mockDelete).toHaveBeenCalledWith("2026-02-26-1");
  });

  it("calls terminalStore.removeByTaskId", async () => {
    await useTaskStore.getState().remove("2026-02-26-1");
    expect(mockRemoveByTaskId).toHaveBeenCalledWith("2026-02-26-1");
  });

  it("clears currentTask when removing the active task", async () => {
    useTaskStore.setState({ currentTask: makeTask({ id: "2026-02-26-1" }) });
    await useTaskStore.getState().remove("2026-02-26-1");
    expect(useTaskStore.getState().currentTask).toBeNull();
  });

  it("keeps currentTask when removing a different task", async () => {
    useTaskStore.setState({ currentTask: makeTask({ id: "2026-02-26-1" }) });
    await useTaskStore.getState().remove("2026-02-26-2");
    expect(useTaskStore.getState().currentTask?.id).toBe("2026-02-26-1");
  });
});

describe("clearCurrent", () => {
  it("resets currentTask, chatTaskId, chatMessages, and chatStreaming when idle", () => {
    useTaskStore.setState({
      currentTask: makeTask(),
      chatTaskId: "t1",
      chatMessages: [{ role: "user", content: "x" }],
      chatStreaming: false,
    });
    useTaskStore.getState().clearCurrent();
    expect(useTaskStore.getState().currentTask).toBeNull();
    expect(useTaskStore.getState().chatTaskId).toBeNull();
    expect(useTaskStore.getState().chatMessages).toEqual([]);
    expect(useTaskStore.getState().chatStreaming).toBe(false);
  });

  it("keeps streaming chat state when leaving the current task during reply", () => {
    useTaskStore.setState({
      currentTask: makeTask(),
      chatTaskId: "2026-02-26-1",
      chatMessages: [{ role: "assistant", content: "partial" }],
      chatStreaming: true,
    });
    useTaskStore.getState().clearCurrent();
    expect(useTaskStore.getState().currentTask).toBeNull();
    expect(useTaskStore.getState().chatTaskId).toBe("2026-02-26-1");
    expect(useTaskStore.getState().chatMessages).toEqual([{ role: "assistant", content: "partial" }]);
    expect(useTaskStore.getState().chatStreaming).toBe(true);
  });

  it("invalidates pending fetchOne updates after leaving task", async () => {
    const pending = createDeferred<Task>();
    mockGet.mockImplementation(() => pending.promise);

    const request = useTaskStore.getState().fetchOne("2026-02-26-1");
    useTaskStore.getState().clearCurrent();
    pending.resolve(makeTask({ title: "Late response" }));
    await request;

    expect(useTaskStore.getState().currentTask).toBeNull();
  });
});
