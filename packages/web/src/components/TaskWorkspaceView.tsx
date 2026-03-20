import { Suspense, lazy, useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useTaskStore } from "../stores/taskStore";
import {
  getSessionIdentifiers,
  sessionMatchesLinkedId,
  useTerminalStore,
  useTaskSessions,
  makeTermSession,
} from "../stores/terminalStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useWs } from "../contexts/WsContext";
import { Header } from "./task-panel/Header";
import { TaskChat } from "./task-panel/TaskChat";
import { parseSessionIds } from "./task-panel/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { cn } from "../utils/cn";
import { LoadingIndicator } from "./LoadingIndicator";
import { buildInitialTaskInfoMessage } from "../utils/task-chat";
import { getArtifactsDragPreview, getCollapsedChatPanelWidth } from "./task-workspace-layout";
import {
  TASK_LIST_DRAWER_BACKDROP_CLASS,
  TASK_LIST_DRAWER_PANEL_CLASS,
} from "./task-panel/task-list-drawer-layout";

const loadTaskListDrawer = () => import("./task-panel/TaskListDrawer");
const loadTaskArtifactsDrawer = () => import("./TaskArtifactsDrawer");
const loadTiledTerminalPanel = () => import("./TiledTerminalPanel");
const loadNewTaskTerminalDialog = () => import("./dialogs/NewTaskTerminalDialog");

const TaskListDrawer = lazy(async () => ({ default: (await loadTaskListDrawer()).TaskListDrawer }));
const TaskArtifactsDrawer = lazy(loadTaskArtifactsDrawer);
const TiledTerminalPanel = lazy(loadTiledTerminalPanel);
const NewTaskTerminalDialog = lazy(async () => ({ default: (await loadNewTaskTerminalDialog()).NewTaskTerminalDialog }));

function TerminalPanelFallback() {
  const { t } = useTranslation();
  return (
    <div className="flex-1 min-w-0 flex flex-col bg-white/30 dark:bg-black/10">
      <div className="h-14 shrink-0 border-b border-black/5 dark:border-white/10 bg-white/50 dark:bg-black/40 px-4 flex items-center">
        <div className="h-4 w-32 rounded bg-black/5 dark:bg-white/5" />
      </div>
      <LoadingIndicator text={t("common.loading")} className="flex-1" />
    </div>
  );
}

function SidePanelFallback() {
  const { t } = useTranslation();
  return (
    <div className="h-full w-full p-4 flex items-center justify-center">
      <LoadingIndicator text={t("common.loading")} />
    </div>
  );
}

function DialogFallback({ onCancel }: { onCancel: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative apple-glass bg-white/90 dark:bg-system-gray-800/90 border border-black/5 dark:border-white/10 rounded-apple-2xl shadow-apple-lg w-full max-w-md overflow-hidden p-8 flex flex-col items-center">
        <LoadingIndicator text={t("common.loading")} />
      </div>
    </div>
  );
}

function TaskListDrawerFallback({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <>
      <div className={cn(TASK_LIST_DRAWER_BACKDROP_CLASS, "z-[60]")} onClick={onClose} />
      <div className={cn(TASK_LIST_DRAWER_PANEL_CLASS, "z-[70] p-4 items-center justify-center")}>
        <LoadingIndicator text={t("common.loading")} />
      </div>
    </>
  );
}

interface Props {
  taskId: string;
  autoStartChat?: boolean;
  onBack: () => void;
  onSwitchTask: (taskId: string, options?: { autoStartChat?: boolean }) => void;
  onAutoStartChatHandled: () => void;
}

