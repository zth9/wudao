import React from "react";
import { useTranslation } from "react-i18next";
import { useSdkRunnerStore, type SdkTimelineItem } from "../../stores/sdkRunnerStore";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SdkStatusBar({ taskId }: { taskId: string }) {
  const { t } = useTranslation();
  const { activeSdkRunId, sdkRunning, sdkTimeline, cancelSdkRun } = useSdkRunnerStore();

  const lastCost = [...sdkTimeline].reverse().find((i) => i.kind === "cost") as
    | (SdkTimelineItem & { kind: "cost" })
    | undefined;

  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-medium">{t("sdkRunner.title")}</span>
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
        {sdkRunning && activeSdkRunId && (
          <button
            onClick={() => cancelSdkRun(taskId, activeSdkRunId)}
            className="px-2 py-0.5 rounded text-red-400 hover:bg-red-400/10 transition-colors"
          >
            {t("sdkRunner.cancel")}
          </button>
        )}
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
  const preview = item.content.length > 120 ? item.content.slice(0, 120) + "…" : item.content;

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
      <div className={`px-3 py-2 text-xs opacity-70 border-t border-white/5 ${expanded ? "" : "max-h-16 overflow-hidden"}`}>
        <pre className="whitespace-pre-wrap break-words">{expanded ? item.content : preview}</pre>
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

// ---------------------------------------------------------------------------
// Timeline renderer
// ---------------------------------------------------------------------------

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
              <div key={item.id} className="whitespace-pre-wrap break-words opacity-90">
                {item.content}
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

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function SdkRunnerPanel({ taskId }: { taskId: string }) {
  const { activeSdkRunId, sdkTimeline } = useSdkRunnerStore();
  const hasContent = activeSdkRunId && sdkTimeline.length > 0;

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg-primary)]">
      <SdkStatusBar taskId={taskId} />
      {hasContent ? <SdkTimeline taskId={taskId} /> : <SdkEmptyState />}
    </div>
  );
}
