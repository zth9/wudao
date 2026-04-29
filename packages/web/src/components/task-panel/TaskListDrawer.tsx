import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { type Task } from "../../services/api";
import { X, CheckCircle2, Circle } from "lucide-react";
import { cn } from "../../utils/cn";
import {
  TASK_LIST_DRAWER_BACKDROP_CLASS,
  TASK_LIST_DRAWER_PANEL_CLASS,
} from "./task-list-drawer-layout";
import { Button } from "@heroui/react/button";
import { Tooltip } from "@heroui/react/tooltip";

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
            <div className="h-14 flex items-center justify-between px-4 border-b border-border shrink-0">
              <h2 className="text-sm font-black uppercase tracking-widest text-foreground">
                {t('tasks.task_list')}
              </h2>
              <Tooltip delay={300} closeDelay={0}>
                <Button
                  isIconOnly
                  variant="ghost"
                  onPress={onClose}
                  className="h-8 w-8 rounded-full text-muted"
                  aria-label={t("common.close")}
                >
                  <X size={18} />
                </Button>
                <Tooltip.Content className="rounded-lg border border-border bg-overlay px-2.5 py-1.5 text-xs font-semibold text-overlay-foreground shadow-md" placement="top" showArrow>
                  <Tooltip.Arrow className="fill-overlay" />
                  {t("common.close")}
                </Tooltip.Content>
              </Tooltip>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2">
              <div className="space-y-6 py-2">
                {/* Active Tasks */}
                {activeTasks.length > 0 && (
                  <div>
                    <div className="px-3 mb-2 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(0,122,255,0.5)]" />
                      <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em]">
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
                      <span className="w-1.5 h-1.5 rounded-full bg-success opacity-50" />
                      <p className="text-[10px] font-black text-muted uppercase tracking-[0.2em]">
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
      ? "bg-danger/10 text-danger"
      : normalizedPriority === 1
        ? "bg-warning/10 text-warning"
        : normalizedPriority === 2
          ? "bg-warning/20 text-warning"
          : normalizedPriority === 3
            ? "bg-accent/10 text-accent"
            : "bg-success/10 text-success";

  return (
    <Button
      variant="ghost"
      onPress={onClick}
      className={cn(
        "relative flex h-auto min-h-0 w-full flex-col items-stretch overflow-hidden rounded-xl px-3 py-3 text-left transition-all duration-300 group",
        isActive
          ? "bg-accent text-accent-foreground shadow-md scale-[1.02] z-10"
          : "hover:bg-default text-foreground"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn(
            "text-sm font-bold leading-tight truncate",
            isActive ? "text-white" : "text-foreground"
          )}>
            {task.title}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className={cn(
              "text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md",
              isActive
                ? "bg-white/20 text-white"
                : "bg-default text-muted"
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
              isActive ? "text-white" : "text-muted"
            )}>
              #{task.id.slice(0, 6)}
            </span>
          </div>
        </div>

        <div className={cn(
          "shrink-0 mt-0.5",
          isActive ? "text-white/80" : "text-default-foreground"
        )}>
          {task.status === "done" ? <CheckCircle2 size={16} /> : <Circle size={16} className="opacity-40" />}
        </div>
      </div>

      {/* Hover/Active Indicator */}
      {!isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-0 bg-accent group-hover:h-6 transition-all rounded-r-full" />
      )}
    </Button>
  );
}
