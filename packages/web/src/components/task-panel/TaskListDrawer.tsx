import { useTranslation } from "react-i18next";
import { type Task } from "../../services/api";
import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "../../utils/cn";
import { Button } from "@heroui/react/button";
import { Chip } from "@heroui/react/chip";
import { Drawer } from "@heroui/react/drawer";
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
    <Drawer isOpen={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Drawer.Backdrop>
        <Drawer.Content placement="left">
          <Drawer.Dialog>
            <Drawer.Header>
              <Drawer.Heading className="text-sm font-black uppercase tracking-widest text-foreground">
                {t('tasks.task_list')}
              </Drawer.Heading>
              <Tooltip delay={300} closeDelay={0}>
                <Button
                  isIconOnly
                  variant="ghost"
                  onPress={onClose}
                  className="h-8 w-8 rounded-full text-muted"
                  aria-label={t("common.close")}
                >
                  ✕
                </Button>
                <Tooltip.Content className="rounded-lg border border-border bg-overlay px-2.5 py-1.5 text-xs font-semibold text-overlay-foreground shadow-md" placement="top" showArrow>
                  <Tooltip.Arrow className="fill-overlay" />
                  {t("common.close")}
                </Tooltip.Content>
              </Tooltip>
            </Drawer.Header>
            <Drawer.Body>
              <div className="flex-1 overflow-y-auto">
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
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}

function TaskItem({ task, isActive, onClick }: { task: Task; isActive: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  const normalizedPriority = [0, 1, 2, 3, 4].includes(task.priority as 0 | 1 | 2 | 3 | 4)
    ? task.priority
    : 2;

  const priorityColor =
    normalizedPriority === 0 ? "danger" :
    normalizedPriority === 1 ? "warning" :
    normalizedPriority === 2 ? "warning" :
    normalizedPriority === 3 ? "accent" :
    "success";

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
            <Chip
              size="sm"
              variant={isActive ? "primary" : "soft"}
              color={isActive ? "default" : "default"}
              className={cn(
                "text-[9px] font-black uppercase tracking-wider",
                isActive ? "bg-white/20 text-white" : ""
              )}
            >
              {t(`task_types.${task.type}`)}
            </Chip>
            <Chip
              size="sm"
              variant={isActive ? "primary" : "soft"}
              color={isActive ? "default" : priorityColor}
              className={cn(
                "text-[9px] font-black uppercase tracking-wider",
                isActive ? "bg-white/20 text-white" : ""
              )}
            >
              {t(`priority_labels.${normalizedPriority}`)}
            </Chip>
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
