import { useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { useWs } from "../contexts/WsContext";
import { system } from "../services/api";
import { isRenderableTerminalViewport, shouldSyncTerminalSize } from "./terminal-resize";
import "@xterm/xterm/css/xterm.css";

interface Props {
  sessionId: string | null;
  providerId: string;
  permissionMode?: string;
  taskId?: string | null;
  initialPrompt?: string | null;
  resumeSessionId?: string | null;
  /** Stable local ID echoed back by server in "created" message */
  clientRef?: string;
}

export default function TerminalView({ sessionId, providerId, permissionMode, taskId, initialPrompt, resumeSessionId, clientRef }: Props) {
  const { t } = useTranslation();
  const { wsRef, wsReady } = useWs();
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const createdRef = useRef(false);
  const sizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const sessionIdRef = useRef<string | null>(sessionId);
  const provisionalSessionIdRef = useRef<string | null>(sessionId);
  const pendingSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const lastSyncedSizeRef = useRef<{ cols: number; rows: number } | null>(null);

  const sendMsg = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, [wsRef]);

  const getRouteSessionId = useCallback(() => {
    return sessionIdRef.current || provisionalSessionIdRef.current || undefined;
  }, []);

  const syncSizeToBackend = useCallback((cols: number, rows: number) => {
    const nextSize = { cols, rows };
    if (!shouldSyncTerminalSize(nextSize, lastSyncedSizeRef.current)) {
      pendingSizeRef.current = null;
      return true;
    }
    const routedSessionId = getRouteSessionId();
    if (!routedSessionId) {
      pendingSizeRef.current = nextSize;
      return false;
    }
    const sent = sendMsg({ type: "resize", sessionId: routedSessionId, cols, rows });
    if (!sent) {
      pendingSizeRef.current = nextSize;
      return false;
    }
    lastSyncedSizeRef.current = nextSize;
    pendingSizeRef.current = null;
    return true;
  }, [sendMsg, getRouteSessionId]);

  const flushPendingResize = useCallback(() => {
    const pending = pendingSizeRef.current;
    if (!pending) return false;

    const routedSessionId = getRouteSessionId();
    if (!routedSessionId) return false;

    const sent = sendMsg({
      type: "resize",
      sessionId: routedSessionId,
      cols: pending.cols,
      rows: pending.rows,
    });
    if (!sent) return false;
    lastSyncedSizeRef.current = pending;
    pendingSizeRef.current = null;
    return true;
  }, [sendMsg, getRouteSessionId]);

  // Keep sessionIdRef in sync with prop
  useEffect(() => {
    sessionIdRef.current = sessionId;
    if (sessionId) {
      provisionalSessionIdRef.current = sessionId;
      flushPendingResize();
    }
  }, [sessionId, flushPendingResize]);

  useEffect(() => {
    if (!wsReady && !sessionIdRef.current) {
      createdRef.current = false;
      provisionalSessionIdRef.current = null;
      pendingSizeRef.current = null;
      lastSyncedSizeRef.current = null;
    }
  }, [wsReady]);

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      lineHeight: 1,
      letterSpacing: 0,
      fontFamily: '"Intel One Mono", "Sarasa Mono SC", monospace',
      theme: {
        background: "#09090b",
        foreground: "#e4e4e7",
        cursor: "#e4e4e7",
        selectionBackground: "#3f3f46",
        black: "#09090b",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#eab308",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#e4e4e7",
        brightBlack: "#52525b",
        brightRed: "#f87171",
        brightGreen: "#4ade80",
        brightYellow: "#facc15",
        brightBlue: "#60a5fa",
        brightMagenta: "#c084fc",
        brightCyan: "#22d3ee",
        brightWhite: "#fafafa",
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    const unicode11 = new Unicode11Addon();
    term.loadAddon(unicode11);
    term.unicode.activeVersion = "11";

    term.open(containerRef.current);
    termRef.current = term;

    // Custom link provider: detect file paths and open in Finder on click
    const pathLinkProvider = term.registerLinkProvider({
      provideLinks(y, callback) {
        const line = term.buffer.active.getLine(y - 1);
        if (!line) { callback(undefined); return; }
        const text = line.translateToString();
        // Match ~/... paths and absolute paths with at least 2 segments
        const regex = /~\/[^\s\x00-\x1f]+|\/(?:Users|home|tmp|var|opt)[^\s\x00-\x1f]*(?:\/[^\s\x00-\x1f]+)+/g;
        const links: Array<{
          range: { start: { x: number; y: number }; end: { x: number; y: number } };
          text: string;
          decorations: { pointerCursor: boolean; underline: boolean };
          activate: (_event: MouseEvent, linkText: string) => void;
        }> = [];
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
          // Strip trailing punctuation that's not part of the path
          const cleaned = match[0].replace(/[,;:)}\]'"]+$/, "");
          links.push({
            range: {
              start: { x: match.index + 1, y },
              end: { x: match.index + cleaned.length + 1, y },
            },
            text: cleaned,
            decorations: { pointerCursor: true, underline: true },
            activate: (_event, linkText) => {
              system.openPath(linkText).catch(() => {});
            },
          });
        }
        callback(links.length > 0 ? links : undefined);
      },
    });

    // Send input to backend (include sessionId for multi-terminal routing)
    term.onData((data) => {
      const routedSessionId = getRouteSessionId();
      if (!routedSessionId) return;
      sendMsg({ type: "input", sessionId: routedSessionId, data });
    });

    let disposed = false;
    const fitAndSyncSize = () => {
      if (disposed) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (!isRenderableTerminalViewport({ width: rect.width, height: rect.height })) {
        return;
      }
      try {
        fitAddon.fit();
        if (term.rows > 0) {
          term.refresh(0, term.rows - 1);
        }
        if (term.cols > 0 && term.rows > 0) {
          sizeRef.current = { cols: term.cols, rows: term.rows };
          syncSizeToBackend(term.cols, term.rows);
        }
      } catch (e) {
        // fit might fail if container is 0 size or hidden
      }
    };

    let fitTimeout: number | null = null;
    const debouncedFit = () => {
      if (fitTimeout !== null) {
        window.clearTimeout(fitTimeout);
      }
      fitTimeout = window.setTimeout(() => {
        fitAndSyncSize();
      }, 150);
    };

    const resizeDisposable = term.onResize(({ cols, rows }) => {
      sizeRef.current = { cols, rows };
      syncSizeToBackend(cols, rows);
    });

    const observer = new ResizeObserver(() => {
      debouncedFit();
    });
    observer.observe(containerRef.current);
    const handleViewportResize = () => debouncedFit();
    window.addEventListener("resize", handleViewportResize);
    window.visualViewport?.addEventListener("resize", handleViewportResize);

    const fontSet = document.fonts;
    const handleFontsLoaded = () => fitAndSyncSize(); // Fonts loaded needs immediate fit
    if (fontSet) {
      void fontSet.ready.then(handleFontsLoaded);
      fontSet.addEventListener("loadingdone", handleFontsLoaded);
    }

    fitAndSyncSize();

    return () => {
      disposed = true;
      if (fitTimeout !== null) {
        window.clearTimeout(fitTimeout);
      }
      resizeDisposable.dispose();
      pathLinkProvider.dispose();
      observer.disconnect();
      window.removeEventListener("resize", handleViewportResize);
      window.visualViewport?.removeEventListener("resize", handleViewportResize);
      if (fontSet) {
        fontSet.removeEventListener("loadingdone", handleFontsLoaded);
      }
      term.dispose();
      termRef.current = null;
      sizeRef.current = null;
    };
  }, [sendMsg, getRouteSessionId, syncSizeToBackend]);

  // Handle WS messages for this terminal
  useEffect(() => {
    if (!wsReady) return;
    const ws = wsRef.current;
    if (!ws) return;

    const handler = (e: MessageEvent) => {
      let msg: { type: string; [key: string]: unknown };
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }

      if (
        msg.type === "created" &&
        clientRef &&
        msg.clientRef === clientRef &&
        typeof msg.sessionId === "string"
      ) {
        provisionalSessionIdRef.current = msg.sessionId;
        flushPendingResize();
      }

      // Skip messages meant for other sessions
      const routedSessionId = sessionIdRef.current || provisionalSessionIdRef.current;
      if (
        typeof msg.sessionId === "string" &&
        (!routedSessionId || msg.sessionId !== routedSessionId)
      ) {
        return;
      }

      if (
        msg.type === "error" &&
        typeof msg.clientRef === "string" &&
        clientRef &&
        msg.clientRef !== clientRef
      ) {
        return;
      }

      if (msg.type === "snapshot") {
        termRef.current?.reset();
        termRef.current?.write(msg.data as string);
      } else if (msg.type === "output") {
        termRef.current?.write(msg.data as string);
      } else if (msg.type === "exit") {
        termRef.current?.write(`\r\n[${t("terminal.process_exit", { code: String(msg.exitCode ?? "") })}]\r\n`);
      } else if (msg.type === "error") {
        termRef.current?.write(`\r\n[${t("terminal.error_prefix")}] ${String(msg.message ?? "")}\r\n`);
      }
    };

    ws.addEventListener("message", handler);
    return () => ws.removeEventListener("message", handler);
  }, [wsRef, wsReady, clientRef, flushPendingResize, t]);

  // Create or attach session when sessionId/providerId changes
  useEffect(() => {
    if (!termRef.current || !wsReady) return;
    const term = termRef.current;

    if (!sessionId && !createdRef.current) {
      // Create new session
      provisionalSessionIdRef.current = null;
      const cols = term.cols;
      const rows = term.rows;
      const sent = sendMsg({
        type: "create",
        providerId,
        permissionMode,
        taskId,
        clientRef: clientRef || undefined,
        resumeSessionId: resumeSessionId || undefined,
        initialInput: initialPrompt || undefined,
        cols,
        rows,
      });
      if (sent) createdRef.current = true;
    } else if (sessionId) {
      sendMsg({ type: "attach", sessionId });
      const currentSize = sizeRef.current;
      if (currentSize) {
        syncSizeToBackend(currentSize.cols, currentSize.rows);
      }
    }
  }, [
    sessionId,
    providerId,
    permissionMode,
    taskId,
    resumeSessionId,
    initialPrompt,
    clientRef,
    wsReady,
    sendMsg,
    syncSizeToBackend,
  ]);

  return (
    <div className="flex-1 h-full min-w-0 min-h-0 overflow-hidden">
      <div ref={containerRef} className="terminal-host w-full h-full min-w-0 min-h-0 transition-none !transition-none" />
    </div>
  );
}
