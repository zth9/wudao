import type { ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../utils/cn";
import { TaskWorkspacePanelHeader } from "./TaskWorkspacePanelHeader";
import { WudaoIconButton } from "./ui/heroui";

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
        "flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#EDEDED] dark:bg-[#191919]",
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
              <WudaoIconButton
                type="button"
                onPress={onClose}
                tone="ghost"
                className="h-8 w-8 rounded-apple-lg text-system-gray-400 hover:text-apple-blue"
                tooltip={t("common.close")}
                aria-label={t("common.close")}
              >
                <X size={16} />
              </WudaoIconButton>
            )}
          </>
        )}
      />

      <div className={cn("flex flex-1 min-h-0 flex-col", bodyClassName)}>{children}</div>
    </aside>
  );
}
