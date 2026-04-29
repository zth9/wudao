import { useEffect, useRef, useState } from "react";
import type { Task } from "../../services/api";
import { tasks as tasksApi } from "../../services/api";
import {
  ArrowLeft,
  ChevronDown,
  Trash2,
  FolderOpen,
  CheckCircle2,
  RotateCcw,
  AlertCircle,
  Box,
  TrendingUp,
  Zap,
  Clock,
  LayoutGrid,
  TerminalSquare
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatLocalizedDateInDefaultTimeZone } from "../../utils/time";
import { cn } from "../../utils/cn";
import { shouldSubmitOnEnter } from "../../utils/ime";
import { CalendarPopup } from "./CalendarPopup";
import { TASK_TYPES } from "./constants";
import { Button } from "@heroui/react/button";
import { Input } from "@heroui/react/input";
import { Dropdown } from "@heroui/react/dropdown";
import { Popover } from "@heroui/react/popover";
import { Tooltip } from "@heroui/react/tooltip";

interface Props {
  task: Task;
  onBack: () => void;
  onSwitchTask: (taskId: string) => void;
  onUpdate: (data: any) => void;
  onToggleStatus: () => void;
  showDeleteConfirm: boolean;
  onDeleteClick: () => void;
  onDeleteCancel: () => void;
  onDeleteConfirm: () => void;
  artifactsOpen?: boolean;
  onToggleArtifacts?: () => void;
  terminalOpen?: boolean;
  onToggleTerminal?: () => void;
  sdkRunnerOpen?: boolean;
  onToggleSdkRunner?: () => void;
  onOpenTaskList: () => void;
}