export default function TaskWorkspaceView({ taskId, autoStartChat = false, onBack, onSwitchTask, onAutoStartChatHandled }: Props) {
  const { t } = useTranslation();
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [artifactsOpen, setArtifactsOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(40);
  const [isDragging, setIsDragging] = useState(false);
  const draggingRef = useRef(false);
  const { wsReady } = useWs();
  const providers = useSettingsStore((s) => s.providers);
  const defaultProvider = providers.find((p) => p.is_default) || providers[0];
  const sessions = useTaskSessions(taskId);
  const hasProviders = providers.length > 0;

  const [showTaskList, setShowTaskList] = useState(false);
  const [terminalCollapsed, setTerminalCollapsed] = useState(false);
  const [artifactsWidth, setArtifactsWidth] = useState(440);
  const [isArtifactsDragging, setIsArtifactsDragging] = useState(false);

  const chatPanelRef = useRef<HTMLDivElement>(null);
  const artifactsPanelRef = useRef<HTMLDivElement>(null);
  const artifactsInnerRef = useRef<HTMLDivElement>(null);
  const autoStartedTaskIdRef = useRef<string | null>(null);

  const {
    tasks,
    fetch,
    currentTask,
    fetchOne,
    update,
    generating,
    clearCurrent,
    agentTimeline,
    agentChatStreaming,
    sendAgentChatMessage,
    startInitialAgentChat,
    abortAgentChat,
    remove,
    generateDocs,
  } = useTaskStore();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const providerRef = useRef<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F1") {
        e.preventDefault();
        void loadTaskListDrawer();
        setShowTaskList(true);
        return;
      }
      if (e.key === "Escape") {
        if (showTaskList) {
          setShowTaskList(false);
          return;
        }
        const target = e.target as HTMLElement;
        // Do not intercept Escape if typing in input/textarea or using terminal
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target.isContentEditable ||
          target.closest('.xterm')
        ) {
          return;
        }
        onBack();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showTaskList, onBack]);

  useEffect(() => {
    fetchOne(taskId);
    return () => clearCurrent();
  }, [taskId, fetchOne, clearCurrent]);

  useEffect(() => {
    if (showTaskList) {
      void loadTaskListDrawer();
      fetch();
    }
  }, [showTaskList, fetch]);

  useEffect(() => {
    if (!terminalCollapsed) {
      void loadTiledTerminalPanel();
    }
  }, [terminalCollapsed]);

  useEffect(() => {
    if (artifactsOpen) {
      void loadTaskArtifactsDrawer();
    }
  }, [artifactsOpen]);

  useEffect(() => {
    if (showNewDialog) {
      void loadNewTaskTerminalDialog();
    }
  }, [showNewDialog]);

  useEffect(() => {
    providerRef.current = currentTask?.provider_id ?? null;
  }, [currentTask?.provider_id]);


  useEffect(() => {
    if (!autoStartChat) return;
    if (!currentTask || currentTask.id !== taskId) return;
    if (agentChatStreaming) return;

    if (agentTimeline.length > 0) {
      onAutoStartChatHandled();
      return;
    }

    if (autoStartedTaskIdRef.current === taskId) return;
    autoStartedTaskIdRef.current = taskId;
    const seedMessage = buildInitialTaskInfoMessage(currentTask, t);
    startInitialAgentChat(taskId, seedMessage, currentTask.provider_id ?? providerRef.current ?? undefined);
    onAutoStartChatHandled();
  }, [
    autoStartChat,
    currentTask,
    taskId,
    agentChatStreaming,
    agentTimeline.length,
    startInitialAgentChat,
    onAutoStartChatHandled,
    t,
  ]);

  const handleUpdate = useCallback(
    (data: any) => {
      void update(taskId, data);
    },
    [taskId, update]
  );

  const handleProviderChange = useCallback(
    (providerId: string) => {
      providerRef.current = providerId;
      if (currentTask?.provider_id === providerId) return;
      void update(taskId, { provider_id: providerId });
    },
    [currentTask?.provider_id, taskId, update]
  );

  const handleGenerateDocs = useCallback(async () => {
    void loadTaskArtifactsDrawer();
    await generateDocs(taskId, providerRef.current ?? undefined);
    setArtifactsOpen(true);
  }, [generateDocs, taskId]);

  const handleToggleArtifacts = useCallback(() => {
    if (!artifactsOpen) {
      void loadTaskArtifactsDrawer();
    }
    setArtifactsOpen((current) => !current);
  }, [artifactsOpen]);

  const handleShowNewDialog = useCallback(() => {
    void loadNewTaskTerminalDialog();
    setShowNewDialog(true);
  }, []);

  const handleOpenTaskList = useCallback(() => {
    void loadTaskListDrawer();
    setShowTaskList(true);
  }, []);

  const handleToggleStatus = useCallback(() => {
    if (!currentTask) return;
    void update(taskId, { status: currentTask.status === "done" ? "execution" : "done" });
  }, [currentTask, taskId, update]);

  const handleDeleteConfirm = useCallback(async () => {
    await remove(taskId);
    onBack();
  }, [remove, taskId, onBack]);

  const persistedSessionNames = useMemo(() => {
    if (!currentTask || currentTask.id !== taskId) return {} as Record<string, string>;
    try {
      const parsed = JSON.parse(currentTask.session_names || "{}") as Record<string, string>;
      const result: Record<string, string> = {};
      for (const [sid, name] of Object.entries(parsed)) {
        if (typeof sid === "string" && typeof name === "string" && sid) {
          result[sid] = name;
        }
      }
      return result;
    } catch {
      return {} as Record<string, string>;
    }
  }, [currentTask, taskId]);

  const persistedSessionProviders = useMemo(() => {
    if (!currentTask || currentTask.id !== taskId) return {} as Record<string, string>;
    try {
      const parsed = JSON.parse(currentTask.session_providers || "{}") as Record<string, string>;
      const result: Record<string, string> = {};
      for (const [sid, providerId] of Object.entries(parsed)) {
        if (typeof sid === "string" && typeof providerId === "string" && sid && providerId) {
          result[sid] = providerId;
        }
      }
      return result;
    } catch {
      return {} as Record<string, string>;
    }
  }, [currentTask, taskId]);

  useEffect(() => {
    const names = persistedSessionNames;
    if (Object.keys(names).length === 0) return;
    const store = useTerminalStore.getState();
    for (const session of sessions) {
      const matchedId = getSessionIdentifiers(session).find((linkedId) => names[linkedId]);
      if (matchedId && names[matchedId] !== session.name) {
        store.updateSessionName(session.localId, names[matchedId]);
      }
    }
  }, [persistedSessionNames, sessions]);

  const linkedSessionNameMap = useMemo(() => {
    const map: Record<string, string> = { ...persistedSessionNames };
    for (const s of sessions) {
      for (const linkedId of getSessionIdentifiers(s)) {
        map[linkedId] = s.name;
      }
    }
    return map;
  }, [persistedSessionNames, sessions]);

  const linkedSessionIds = useMemo(
    () => parseSessionIds(currentTask?.session_ids || "[]"),
    [currentTask?.session_ids]
  );

  const initialPrompt = useMemo(() => {
    if (!currentTask || currentTask.id !== taskId) return null;
    if (!currentTask.agent_doc) return null;
    return t("terminal.initial_prompt");
  }, [currentTask, taskId, t]);

  const createTaskSession = useCallback((opts: {
    taskId: string;
    providerId: string;
    permissionMode: string;
    name?: string | null;
    initialPrompt?: string | null;
    resumeSessionId?: string | null;
  }) => {
    const provider = providers.find((p) => p.id === opts.providerId);
    if (!provider) return;

    const session = makeTermSession({
      providerId: provider.id,
      providerName: provider.name,
      name: opts.name,
      permissionMode: opts.permissionMode,
      taskId: opts.taskId,
      initialPrompt: opts.initialPrompt ?? null,
      resumeSessionId: opts.resumeSessionId ?? null,
    });
    useTerminalStore.getState().addSession(session);
  }, [providers]);

  const resolveLinkedSessionName = useCallback((linkedSessionId: string) => {
    const saved = linkedSessionNameMap[linkedSessionId];
    if (typeof saved === "string" && saved.trim()) {
      return saved;
    }
    return `Session ${linkedSessionId.slice(0, 8)}`;
  }, [linkedSessionNameMap]);

  const resolveLinkedSessionProviderId = useCallback((linkedSessionId: string) => {
    const linkedProviderId = persistedSessionProviders[linkedSessionId];
    if (linkedProviderId && providers.some((p) => p.id === linkedProviderId)) {
      return linkedProviderId;
    }

    const live = sessions.find((session) => sessionMatchesLinkedId(session, linkedSessionId));
    if (live && providers.some((p) => p.id === live.providerId)) {
      return live.providerId;
    }

    if (currentTask?.provider_id && providers.some((p) => p.id === currentTask.provider_id)) {
      return currentTask.provider_id;
    }

    const fallback = providers.find((p) => p.id === "claude") || defaultProvider || providers[0];
    return fallback?.id || null;
  }, [persistedSessionProviders, sessions, providers, currentTask?.provider_id, defaultProvider]);

  const handleNavigateToSession = useCallback((linkedSessionId: string, tid: string) => {
    const exists = sessions.some((session) => sessionMatchesLinkedId(session, linkedSessionId));
    if (exists) return;

    const providerId = resolveLinkedSessionProviderId(linkedSessionId);
    if (!providerId) return;
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return;
    createTaskSession({
      taskId: tid,
      providerId: provider.id,
      permissionMode: "bypassPermissions",
      name: resolveLinkedSessionName(linkedSessionId),
      resumeSessionId: linkedSessionId,
    });
  }, [sessions, providers, createTaskSession, resolveLinkedSessionName, resolveLinkedSessionProviderId]);

  const handleRestoreAllSessions = useCallback((linkedSessionIds: string[], tid: string) => {
    if (linkedSessionIds.length === 0) return;

    const existing = new Set<string>();
    for (const session of sessions) {
      for (const linkedId of getSessionIdentifiers(session)) {
        existing.add(linkedId);
      }
    }

    for (const linkedSessionId of linkedSessionIds) {
      if (!linkedSessionId || existing.has(linkedSessionId)) continue;
      const providerId = resolveLinkedSessionProviderId(linkedSessionId);
      if (!providerId) continue;
      const provider = providers.find((p) => p.id === providerId);
      if (!provider) continue;
      existing.add(linkedSessionId);
      createTaskSession({
        taskId: tid,
        providerId: provider.id,
        permissionMode: "bypassPermissions",
        name: resolveLinkedSessionName(linkedSessionId),
        resumeSessionId: linkedSessionId,
      });
    }
  }, [sessions, providers, createTaskSession, resolveLinkedSessionName, resolveLinkedSessionProviderId]);

  const containerRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    setIsDragging(true);
    let currentPct = panelWidth;

    // Add an overlay to prevent iframe/terminal from capturing mouse events during drag
    const overlay = document.createElement("div");
    overlay.style.position = "absolute";
    overlay.style.inset = "0";
    overlay.style.zIndex = "9999";
    overlay.style.cursor = "col-resize";
    document.body.appendChild(overlay);

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      currentPct = Math.min(Math.max(pct, 20), 80);

      if (chatPanelRef.current) {
        chatPanelRef.current.style.width = `${currentPct}%`;
      }
    };
    const onUp = () => {
      draggingRef.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);

      setPanelWidth(currentPct);

      setTimeout(() => {
        setIsDragging(false);
        // Wait for the next tick after state updates to let the DOM settle before measuring
        setTimeout(() => window.dispatchEvent(new Event("resize")), 10);
      }, 50);
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [panelWidth]);

  const handleArtifactsDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    setIsArtifactsDragging(true);
    let currentWidth = artifactsWidth;

    const overlay = document.createElement("div");
    overlay.style.position = "absolute";
    overlay.style.inset = "0";
    overlay.style.zIndex = "9999";
    overlay.style.cursor = "col-resize";
    document.body.appendChild(overlay);

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const { artifactsWidth: nextWidth, chatPanelWidth } = getArtifactsDragPreview({
        containerRight: rect.right,
        pointerClientX: ev.clientX,
        terminalCollapsed,
        viewportWidth: window.innerWidth,
      });
      currentWidth = nextWidth;

      if (artifactsPanelRef.current) {
        artifactsPanelRef.current.style.width = `${currentWidth}px`;
      }
      if (artifactsInnerRef.current) {
        artifactsInnerRef.current.style.width = `${currentWidth}px`;
      }
      if (chatPanelRef.current && chatPanelWidth) {
        chatPanelRef.current.style.width = chatPanelWidth;
      }
    };
    const onUp = () => {
      draggingRef.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);

      // Update width state first while isArtifactsDragging is still true (duration: 0)
      setArtifactsWidth(currentWidth);

      // Delay disabling the dragging state to skip the spring animation for the final width update
      setTimeout(() => {
        setIsArtifactsDragging(false);
        // Ensure everything is perfectly aligned at the end, after DOM has settled
        setTimeout(() => window.dispatchEvent(new Event("resize")), 10);
      }, 50);
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [artifactsWidth, terminalCollapsed]);

  if (!currentTask) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background-secondary dark:bg-black/40">
        <LoadingIndicator text={t("tasks.loading_task")} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-background-secondary dark:bg-black relative">
      {/* Top Navigation Bar */}
      <Header
        task={currentTask}
        onBack={onBack}
        onSwitchTask={onSwitchTask}
        onUpdate={handleUpdate}
        onToggleStatus={handleToggleStatus}
        showDeleteConfirm={showDeleteConfirm}
        onDeleteClick={() => setShowDeleteConfirm(true)}
        onDeleteCancel={() => setShowDeleteConfirm(false)}
        onDeleteConfirm={() => void handleDeleteConfirm()}
        artifactsOpen={artifactsOpen}
        onToggleArtifacts={handleToggleArtifacts}
        terminalOpen={!terminalCollapsed}
        onToggleTerminal={() => setTerminalCollapsed(!terminalCollapsed)}
        onOpenTaskList={handleOpenTaskList}
      />

      <div ref={containerRef} className="flex-1 min-h-0 flex flex-row overflow-hidden relative">
        {/* Chat Area (Left) */}
        <motion.div
          ref={chatPanelRef}
          layout={false}
          initial={false}
          animate={{
            width: terminalCollapsed
              ? (artifactsOpen ? getCollapsedChatPanelWidth(artifactsWidth) : "100%")
              : `${panelWidth}%`,
          }}
          transition={isDragging || isArtifactsDragging ? { duration: 0 } : { type: "spring", damping: 30, stiffness: 200 }}
          className={cn(
            "flex flex-col min-h-0 border-r border-black/5 dark:border-white/10 bg-white/20 dark:bg-white/5 shrink-0",
            terminalCollapsed && "border-r-0"
          )}
          style={{ minWidth: 320 }}
        >
          <TaskChat
            taskId={taskId}
            taskProviderId={currentTask.provider_id}
            items={agentTimeline}
            streaming={agentChatStreaming}
            agentDoc={currentTask.agent_doc}
            generatingDocs={generating}
            onGenerateDocs={() => void handleGenerateDocs()}
            onSend={(message, providerId) => sendAgentChatMessage(taskId, message, providerId)}
            onProviderChange={handleProviderChange}
            onAbort={abortAgentChat}
          />
        </motion.div>

        {/* Resizer */}
        {!terminalCollapsed && (
          <div
            onMouseDown={handleDragStart}
            className="w-[1px] shrink-0 cursor-col-resize bg-black/5 dark:bg-white/5 hover:bg-apple-blue dark:hover:bg-apple-blue transition-colors group relative"
          >
             <div className="absolute inset-y-0 -left-1 -right-1 z-20" />
          </div>
        )}

        {/* Terminal Area (Right/Middle) */}
        {!terminalCollapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={isDragging || isArtifactsDragging ? { duration: 0 } : { duration: 0.14, ease: "easeOut" }}
            className="min-w-0 flex flex-col relative overflow-hidden flex-1"
          >
            <Suspense fallback={<TerminalPanelFallback />}>
              <TiledTerminalPanel
                taskId={taskId}
                onNewTerminal={handleShowNewDialog}
                wsReady={wsReady}
                hasProviders={hasProviders}
                linkedSessionIds={linkedSessionIds}
                linkedSessionNameMap={linkedSessionNameMap}
                linkedSessionProviderMap={persistedSessionProviders}
                onRestoreSession={(sessionId) => handleNavigateToSession(sessionId, taskId)}
                onRestoreAll={() => handleRestoreAllSessions(linkedSessionIds, taskId)}
              />
            </Suspense>
          </motion.div>
        )}

        {/* Artifacts Resizer */}
        {artifactsOpen && (
          <div
            onMouseDown={handleArtifactsDragStart}
            className="w-[1px] shrink-0 cursor-col-resize bg-black/5 dark:bg-white/5 hover:bg-apple-blue dark:hover:bg-apple-blue transition-colors group relative z-30"
          >
             <div className="absolute inset-y-0 -left-1 -right-1 z-20" />
          </div>
        )}

        {/* Artifacts Area (Right) */}
        <AnimatePresence initial={false}>
          {artifactsOpen && (
            <motion.div
              ref={artifactsPanelRef}
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: artifactsWidth, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={isArtifactsDragging ? { duration: 0 } : { type: "spring", damping: 25, stiffness: 200 }}
              className="shrink-0 flex flex-col overflow-hidden bg-white/50 dark:bg-black/40"
            >
              <div ref={artifactsInnerRef} style={{ width: artifactsWidth }} className="h-full flex flex-col min-h-0">
                <Suspense fallback={<SidePanelFallback />}>
                  <TaskArtifactsDrawer
                    taskId={taskId}
                    agentDoc={currentTask?.id === taskId ? currentTask.agent_doc : null}
                    onClose={() => setArtifactsOpen(false)}
                  />
                </Suspense>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {showNewDialog && (
        <Suspense fallback={<DialogFallback onCancel={() => setShowNewDialog(false)} />}>
          <NewTaskTerminalDialog
            providers={providers}
            defaultProviderId={defaultProvider?.id || providers[0]?.id || ""}
            onConfirm={(providerId, permissionMode, name) => {
              setShowNewDialog(false);
              createTaskSession({
                taskId,
                providerId,
                permissionMode,
                name,
                initialPrompt,
              });
            }}
            onCancel={() => setShowNewDialog(false)}
          />
        </Suspense>
      )}

      {showTaskList && (
        <Suspense fallback={<TaskListDrawerFallback onClose={() => setShowTaskList(false)} />}>
          <TaskListDrawer
            isOpen={showTaskList}
            onClose={() => setShowTaskList(false)}
            tasks={tasks}
            currentTaskId={taskId}
            onSwitchTask={onSwitchTask}
          />
        </Suspense>
      )}
    </div>
  );
}
