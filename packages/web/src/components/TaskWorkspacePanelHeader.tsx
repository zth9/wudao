import type { HTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../utils/cn";

export const TASK_WORKSPACE_HEADER_HEIGHT_PX = 49;

type DivAttributes = HTMLAttributes<HTMLDivElement> & {
  [key: `data-${string}`]: string | number | boolean | undefined;
};

interface Props {
  title: string;
  icon: LucideIcon;
  actions?: ReactNode;
  wrapperProps?: DivAttributes;
  panelProps?: DivAttributes;
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
          "flex items-center justify-between border-b border-border bg-overlay/90 backdrop-blur-xl dark:bg-overlay/85 px-4 py-3",
          panelClassName,
        )}
        style={{ height: `${TASK_WORKSPACE_HEADER_HEIGHT_PX}px`, ...panelStyle }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-default text-accent">
            <Icon size={14} />
          </div>
          <span className="truncate text-[11px] font-bold tracking-[0.08em] text-muted">
            {title}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </div>
    </div>
  );
}
