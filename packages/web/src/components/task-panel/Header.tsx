import { useEffect, useRef, useState } from "react";
import type { Task, TaskType } from "../../services/api";
import { tasks as tasksApi } from "../../services/api";
import { useTaskStore } from "../../stores/taskStore";
import { 
  ArrowLeft, 
  ChevronDown, 
  Trash2, 
  FolderOpen, 
  CheckCircle2, 
  RotateCcw, 
  Calendar, 
  AlertCircle, 
  X,
  Box,
  TrendingUp,
  Zap,
  Clock,
  LayoutGrid,
  TerminalSquare
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { formatLocalizedDateInDefaultTimeZone } from "../../utils/time";
import { cn } from "../../utils/cn";
import { shouldSubmitOnEnter } from "../../utils/ime";
import { CalendarPopup } from "./CalendarPopup";

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
  onOpenTaskList: () => void;
}

export function Header({
  task,
  onBack,
  onSwitchTask,
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
  onOpenTaskList,
}: Props) {
  const { t, i18n } = useTranslation();
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(task.title);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
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

  const taskTypes: TaskType[] = ["feature", "bugfix", "investigation", "exploration", "refactor", "learning"];
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
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-system-gray-400 hover:text-apple-blue transition-colors text-xs font-bold uppercase tracking-wider group shrink-0"
        >
          <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-1" />
        </button>

        <div className="h-4 w-[1px] bg-black/5 dark:bg-white/5 shrink-0" />

        <div className="relative min-w-0 flex items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button 
              onClick={onOpenTaskList}
              className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-system-gray-400 hover:text-apple-blue transition-colors shrink-0"
              title={t('tasks.task_list')}
            >
              <LayoutGrid size={18} />
            </button>
            
            {editingTitle ? (
              <input
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
                className="bg-white/50 dark:bg-system-gray-800/50 border border-apple-blue/30 rounded-apple px-2 py-0.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-apple-blue/20"
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
            <div className="relative">
              <button
                onClick={() => setShowTypeMenu(!showTypeMenu)}
                className="flex items-center gap-1.5 h-8 w-24 px-2 rounded-apple-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-all border border-transparent"
              >
                <span className="text-[10px] font-black uppercase tracking-widest text-system-gray-600 dark:text-system-gray-300 truncate flex-1 text-left">
                  {t(`task_types.${task.type}`)}
                </span>
                <ChevronDown size={10} className="text-system-gray-400 shrink-0" />
              </button>

              <AnimatePresence>
                {showTypeMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowTypeMenu(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 5, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 5, scale: 0.95 }}
                      className="absolute left-0 top-full mt-1 apple-dropdown w-24 z-50"
                    >
                      {taskTypes.map((type) => (
                        <button
                          key={type}
                          onClick={() => { onUpdate({ type }); setShowTypeMenu(false); }}
                          className={cn(
                            "apple-dropdown-item font-bold py-1.5 flex items-center justify-between",
                            task.type === type
                              ? "apple-dropdown-item-active"
                              : "text-system-gray-600 dark:text-system-gray-300"
                          )}
                        >
                          <span className="truncate">{t(`task_types.${type}`)}</span>
                          {task.type === type && <CheckCircle2 size={10} className="shrink-0" />}
                        </button>
                      ))}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Priority Selector */}
            <div className="relative">
              <button
                onClick={() => setShowPriorityMenu(!showPriorityMenu)}
                className="flex items-center gap-1.5 h-8 w-20 px-2 rounded-apple-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-all border border-transparent"
              >
                <TrendingUp size={12} className={cn("shrink-0", getPriorityColor(currentPriority))} />
                <span className="text-[10px] font-black uppercase tracking-widest text-system-gray-600 dark:text-system-gray-300 flex-1 text-left">P{currentPriority}</span>
                <ChevronDown size={10} className="text-system-gray-400 shrink-0" />
              </button>

              <AnimatePresence>
                {showPriorityMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowPriorityMenu(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 5, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 5, scale: 0.95 }}
                      className="absolute left-0 top-full mt-1 apple-dropdown w-20 z-50"
                    >
                      {priorities.map((p) => (
                        <button
                          key={p}
                          onClick={() => { onUpdate({ priority: p }); setShowPriorityMenu(false); }}
                          className={cn(
                            "apple-dropdown-item font-bold py-1.5 flex items-center justify-between",
                            task.priority === p
                              ? "apple-dropdown-item-active"
                              : "text-system-gray-600 dark:text-system-gray-300"
                          )}
                        >
                          <span className={cn(task.priority !== p && getPriorityColor(p))}>P{p}</span>
                          {task.priority === p && <CheckCircle2 size={10} className="shrink-0" />}
                        </button>
                      ))}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Due Date Selector */}
            <div className="relative">
              <button
                onClick={() => setShowCalendar(!showCalendar)}
                className={cn(
                  "flex items-center gap-1.5 h-8 rounded-apple-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-all border border-transparent",
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
              </button>
              
              <AnimatePresence>
                {showCalendar && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowCalendar(false)} />
                    <CalendarPopup
                      selectedDate={task.due_at ? new Date(task.due_at) : null}
                      onChange={(date) => { onUpdate({ due_at: date ? date.toISOString() : null }); setShowCalendar(false); }}
                      onClose={() => setShowCalendar(false)}
                      className="absolute left-1/2 top-full mt-1 z-50 origin-top"
                    />
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onToggleTerminal}
          className={cn(
            "p-2 rounded-full transition-colors",
            terminalOpen 
              ? "bg-apple-blue/10 text-apple-blue" 
              : "hover:bg-black/5 dark:hover:bg-white/5 text-system-gray-400"
          )}
          title={t('tasks.terminal')}
        >
          <TerminalSquare size={16} />
        </button>

        <button
          onClick={onToggleArtifacts}
          className={cn(
            "p-2 rounded-full transition-colors",
            artifactsOpen 
              ? "bg-apple-blue/10 text-apple-blue" 
              : "hover:bg-black/5 dark:hover:bg-white/5 text-system-gray-400"
          )}
          title={t('tasks.artifacts')}
        >
          <Box size={16} />
        </button>

        <button
          onClick={() => tasksApi.openWorkspace(task.id)}
          className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-system-gray-400 transition-colors"
          title={t('tasks.open_workspace')}
        >
          <FolderOpen size={16} />
        </button>

        <div className="w-[1px] h-4 bg-black/5 dark:bg-white/5 mx-1" />

        <button
          onClick={onToggleStatus}
          className={cn(
            "p-2 rounded-full transition-all",
            task.status === "done" 
              ? "text-apple-green hover:bg-apple-green/10" 
              : "text-system-gray-400 hover:text-apple-blue hover:bg-black/5 dark:hover:bg-white/5"
          )}
          title={task.status === "done" ? t('tasks.resume') : t('tasks.complete')}
        >
          {task.status === "done" ? <RotateCcw size={18} /> : <CheckCircle2 size={18} />}
        </button>

        <div className="relative">
          <button
            onClick={onDeleteClick}
            className="p-2 rounded-full hover:bg-apple-red/10 text-system-gray-400 hover:text-apple-red transition-colors"
            title={t('common.delete')}
          >
            <Trash2 size={16} />
          </button>

          <AnimatePresence>
            {showDeleteConfirm && (
              <>
                <div className="fixed inset-0 z-40" onClick={onDeleteCancel} />
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 top-full mt-2 apple-dropdown p-4 w-64 text-center"
                >
                  <AlertCircle size={32} className="text-apple-red mx-auto mb-2" />
                  <p className="text-sm font-bold mb-4">{t('tasks.delete_confirm')}</p>
                  <div className="flex gap-2">
                    <button onClick={onDeleteCancel} className="apple-dropdown-item bg-black/5 dark:bg-white/5 py-1.5 justify-center">{t('common.cancel')}</button>
                    <button onClick={onDeleteConfirm} className="apple-dropdown-item apple-dropdown-item-active py-1.5 justify-center">{t('common.delete')}</button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
