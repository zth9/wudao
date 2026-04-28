import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { buildTaskSessionLinkPayload, useTerminalStore } from "../stores/terminalStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useTaskStore } from "../stores/taskStore";

interface WsContextValue {
  wsRef: React.MutableRefObject<WebSocket | null>;
  wsReady: boolean;
}

const WsContext = createContext<WsContextValue>({
  wsRef: { current: null },
  wsReady: false,
});

export function useWs() {
  return useContext(WsContext);
}

function getWsUrl() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws/terminal`;
}

export function WsProvider({ children }: { children: ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null);
  const [wsReady, setWsReady] = useState(false);
  const providers = useSettingsStore((s) => s.providers);
  const providersRef = useRef(providers);
  useEffect(() => { providersRef.current = providers; }, [providers]);

  // Create WebSocket connection
  useEffect(() => {
    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;
    ws.onopen = () => setWsReady(true);
    ws.onclose = () => setWsReady(false);
    return () => ws.close();
  }, []);

  // Request session list on connect
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || !wsReady) return;
    ws.send(JSON.stringify({ type: "list" }));
  }, [wsReady]);

  // Dispatch incoming messages to terminalStore
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;

    const handler = (e: MessageEvent) => {
      let msg: { type: string; [key: string]: unknown };
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }

      const store = useTerminalStore.getState();

      const getReplacementSessionIds = (session: { id: string; cliSessionId: string | null }, linkedSessionId: string) => {
        const runtimeSessionId = session.id.trim();
        if (!runtimeSessionId || runtimeSessionId === linkedSessionId) {
          return undefined;
        }
        return [runtimeSessionId];
      };

      if (msg.type === "created") {
        const clientRef = msg.clientRef as string | undefined;
        const sessionId = msg.sessionId as string;
        const cliSessionId = (msg.cliSessionId as string) || null;

        if (clientRef) {
          store.confirmSession(clientRef, sessionId, cliSessionId);
        } else {
          // Fallback: match last session with empty id
          const reversed = [...store.sessions].reverse();
          const last = reversed.find((session) => !session.id);
          if (last) {
            store.confirmSession(last.localId, sessionId, cliSessionId);
          }
        }

        // Link to task if applicable
        const confirmed = useTerminalStore.getState().sessions.find((s) => s.id === sessionId);
        if (confirmed) {
          const linkPayload = buildTaskSessionLinkPayload(confirmed, { includeSessionName: true });
          if (!linkPayload) return;
          useTaskStore.getState().linkSession(
            linkPayload.taskId,
            linkPayload.sessionId,
            linkPayload.sessionName,
            linkPayload.providerId,
            getReplacementSessionIds(confirmed, linkPayload.sessionId),
          );
        }
      }

      if (msg.type === "sessions") {
        const remoteSessions = msg.sessions as Array<{
          id: string;
          cliSessionId: string | null;
          providerId: string;
          permissionMode: string;
          taskId: string | null;
        }>;
        store.restoreSessions(remoteSessions, providersRef.current);

        const updatedSessions = useTerminalStore.getState().sessions;
        for (const remoteSession of remoteSessions) {
          const restored = updatedSessions.find((session) => session.id === remoteSession.id);
          if (!restored) continue;
          const linkPayload = buildTaskSessionLinkPayload(restored);
          if (!linkPayload) continue;
          useTaskStore.getState().linkSession(
            linkPayload.taskId,
            linkPayload.sessionId,
            linkPayload.sessionName,
            linkPayload.providerId,
            getReplacementSessionIds(restored, linkPayload.sessionId),
          );
        }
      }
    };

    ws.addEventListener("message", handler);
    return () => ws.removeEventListener("message", handler);
  }, [wsReady]);

  return (
    <WsContext.Provider value={{ wsRef, wsReady }}>
      {children}
    </WsContext.Provider>
  );
}
