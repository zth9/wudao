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
import { Button } from "@heroui/react/button";
import { Input } from "@heroui/react/input";
import { Tooltip } from "@heroui/react/tooltip";

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
        className="flex flex-col border border-border rounded-xl overflow-hidden bg-[#09090b] shadow-md min-h-0 min-w-0 group"
        {...rest}
      >
        <div className="h-9 shrink-0 bg-surface/80 border-b border-border flex items-center px-3 gap-2 backdrop-blur-md">
          <div
            className="cursor-grab active:cursor-grabbing text-muted hover:text-accent transition-colors p-1 -ml-1"
            {...dragHandleProps}
          >
            <GripVertical size={14} />
          </div>

          <div className="w-5 h-5 rounded-md bg-accent/10 flex items-center justify-center text-accent shrink-0">
            <TerminalIcon size={12} />
          </div>

          {editingName ? (
            <Input
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
              className="min-h-0 flex-1 bg-default px-2 py-0.5 text-[11px] font-bold text-foreground"
            />
          ) : (
            <span
              className="text-[11px] font-bold tracking-wider text-muted truncate flex-1 cursor-text select-none"
              title={`${session.name} · ${session.providerName}`}
              onDoubleClick={() => setEditingName(true)}
            >
              {session.name}
            </span>
          )}

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Tooltip delay={300} closeDelay={0}>
              <Button
                isIconOnly
                variant="ghost"
                onPress={() => setEditingName(true)}
                className="h-6 w-6 rounded-md text-muted hover:text-accent"
                aria-label={t("terminal.rename")}
              >
                <Pencil size={12} />
              </Button>
              <Tooltip.Content className="rounded-lg border border-border bg-overlay px-2.5 py-1.5 text-xs font-semibold text-overlay-foreground shadow-md" placement="top" showArrow>
                <Tooltip.Arrow className="fill-overlay" />
                {t("terminal.rename")}
              </Tooltip.Content>
            </Tooltip>
            <Tooltip delay={300} closeDelay={0}>
              <Button
                isIconOnly
                variant="ghost"
                onPress={onClose}
                className="h-6 w-6 rounded-md text-muted hover:bg-danger/10 hover:text-danger"
                aria-label={t("terminal.close")}
              >
                <X size={14} />
              </Button>
              <Tooltip.Content className="rounded-lg border border-border bg-overlay px-2.5 py-1.5 text-xs font-semibold text-overlay-foreground shadow-md" placement="top" showArrow>
                <Tooltip.Arrow className="fill-overlay" />
                {t("terminal.close")}
              </Tooltip.Content>
            </Tooltip>
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
