import { Suspense, forwardRef, lazy, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  GripVertical,
  Pencil,
  X,
  Terminal as TerminalIcon,
} from "lucide-react";
import {
  getPersistableLinkedSessionId,
  useTerminalStore,
  type TermSession,
} from "../stores/terminalStore";
import { useTaskStore } from "../stores/taskStore";
import { LoadingIndicator } from "./LoadingIndicator";
import { shouldSubmitOnEnter } from "../utils/ime";

const loadTerminalView = () => import("./TerminalView");
const TerminalView = lazy(loadTerminalView);

interface Props {
  session: TermSession;
  onClose: () => void;
  style?: React.CSSProperties;
  dragHandleProps?: Record<string, unknown>;
}

const TerminalTile = forwardRef<HTMLDivElement, Props>(
  ({ session, onClose, style, dragHandleProps, ...rest }, ref) => {
    const { t } = useTranslation();
    const updateSessionName = useTerminalStore((s) => s.updateSessionName);
    const linkTaskSession = useTaskStore((s) => s.linkSession);
    const [editingName, setEditingName] = useState(false);
    const [draftName, setDraftName] = useState(session.name);
    const inputRef = useRef<HTMLInputElement>(null);
    const nameInputComposingRef = useRef(false);

    useEffect(() => {
      if (!editingName) {
        setDraftName(session.name);
      }
    }, [session.name, editingName]);

    useEffect(() => {
      void loadTerminalView();
    }, []);

    useEffect(() => {
      if (!editingName) return;
      inputRef.current?.focus();
      inputRef.current?.select();
    }, [editingName]);

    const commitRename = () => {
      const trimmed = draftName.trim();
      if (trimmed && trimmed !== session.name) {
        updateSessionName(session.localId, trimmed);
        const linkedSessionId = getPersistableLinkedSessionId(session);
        if (session.taskId && linkedSessionId) {
          void linkTaskSession(session.taskId, linkedSessionId, trimmed);
        }
      } else {
        setDraftName(session.name);
      }
      setEditingName(false);
    };

    const cancelRename = () => {
      setDraftName(session.name);
      setEditingName(false);
    };

    return (
      <div
        ref={ref}
        style={style}
        className="flex flex-col border border-black/5 dark:border-white/10 rounded-apple-xl overflow-hidden bg-[#09090b] shadow-apple-md min-h-0 min-w-0 group"
        {...rest}
      >
        <div className="h-9 shrink-0 bg-white/80 dark:bg-system-gray-800/80 border-b border-black/5 dark:border-white/10 flex items-center px-3 gap-2 backdrop-blur-md">
          <div
            className="cursor-grab active:cursor-grabbing text-system-gray-400 hover:text-apple-blue transition-colors p-1 -ml-1"
            {...dragHandleProps}
          >
            <GripVertical size={14} />
          </div>

          <div className="w-5 h-5 rounded-apple bg-apple-blue/10 flex items-center justify-center text-apple-blue shrink-0">
            <TerminalIcon size={12} />
          </div>

          {editingName ? (
            <input
              ref={inputRef}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onCompositionStart={() => {
                nameInputComposingRef.current = true;
              }}
              onCompositionEnd={() => {
                nameInputComposingRef.current = false;
              }}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (shouldSubmitOnEnter(e, nameInputComposingRef.current)) {
                  e.preventDefault();
                  commitRename();
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelRename();
                }
              }}
              className="flex-1 min-w-0 bg-black/5 dark:bg-white/5 border border-apple-blue/30 rounded-apple px-2 py-0.5 text-[11px] font-bold text-system-gray-700 dark:text-system-gray-200 focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
            />
          ) : (
            <span
              className="text-[11px] font-bold tracking-wider text-system-gray-500 dark:text-system-gray-400 truncate flex-1 cursor-text select-none"
              title={`${session.name} · ${session.providerName}`}
              onDoubleClick={() => setEditingName(true)}
            >
              {session.name}
            </span>
          )}

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setEditingName(true)}
              className="w-6 h-6 rounded-apple hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center text-system-gray-400 hover:text-apple-blue transition-all"
              title={t("terminal.rename")}
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={onClose}
              className="w-6 h-6 rounded-apple hover:bg-apple-red/10 flex items-center justify-center text-system-gray-400 hover:text-apple-red transition-all"
              title={t("terminal.close")}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 min-w-0 bg-black">
          <Suspense fallback={<LoadingIndicator text={t("common.loading")} size={16} />}>
            <TerminalView
              sessionId={session.id || null}
              providerId={session.providerId}
              permissionMode={session.permissionMode}
              taskId={session.taskId}
              initialPrompt={session.initialPrompt}
              resumeSessionId={session.resumeSessionId}
              clientRef={session.localId}
            />
          </Suspense>
        </div>
      </div>
    );
  },
);

TerminalTile.displayName = "TerminalTile";
export default TerminalTile;
