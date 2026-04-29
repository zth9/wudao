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
import { Button } from "@heroui/react/button";
import { Chip } from "@heroui/react/chip";

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
            <Button
              variant="secondary"
              onPress={onRestoreAll}
              isDisabled={!canLaunch || restorableCount === 0}
              className="flex h-8 items-center gap-1.5 px-3 text-[11px] font-bold uppercase tracking-wider"
            >
              <RotateCcw size={14} className="text-muted" />
              {t("terminal_panel.restore_all")}
            </Button>
          )}

          <Button
            variant="primary"
            onPress={onNewTerminal}
            isDisabled={!canLaunch}
            className="flex h-8 items-center gap-1.5 px-3 text-[11px] font-bold uppercase tracking-wider"
          >
            <Plus size={16} />
            {t("terminal_panel.new_terminal")}
          </Button>
        </>
      )}
    >
      <div className="shrink-0 border-b border-border bg-surface/35">
        <div className="px-4 py-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted truncate">
              {sessions.length > 0
                ? t("terminal_panel.sessions_summary", { count: sessions.length })
                : t("terminal_panel.not_started")}
            </span>
            {linkedSessionIds.length > 0 && (
              <Chip size="sm" variant="soft" color="default" className="shrink-0 px-2 py-1 text-[10px] tracking-[0.12em]">
                {t("terminal_panel.linked")}
              </Chip>
            )}
          </div>

          {linkedSessionIds.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-default border border-dashed border-border">
              <History size={12} className="text-muted" />
              <p className="text-[10px] font-medium text-muted">{t("terminal_panel.no_linked_sessions")}</p>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-default text-muted shrink-0">
                <History size={12} />
                <span className="text-[10px] font-bold uppercase tracking-tight">{t("terminal_panel.linked")}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 min-w-0">
                {linkedSessionIds.map((sessionId) => {
                  const isOpen = openLinkedSessionIds.has(sessionId);
                  const label = linkedSessionNameMap[sessionId] || t("terminal_panel.session_fallback", { id: sessionId.slice(0, 8) });

                  return (
                    <Button
                      key={sessionId}
                      variant="ghost"
                      onPress={() => onRestoreSession(sessionId)}
                      isDisabled={isOpen || !canLaunch}
                      className={cn(
                        "h-6 px-3 text-[10px] font-bold rounded-full transition-all flex items-center gap-1.5 border tracking-tight",
                        isOpen
                          ? "bg-success/10 text-success border-success/20 opacity-60 cursor-default"
                          : "bg-surface text-accent border-border hover:border-accent/30 shadow-sm",
                      )}
                    >
                      <span className="truncate">{label}</span>
                      <span className="opacity-70 font-medium uppercase">{isOpen ? t("terminal_panel.opened") : t("terminal_panel.restore")}</span>
                    </Button>
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
    <div className="bg-surface border border-accent rounded-lg h-10 flex items-center px-4 shadow-lg">
      <TerminalIcon size={14} className="text-accent mr-2" />
      <span className="text-[12px] font-bold text-foreground">{session.name}</span>
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
      <div className="text-center max-w-sm bg-overlay/90 backdrop-blur-xl p-8 rounded-2xl border border-border shadow-lg">
        <div className="w-16 h-16 rounded-2xl bg-default flex items-center justify-center mx-auto mb-6">
          <TerminalIcon size={32} className="text-default-foreground" />
        </div>
        <p className="text-sm font-medium text-muted mb-6 leading-relaxed">
          {hasLinkedSessions ? t("terminal_panel.empty_with_history") : t("terminal_panel.empty_without_history")}
        </p>
        <Button
          variant="primary"
          onPress={onNew}
          isDisabled={!wsReady || !hasProviders}
          className="mx-auto flex items-center gap-2 px-8 py-2.5 text-sm font-bold"
        >
          <Plus size={18} />
          {t("terminal_panel.start_terminal")}
        </Button>
      </div>
    </div>
  );
}
