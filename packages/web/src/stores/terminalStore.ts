import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { Provider } from "../services/api";

export interface TermSession {
  localId: string;
  id: string;
  cliSessionId: string | null;
  providerId: string;
  providerName: string;
  name: string;
  permissionMode: string;
  taskId: string | null;
  initialPrompt: string | null;
  resumeSessionId: string | null;
}

type SessionIdFields = Pick<TermSession, "id" | "cliSessionId" | "resumeSessionId">;

type LinkedSessionAware = SessionIdFields & Pick<TermSession, "providerId">;

export interface TaskSessionLinkPayload {
  taskId: string;
  sessionId: string;
  providerId: string;
  sessionName?: string;
}

interface TerminalState {
  sessions: TermSession[];
  addSession: (s: TermSession) => void;
  confirmSession: (localId: string, id: string, cliSessionId: string | null) => void;
  updateSessionName: (localId: string, name: string) => void;
  removeSession: (localId: string) => void;
  removeByTaskId: (taskId: string) => void;
  reorderSessions: (sessions: TermSession[]) => void;
  restoreSessions: (
    remote: Array<{
      id: string;
      cliSessionId: string | null;
      providerId: string;
      permissionMode: string;
      taskId: string | null;
    }>,
    providers: Provider[],
  ) => void;
}

const RUNTIME_LINKABLE_PROVIDER_IDS = new Set(["openai"]);

function buildRestoredSession(
  remote: {
    id: string;
    cliSessionId: string | null;
    providerId: string;
    permissionMode: string;
    taskId: string | null;
  },
  providers: Provider[],
): TermSession {
  const provider = providers.find((p) => p.id === remote.providerId);
  return {
    localId: crypto.randomUUID(),
    id: remote.id,
    cliSessionId: remote.cliSessionId || null,
    providerId: remote.providerId,
    providerName: provider?.name || remote.providerId,
    name: `${provider?.name || remote.providerId} ${((remote.cliSessionId || remote.id).slice(0, 6))}`,
    permissionMode: remote.permissionMode,
    taskId: remote.taskId,
    initialPrompt: null,
    resumeSessionId: null,
  };
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  sessions: [],

  addSession: (s) => set((state) => ({ sessions: [...state.sessions, s] })),

  confirmSession: (localId, id, cliSessionId) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.localId === localId ? { ...s, id, cliSessionId } : s,
      ),
    })),

  updateSessionName: (localId, name) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.localId === localId ? { ...s, name: normalizeTerminalName(name) } : s,
      ),
    })),

  removeSession: (localId) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.localId !== localId),
    })),

  removeByTaskId: (taskId) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.taskId !== taskId),
    })),

  reorderSessions: (sessions) => set({ sessions }),

  restoreSessions: (remote, providers) =>
    set((state) => {
      const remoteById = new Map(remote.map((rs) => [rs.id, rs]));
      let changed = false;
      const merged = state.sessions.map((session) => {
        if (!session.id) return session;
        const incoming = remoteById.get(session.id);
        if (!incoming) return session;
        const provider = providers.find((p) => p.id === incoming.providerId);
        const nextCliSessionId = incoming.cliSessionId || session.cliSessionId;
        const nextProviderName = provider?.name || incoming.providerId;
        const nextPermissionMode = incoming.permissionMode || session.permissionMode;
        const nextTaskId = incoming.taskId ?? session.taskId;

        if (
          nextCliSessionId === session.cliSessionId
          && nextProviderName === session.providerName
          && nextPermissionMode === session.permissionMode
          && nextTaskId === session.taskId
        ) {
          return session;
        }

        changed = true;
        return {
          ...session,
          cliSessionId: nextCliSessionId,
          providerName: nextProviderName,
          permissionMode: nextPermissionMode,
          taskId: nextTaskId,
        };
      });

      const existingIds = new Set(merged.filter((s) => s.id).map((s) => s.id));
      const restored = remote
        .filter((rs) => !existingIds.has(rs.id))
        .map((rs) => buildRestoredSession(rs, providers));

      if (!changed && restored.length === 0) return state;
      return { sessions: [...merged, ...restored] };
    }),
}));

export function useTaskSessions(taskId: string) {
  return useTerminalStore(useShallow((s) => s.sessions.filter((x) => x.taskId === taskId)));
}

export function getSessionIdentifiers(session: SessionIdFields): string[] {
  const ids = [session.cliSessionId, session.resumeSessionId, session.id]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set(ids));
}

export function getPreferredLinkedSessionId(session: SessionIdFields): string | null {
  return getSessionIdentifiers(session)[0] || null;
}