export function Header({
  task,
  onBack,
  onUpdate,
  onToggleStatus,
  showDeleteConfirm,
  onDeleteClick,
  onDeleteCancel,
  onDeleteConfirm,
  artifactsOpen,
  onToggleArtifacts,
  terminalOpen = true,
  onToggleTerminal,
  sdkRunnerOpen = false,
  onToggleSdkRunner,
  onOpenTaskList,
}: Props) {
  const { t, i18n } = useTranslation();
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(task.title);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [priorityMenuOpen, setPriorityMenuOpen] = useState(false);
  const [calendarMenuOpen, setCalendarMenuOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const titleInputComposingRef = useRef(false);

  useEffect(() => {
    setDraftTitle(task.title);
    setEditingTitle(false);
  }, [task.id, task.title]);

  useEffect(() => {
    if (!editingTitle) return;
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, [editingTitle]);

  const commitTitle = () => {
    const normalized = draftTitle.trim();
    if (!normalized) {
      setDraftTitle(task.title);
      setEditingTitle(false);
      return;
    }
    if (normalized !== task.title) {
      onUpdate({ title: normalized });
    }
    setEditingTitle(false);
  };

  const priorities = [0, 1, 2, 3, 4] as const;
  const currentPriority = priorities.includes(task.priority as any) ? task.priority : 2;

  const getPriorityColor = (p: number) => {
    switch (p) {
      case 0: return "text-danger";
      case 1: return "text-warning";
      case 2: return "text-warning";
      case 3: return "text-accent";
      case 4: return "text-success";
      default: return "text-muted";
    }
  };

  const IconButton = ({ tooltip, ...props }: { tooltip: string } & React.ComponentProps<typeof Button>) => (
    <Tooltip delay={300} closeDelay={0}>
      <Button isIconOnly variant="ghost" {...props} />
      <Tooltip.Content className="rounded-lg border border-border bg-overlay px-2.5 py-1.5 text-xs font-semibold text-overlay-foreground shadow-md" placement="top" showArrow>
        <Tooltip.Arrow className="fill-overlay" />
        {tooltip}
      </Tooltip.Content>
    </Tooltip>
  );

  return (
    <header className="h-14 shrink-0 px-4 flex items-center justify-between gap-4 border-b border-border bg-surface relative">
      {/* Left: Back, Title & Metadata */}
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <Button
          variant="ghost"
          onPress={onBack}
          className="flex items-center gap-1.5 text-muted hover:text-accent transition-colors text-xs font-bold uppercase tracking-wider group shrink-0"
        >
          <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-1" />
        </Button>

        <div className="h-4 w-[1px] bg-default shrink-0" />

        <div className="relative min-w-0 flex items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <IconButton
              onPress={onOpenTaskList}
              className="h-8 w-8 rounded-lg text-muted hover:text-accent"
              tooltip={t('tasks.task_list')}
              aria-label={t('tasks.task_list')}
            >
              <LayoutGrid size={18} />
            </IconButton>

            {editingTitle ? (
              <Input
                ref={titleInputRef}
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onCompositionStart={() => {
                  titleInputComposingRef.current = true;
                }}
                onCompositionEnd={() => {
                  titleInputComposingRef.current = false;
                }}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (shouldSubmitOnEnter(e, titleInputComposingRef.current)) {
                    e.preventDefault();
                    commitTitle();
                    return;
                  }
                  if (e.key === "Escape") { setDraftTitle(task.title); setEditingTitle(false); }
                }}
                className="min-h-0 w-auto bg-surface/50 px-2 py-0.5 text-sm font-bold"
              />
            ) : (
              <h1
                className="text-sm font-bold tracking-tight truncate cursor-pointer hover:text-accent transition-colors"
                onClick={() => setEditingTitle(true)}
              >
                {task.title}
              </h1>
            )}
          </div>

          <div className="hidden xl:flex items-center gap-2 shrink-0">
            {/* Task Type Selector */}
            <Dropdown isOpen={typeMenuOpen} onOpenChange={setTypeMenuOpen}>
              <Button
                variant="ghost"
                className="flex h-8 min-h-0 w-24 items-center gap-1.5 rounded-lg border border-transparent bg-default px-2 transition-all hover:bg-default/80"
              >
                <span className="text-[10px] font-black uppercase tracking-widest text-foreground truncate flex-1 text-left">
                  {t(`task_types.${task.type}`)}
                </span>
                <ChevronDown size={10} className="text-muted shrink-0" />
              </Button>
              <Dropdown.Popover className="w-24 min-w-24">
                <Dropdown.Menu
                  aria-label={t("tasks.type")}
                  onAction={(key) => {
                    onUpdate({ type: String(key) });
                    setTypeMenuOpen(false);
                  }}
                >
                  {TASK_TYPES.map((type) => (
                    <Dropdown.Item
                      key={type}
                      id={type}
                      textValue={t(`task_types.${type}`)}
                      className="justify-between py-1.5 font-bold"
                    >
                      <span className="truncate">{t(`task_types.${type}`)}</span>
                      {task.type === type && <CheckCircle2 size={10} className="shrink-0" />}
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>

            {/* Priority Selector */}
            <Dropdown isOpen={priorityMenuOpen} onOpenChange={setPriorityMenuOpen}>
              <Button
                variant="ghost"
                className="flex h-8 min-h-0 w-20 items-center gap-1.5 rounded-lg border border-transparent bg-default px-2 transition-all hover:bg-default/80"
              >
                <TrendingUp size={12} className={cn("shrink-0", getPriorityColor(currentPriority))} />
                <span className="text-[10px] font-black uppercase tracking-widest text-foreground flex-1 text-left">P{currentPriority}</span>
                <ChevronDown size={10} className="text-muted shrink-0" />
              </Button>
              <Dropdown.Popover className="w-20 min-w-20">
                <Dropdown.Menu
                  aria-label={t("tasks.priority")}
                  onAction={(key) => {
                    onUpdate({ priority: Number(key) });
                    setPriorityMenuOpen(false);
                  }}
                >
                  {priorities.map((p) => (
                    <Dropdown.Item
                      key={p}
                      id={String(p)}
                      textValue={`P${p}`}
                      className="justify-between py-1.5 font-bold"
                    >
                      <span className={cn(task.priority !== p && getPriorityColor(p))}>P{p}</span>
                      {task.priority === p && <CheckCircle2 size={10} className="shrink-0" />}
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>

            {/* Due Date Selector */}
            <Popover isOpen={calendarMenuOpen} onOpenChange={setCalendarMenuOpen}>
              <Button
                variant="ghost"
                className={cn(
                  "flex h-8 min-h-0 items-center gap-1.5 rounded-lg border border-transparent bg-default transition-all hover:bg-default/80",
                  task.due_at ? "w-32 px-2" : "w-8 justify-center"
                )}
              >
                <Clock size={12} className={cn("shrink-0", task.due_at ? "text-accent" : "text-muted")} />
                {task.due_at && (
                  <>
                    <span className="text-[10px] font-black uppercase tracking-widest text-foreground flex-1 text-left truncate">
                      {formatLocalizedDateInDefaultTimeZone(task.due_at, i18n.language)}
                    </span>
                    <ChevronDown size={10} className="text-muted shrink-0" />
                  </>
                )}
              </Button>

              <Popover.Content className="p-0" placement="bottom">
                <Popover.Dialog>
                  <CalendarPopup
                    selectedDate={task.due_at ? new Date(task.due_at) : null}
                    onChange={(date) => { onUpdate({ due_at: date ? date.toISOString() : null }); setCalendarMenuOpen(false); }}
                    onClose={() => setCalendarMenuOpen(false)}
                  />
                </Popover.Dialog>
              </Popover.Content>
            </Popover>
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <IconButton
          onPress={onToggleTerminal}
          className={cn(
            "rounded-full transition-colors",
            terminalOpen
              ? "bg-accent/10 text-accent"
              : "hover:bg-default text-muted"
          )}
          tooltip={t('tasks.terminal')}
          aria-label={t('tasks.terminal')}
        >
          <TerminalSquare size={16} />
        </IconButton>

        <IconButton
          onPress={onToggleSdkRunner}
          className={cn(
            "rounded-full transition-colors",
            sdkRunnerOpen
              ? "bg-accent/10 text-accent"
              : "hover:bg-default text-muted"
          )}
          tooltip={t('sdkRunner.title')}
          aria-label={t('sdkRunner.title')}
        >
          <Zap size={16} />
        </IconButton>

        <IconButton
          onPress={onToggleArtifacts}
          className={cn(
            "rounded-full transition-colors",
            artifactsOpen
              ? "bg-accent/10 text-accent"
              : "hover:bg-default text-muted"
          )}
          tooltip={t('tasks.artifacts')}
          aria-label={t('tasks.artifacts')}
        >
          <Box size={16} />
        </IconButton>

        <IconButton
          onPress={() => void tasksApi.openWorkspace(task.id)}
          className="rounded-full text-muted"
          tooltip={t('tasks.open_workspace')}
          aria-label={t('tasks.open_workspace')}
        >
          <FolderOpen size={16} />
        </IconButton>

        <div className="w-[1px] h-4 bg-default mx-1" />

        <IconButton
          onPress={onToggleStatus}
          className={cn(
            "rounded-full transition-all",
            task.status === "done"
              ? "text-success hover:bg-success/10"
              : "text-muted hover:text-accent hover:bg-default"
          )}
          tooltip={task.status === "done" ? t('tasks.resume') : t('tasks.complete')}
          aria-label={task.status === "done" ? t('tasks.resume') : t('tasks.complete')}
        >
          {task.status === "done" ? <RotateCcw size={18} /> : <CheckCircle2 size={18} />}
        </IconButton>

        <div className="relative">
          <Popover
            isOpen={showDeleteConfirm}
            onOpenChange={(open) => {
              if (open) {
                onDeleteClick();
              } else {
                onDeleteCancel();
              }
            }}
          >
            <Button
              isIconOnly
              variant="ghost"
              className="p-2 rounded-full hover:bg-danger/10 text-muted hover:text-danger transition-colors"
              aria-label={t('common.delete')}
            >
              <Trash2 size={16} />
            </Button>

            <Popover.Content className="w-64 p-4 text-center">
              <Popover.Dialog>
                <AlertCircle size={32} className="text-danger mx-auto mb-2" />
                <p className="text-sm font-bold mb-4">{t('tasks.delete_confirm')}</p>
                <div className="flex gap-2">
                  <Button variant="secondary" onPress={onDeleteCancel} className="flex-1 justify-center py-1.5 text-xs">{t('common.cancel')}</Button>
                  <Button variant="danger" onPress={onDeleteConfirm} className="flex-1 justify-center py-1.5 text-xs">{t('common.delete')}</Button>
                </div>
              </Popover.Dialog>
            </Popover.Content>
          </Popover>
        </div>
      </div>
    </header>
  );
}
