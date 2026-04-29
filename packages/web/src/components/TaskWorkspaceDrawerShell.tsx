import type { ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../utils/cn";
import { TaskWorkspacePanelHeader } from "./TaskWorkspacePanelHeader";
import { Button } from "@heroui/react/button";
import { Tooltip } from "@heroui/react/tooltip";

interface Props {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  headerActions?: ReactNode;
  onClose?: () => void;
  className?: string;
  bodyClassName?: string;
}

export function TaskWorkspaceDrawerShell({
  title,
  icon: Icon,
  children,
  headerActions,
  onClose,
  className,
  bodyClassName,
}: Props) {
  const { t } = useTranslation();

  return (
    <aside
      data-task-workspace-drawer="true"
      className={cn(
        "flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface-secondary dark:bg-background",
        className,
      )}
    >
      <TaskWorkspacePanelHeader
        title={title}
        icon={Icon}
        wrapperProps={{
          "data-task-workspace-drawer-header": "true",
          className: "shrink-0",
        }}
        actions={(
          <>
            {headerActions}
            {onClose && (
              <Tooltip delay={300} closeDelay={0}>
                <Button
                  type="button"
                  isIconOnly
                  variant="ghost"
                  onPress={onClose}
                  className="h-8 w-8 rounded-lg text-muted hover:text-accent"
                  aria-label={t("common.close")}
                >
                  <X size={16} />
                </Button>
                <Tooltip.Content
                  className="rounded-lg border border-border bg-overlay px-2.5 py-1.5 text-xs font-semibold text-overlay-foreground shadow-md"
                  placement="top"
                  showArrow
                >
                  <Tooltip.Arrow className="fill-overlay" />
                  {t("common.close")}
                </Tooltip.Content>
              </Tooltip>
            )}
          </>
        )}
      />

      <div className={cn("flex flex-1 min-h-0 flex-col", bodyClassName)}>{children}</div>
    </aside>
  );
}
