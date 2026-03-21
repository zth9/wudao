import React from "react";
import { useTranslation } from "react-i18next";
import { useSdkRunnerStore, type SdkTimelineItem } from "../../stores/sdkRunnerStore";
import { cn } from "../../utils/cn";
import { shortSdkRunId } from "../../utils/sdk-runner";
import MarkdownContent from "../MarkdownContent";

function formatRunTimestamp(value: string): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resolveRunStatusLabel(status: string, t: (key: string) => string): string {
  if (status === "running") return t("sdkRunner.running");
  if (status === "completed") return t("sdkRunner.completed");
  if (status === "failed") return t("sdkRunner.failed");
  if (status === "cancelled") return t("sdkRunner.cancelled");
  return t("sdkRunner.pending");
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SdkStatusBar({ taskId }: { taskId: string }) {
  const { t } = useTranslation();
  const { activeSdkRunId, sdkRuns, sdkRunning, sdkTimeline, cancelSdkRun } = useSdkRunnerStore();
  const activeRun = sdkRuns.find((run) => run.id === activeSdkRunId) ?? null;

  const lastCost = [...sdkTimeline].reverse().find((item) => item.kind === "cost") as
    | (SdkTimelineItem & { kind: "cost" })
    | undefined;

  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 text-xs">
      <div className="min-w-0 flex items-center gap-2">
        <span className="font-medium">{t("sdkRunner.title")}</span>
        {activeSdkRunId && (
          <span className="rounded-full border border-black/5 bg-black/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-system-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-system-gray-300">
            {shortSdkRunId(activeSdkRunId)}
          </span>
        )}
        {sdkRunning && (
          <span className="flex items-center gap-1 text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            {t("sdkRunner.running")}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {lastCost && (
          <>
            <span className="opacity-60">${lastCost.totalCostUsd.toFixed(3)}</span>
            {lastCost.durationMs != null && (
              <span className="opacity-60">{(lastCost.durationMs / 1000).toFixed(1)}s</span>
            )}
          </>
        )}
        {activeRun && (activeRun.status === "pending" || activeRun.status === "running") && (
          <button
            onClick={() => cancelSdkRun(taskId, activeRun.id)}
            className="px-2 py-0.5 rounded text-red-400 hover:bg-red-400/10 transition-colors"
          >
            {t("sdkRunner.cancel")}
          </button>
        )}
      </div>
    </div>
  );
}

