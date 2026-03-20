import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { type Task } from "../../services/api";
import { X, CheckCircle2, Circle, Clock } from "lucide-react";
import { cn } from "../../utils/cn";
import {
  TASK_LIST_DRAWER_BACKDROP_CLASS,
  TASK_LIST_DRAWER_PANEL_CLASS,
} from "./task-list-drawer-layout";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  currentTaskId: string;
  onSwitchTask: (taskId: string) => void;
}

export function TaskListDrawer({ isOpen, onClose, tasks, currentTaskId, onSwitchTask }: Props) {
  const { t } = useTranslation();

  const activeTasks = tasks.filter((item) => item.status !== "done");
  const doneTasks = tasks.filter((item) => item.status === "done");

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className={cn(TASK_LIST_DRAWER_BACKDROP_CLASS, "z-[60]")}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className={cn(TASK_LIST_DRAWER_PANEL_CLASS, "z-[70]")}
          >
            {/* Header */}
            <div className="h-14 flex items-center justify-between px-4 border-b border-black/5 dark:border-white/10 shrink-0">
              <h2 className="text-sm font-black uppercase tracking-widest text-system-gray-600 dark:text-system-gray-300">
                {t('tasks.task_list')}
              </h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-system-gray-400 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2 dark-scrollbar">
              <div className="space-y-6 py-2">
                {/* Active Tasks */}
                {activeTasks.length > 0 && (
                  <div>
                    <div className="px-3 mb-2 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-apple-blue shadow-[0_0_8px_rgba(0,122,255,0.5)]" />
                      <p className="text-[10px] font-black text-system-gray-400 uppercase tracking-[0.2em]">
                        {t('common.active')}
                      </p>
                    </div>
                    <div className="space-y-1">
                      {activeTasks.map((item) => (
                        <TaskItem
                          key={item.id}
                          task={item}
                          isActive={item.id === currentTaskId}
                          onClick={() => {
                            onSwitchTask(item.id);
                            onClose();
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Done Tasks */}
                {doneTasks.length > 0 && (
                  <div>
                    <div className="px-3 mb-2 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-apple-green opacity-50" />
                      <p className="text-[10px] font-black text-system-gray-400 uppercase tracking-[0.2em]">
                        {t('common.done')}
                      </p>
                    </div>
                    <div className="space-y-1">
                      {doneTasks.map((item) => (
                        <TaskItem
                          key={item.id}
                          task={item}
                          isActive={item.id === currentTaskId}
                          onClick={() => {
                            onSwitchTask(item.id);
                            onClose();
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function TaskItem({ task, isActive, onClick }: { task: Task; isActive: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  const normalizedPriority = [0, 1, 2, 3, 4].includes(task.priority as 0 | 1 | 2 | 3 | 4)
    ? task.priority
    : 2;
  const priorityClassName = isActive
    ? "bg-white/20 text-white"
    : normalizedPriority === 0
      ? "bg-apple-red/10 text-apple-red"
      : normalizedPriority === 1
        ? "bg-apple-orange/10 text-apple-orange"
        : normalizedPriority === 2
          ? "bg-apple-yellow/20 text-orange-600 dark:text-apple-yellow"
          : normalizedPriority === 3
            ? "bg-apple-blue/10 text-apple-blue"
            : "bg-apple-green/10 text-apple-green";
  
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-3 rounded-apple-xl transition-all duration-300 group relative overflow-hidden",
        isActive
          ? "bg-apple-blue text-white shadow-apple-md scale-[1.02] z-10"
          : "hover:bg-black/5 dark:hover:bg-white/5 text-system-gray-600 dark:text-system-gray-300"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn(
            "text-sm font-bold leading-tight truncate",
            isActive ? "text-white" : "text-foreground dark:text-system-gray-100"
          )}>
            {task.title}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className={cn(
              "text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md",
              isActive 
                ? "bg-white/20 text-white" 
                : "bg-black/5 dark:bg-white/10 text-system-gray-500 dark:text-system-gray-300"
            )}>
              {t(`task_types.${task.type}`)}
            </span>
            <span className={cn(
              "text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md",
              priorityClassName
            )}>
              {t(`priority_labels.${normalizedPriority}`)}
            </span>
            <span className={cn(
              "text-[9px] font-mono opacity-40 uppercase",
              isActive ? "text-white" : "text-system-gray-400 dark:text-system-gray-500"
            )}>
              #{task.id.slice(0, 6)}
            </span>
          </div>
        </div>
        
        <div className={cn(
          "shrink-0 mt-0.5",
          isActive ? "text-white/80" : "text-system-gray-300"
        )}>
          {task.status === "done" ? <CheckCircle2 size={16} /> : <Circle size={16} className="opacity-40" />}
        </div>
      </div>

      {/* Hover/Active Indicator */}
      {!isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-0 bg-apple-blue group-hover:h-6 transition-all rounded-r-full" />
      )}
    </button>
  );
}
