import type { HTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../utils/cn";

export const TASK_WORKSPACE_HEADER_HEIGHT_PX = 49;

interface Props {
  title: string;
  icon: LucideIcon;
  actions?: ReactNode;
  wrapperProps?: HTMLAttributes<HTMLDivElement>;
  panelProps?: HTMLAttributes<HTMLDivElement>;
}

export function TaskWorkspacePanelHeader({
  title,
  icon: Icon,
  actions,
  wrapperProps,
  panelProps,
}: Props) {
  const {
    className: wrapperClassName,
    ...restWrapperProps
  } = wrapperProps ?? {};
  const {
    className: panelClassName,
    style: panelStyle,
    ...restPanelProps
  } = panelProps ?? {};

  return (
    <div {...restWrapperProps} className={cn(wrapperClassName)}>
      <div
        {...restPanelProps}
        className={cn(
          "flex items-center justify-between border-b border-black/5 bg-white/90 backdrop-blur-apple dark:border-white/10 dark:bg-[#1c1c1e]/85 px-4 py-3",
          panelClassName,
        )}
        style={{ height: `${TASK_WORKSPACE_HEADER_HEIGHT_PX}px`, ...panelStyle }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-apple-md border border-black/5 bg-black/5 text-apple-blue dark:border-white/10 dark:bg-white/5">
            <Icon size={14} />
          </div>
          <span className="truncate text-[11px] font-bold tracking-[0.08em] text-system-gray-500 dark:text-system-gray-400">
            {title}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </div>
    </div>
  );
}
