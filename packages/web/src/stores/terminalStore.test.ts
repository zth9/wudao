import { describe, expect, it } from "vitest";
import {
  buildTaskSessionLinkPayload,
  useTerminalStore,
  getPersistableLinkedSessionId,
  getPreferredLinkedSessionId,
  getSessionIdentifiers,
  resolveOpenLinkedSessionIds,
  sessionMatchesLinkedId,
  type TermSession,
} from "./terminalStore";

function makeSession(overrides: Partial<TermSession> = {}): TermSession {
  return {
    localId: "local-1",
    id: "server-1",
    cliSessionId: null,
    providerId: "openai",
    providerName: "Codex",
    name: "终端",
    permissionMode: "bypassPermissions",
    taskId: "2026-03-06-1",
    initialPrompt: null,
    resumeSessionId: null,
    ...overrides,
  };
}

describe("terminalStore session identifiers", () => {
  it("uses a discovered gemini cli session id when available", () => {
    const session = makeSession({
      providerId: "gemini",
      cliSessionId: "gemini-session-id",
      resumeSessionId: null,
      id: "server-1",
    });

    expect(getPersistableLinkedSessionId(session)).toBe("gemini-session-id");
  });

  it("falls back to backend session id when cli session id is unavailable", () => {
    const session = makeSession();
    expect(getSessionIdentifiers(session)).toEqual(["server-1"]);
    expect(getPreferredLinkedSessionId(session)).toBe("server-1");
  });

  it("prefers cli and resume ids before backend id and matches all of them", () => {
    const session = makeSession({
      id: "server-1",
      cliSessionId: "cli-1",
      resumeSessionId: "resume-1",
    });

    expect(getSessionIdentifiers(session)).toEqual(["cli-1", "resume-1", "server-1"]);
    expect(getPreferredLinkedSessionId(session)).toBe("cli-1");
    expect(sessionMatchesLinkedId(session, "cli-1")).toBe(true);
    expect(sessionMatchesLinkedId(session, "resume-1")).toBe(true);
    expect(sessionMatchesLinkedId(session, "server-1")).toBe(true);
    expect(sessionMatchesLinkedId(session, "missing")).toBe(false);
  });

  it("falls back to backend session ids for fixed-session providers when no cli id is available", () => {
    const session = makeSession({
      providerId: "openai",
      cliSessionId: null,
      resumeSessionId: null,
      id: "server-1",
    });

    expect(getPersistableLinkedSessionId(session)).toBe("server-1");
  });

  it("does not persist opaque runtime session ids for providers without a recoverable cli id", () => {
    const session = makeSession({
      providerId: "gemini",
      cliSessionId: null,
      resumeSessionId: null,
      id: "server-1",
    });

    expect(getPersistableLinkedSessionId(session)).toBe(null);
  });

  it("includes the terminal name only for explicit create-time task linking", () => {
    const session = makeSession({
      providerId: "claude",
      cliSessionId: "claude-session-id",
      name: "我的终端",
    });

    expect(buildTaskSessionLinkPayload(session, { includeSessionName: true })).toEqual({
      taskId: "2026-03-06-1",
      sessionId: "claude-session-id",
      providerId: "claude",
      sessionName: "我的终端",
    });
    expect(buildTaskSessionLinkPayload(session)).toEqual({
      taskId: "2026-03-06-1",
      sessionId: "claude-session-id",
      providerId: "claude",
    });
  });

  it("treats a single restored session on the same provider as already open after refresh", () => {
    const openIds = resolveOpenLinkedSessionIds(
      [
        makeSession({
          id: "server-2",
          cliSessionId: "cli-2",
          providerId: "claude",
          resumeSessionId: null,
        }),
      ],
      ["linked-legacy"],
      { "linked-legacy": "claude" },
    );

    expect(Array.from(openIds)).toEqual(["linked-legacy"]);
  });

  it("does not guess opened state when the same provider has multiple unmatched sessions", () => {
    const openIds = resolveOpenLinkedSessionIds(
      [
        makeSession({ id: "server-2", cliSessionId: "cli-2", providerId: "claude" }),
        makeSession({ localId: "local-2", id: "server-3", cliSessionId: "cli-3", providerId: "claude" }),
      ],
      ["linked-a", "linked-b"],
      { "linked-a": "claude", "linked-b": "claude" },
    );

    expect(Array.from(openIds)).toEqual([]);
  });

  it("refreshes existing sessions with newly discovered cli session ids from the websocket list", () => {
    useTerminalStore.setState({ sessions: [] });
    useTerminalStore.setState({
      sessions: [
        makeSession({
          localId: "local-1",
          id: "server-1",
          providerId: "gemini",
          providerName: "Gemini",
          cliSessionId: null,
          taskId: "2026-03-06-1",
        }),
      ],
    });

    useTerminalStore.getState().restoreSessions(
      [
        {
          id: "server-1",
          cliSessionId: "gemini-session-id",
          providerId: "gemini",
          permissionMode: "bypassPermissions",
          taskId: "2026-03-06-1",
        },
      ],
      [{ id: "gemini", name: "Gemini", endpoint: "", model: "", api_key: null, usage_auth_token: null, usage_cookie: null, is_default: 0, sort_order: 1, created_at: "" }],
    );

    const [session] = useTerminalStore.getState().sessions;
    expect(session.cliSessionId).toBe("gemini-session-id");
    expect(session.providerName).toBe("Gemini");
    useTerminalStore.setState({ sessions: [] });
  });
});
