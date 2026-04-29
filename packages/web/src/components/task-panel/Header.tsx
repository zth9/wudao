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
import {
  WudaoButton,
  WudaoDropdown,
  WudaoDropdownItem,
  WudaoDropdownMenu,
  WudaoDropdownPopover,
  WudaoIconButton,
  WudaoInput,
  WudaoPopover,
  WudaoPopoverContent,
} from "../ui/heroui";

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
      case 0: return "text-apple-red";
      case 1: return "text-apple-orange";
      case 2: return "text-orange-600 dark:text-apple-yellow";
      case 3: return "text-apple-blue";
      case 4: return "text-apple-green";
      default: return "text-system-gray-400";
    }
  };

  return (
    <header className="h-14 shrink-0 px-4 flex items-center justify-between gap-4 border-b border-black/5 dark:border-white/10 bg-white/90 dark:bg-[#1c1c1e] relative">
      {/* Left: Back, Title & Metadata */}
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <WudaoButton
          onPress={onBack}
          tone="plain"
          className="flex items-center gap-1.5 text-system-gray-400 hover:text-apple-blue transition-colors text-xs font-bold uppercase tracking-wider group shrink-0"
        >
          <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-1" />
        </WudaoButton>

        <div className="h-4 w-[1px] bg-black/5 dark:bg-white/5 shrink-0" />

        <div className="relative min-w-0 flex items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <WudaoIconButton
              onPress={onOpenTaskList}
              tone="ghost"
              className="h-8 w-8 rounded-lg text-system-gray-400 hover:text-apple-blue"
              tooltip={t('tasks.task_list')}
              aria-label={t('tasks.task_list')}
            >
              <LayoutGrid size={18} />
            </WudaoIconButton>
            
            {editingTitle ? (
              <WudaoInput
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
                className="min-h-0 w-auto bg-white/50 px-2 py-0.5 text-sm font-bold dark:bg-system-gray-800/50"
              />
            ) : (
              <h1 
                className="text-sm font-bold tracking-tight truncate cursor-pointer hover:text-apple-blue transition-colors"
                onClick={() => setEditingTitle(true)}
              >
                {task.title}
              </h1>
            )}
          </div>
          
          <div className="hidden xl:flex items-center gap-2 shrink-0">
            {/* Task Type Selector */}
            <WudaoDropdown isOpen={typeMenuOpen} onOpenChange={setTypeMenuOpen}>
              <WudaoButton
                tone="plain"
                className="flex h-8 min-h-0 w-24 items-center gap-1.5 rounded-apple-lg border border-transparent bg-black/5 px-2 transition-all hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"
              >
                <span className="text-[10px] font-black uppercase tracking-widest text-system-gray-600 dark:text-system-gray-300 truncate flex-1 text-left">
                  {t(`task_types.${task.type}`)}
                </span>
                <ChevronDown size={10} className="text-system-gray-400 shrink-0" />
              </WudaoButton>
              <WudaoDropdownPopover className="w-24 min-w-24">
                <WudaoDropdownMenu
                  aria-label={t("tasks.type")}
                  onAction={(key) => {
                    onUpdate({ type: String(key) });
                    setTypeMenuOpen(false);
                  }}
                >
                  {TASK_TYPES.map((type) => (
                    <WudaoDropdownItem
                      key={type}
                      id={type}
                      textValue={t(`task_types.${type}`)}
                      isSelected={task.type === type}
                      className="justify-between py-1.5 font-bold"
                    >
                      <span className="truncate">{t(`task_types.${type}`)}</span>
                      {task.type === type && <CheckCircle2 size={10} className="shrink-0" />}
                    </WudaoDropdownItem>
                  ))}
                </WudaoDropdownMenu>
              </WudaoDropdownPopover>
            </WudaoDropdown>

            {/* Priority Selector */}
            <WudaoDropdown isOpen={priorityMenuOpen} onOpenChange={setPriorityMenuOpen}>
              <WudaoButton
                tone="plain"
                className="flex h-8 min-h-0 w-20 items-center gap-1.5 rounded-apple-lg border border-transparent bg-black/5 px-2 transition-all hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"
              >
                <TrendingUp size={12} className={cn("shrink-0", getPriorityColor(currentPriority))} />
                <span className="text-[10px] font-black uppercase tracking-widest text-system-gray-600 dark:text-system-gray-300 flex-1 text-left">P{currentPriority}</span>
                <ChevronDown size={10} className="text-system-gray-400 shrink-0" />
              </WudaoButton>
              <WudaoDropdownPopover className="w-20 min-w-20">
                <WudaoDropdownMenu
                  aria-label={t("tasks.priority")}
                  onAction={(key) => {
                    onUpdate({ priority: Number(key) });
                    setPriorityMenuOpen(false);
                  }}
                >
                  {priorities.map((p) => (
                    <WudaoDropdownItem
                      key={p}
                      id={String(p)}
                      textValue={`P${p}`}
                      isSelected={task.priority === p}
                      className="justify-between py-1.5 font-bold"
                    >
                      <span className={cn(task.priority !== p && getPriorityColor(p))}>P{p}</span>
                      {task.priority === p && <CheckCircle2 size={10} className="shrink-0" />}
                    </WudaoDropdownItem>
                  ))}
                </WudaoDropdownMenu>
              </WudaoDropdownPopover>
            </WudaoDropdown>

            {/* Due Date Selector */}
            <WudaoPopover isOpen={calendarMenuOpen} onOpenChange={setCalendarMenuOpen}>
              <WudaoButton
                tone="plain"
                className={cn(
                  "flex h-8 min-h-0 items-center gap-1.5 rounded-apple-lg border border-transparent bg-black/5 transition-all hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10",
                  task.due_at ? "w-32 px-2" : "w-8 justify-center"
                )}
                title={!task.due_at ? t('tasks.due_date') : undefined}
              >
                <Clock size={12} className={cn("shrink-0", task.due_at ? "text-apple-blue" : "text-system-gray-400")} />
                {task.due_at && (
                  <>
                    <span className="text-[10px] font-black uppercase tracking-widest text-system-gray-600 dark:text-system-gray-300 flex-1 text-left truncate">
                      {formatLocalizedDateInDefaultTimeZone(task.due_at, i18n.language)}
                    </span>
                    <ChevronDown size={10} className="text-system-gray-400 shrink-0" />
                  </>
                )}
              </WudaoButton>

              <WudaoPopoverContent placement="bottom" className="p-0">
                <CalendarPopup
                  selectedDate={task.due_at ? new Date(task.due_at) : null}
                  onChange={(date) => { onUpdate({ due_at: date ? date.toISOString() : null }); setCalendarMenuOpen(false); }}
                  onClose={() => setCalendarMenuOpen(false)}
                />
              </WudaoPopoverContent>
            </WudaoPopover>
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <WudaoIconButton
          onPress={onToggleTerminal}
          tone="ghost"
          className={cn(
            "rounded-full transition-colors",
            terminalOpen 
              ? "bg-apple-blue/10 text-apple-blue" 
              : "hover:bg-black/5 dark:hover:bg-white/5 text-system-gray-400"
          )}
          tooltip={t('tasks.terminal')}
          aria-label={t('tasks.terminal')}
        >
          <TerminalSquare size={16} />
        </WudaoIconButton>

        <WudaoIconButton
          onPress={onToggleSdkRunner}
          tone="ghost"
          className={cn(
            "rounded-full transition-colors",
            sdkRunnerOpen
              ? "bg-apple-blue/10 text-apple-blue"
              : "hover:bg-black/5 dark:hover:bg-white/5 text-system-gray-400"
          )}
          tooltip={t('sdkRunner.title')}
          aria-label={t('sdkRunner.title')}
        >
          <Zap size={16} />
        </WudaoIconButton>

        <WudaoIconButton
          onPress={onToggleArtifacts}
          tone="ghost"
          className={cn(
            "rounded-full transition-colors",
            artifactsOpen 
              ? "bg-apple-blue/10 text-apple-blue" 
              : "hover:bg-black/5 dark:hover:bg-white/5 text-system-gray-400"
          )}
          tooltip={t('tasks.artifacts')}
          aria-label={t('tasks.artifacts')}
        >
          <Box size={16} />
        </WudaoIconButton>

        <WudaoIconButton
          onPress={() => void tasksApi.openWorkspace(task.id)}
          tone="ghost"
          className="rounded-full text-system-gray-400"
          tooltip={t('tasks.open_workspace')}
          aria-label={t('tasks.open_workspace')}
        >
          <FolderOpen size={16} />
        </WudaoIconButton>

        <div className="w-[1px] h-4 bg-black/5 dark:bg-white/5 mx-1" />

        <WudaoIconButton
          onPress={onToggleStatus}
          tone="ghost"
          className={cn(
            "rounded-full transition-all",
            task.status === "done" 
              ? "text-apple-green hover:bg-apple-green/10" 
              : "text-system-gray-400 hover:text-apple-blue hover:bg-black/5 dark:hover:bg-white/5"
          )}
          tooltip={task.status === "done" ? t('tasks.resume') : t('tasks.complete')}
          aria-label={task.status === "done" ? t('tasks.resume') : t('tasks.complete')}
        >
          {task.status === "done" ? <RotateCcw size={18} /> : <CheckCircle2 size={18} />}
        </WudaoIconButton>

        <div className="relative">
          <WudaoPopover
            isOpen={showDeleteConfirm}
            onOpenChange={(open) => {
              if (open) {
                onDeleteClick();
              } else {
                onDeleteCancel();
              }
            }}
          >
            <WudaoButton
              isIconOnly
              title={t('common.delete')}
              tone="ghost"
              className="p-2 rounded-full hover:bg-apple-red/10 text-system-gray-400 hover:text-apple-red transition-colors"
              aria-label={t('common.delete')}
            >
              <Trash2 size={16} />
            </WudaoButton>

            <WudaoPopoverContent className="w-64 p-4 text-center">
              <AlertCircle size={32} className="text-apple-red mx-auto mb-2" />
              <p className="text-sm font-bold mb-4">{t('tasks.delete_confirm')}</p>
              <div className="flex gap-2">
                <WudaoButton onPress={onDeleteCancel} tone="secondary" className="flex-1 justify-center py-1.5 text-xs">{t('common.cancel')}</WudaoButton>
                <WudaoButton onPress={onDeleteConfirm} tone="danger" className="flex-1 justify-center py-1.5 text-xs">{t('common.delete')}</WudaoButton>
              </div>
            </WudaoPopoverContent>
          </WudaoPopover>
        </div>
      </div>
    </header>
  );
}