export function getPersistableLinkedSessionId(session: SessionIdFields & Pick<TermSession, "providerId">): string | null {
  const cliSessionId = session.cliSessionId?.trim();
  if (cliSessionId) return cliSessionId;

  const resumeSessionId = session.resumeSessionId?.trim();
  if (resumeSessionId) return resumeSessionId;

  const sessionId = session.id.trim();
  if (!sessionId) {
    return null;
  }

  // Codex can recover a runtime session id through the workspace-bound session store.
  // Other fixed-session providers should not persist opaque backend ids until a stable
  // provider session id is available, otherwise refresh/restore will hard fail.
  if (RUNTIME_LINKABLE_PROVIDER_IDS.has(session.providerId)) {
    return sessionId;
  }

  return null;
}

export function buildTaskSessionLinkPayload(
  session: TermSession,
  options?: { includeSessionName?: boolean },
): TaskSessionLinkPayload | null {
  const sessionId = getPersistableLinkedSessionId(session);
  if (!session.taskId || !sessionId) {
    return null;
  }

  return {
    taskId: session.taskId,
    sessionId,
    providerId: session.providerId,
    ...(options?.includeSessionName ? { sessionName: session.name } : {}),
  };
}

export function sessionMatchesLinkedId(session: SessionIdFields, linkedSessionId: string): boolean {
  return getSessionIdentifiers(session).includes(linkedSessionId);
}

export function resolveOpenLinkedSessionIds(
  sessions: LinkedSessionAware[],
  linkedSessionIds: string[],
  linkedSessionProviders: Record<string, string>,
): Set<string> {
  const openIds = new Set<string>();
  const unresolvedSessionsByProvider = new Map<string, LinkedSessionAware[]>();
  const unresolvedLinkedByProvider = new Map<string, string[]>();
  const linkedIdSet = new Set(linkedSessionIds);

  for (const session of sessions) {
    const matchedIds = getSessionIdentifiers(session).filter((id) => linkedIdSet.has(id));
    if (matchedIds.length > 0) {
      for (const id of matchedIds) {
        openIds.add(id);
      }
      continue;
    }

    const items = unresolvedSessionsByProvider.get(session.providerId) || [];
    items.push(session);
    unresolvedSessionsByProvider.set(session.providerId, items);
  }

  const unresolvedLinkedIds: string[] = [];
  const unresolvedSessions: LinkedSessionAware[] = [];
  for (const sessionList of unresolvedSessionsByProvider.values()) {
    unresolvedSessions.push(...sessionList);
  }

  for (const linkedSessionId of linkedSessionIds) {
    if (openIds.has(linkedSessionId)) continue;
    unresolvedLinkedIds.push(linkedSessionId);
    const providerId = linkedSessionProviders[linkedSessionId];
    if (!providerId) continue;
    const items = unresolvedLinkedByProvider.get(providerId) || [];
    items.push(linkedSessionId);
    unresolvedLinkedByProvider.set(providerId, items);
  }

  for (const [providerId, ids] of unresolvedLinkedByProvider.entries()) {
    if (ids.length !== 1) continue;
    const sessionList = unresolvedSessionsByProvider.get(providerId) || [];
    if (sessionList.length === 1) {
      openIds.add(ids[0]);
    }
  }

  if (unresolvedLinkedIds.length === 1 && unresolvedSessions.length === 1) {
    openIds.add(unresolvedLinkedIds[0]);
  }

  return openIds;
}

// Helper: create a new TermSession object
export function makeTermSession(opts: {
  providerId: string;
  providerName: string;
  name?: string | null;
  permissionMode: string;
  taskId?: string | null;
  initialPrompt?: string | null;
  resumeSessionId?: string | null;
}): TermSession {
  return {
    localId: crypto.randomUUID(),
    id: "",
    cliSessionId: null,
    providerId: opts.providerId,
    providerName: opts.providerName,
    name: normalizeTerminalName(opts.name),
    permissionMode: opts.permissionMode,
    taskId: opts.taskId ?? null,
    initialPrompt: opts.initialPrompt ?? null,
    resumeSessionId: opts.resumeSessionId ?? null,
  };
}

const NAME_ADJECTIVES = ["青石", "晨雾", "流云", "银杉", "赤焰", "霜刃", "微光", "远山"];
const NAME_NOUNS = ["工坊", "引擎", "终端", "航站", "节点", "控制台", "实验台", "工位"];

export function generateTerminalName(): string {
  const adjective = NAME_ADJECTIVES[Math.floor(Math.random() * NAME_ADJECTIVES.length)];
  const noun = NAME_NOUNS[Math.floor(Math.random() * NAME_NOUNS.length)];
  const suffix = Math.floor(Math.random() * 90) + 10;
  return `${adjective}${noun}${suffix}`;
}

function normalizeTerminalName(name?: string | null): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return generateTerminalName();
  return trimmed.slice(0, 32);
}