function SdkRunHistory({ taskId }: { taskId: string }) {
  const { t } = useTranslation();
  const { sdkRuns, activeSdkRunId, selectSdkRun } = useSdkRunnerStore();

  if (sdkRuns.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-white/10">
      <div className="flex items-center justify-between px-3 pt-3 pb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-system-gray-400">
        <span>{t("sdkRunner.history")}</span>
        <span>{sdkRuns.length}</span>
      </div>
      <div className="max-h-44 overflow-y-auto px-3 pb-3 space-y-2">
        {sdkRuns.map((run) => {
          const selected = run.id === activeSdkRunId;
          return (
            <button
              key={run.id}
              type="button"
              data-sdk-run-item={run.id}
              onClick={() => selectSdkRun(taskId, run.id)}
              className={cn(
                "w-full rounded-apple-xl border px-3 py-2 text-left transition-colors",
                selected
                  ? "border-apple-blue/30 bg-apple-blue/10"
                  : "border-black/5 bg-black/[0.03] hover:bg-black/[0.05] dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-system-gray-500 dark:text-system-gray-300">
                  {shortSdkRunId(run.id)}
                </span>
                <span className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]",
                  run.status === "running" || run.status === "pending"
                    ? "bg-green-500/10 text-green-400"
                    : run.status === "failed"
                      ? "bg-red-500/10 text-red-400"
                      : run.status === "cancelled"
                        ? "bg-orange-500/10 text-orange-400"
                        : "bg-black/5 text-system-gray-500 dark:bg-white/5 dark:text-system-gray-300",
                )}>
                  {resolveRunStatusLabel(run.status, t)}
                </span>
                <span className="ml-auto text-[10px] text-system-gray-400">
                  {formatRunTimestamp(run.created_at)}
                </span>
              </div>
              <div className="mt-2 text-[12px] leading-relaxed text-system-gray-700 dark:text-system-gray-100 overflow-hidden text-ellipsis whitespace-nowrap">
                {run.prompt || t("sdkRunner.noPrompt")}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SdkToolCard({ item }: { item: SdkTimelineItem & { kind: "tool_use" } }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="rounded-lg border border-white/10 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 transition-colors"
      >
        <span className="text-blue-400">⚡</span>
        <span className="font-medium">{t("sdkRunner.toolUse")}: {item.toolName}</span>
        <span className="ml-auto opacity-40">{expanded ? "▼" : "▶"}</span>
      </button>
      {expanded && (
        <pre className="px-3 py-2 text-xs opacity-70 border-t border-white/5 overflow-x-auto max-h-40">
          {JSON.stringify(item.input, null, 2)}
        </pre>
      )}
    </div>
  );
}

function SdkToolResultCard({ item }: { item: SdkTimelineItem & { kind: "tool_result" } }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className={`rounded-lg border overflow-hidden ${item.isError ? "border-red-400/30" : "border-white/10"}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 transition-colors"
      >
        <span className={item.isError ? "text-red-400" : "text-green-400"}>{item.isError ? "✗" : "✓"}</span>
        <span className="font-medium">{t("sdkRunner.toolResult")}</span>
        <span className="ml-auto opacity-40">{expanded ? "▼" : "▶"}</span>
      </button>
      <div className={`px-3 py-2 text-xs opacity-70 border-t border-white/5 ${expanded ? "" : "max-h-24 overflow-hidden"}`}>
        <MarkdownContent content={item.content} className="text-[13px] leading-6" />
      </div>
    </div>
  );
}

function SdkApprovalCard({
  item,
  taskId,
}: {
  item: SdkTimelineItem & { kind: "approval_request" };
  taskId: string;
}) {
  const { t } = useTranslation();
  const { activeSdkRunId, approveSdkAction } = useSdkRunnerStore();

  const statusLabel =
    item.status === "pending"
      ? t("sdkRunner.approvalPending")
      : item.status === "approved"
        ? t("sdkRunner.approvalApproved")
        : item.status === "denied"
          ? t("sdkRunner.approvalDenied")
          : t("sdkRunner.approvalTimeout");

  const isPending = item.status === "pending";

  return (
    <div className="rounded-lg border-2 border-orange-400/50 bg-orange-400/5 overflow-hidden">
      <div className="px-3 py-2 flex items-center gap-2 text-xs">
        <span className="text-orange-400">⚠️</span>
        <span className="font-medium">{item.toolName}</span>
        <span className={`ml-auto text-xs ${isPending ? "text-orange-400 animate-pulse" : "opacity-60"}`}>
          {statusLabel}
        </span>
      </div>
      <pre className="px-3 py-1 text-xs opacity-60 max-h-20 overflow-auto border-t border-orange-400/20">
        {JSON.stringify(item.input, null, 2)}
      </pre>
      {isPending && activeSdkRunId && (
        <div className="flex gap-2 px-3 py-2 border-t border-orange-400/20">
          <button
            onClick={() => approveSdkAction(taskId, activeSdkRunId, item.approvalId, true)}
            className="flex-1 px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 text-xs font-medium hover:bg-green-500/30 transition-colors"
          >
            {t("sdkRunner.approve")}
          </button>
          <button
            onClick={() => approveSdkAction(taskId, activeSdkRunId, item.approvalId, false)}
            className="flex-1 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30 transition-colors"
          >
            {t("sdkRunner.deny")}
          </button>
        </div>
      )}
    </div>
  );
}

function SdkTimeline({ taskId }: { taskId: string }) {
  const { sdkTimeline } = useSdkRunnerStore();
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sdkTimeline.length]);

  return (
    <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 text-sm">
      {sdkTimeline.map((item) => {
        switch (item.kind) {
          case "text":
            return (
              <div key={item.id} className="opacity-90">
                <MarkdownContent content={item.content} className="text-[13px] leading-6" />
                {item.streaming && <span className="inline-block w-1.5 h-3.5 bg-current animate-pulse ml-0.5" />}
              </div>
            );
          case "thinking":
            return (
              <div key={item.id} className="text-xs italic opacity-50 whitespace-pre-wrap">
                💭 {item.content}
              </div>
            );
          case "tool_use":
            return <SdkToolCard key={item.id} item={item} />;
          case "tool_result":
            return <SdkToolResultCard key={item.id} item={item} />;
          case "approval_request":
            return <SdkApprovalCard key={item.id} item={item} taskId={taskId} />;
          case "progress":
            return (
              <div key={item.id} className="text-xs opacity-40 flex items-center gap-1">
                <span>📋</span> {item.message}
              </div>
            );
          case "cost":
            return (
              <div key={item.id} className="text-xs opacity-40 flex items-center gap-3">
                <span>💰 ${item.totalCostUsd.toFixed(3)}</span>
                {item.durationMs != null && <span>⏱ {(item.durationMs / 1000).toFixed(1)}s</span>}
                {item.numTurns != null && <span>🔄 {item.numTurns} turns</span>}
              </div>
            );
          case "error":
            return (
              <div key={item.id} className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">
                ❌ {item.message}
              </div>
            );
          case "status_change":
            return (
              <div key={item.id} className="text-xs text-center opacity-30 py-1">
                — {item.status} —
              </div>
            );
          default:
            return null;
        }
      })}
      <div ref={bottomRef} />
    </div>
  );
}

function SdkEmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 opacity-40">
      <div className="text-3xl mb-3">🤖</div>
      <div className="text-sm font-medium">{t("sdkRunner.empty")}</div>
      <div className="text-xs mt-1 max-w-[240px]">{t("sdkRunner.emptyHint")}</div>
    </div>
  );
}

function SdkHistoryPlaceholder() {
  const { t } = useTranslation();

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 opacity-40">
      <div className="text-sm font-medium">{t("sdkRunner.historyReady")}</div>
      <div className="text-xs mt-1 max-w-[240px]">{t("sdkRunner.historyHint")}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function SdkRunnerPanel({ taskId }: { taskId: string }) {
  const { sdkRuns, activeSdkRunId, sdkTimeline } = useSdkRunnerStore();
  const hasRuns = sdkRuns.length > 0;
  const hasContent = Boolean(activeSdkRunId) && sdkTimeline.length > 0;

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg-primary)]">
      <SdkStatusBar taskId={taskId} />
      <SdkRunHistory taskId={taskId} />
      {hasContent ? <SdkTimeline taskId={taskId} /> : hasRuns ? <SdkHistoryPlaceholder /> : <SdkEmptyState />}
    </div>
  );
}
