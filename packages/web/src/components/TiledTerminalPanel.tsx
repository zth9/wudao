import { useState, useCallback, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus,
  RotateCcw,
  Terminal as TerminalIcon,
  History,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  resolveOpenLinkedSessionIds,
  useTerminalStore,
  useTaskSessions,
  type TermSession,
} from "../stores/terminalStore";
import TerminalTile from "./TerminalTile";
import { TaskWorkspaceDrawerShell } from "./TaskWorkspaceDrawerShell";
import { useWs } from "../contexts/WsContext";
import { cn } from "../utils/cn";

interface Props {
  taskId: string;
  onNewTerminal: () => void;
  onClosePanel: () => void;
  wsReady: boolean;
  hasProviders: boolean;
  linkedSessionIds: string[];
  linkedSessionNameMap: Record<string, string>;
  linkedSessionProviderMap: Record<string, string>;
  onRestoreSession: (sessionId: string) => void;
  onRestoreAll: () => void;
}

export default function TiledTerminalPanel({
  taskId,
  onNewTerminal,
  onClosePanel,
  wsReady,
  hasProviders,
  linkedSessionIds,
  linkedSessionNameMap,
  linkedSessionProviderMap,
  onRestoreSession,
  onRestoreAll,
}: Props) {
  const { t } = useTranslation();
  const sessions = useTaskSessions(taskId);
  const { reorderSessions } = useTerminalStore();
  const { wsRef } = useWs();
  const [activeId, setActiveId] = useState<string | null>(null);
  const canLaunch = wsReady && hasProviders;

  const openLinkedSessionIds = useMemo(() => {
    return resolveOpenLinkedSessionIds(sessions, linkedSessionIds, linkedSessionProviderMap);
  }, [sessions, linkedSessionIds, linkedSessionProviderMap]);

  const restorableCount = useMemo(
    () => linkedSessionIds.filter((id) => !openLinkedSessionIds.has(id)).length,
    [linkedSessionIds, openLinkedSessionIds],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const allSessions = useTerminalStore.getState().sessions;
    const taskLocalIds = sessions.map((s) => s.localId);
    const oldIndex = taskLocalIds.indexOf(active.id as string);
    const newIndex = taskLocalIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(taskLocalIds, oldIndex, newIndex);
    const taskMap = new Map(sessions.map((s) => [s.localId, s]));
    const reorderedSet = new Set(reordered);
    let reorderIndex = 0;
    const result = allSessions.map((session) =>
      reorderedSet.has(session.localId) ? taskMap.get(reordered[reorderIndex++])! : session,
    );
    reorderSessions(result);
  }, [sessions, reorderSessions]);

  const handleClose = useCallback((localId: string, sessionId: string) => {
    const ws = wsRef.current;
    if (sessionId && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "close", sessionId }));
    }
    useTerminalStore.getState().removeSession(localId);
  }, [wsRef]);

  const gridCols = sessions.length === 1 ? 1 : sessions.length <= 4 ? 2 : 3;

  return (
    <TaskWorkspaceDrawerShell
      title={t("terminal_panel.title")}
      icon={TerminalIcon}
      onClose={onClosePanel}
      headerActions={(
        <>
          {linkedSessionIds.length > 0 && (
            <button
              onClick={onRestoreAll}
              disabled={!canLaunch || restorableCount === 0}
              className="apple-btn-secondary h-8 px-3 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-30"
            >
              <RotateCcw size={14} className="text-system-gray-400 dark:text-system-gray-300" />
              {t("terminal_panel.restore_all")}
            </button>
          )}

          <button
            onClick={onNewTerminal}
            disabled={!canLaunch}
            className="apple-btn-primary h-8 px-3 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-apple-sm"
          >
            <Plus size={16} />
            {t("terminal_panel.new_terminal")}
          </button>
        </>
      )}
    >
      <div className="shrink-0 border-b border-black/5 bg-white/35 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="px-4 py-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-system-gray-400 dark:text-system-gray-300 truncate">
              {sessions.length > 0
                ? t("terminal_panel.sessions_summary", { count: sessions.length })
                : t("terminal_panel.not_started")}
            </span>
            {linkedSessionIds.length > 0 && (
              <span className="shrink-0 rounded-full bg-black/5 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-system-gray-500 dark:bg-white/5 dark:text-system-gray-300">
                {t("terminal_panel.linked")}
              </span>
            )}
          </div>

          {linkedSessionIds.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-apple-lg bg-black/5 dark:bg-white/5 border border-dashed border-black/10 dark:border-white/10">
              <History size={12} className="text-system-gray-400 dark:text-system-gray-300" />
              <p className="text-[10px] font-medium text-system-gray-400 dark:text-system-gray-300">{t("terminal_panel.no_linked_sessions")}</p>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-system-gray-100 dark:bg-system-gray-800 text-system-gray-500 dark:text-system-gray-400 shrink-0">
                <History size={12} />
                <span className="text-[10px] font-bold uppercase tracking-tight">{t("terminal_panel.linked")}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 min-w-0">
                {linkedSessionIds.map((sessionId) => {
                  const isOpen = openLinkedSessionIds.has(sessionId);
                  const label = linkedSessionNameMap[sessionId] || t("terminal_panel.session_fallback", { id: sessionId.slice(0, 8) });

                  return (
                    <button
                      key={sessionId}
                      onClick={() => onRestoreSession(sessionId)}
                      disabled={isOpen || !canLaunch}
                      title={isOpen ? t("terminal_panel.session_open_title") : t("terminal_panel.session_restore_title")}
                      className={cn(
                        "h-6 px-3 text-[10px] font-bold rounded-full transition-all flex items-center gap-1.5 border tracking-tight",
                        isOpen
                          ? "bg-apple-green/10 text-apple-green border-apple-green/20 opacity-60 cursor-default"
                          : "bg-white dark:bg-system-gray-800 text-apple-blue border-black/5 dark:border-white/10 hover:border-apple-blue/30 shadow-apple-sm",
                      )}
                    >
                      <span className="truncate">{label}</span>
                      <span className="opacity-70 font-medium uppercase">{isOpen ? t("terminal_panel.opened") : t("terminal_panel.restore")}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {sessions.length === 0 ? (
        <EmptyState
          wsReady={wsReady}
          hasProviders={hasProviders}
          hasLinkedSessions={linkedSessionIds.length > 0}
          onNew={onNewTerminal}
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <SortableContext items={sessions.map((s) => s.localId)} strategy={rectSortingStrategy}>
            <div className="flex-1 min-h-0 p-4 overflow-auto">
              <div
                className="grid gap-4 h-full"
                style={{
                  gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                  gridAutoRows: sessions.length <= gridCols ? "1fr" : "minmax(250px, 1fr)",
                }}
              >
                {sessions.map((session) => (
                  <SortableTile
                    key={session.localId}
                    session={session}
                    onClose={() => handleClose(session.localId, session.id)}
                  />
                ))}
              </div>
            </div>
          </SortableContext>
          <DragOverlay>
            {activeId ? <DragGhost session={sessions.find((session) => session.localId === activeId)} /> : null}
          </DragOverlay>
        </DndContext>
      )}
    </TaskWorkspaceDrawerShell>
  );
}

function SortableTile({ session, onClose }: { session: TermSession; onClose: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: session.localId,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? transition : undefined,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <TerminalTile
      ref={setNodeRef}
      session={session}
      onClose={onClose}
      style={style}
      dragHandleProps={{ ...attributes, ...listeners }}
    />
  );
}

function DragGhost({ session }: { session?: TermSession }) {
  if (!session) return null;
  return (
    <div className="bg-white dark:bg-system-gray-800 border border-apple-blue rounded-apple-lg h-10 flex items-center px-4 shadow-apple-lg">
      <TerminalIcon size={14} className="text-apple-blue mr-2" />
      <span className="text-[12px] font-bold text-system-gray-600 dark:text-system-gray-200">{session.name}</span>
    </div>
  );
}

function EmptyState({ wsReady, hasProviders, hasLinkedSessions, onNew }: {
  wsReady: boolean;
  hasProviders: boolean;
  hasLinkedSessions: boolean;
  onNew: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-sm apple-glass p-8 rounded-apple-2xl border border-black/5 shadow-apple-lg">
        <div className="w-16 h-16 rounded-2xl bg-black/5 dark:bg-white/5 flex items-center justify-center mx-auto mb-6">
          <TerminalIcon size={32} className="text-system-gray-300" />
        </div>
        <p className="text-sm font-medium text-system-gray-500 dark:text-system-gray-400 mb-6 leading-relaxed">
          {hasLinkedSessions ? t("terminal_panel.empty_with_history") : t("terminal_panel.empty_without_history")}
        </p>
        <button
          onClick={onNew}
          disabled={!wsReady || !hasProviders}
          className="apple-btn-primary px-8 py-2.5 text-sm font-bold flex items-center gap-2 mx-auto shadow-apple-sm"
        >
          <Plus size={18} />
          {t("terminal_panel.start_terminal")}
        </button>
      </div>
    </div>
  );
}
